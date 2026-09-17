/**
 * Large plain-text pastes are intercepted in the composer and replaced with a
 * compact placeholder token ("[Pasted text 1 · 42 lines]"); the full content
 * is kept aside and spliced back as a fenced code block on send. Fencing keeps
 * the rendered message (and the model input) whitespace-faithful instead of
 * letting the markdown renderer mangle terminal output.
 */

export interface PastedTextChip {
  id: number;
  token: string;
  content: string;
}

/** Draft persistence shape — token is derived on load, not stored. */
export interface ChatDraftText {
  id: number;
  content: string;
}

export const PASTE_LINE_THRESHOLD = 8;
export const PASTE_CHAR_THRESHOLD = 500;

export function shouldChipPastedText(text: string): boolean {
  if (!text) return false;
  if (text.length >= PASTE_CHAR_THRESHOLD) return true;
  return text.split("\n").length >= PASTE_LINE_THRESHOLD;
}

/** CRLF → LF and drop one trailing newline (terminal pastes usually end with one). */
export function normalizePastedText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

export function buildPasteToken(id: number, content: string): string {
  const lines = content.split("\n").length;
  // Deliberately locale-independent and free of #/@//! — the token must stay
  // stable for splicing and must not trigger the composer's mention menus.
  return `[Pasted text ${id} · ${lines} lines]`;
}

/**
 * Replace every chip token found in the composer value with a fenced code
 * block. Tokens that the user deleted are dropped silently. Newlines are
 * inserted around the fence when the token sits mid-line so the fence always
 * opens at the start of a line.
 */
export function splicePastedTexts(value: string, pastedTexts: ReadonlyArray<{ token: string; content: string }>): string {
  let result = value;
  for (const paste of pastedTexts) {
    if (result.includes(paste.token)) {
      result = replaceAllTokens(result, paste.token, paste.content);
    }
  }
  return result;
}

function replaceAllTokens(value: string, token: string, content: string): string {
  let result = "";
  let rest = value;
  for (;;) {
    const index = rest.indexOf(token);
    if (index === -1) {
      result += rest;
      return result;
    }
    result += rest.slice(0, index);
    if (result && !result.endsWith("\n")) result += "\n";
    result += fencedBlock(content);
    rest = rest.slice(index + token.length);
    if (rest && !rest.startsWith("\n")) result += "\n";
  }
}

/** CommonMark: an outer fence must be longer than any backtick run inside. */
function fencedBlock(content: string): string {
  const longestRun = content.match(/`{3,}/g)
    ?.reduce((max, run) => Math.max(max, run.length), 2) ?? 2;
  const fence = "`".repeat(longestRun + 1);
  return `${fence}\n${content}\n${fence}`;
}
