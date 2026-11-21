import { expect, test } from "@playwright/test";
import type { LevelProbeResult, ThinkingLevelMap } from "../../lib/thinking-level-probe";

for (const [width, theme] of [[1280, "light"], [390, "dark"]] as const) {
  test(`custom Gemini thinking probe is reviewed, applied to draft, and explicitly saved (${width} ${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      localStorage.setItem("pi-locale", "en");
      localStorage.setItem("pi-theme", theme);
    }, theme);
    const providerName = "mock-gemini-gateway";
    const modelName = "Mock Gemini Pro";
    const initialMap = { medium: "mid", high: "strong" };
    const suggestedMap = { ...initialMap, minimal: null, low: null, xhigh: "xhigh", max: "max" };
    const modelDraft = {
      id: "gemini-pro-fixture", name: modelName, reasoning: true, input: ["text"],
      thinkingLevelMap: initialMap as ThinkingLevelMap,
    };
    const provider = {
      name: "Mock Gemini gateway", baseUrl: "https://gemini-fixture.invalid/v1beta",
      api: "google-generative-ai", models: [modelDraft],
    };
    let config = { providers: { [providerName]: provider } };
    const saves: Array<typeof config> = [];
    const probes: unknown[] = [];
    const results: LevelProbeResult[] = [
      { level: "minimal", value: "minimal", outcome: "rejected", status: 400 },
      { level: "low", value: "low", outcome: "rejected", status: 422 },
      { level: "medium", value: "mid", outcome: "inconclusive", status: 429 },
      { level: "high", value: "strong", outcome: "inconclusive", status: 503 },
      { level: "xhigh", value: "xhigh", outcome: "accepted", status: 200 },
      { level: "max", value: "max", outcome: "accepted", status: 200 },
    ];
    // Exercise the real UI with a fixture-only API response. The API's
    // classification and outgoing provider payload are backend test concerns.
    await page.route("https://gemini-fixture.invalid/**", route => route.abort());
    await page.route("**/api/models-config/test", async route => {
      expect(route.request().method()).toBe("POST");
      probes.push(route.request().postDataJSON());
      await route.fulfill({ json: {
        ok: true, status: 200, latencyMs: 15, responseText: "OK",
        thinking: { results, applicable: true, allRejected: false, suggestedMap, changed: true },
      } });
    });
    await page.route("**/api/models-config", async route => {
      if (route.request().method() === "PUT") {
        config = route.request().postDataJSON() as typeof config;
        saves.push(config);
        await route.fulfill({ json: { success: true } });
      } else {
        expect(route.request().method()).toBe("GET");
        await route.fulfill({ json: config });
      }
    });
    await page.route("**/api/auth/providers", route => route.fulfill({
      json: { oauthProviders: [], apiKeyProviders: [], providerNames: { [providerName]: provider.name } },
    }));

    const settings = page.locator(".settings-dialog-surface");
    const openModelAdvanced = async () => {
      await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
      await page.keyboard.press("Control+,");
      await expect(settings).toBeVisible();
      if (width < 640) {
        const select = settings.getByRole("combobox", { name: "Settings section", exact: true });
        if ((await select.innerText()).trim() !== "Models") {
          await select.click();
          await page.getByRole("option", { name: "Models", exact: true }).click();
        }
      } else {
        await settings.locator(".settings-section-tab").filter({ hasText: /^Models$/ }).click();
      }
      // Scope the row to Settings, but match its exact ID relative to the row.
      const modelRow = settings.locator("button.models-sidebar-indented-item")
        .filter({ has: page.getByText(modelDraft.id, { exact: true }) });
      await expect(modelRow).toBeVisible();
      await modelRow.click();
      await expect(modelRow).toHaveAttribute("aria-current", "page");
      const advanced = settings.getByRole("button", { name: /^Advanced settings/ });
      if (await advanced.getAttribute("aria-expanded") !== "true") await advanced.click();
      await expect(settings.getByRole("button", { name: "Test thinking levels", exact: true })).toBeVisible();
    };

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await openModelAdvanced();
    const probe = settings.locator(".thinking-probe");
    await probe.getByRole("button", { name: "Test thinking levels", exact: true }).click();
    const row = (level: string) => probe.locator(".thinking-probe-result")
      .filter({ has: page.locator("code").filter({ hasText: new RegExp(`^${level}$`) }) });
    for (const result of results) {
      await expect(row(result.level)).toHaveAttribute("data-outcome", result.outcome);
      if (result.outcome !== "accepted") {
        await expect(row(result.level)).toContainText(`HTTP ${result.status}`);
        await expect(row(result.level)).toContainText(result.outcome === "rejected" ? "Refused" : "Unclear");
      }
    }
    expect(probes).toEqual([expect.objectContaining({
      providerName, probeThinking: true,
      provider: expect.objectContaining({ api: provider.api, baseUrl: provider.baseUrl }),
      model: expect.objectContaining({ id: modelDraft.id, thinkingLevelMap: initialMap }),
    })]);

    const advanced = settings.locator("#model-advanced-settings");
    const mapInput = (level: string) => advanced.getByPlaceholder(level, { exact: true });
    await expect(mapInput("xhigh")).toHaveValue("");
    await expect(mapInput("max")).toHaveValue("");
    expect(config.providers[providerName].models[0].thinkingLevelMap).toEqual(initialMap);
    expect(saves).toHaveLength(0);
    await probe.scrollIntoViewIfNeeded();
    const bounds = await probe.boundingBox();
    expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`gemini-probe-review-${theme}-${width}.png`), animations: "disabled" });

    await probe.getByRole("button", { name: "Apply suggestion", exact: true }).click();
    await expect(probe.getByText("Applied. Save to write it to models.json:")).toBeVisible();
    await expect(mapInput("xhigh")).toHaveValue("xhigh");
    await expect(mapInput("max")).toHaveValue("max");
    await expect(mapInput("medium")).toHaveValue("mid");
    await expect(mapInput("high")).toHaveValue("strong");
    expect(config.providers[providerName].models[0].thinkingLevelMap).toEqual(initialMap);
    expect(saves).toHaveLength(0);

    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => saves.at(-1)?.providers[providerName]?.models[0]?.thinkingLevelMap).toEqual(suggestedMap);
    expect(saves).toHaveLength(1);
    await page.reload();
    await openModelAdvanced();
    await expect(mapInput("xhigh")).toHaveValue("xhigh");
    await expect(mapInput("max")).toHaveValue("max");
    await expect(mapInput("medium")).toHaveValue("mid");
    await expect(mapInput("high")).toHaveValue("strong");
    await expect(mapInput("minimal").locator("../..").getByText("minimal", { exact: true })).toHaveCSS("text-decoration-line", "line-through");
    await expect(mapInput("low").locator("../..").getByText("low", { exact: true })).toHaveCSS("text-decoration-line", "line-through");
    expect(saves).toHaveLength(1);
    expect(probes).toHaveLength(1);
  });
}
