import { expect, test } from "@playwright/test";

for (const [width, theme] of [[1280, "light"], [390, "dark"]] as const) {
  test(`0.8.7 model provider ID, display name and llama.cpp router (${width} ${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem("pi-locale", "en");
      localStorage.setItem("pi-theme", theme);
    }, theme);
    const providerId = "display-fixture";
    const displayName = "Fixture provider with a deliberately long display name for narrow settings";
    type Config = { providers: Record<string, { api?: string; name?: string }> };
    let config: Config = { providers: { [providerId]: { api: "openai-completions", name: "Display fixture" } } };
    const saves: Config[] = [];
    let routerRequest: unknown;
    await page.route("**/api/models-config", async route => {
      if (route.request().method() === "PUT") {
        config = route.request().postDataJSON() as Config;
        saves.push(config);
        return route.fulfill({ json: { success: true } });
      }
      await route.fulfill({ json: config });
    });
    await page.route("**/api/auth/providers", route => route.fulfill({
      json: {
        oauthProviders: [],
        apiKeyProviders: [{ id: "llama.cpp", displayName: "llama.cpp", configured: false, modelCount: 0 }],
        providerNames: { [providerId]: config.providers[providerId]?.name ?? providerId },
      },
    }));
    await page.route("**/api/auth/api-key/llama.cpp", async route => {
      expect(route.request().method()).toBe("POST");
      routerRequest = route.request().postDataJSON();
      await route.fulfill({ json: { success: true, catalog: { completed: true } } });
    });
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
    await page.keyboard.press("Control+,");
    const settings = page.locator(".settings-dialog-surface");
    const tab = settings.locator(".settings-section-tab").filter({ hasText: /^Models$/ });
    if (width < 640) {
      await settings.getByRole("combobox", { name: "Settings section", exact: true }).click();
      await page.getByRole("option", { name: "Models", exact: true }).click();
    } else await tab.click();
    await settings.getByRole("button", { name: /^Display fixture/ }).click();
    const field = (name: string) => settings.locator(".config-field").filter({
      has: page.locator(".config-field-label").filter({ hasText: new RegExp(`^${name}$`) }),
    }).locator("input").first();
    await expect(field("Provider ID")).toHaveValue(providerId);
    await expect(field("Display name")).toHaveValue("Display fixture");
    await field("Display name").fill(displayName);
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => saves.at(-1)?.providers[providerId]?.name).toBe(displayName);
    expect(Object.keys(saves.at(-1)?.providers ?? {})).toEqual([providerId]);
    await expect(field("Provider ID")).toHaveValue(providerId);
    await page.screenshot({ path: info.outputPath(`provider-display-name-${theme}-${width}.png`), animations: "disabled" });
    await settings.getByRole("button", { name: "Add provider", exact: true }).click();
    await settings.getByPlaceholder("Search providers…").fill("llama.cpp");
    await settings.getByRole("button", { name: /llama\.cpp/ }).click();
    const router = settings.getByPlaceholder("http://127.0.0.1:8080");
    await expect(router).toHaveValue("http://127.0.0.1:8080");
    await expect(settings.getByPlaceholder("API key (optional)")).toHaveValue("");
    const box = await router.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width + 1).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`llama-router-${theme}-${width}.png`), animations: "disabled" });
    await settings.locator(".config-detail-stack").getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => routerRequest).toEqual({ apiKey: "", serverUrl: "http://127.0.0.1:8080" });
  });
}
