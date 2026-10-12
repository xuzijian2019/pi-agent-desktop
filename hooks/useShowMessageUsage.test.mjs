import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the per-message usage line is shown unless the user switched it off", async () => {
  const { APP_PREF_KEYS, getPrefBool, setPrefBool } = await jiti.import("@/lib/app-prefs.ts");
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  try {
    assert.equal(getPrefBool(APP_PREF_KEYS.showMessageUsage, true), true);
    setPrefBool(APP_PREF_KEYS.showMessageUsage, false);
    assert.equal(getPrefBool(APP_PREF_KEYS.showMessageUsage, true), false);
  } finally {
    delete globalThis.window;
  }
});

test("only the per-message line is gated; ring, /session and codemode cost stay", async () => {
  const message = await read("../components/MessageView.tsx");
  assert.match(message, /showUsage && message\.usage && !isStreaming/);

  for (const file of ["ContextUsageRing.tsx", "ChatCommandDialog.tsx", "CodemodeToolView.tsx"]) {
    assert.doesNotMatch(await read(`../components/${file}`), /useShowMessageUsage/, `${file} must not be gated`);
  }
});

test("Settings › General exposes the switch in every locale", async () => {
  assert.match(await read("../components/SettingsPanel.tsx"), /useShowMessageUsage\(\)/);
  for (const locale of ["en", "zh-CN", "zh-TW"]) {
    const messages = await read(`../lib/i18n/messages/${locale}.ts`);
    assert.match(messages, /"appSettings\.showMessageUsage":/, locale);
    assert.match(messages, /"appSettings\.showMessageUsageHint":/, locale);
  }
});
