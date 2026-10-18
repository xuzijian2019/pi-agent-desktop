import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { forkLocalePlugins, englishMessages } = await jiti.import("./locale-plugins.ts");
const { enLocale } = await jiti.import("./messages/en.ts");
const { zhCNLocale } = await jiti.import("./messages/zh-CN.ts");
const { zhTWLocale } = await jiti.import("./messages/zh-TW.ts");
const basePlugins = [enLocale, zhCNLocale, zhTWLocale];

// Git cannot follow a message moved to the patch layer while the fork edits
// its old location. Protect both sides of the extraction, not just key parity.
const forkKeys = [
  "wb.branch", "wb.draftChanged",
  "settings.browserNotifications", "settings.browserNotificationsDescription", "settings.browserNotificationsDenied",
  "appSettings.autoTitle", "appSettings.autoTitleHint",
  "appSettings.showMessageUsage", "appSettings.showMessageUsageHint", "appSettings.taglineWeb",
  "workspace.folderMissing", "workspace.pickFolder", "sidebar.cwdMissing", "sidebar.sessionActions",
  "contextPanel.fileActions", "contextPanel.copyPath", "contextPanel.copyContents", "contextPanel.wordWrap",
  "contextPanel.openExternally", "contextPanel.revealInFinder",
  "chat.loadFailed", "files.choosePreview", "chat.commandModel", "chat.commandThinking",
  "chat.commandSettings", "chat.commandHotkeys", "chat.commandSide", "chat.commandRecap",
  "side.title", "side.parentRunning", "recap.title", "recap.times",
  "agentSummary.label", "agentSummary.commands.one", "agentSummary.failed",
  "appshell.exportHtml", "appshell.exportHtmlHint", "appshell.exportHtmlUnsaved", "i18n.viewImage",
];

test("fork additions live only in composed locale packs, leaving upstream packs untouched", () => {
  assert.strictEqual(englishMessages, forkLocalePlugins[0].messages);
  for (const base of basePlugins) {
    const patched = forkLocalePlugins.find(({ id }) => id === base.id);
    assert.ok(patched, base.id);
    assert.notStrictEqual(patched, base);
    assert.notStrictEqual(patched.messages, base.messages);
    for (const key of forkKeys) {
      assert.equal(base.messages[key], undefined, `${base.id}.${key} must stay in the fork patch`);
      assert.equal(typeof patched.messages[key], "string", `${base.id}.${key} must survive extraction`);
      assert.ok(patched.messages[key].length > 0, `${base.id}.${key} must not be empty`);
    }
    assert.equal(typeof base.messages["settings.generalDescription"], "string");
    assert.equal(patched.messages["settings.generalDescription"], undefined);
    const source = readFileSync(new URL(`./messages/${base.id}.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /workbenchEn|workbenchZh|\.\.\.enLocale\.messages/);
  }
});

test("fork wording overrides and workbench fallbacks survive message extraction", () => {
  const messages = Object.fromEntries(forkLocalePlugins.map(({ id, messages }) => [id, messages]));
  assert.equal(englishMessages["title.generate"], "Regenerate title");
  assert.equal(englishMessages["title.generateSession"], "Uses the whole session so far");
  assert.equal(englishMessages["i18n.branches"], "Forks");
  assert.equal(englishMessages["chat.steerPlaceholder"], "Enter queues a follow-up · Ctrl+Enter steers now...");
  assert.equal(messages["zh-CN"]["title.generate"], "重新生成标题");
  assert.equal(messages["zh-CN"]["wb.branch"], "Git 分支");
  assert.equal(messages["zh-TW"]["wb.branch"], messages.en["wb.branch"]);
  assert.equal(messages["zh-TW"]["settings.browserNotifications"], "瀏覽器通知");
});

test("upstream recent-session and scheduler takeover messages survive fork composition", () => {
  for (const { id, messages } of forkLocalePlugins) {
    for (const key of [
      "settings.sectionPicker", "workspace.showPanel", "workspace.hidePanel",
      "sidebar.fetchBranches", "sidebar.fetchingBranches", "sidebar.removeWorktree",
      "sidebar.worktreesNeedGit", "sidebar.recent", "sidebar.today", "sidebar.showMoreSessions",
      "sidebar.switchBranch", "sidebar.switchBranchTitle", "sidebar.fetchBranchesTitle",
      "sidebar.branchRemoteTitle", "sidebar.branchInWorktreeTitle", "sidebar.remoteBranchTag", "sidebar.noOtherBranches",
      "scheduled.ownerDetails", "scheduled.ownerTakeoverHint", "scheduled.ownerTakeoverReady",
      "scheduled.checkAgain", "scheduled.takeOver", "scheduled.takingOver",
    ]) {
      assert.equal(typeof messages[key], "string", `${id}.${key}`);
    }
  }
});

test("fork-deleted completion sound and retired browser/stats labels stay removed", () => {
  for (const { id, messages } of forkLocalePlugins) {
    for (const key of [
      "settings.completionSound", "chat.enableSound", "chat.disableSound",
      "contextPanel.tabDiff", "contextPanel.browser", "contextPanel.browserAddress", "contextPanel.browserPlaceholder",
      "contextPanel.browserGo", "contextPanel.browserBack", "contextPanel.browserForward", "contextPanel.browserReload",
      "contextPanel.browserOpenExternal", "contextPanel.browserEmpty", "contextPanel.browserHint",
      "appshell.sessionStats", "appshell.statsHint",
    ]) {
      assert.equal(messages[key], undefined, `${id}.${key} was deliberately removed`);
    }
  }
});
