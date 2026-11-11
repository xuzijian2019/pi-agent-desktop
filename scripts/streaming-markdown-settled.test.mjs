import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { markdownTextHasSettled } from "../e2e/streaming-markdown-settled.mjs";

const tail = "强调文字还在生成";
const timeline = {};
const animation = (playState, clock = timeline, endTime = 300) => ({
  playState, timeline: clock, effect: { getComputedTiming: () => ({ endTime }) },
});
function settled(animations = [], textContent = `正文，${tail}`, present = true) {
  const body = {
    textContent,
    getAnimations(options) {
      assert.equal(options.subtree, true);
      return animations;
    },
  };
  // Like Playwright, serialize the callback into a separate browser context.
  return runInNewContext(`(${markdownTextHasSettled})(${JSON.stringify(tail)})`, {
    document: {
      timeline,
      querySelector(selector) {
        assert.equal(selector, ".markdown-body");
        return present ? body : null;
      },
    },
  });
}

test("requires the body and final streamed text before taking a screenshot", () => {
  assert.equal(settled([], "", false), false);
  assert.equal(settled([], "正文，强调文字"), false);
  assert.equal(settled(), true);
});

test("waits for finite text fades, including paused and pending fades", () => {
  for (const state of ["running", "paused", "idle"]) {
    assert.equal(settled([animation(state)]), false, state);
  }
  assert.equal(settled([animation("finished")]), true);
  assert.equal(settled([animation("finished"), animation("running")]), false);
});

test("running and inactive scroll timelines do not block completed text fades", () => {
  const scrollFades = [animation("running", {}), animation("idle", {})];
  assert.equal(settled([...scrollFades, animation("running")]), false);
  assert.equal(settled([...scrollFades, animation("finished")]), true);
  assert.equal(settled(scrollFades), true);
});

test("no animations (including reduced motion) and non-finite animations settle", () => {
  assert.equal(settled(), true);
  assert.equal(settled([animation("running", timeline, Infinity)]), true);
});
