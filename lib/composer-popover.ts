export type PopoverPlacement = { left: number; bottom: number; width: number; maxHeight: number };

/**
 * Place a composer popover above its trigger, clamped inside the composer so a
 * narrow phone layout shrinks it instead of letting it hang off the viewport.
 * Pure geometry, so it can be tested without a DOM.
 */
export function placeAboveComposer(
  trigger: { left: number; top: number },
  composer: { left: number; right: number } | undefined,
  viewport: { width: number; height: number },
  desiredWidth = 420,
  inset = 12,
  maxHeight = 520,
): PopoverPlacement {
  const leftEdge = Math.max(inset, (composer?.left ?? 0) + inset);
  const rightEdge = Math.min(viewport.width - inset, (composer?.right ?? viewport.width) - inset);
  const width = Math.max(0, Math.min(desiredWidth, rightEdge - leftEdge));
  return {
    left: Math.max(leftEdge, Math.min(trigger.left, rightEdge - width)),
    bottom: viewport.height - trigger.top + 6,
    width,
    maxHeight: Math.max(0, Math.min(maxHeight, trigger.top - 18)),
  };
}
