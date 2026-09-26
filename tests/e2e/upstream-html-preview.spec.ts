import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WORK_ROOT } from "./sandbox";

test("HTML preview loads local assets with scripts blocked and isolates explicit script mode", async ({ page }) => {
  const cwd = path.join(WORK_ROOT, `html-${randomUUID()}`);
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(cwd, "preview.css"), "#fixture { color: rgb(12, 34, 56); }");
  await writeFile(path.join(cwd, "preview.html"), '<link rel="stylesheet" href="preview.css"><p id="fixture">Static preview</p><script>document.querySelector("#fixture").textContent="Script preview"</script>');
  await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  await page.locator(".right-panel-toggle-button").click();
  await page.locator("#file-panel").getByText("preview.html", { exact: true }).click();
  const iframe = page.locator('.file-viewer-shell iframe[title="HTML preview"]');
  const preview = page.frameLocator('.file-viewer-shell iframe[title="HTML preview"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(preview.locator("#fixture")).toHaveText("Static preview");
  await expect(preview.locator("#fixture")).toHaveCSS("color", "rgb(12, 34, 56)");
  const scripts = page.getByRole("button", { name: "Run scripts", exact: true });
  await expect(scripts).toHaveAttribute("aria-pressed", "false");
  await scripts.click();
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(preview.locator("#fixture")).toHaveText("Script preview");
  await expect(iframe).toHaveAttribute("srcdoc", /Script preview/);
  await scripts.click();
  await expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(preview.locator("#fixture")).toHaveText("Static preview");

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 390) {
        await expect(page.locator("#file-panel")).toBeHidden();
        await page.locator(".right-panel-toggle-button").click();
      }
      await expect(iframe).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`html-${theme}-${width}.png`) });
    }
  }
});
