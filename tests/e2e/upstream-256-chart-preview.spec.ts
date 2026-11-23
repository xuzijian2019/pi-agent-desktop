import { test, expect, type Page } from "@playwright/test";
import { build, type Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildHtmlPreviewDocument, HTML_PREVIEW_SANDBOX } from "../../lib/html-preview";
import { buildStreamShell } from "../../lib/html-preview-stream";

const root = path.resolve(__dirname, "../..");
// Actual UI components on a synthetic origin. No app/session/model endpoints
// and no external requests: all responses are supplied by this fixture.
async function mount(page: Page, source: string, plugins: Plugin[] = []) {
  const result = await build({
    stdin: { contents: source, loader: "tsx", resolveDir: root },
    bundle: true, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' }, write: false, plugins,
  });
  const css = await readFile(path.join(root, "app/native-theme.css"), "utf8");
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://preview.fixture") return route.abort();
    if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript; charset=utf-8", body: result.outputFiles[0].text });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script>' });
    return route.abort();
  });
  await page.goto("http://preview.fixture/");
  await page.addStyleTag({ content: css + "\nbody{margin:16px}#root{max-width:740px}.chart-block{width:100%}" });
}

const imports = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from './hooks/useI18n';
`;

test("chart keeps CJK labels inside a narrow figure and exact tooltip values", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, imports + `
    import {ChartBlock} from './components/ChartBlock';
    const spec = JSON.stringify({type:'bar',title:'模型精度',items:[{label:'某个名字很长很长的本地模型',value:0.000000123456789},{label:'备用模型',value:0.0000001}]});
    createRoot(document.getElementById('root')).render(<I18nProvider><ChartBlock code={spec}/></I18nProvider>);
  `);
  const svg = page.locator(".chart-block-figure svg");
  await expect(svg).toBeVisible();
  const labelsFit = await svg.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const labels = [...el.querySelectorAll("text")].filter(t => /[\u4e00-\u9fff]/.test(t.textContent ?? ""));
    return labels.length > 0 && labels.every(t => {
      const r = t.getBoundingClientRect();
      return r.left >= bounds.left - 2 && r.right <= bounds.right + 2;
    });
  });
  expect(labelsFit).toBe(true);
  await svg.locator('[data-part="mark"]').first().hover();
  await expect(page.locator(".chart-tooltip-value").first()).toHaveText("0.000000123456789");
  await page.screenshot({ path: info.outputPath("chart-cjk-exact-tooltip-390.png") });
});

test("Mermaid parse errors offer fix but renderer load failures offer Retry", async ({ page }) => {
  // Substitute only the import boundary, not the component/error flow. Ordinary
  // malformed input and an unavailable local module exercise the two branches.
  const renderer: Plugin = { name: "renderer-boundary", setup(build) {
    build.onResolve({ filter: /^mermaid$/ }, () => ({ path: "mermaid", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      let attempts=0;
      export default {initialize(){},async parse(code){
        if(code==='bad')throw new Error('Parse error on line 2');
        if(code==='load' && attempts++===0)throw new TypeError('Failed to fetch dynamically imported module');
      },async render(){return {svg:'<svg viewBox="0 0 100 30"><text x="5" y="20">Ready</text></svg>'}}};
    `, loader: "js" }));
  } };
  await mount(page, imports + `
    import {MermaidBlock} from './components/MermaidBlock';
    createRoot(document.getElementById('root')).render(<I18nProvider>
      <section id="bad"><MermaidBlock code="bad" defaultPreview fixable={()=>true}/></section>
      <section id="load"><MermaidBlock code="load" defaultPreview fixable={()=>true}/></section>
    </I18nProvider>);
  `, [renderer]);
  await expect(page.locator("#bad [role=alert]")).toContainText("Parse error on line 2");
  await expect(page.locator("#bad .mermaid-fix")).toBeVisible();
  await expect(page.locator("#bad").getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await expect(page.locator("#load [role=alert]")).toBeVisible();
  await expect(page.locator("#load .mermaid-fix")).toHaveCount(0);
  await page.locator("#load").getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("#load svg").getByText("Ready")).toBeVisible();
});

test("finished blank preview reports an error while the streaming shell waits", async ({ page }) => {
  await page.route("**/*", route => route.abort());
  const docs = [
    buildHtmlPreviewDocument("html", "<!doctype html><body></body>"),
    buildHtmlPreviewDocument("html", "<!doctype html><body><p>Visible text</p></body>"),
    buildStreamShell("html", {}, "Generating"),
  ];
  await page.setContent('<!doctype html><body><script>window.reports=[[],[],[]];addEventListener("message",e=>{const i=[...document.querySelectorAll("iframe")].findIndex(f=>f.contentWindow===e.source);if(i>=0&&e.data?.type==="pi-html-preview:error")reports[i].push(e.data.message)});</script>');
  await page.evaluate(({ docs, sandbox }) => {
    for (const doc of docs) {
      const f = document.createElement("iframe"); f.setAttribute("sandbox", sandbox);
      f.style.cssText = "width:320px;height:160px"; f.srcdoc = doc; document.body.append(f);
    }
  }, { docs, sandbox: HTML_PREVIEW_SANDBOX });
  await expect.poll(() => page.evaluate(() => (window as unknown as { reports: string[][] }).reports[0].some(s => s.includes("rendered nothing visible"))), { timeout: 10000 }).toBe(true);
  await page.waitForTimeout(1000);
  const reports = await page.evaluate(() => (window as unknown as { reports: string[][] }).reports);
  expect(reports[1]).toEqual([]);
  expect(reports[2]).toEqual([]);
});

test("historical active previews remain source-first until explicitly opened", async ({ page }) => {
  await mount(page, imports + `
    import {ArtifactView} from './components/ArtifactView';
    import {HtmlPreviewBlock} from './components/HtmlPreviewBlock';
    const entries = [
      ['html','<!doctype html><button onclick="this.disabled=true">Ready</button>'],
      ['svg','<svg xmlns="http://www.w3.org/2000/svg" onclick="this.dataset.clicked=1"><rect width="20" height="20"/></svg>'],
      ['react','export default function App(){return <button onClick={()=>{}}>Ready</button>}'],
    ];
    createRoot(document.getElementById('root')).render(<I18nProvider>{entries.map(([type,content])=><section key={type}>
      <div id={'artifact-'+type}><ArtifactView identifier={type} title={type} emptyMessage="empty" holdActiveContent versions={[{type,content,title:type,lang:type,complete:true}]}/></div>
      <div id={'inline-'+type}><HtmlPreviewBlock kind={type} lang={type} code={content}/></div>
    </section>)}</I18nProvider>);
  `);
  for (const kind of ["html", "svg", "react"]) {
    for (const surface of ["artifact", "inline"]) {
      const section = page.locator(`#${surface}-${kind}`);
      await expect(section.locator("pre")).toBeVisible();
      await expect(section.locator("iframe")).toHaveCount(0);
    }
  }
  await page.locator("#inline-html").getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#inline-html iframe")).toBeVisible();
});
