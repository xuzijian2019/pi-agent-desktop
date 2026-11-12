// Passed directly to Playwright, so keep this function self-contained.
export function markdownTextHasSettled(expectedTail) {
  const body = document.querySelector(".markdown-body");
  if (!body?.textContent.endsWith(expectedTail)) return false;
  // Text fades finish on the document clock. Table edge fades instead follow
  // scroll position (or have an inactive timeline without overflow), so waiting
  // for every subtree animation to finish would never settle this screenshot.
  return body.getAnimations({ subtree: true })
    .filter((animation) => animation.timeline === document.timeline
      && Number.isFinite(animation.effect?.getComputedTiming().endTime))
    .every((animation) => animation.playState === "finished");
}
