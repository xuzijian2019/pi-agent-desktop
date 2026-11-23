import { expect, test } from "@playwright/test";
import type { AppUpdatesResponse } from "../../lib/app-update-types";

for (const [width, theme] of [[1280, "light"], [390, "dark"]] as const) {
  test(`Settings forces a fresh update check and labels stale metadata (${width} ${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem("pi-locale", "en");
      localStorage.setItem("pi-theme", theme);
    }, theme);

    const staleTitle = "Stale fixture release notes";
    const freshTitle = "Fresh fixture release notes";
    let fail = true;
    let refreshes = 0;
    await page.route("**/api/updates**", async route => {
      const url = new URL(route.request().url());
      expect(url.pathname).toBe("/api/updates");
      expect(route.request().method()).toBe("GET");
      const refreshed = url.searchParams.get("refresh") === "1";
      if (refreshed) refreshes += 1;
      const fresh = refreshed && !fail;
      const component = {
        project: "pi-agent-desktop" as const, name: "Pi Agent Desktop",
        repository: "example/fixture", repositoryUrl: "https://release-fixture.invalid/",
        currentVersion: "0.8.8", latestVersion: fresh ? "9.8.2" : "9.8.1",
        releaseUrl: `https://release-fixture.invalid/v${fresh ? "9.8.2" : "9.8.1"}`,
        updateAvailable: true, releaseStatus: "available" as const,
        highlights: { en: [fresh ? freshTitle : staleTitle], zh: [] },
      };
      const response: AppUpdatesResponse = {
        checkedAt: "2026-11-23T12:00:00Z", nextCheckAt: "2026-11-24T12:00:00Z",
        components: [component], updates: [],
        ...(refreshed && fail ? { errors: [{ project: "pi-agent-desktop", message: "Fixture metadata request failed" }] } : {}),
      };
      await route.fulfill({ json: response });
    });
    await page.route("https://release-fixture.invalid/**", route => route.abort());

    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    const updates = settings.locator(".settings-updates");
    const openSettings = async () => {
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
      await page.keyboard.press("Control+,");
      await expect(updates).toBeVisible();
    };
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await openSettings();
    await expect(updates.getByRole("status")).toHaveText("Could not check GitHub releases.");
    expect(refreshes).toBeGreaterThan(0);
    await expect(updates.getByRole("link", { name: /v9\.8\.1/ })).toHaveCount(0);
    await expect(updates).not.toContainText(staleTitle);
    await expect(updates).not.toContainText("You're on the latest version.");
    await updates.scrollIntoViewIfNeeded();
    const box = await updates.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width + 1).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`updates-stale-${theme}-${width}.png`), animations: "disabled" });

    const beforeRetry = refreshes;
    fail = false;
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(settings).toBeHidden();
    await openSettings();
    await expect(updates.getByRole("link", { name: /v9\.8\.2/ })).toHaveAttribute("href", "https://release-fixture.invalid/v9.8.2");
    await expect(updates).toContainText(freshTitle);
    await expect(updates.getByRole("status")).toHaveText("A new version is available.");
    expect(refreshes).toBeGreaterThan(beforeRetry);
    await updates.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`updates-fresh-${theme}-${width}.png`), animations: "disabled" });
  });
}
