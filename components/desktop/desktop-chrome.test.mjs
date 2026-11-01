import assert from "node:assert/strict";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

/**
 * The window chrome moved out of AppShell.tsx, which used these expressions
 * inline:
 *
 *   className={`app-topbar${desktopPlatform === "macos" && … }`}
 *   data-tauri-drag-region={desktopPlatform ? true : undefined}
 *   {desktopPlatform && desktopPlatform !== "macos" && ( …buttons… )}
 *
 * The extraction replaced them with `isMacOS`, `dragRegionProps` and
 * `isDesktop && !isMacOS`. These tests pin that equivalence for every platform
 * value, so a refactor cannot quietly change which chrome a platform gets.
 */

// The real implementation, not a restatement of it — a copy would keep passing
// after someone changed the source. The alias mirrors tsconfig's "@/*" paths,
// which jiti does not read on its own.
const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const jiti = createJiti(import.meta.url, { alias: { "@": rootDir } });
const { desktopChromeFor: chromeFor } = await jiti.import("./useDesktopChrome.ts");

const PLATFORMS = ["macos", "windows", "linux", null];

// "deep" rather than the original bare `true`: Tauri's bare drag region only
// reacts to a press on the element itself, so the sidebar's controls row and
// the topbar title (children covering the region) could not move the window.
test("drag region is a deep data-tauri-drag-region on every desktop platform", () => {
  for (const platform of PLATFORMS) {
    const expected = platform ? "deep" : undefined;
    const chrome = chromeFor(platform);
    assert.equal(chrome.platform, platform);
    assert.equal(chrome.dragRegionProps["data-tauri-drag-region"], expected, `platform ${platform}`);
  }
});

test("sidebar, topbar and panel header keep descendant-aware drag regions", () => {
  const shell = readFileSync(new URL("../AppShell.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("../SessionSidebar.tsx", import.meta.url), "utf8");
  assert.equal(shell.match(/\{\.\.\.desktopChrome\.dragRegionProps\}/g)?.length, 2);
  assert.match(sidebar, /data-tauri-drag-region=\{desktopPlatform \? "deep" : undefined\}/);
  assert.match(sidebar, /sidebar-search-wrap[\s\S]*?data-no-drag data-tauri-drag-region=\{desktopPlatform \? "false" : undefined\}/);
});

test("mac inset matches the original desktopPlatform === 'macos' expression", () => {
  for (const platform of PLATFORMS) {
    assert.equal(chromeFor(platform).isMacOS, platform === "macos", `platform ${platform}`);
  }
});

test("custom window buttons render exactly where they used to", () => {
  for (const platform of PLATFORMS) {
    const legacy = Boolean(platform && platform !== "macos");
    const chrome = chromeFor(platform);
    assert.equal(chrome.isDesktop && !chrome.isMacOS, legacy, `platform ${platform}`);
  }
});

test("a browser build gets no desktop chrome at all", () => {
  const chrome = chromeFor(null);
  assert.equal(chrome.isDesktop, false);
  assert.equal(chrome.isMacOS, false);
  assert.deepEqual(chrome.dragRegionProps, {});
});

test("macOS keeps its native traffic lights and draws no buttons", () => {
  const chrome = chromeFor("macos");
  assert.equal(chrome.isDesktop, true);
  assert.equal(chrome.isMacOS, true);
  assert.equal(chrome.isDesktop && !chrome.isMacOS, false);
  assert.equal(chrome.dragRegionProps["data-tauri-drag-region"], "deep");
});

test("macOS traffic lights share the sidebar controls' centre line", () => {
  const css = readFileSync(new URL("../../app/native-theme.css", import.meta.url), "utf8");
  // The fork keeps a compact controls row beneath a shared 10px inset:
  // 10 + 28 / 2 = 24, matching the native traffic-light centre.
  const header = css.match(/\.session-sidebar-header \{([^}]*)\}/)?.[1] ?? "";
  const button = css.match(/\.sidebar-chrome-button \{([^}]*)\}/)?.[1] ?? "";
  assert.match(header, /padding: 10px 6px 0 !important;/);
  // The shared token is used by the button; pin both its use and its sole
  // definition so a future token change cannot silently break this alignment.
  assert.match(button, /height: var\(--control-h-md\);/);
  assert.deepEqual([...css.matchAll(/--control-h-md:\s*([^;]+);/g)].map((match) => match[1]), ["28px"]);
  assert.doesNotMatch(css, /\.session-sidebar-header--mac-inset \{[^}]*padding-top: 0 !important;/);
});

test("windows and linux draw their own buttons", () => {
  for (const platform of ["windows", "linux"]) {
    const chrome = chromeFor(platform);
    assert.equal(chrome.isDesktop && !chrome.isMacOS, true, `platform ${platform}`);
    assert.equal(chrome.dragRegionProps["data-tauri-drag-region"], "deep", `platform ${platform}`);
  }
});
