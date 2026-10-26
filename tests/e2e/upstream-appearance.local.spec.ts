import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WORK_ROOT } from "./sandbox";

// Real web routes persist only to the E2E sandbox. No native app/font enumeration
// or provider credentials are involved in this appearance acceptance coverage.
async function section(page: Page, name: string, narrow: boolean) {
  const dialog = page.locator(".settings-dialog-surface");
  if (narrow) {
    await dialog.locator(".settings-mobile-section-picker").click();
    await page.getByRole("option", { name, exact: true }).click();
  } else {
    await dialog.locator(".settings-section-tab").filter({ hasText: new RegExp(`^${name}$`) }).click();
  }
}

for (const width of [1280, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`appearance persists fonts/background and fits ${width}px ${theme}`, async ({ page, request }, testInfo) => {
      const cwd = path.join(WORK_ROOT, `appearance-${randomUUID()}`);
      await mkdir(cwd, { recursive: true });
      expect((await request.put("/api/appearance/fonts", { data: { fonts: { ui: "", mono: "" } } })).ok()).toBe(true);
      expect((await request.put("/api/appearance", { data: { background: "rex" } })).ok()).toBe(true);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
      await page.keyboard.press("Control+,");
      const dialog = page.locator(".settings-dialog-surface");
      await expect(dialog).toBeVisible();
      await section(page, "Appearance", width < 640);
      const appearance = dialog.locator(".settings-appearance");
      await expect(appearance).toBeVisible();
      await appearance.locator(`.settings-theme-option:has(input[value="${theme}"])`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await appearance.locator('.settings-background-option:has(input[value="mist"])').click();
      await expect(page.locator("html")).toHaveAttribute("data-background", "mist");
      await expect.poll(async () => (await (await request.get("/api/appearance")).json()).background).toBe("mist");
      await expect(appearance.locator('input[name="background"]')).toHaveCount(5);
      await expect(appearance.locator('input[name="theme"]')).toHaveCount(3);
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.screenshot({ path: testInfo.outputPath(`appearance-${width}-${theme}.png`), animations: "disabled" });

      const family = "Long Custom Font Family For Readable Interface And Multilingual Conversation Preview";
      const picker = appearance.getByRole("combobox", { name: "Interface font", exact: true });
      await picker.click();
      await page.getByRole("option", { name: "Custom font…", exact: true }).click();
      const fontInput = appearance.getByRole("textbox", { name: "Interface font name", exact: true });
      await fontInput.fill(family);
      await fontInput.press("Enter");
      await expect(picker).toContainText(family);
      await expect.poll(async () => (await (await request.get("/api/appearance/fonts")).json()).fonts.ui).toBe(family);
      await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--font-ui"))).toContain(family);
      await picker.scrollIntoViewIfNeeded();
      await page.evaluate(async () => { await document.fonts.ready; });
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await appearance.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`appearance-long-font-${width}-${theme}.png`), animations: "disabled" });

      // Navigating away preserves the already mounted appearance section and
      // the fork General controls; a full reload restores the server choice.
      await section(page, "General", width < 640);
      await expect(dialog.getByRole("switch", { name: "Name new sessions automatically" })).toBeVisible();
      await section(page, "Appearance", width < 640);
      await expect(picker).toContainText(family);
      await page.reload();
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
      await page.keyboard.press("Control+,");
      await section(page, "Appearance", width < 640);
      await expect(picker).toContainText(family);
      await expect(page.locator("html")).toHaveAttribute("data-background", "mist");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await appearance.getByRole("button", { name: "Reset fonts", exact: true }).click();
      await expect(picker).toHaveText("Default");
      await expect.poll(async () => (await (await request.get("/api/appearance/fonts")).json()).fonts).toEqual({ ui: "", mono: "" });
      await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--font-ui"))).toBe("");
      await expect(appearance.getByRole("alert")).toHaveCount(0);
    });
  }
}
