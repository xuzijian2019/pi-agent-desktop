import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const {
  shouldChipPastedText,
  normalizePastedText,
  buildPasteToken,
  splicePastedTexts,
} = await createJiti(import.meta.url, { tsconfigPaths: true })
  .import("./pasted-text.ts");

test("chips pastes at the line or char threshold", () => {
  assert.equal(shouldChipPastedText(""), false);
  assert.equal(shouldChipPastedText("short paste"), false);
  assert.equal(shouldChipPastedText(Array.from({ length: 7 }, (_, i) => `line ${i}`).join("\n")), false);
  assert.equal(shouldChipPastedText(Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n")), true);
  assert.equal(shouldChipPastedText("x".repeat(499)), false);
  assert.equal(shouldChipPastedText("x".repeat(500)), true);
});

test("normalizes CRLF and one trailing newline", () => {
  assert.equal(normalizePastedText("a\r\nb\r"), "a\nb");
  assert.equal(normalizePastedText("a\n"), "a");
  assert.equal(normalizePastedText("a\n\n"), "a\n");
});

test("token is locale-stable and never triggers mention menus", () => {
  const token = buildPasteToken(1, "a\nb\nc");
  assert.equal(token, "[Pasted text 1 · 3 lines]");
  for (const ch of ["#", "@", "/", "!"]) {
    assert.equal(token.includes(ch), false);
  }
});

test("splices tokens into fenced blocks with line-start boundaries", () => {
  const chip = { token: "[Pasted text 1 · 2 lines]", content: "State  Recv-Q\nLISTEN 0" };
  assert.equal(
    splicePastedTexts(`look: ${chip.token} then`, [chip]),
    "look: \n```\nState  Recv-Q\nLISTEN 0\n```\n then",
  );
  assert.equal(
    splicePastedTexts(`${chip.token}\nquestion`, [chip]),
    "```\nState  Recv-Q\nLISTEN 0\n```\nquestion",
  );
  // Token at line start: no leading blank line is added.
  assert.equal(
    splicePastedTexts(`check:\n${chip.token}\nthanks`, [chip]),
    "check:\n```\nState  Recv-Q\nLISTEN 0\n```\nthanks",
  );
});

test("splices multiple chips and repeated tokens, drops missing tokens", () => {
  const a = { token: "[Pasted text 1 · 1 lines]", content: "one" };
  const b = { token: "[Pasted text 2 · 1 lines]", content: "two" };
  assert.equal(
    splicePastedTexts(`${a.token} mid ${a.token} end ${b.token}`, [a, b]),
    "```\none\n```\n mid \n```\none\n```\n end \n```\ntwo\n```",
  );
  assert.equal(splicePastedTexts("no tokens here", [a]), "no tokens here");
});

test("uses a longer fence when the paste contains backtick runs", () => {
  const chip = { token: "[Pasted text 1 · 2 lines]", content: "```\ncode\n```" };
  assert.equal(
    splicePastedTexts(chip.token, [chip]),
    "````\n```\ncode\n```\n````",
  );
});
