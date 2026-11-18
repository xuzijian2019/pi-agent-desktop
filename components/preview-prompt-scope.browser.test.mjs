import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

// Exercise the real MarkdownBody -> nested preview -> frame-message bridge,
// with another conversation still registered behind a cross-session artifact.
test("nested artifact prompts cannot reach a different mounted conversation", async (t) => {
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
      ...(process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {}),
    });
  } catch {
    return t.skip("Playwright browser unavailable in this environment");
  }
  let server;
  try {
    const html = '<!doctype html><html><body><button id="ask" onclick="sendPrompt(\'followup\')">Ask</button></body></html>';
    const markdown = `\`\`\`html\n${html}\n\`\`\``;
    const source = `
      import React, { useEffect, useState } from "react";
      import { createRoot } from "react-dom/client";
      import { I18nProvider } from "./hooks/useI18n";
      import { MarkdownBody } from "./components/MarkdownBody";
      import { ArtifactView } from "./components/ArtifactView";
      import { setActiveArtifactSession, setArtifactPromptHandler } from "./lib/artifact-store";
      const markdown = ${JSON.stringify(markdown)};
      const versions = [{ type: "markdown", title: "Document", content: markdown, lang: "markdown", complete: true }];
      function Fixture() {
        const [normal, setNormal] = useState(0);
        const [scoped, setScoped] = useState(0);
        useEffect(() => {
          setActiveArtifactSession("current-session");
          return setArtifactPromptHandler("current-session", () => setNormal(n => n + 1));
        }, []);
        return <I18nProvider>
          <output id="counts">{normal + ":" + scoped}</output>
          <section id="normal"><MarkdownBody>{markdown}</MarkdownBody></section>
          <section id="cross"><ArtifactView identifier="cross" title="Cross" versions={versions} holdActiveContent /></section>
          <section id="scoped"><ArtifactView identifier="same" title="Same" versions={versions} onPrompt={() => { setScoped(n => n + 1); return true; }} /></section>
        </I18nProvider>;
      }
      createRoot(document.getElementById("root")).render(<Fixture />);
    `;
    const result = await build({
      stdin: { contents: source, loader: "tsx", resolveDir: fileURLToPath(new URL("../", import.meta.url)) },
      bundle: true, platform: "browser", format: "iife", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' }, write: false, logLevel: "silent",
    });
    const js = result.outputFiles[0].text;
    server = createServer((req, res) => {
      if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(js); }
      else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><div id="root"></div><script src="/fixture.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const page = await browser.newPage();
    await page.addInitScript(() => { if (window === window.top) localStorage.setItem("pi-locale", "en"); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#counts").waitFor();
    for (const id of ["cross", "normal", "scoped"]) {
      const section = page.locator(`#${id}`);
      await section.locator(".markdown-code-action").filter({ hasText: /^Preview$/ }).click();
      await section.frameLocator("iframe").locator("#ask").click();
      if (id === "cross") {
        // A postMessage is asynchronous; flush it before checking the absence.
        await page.waitForTimeout(100);
        assert.equal(await page.locator("#counts").textContent(), "0:0");
      } else {
        await page.waitForFunction(expected => document.getElementById("counts").textContent === expected, id === "normal" ? "1:0" : "1:1");
      }
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await browser.close();
  }
});
