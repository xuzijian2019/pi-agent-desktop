import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebarSource = readFileSync(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const messageSource = readFileSync(new URL("./MessageView.tsx", import.meta.url), "utf8");

test("session rows keep the action menu reachable on touch devices", () => {
  assert.match(sidebarSource, /matchMedia\?\.\("\(hover: none\)"\)/);
  assert.match(sidebarSource, /hovered \|\| treeFocused \|\| touchMode \|\| menuOpen \?/);
});

test("message actions stay reachable for keyboard and touch users", () => {
  assert.match(messageSource, /className="msg-actions" data-visible=\{hovered\}/);
  assert.match(messageSource, /className="user-msg-actions msg-actions"/);
  assert.match(messageSource, /aria-live="polite"/);
  assert.doesNotMatch(messageSource, /pointerEvents: hovered/);
  assert.doesNotMatch(messageSource, /opacity: hovered/);
});

test("busy sessions disable in-session edits without hiding the action", () => {
  const chatWindowSource = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(chatWindowSource, /onEditContent=\{stableHandleEditContent\}/);
  assert.match(chatWindowSource, /if \(sessionBusyRef\.current\) return;/);
  assert.match(chatWindowSource, /editDisabled=\{sessionBusy\}/);
  assert.match(messageSource, /disabled=\{editBlocked\}/);
  assert.match(messageSource, /t\("i18n\.editFromHereBusyTitle"\)/);
});

test("rename and delete failures surface an error instead of being swallowed", () => {
  assert.match(sidebarSource, /sidebar\.renameFailed/);
  assert.match(sidebarSource, /sidebar\.deleteFailed/);
  assert.match(sidebarSource, /role="alert"/);
  assert.doesNotMatch(sidebarSource, /\/\* ignore \*\//);
});

test("interrupted tool calls render a cancelled marker instead of success styling", () => {
  // Loaded (non-streaming) message + no paired result ⇒ aborted.
  assert.match(messageSource, /aborted=\{!isStreaming && !result\}/);
  assert.match(messageSource, /t\("chat\.toolCancelled"\)/);
  // Aborted styling is a data-status modifier (fork keeps tool cards class-based).
  assert.match(messageSource, /data-status=\{isError \? "error" : aborted \? "aborted" : "ok"\}/);
  assert.match(messageSource, /className="msg-tool-cancelled"/);
});


test("memoized messages rerender when edit availability changes", async () => {
  const { Script } = await import("node:vm");
  const start = messageSource.indexOf("}, (prev, next) => {");
  assert.notEqual(start, -1);
  const end = messageSource.indexOf("\n});", start);
  assert.notEqual(end, -1);
  const comparator = messageSource.slice(start + 3, end + 2);
  const context = { haveSameRelevantToolResults: () => true };
  new Script("globalThis.compare = " + comparator).runInNewContext(context);
  const props = { message: { role: "user", content: [] }, editDisabled: false };
  assert.equal(context.compare(props, { ...props }), true);
  assert.equal(context.compare(props, { ...props, editDisabled: true }), false);
  assert.equal(context.compare({ ...props, editDisabled: true }, props), false);
  assert.equal(context.compare(props, { ...props, onEditContent: () => {} }), false);
});
