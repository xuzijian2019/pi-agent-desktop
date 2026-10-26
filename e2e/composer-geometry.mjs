import assert from "node:assert/strict";
import {mkdir} from 'node:fs/promises';

export async function checkComposerGeometry(page) {
  await mkdir("test-results/ui-send", { recursive: true });
  const input = page.locator(".chat-composer textarea");
  const previousDraft = await input.inputValue();
  const card = page.locator('.chat-composer');
  const previousSize = await card.evaluate(el => el.style.getPropertyValue('--chat-content-font-size'));
  const heights = [];
  try {
    // Empty placeholder, entered text and the first line of a tall draft must
    // stay readable across the supported font-size range. The fork deliberately
    // keeps attachment controls below the card, not beside the first text line.
    for (const size of [12, 14, 20, 24]) {
      await card.evaluate((el, size) => el.style.setProperty('--chat-content-font-size', `${size}px`), size);
      for (const draft of ['', '给 Pi 发消息…', 'First line\nSecond line\nThird line']) {
        await input.fill(draft);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const alignment = await card.evaluate(el => {
          const text = el.querySelector('textarea');
          const shell = el.closest('.chat-input-shell');
          const attach = shell.querySelector('.composer-attach-button svg');
          const style = getComputedStyle(text), box = text.getBoundingClientRect();
          const outer = el.getBoundingClientRect(), icon = attach.getBoundingClientRect();
          return {
            attachOutsideCard: !el.contains(attach), attachTop: icon.top, cardBottom: outer.bottom,
            textLeft: box.left, textRight: box.right, cardLeft: outer.left, cardRight: outer.right,
            fontSize: parseFloat(style.fontSize),
            placeholderLine: parseFloat(getComputedStyle(text, '::placeholder').lineHeight), line: parseFloat(style.lineHeight),
            overflow: text.scrollHeight - text.clientHeight,
          };
        });
        assert.equal(alignment.attachOutsideCard, true, 'Fork attachment control belongs below the input card');
        assert.ok(alignment.attachTop >= alignment.cardBottom, `Attachment control must not overlap text: ${JSON.stringify(alignment)}`);
        assert.ok(alignment.textLeft >= alignment.cardLeft && alignment.textRight <= alignment.cardRight, `Text must fit inside its card: ${JSON.stringify(alignment)}`);
        assert.equal(alignment.fontSize, page.viewportSize().width <= 640 ? Math.max(16, size) : size, 'Requested font size must actually apply');
        assert.ok(Math.abs(alignment.placeholderLine - alignment.line) < 0.1, 'Placeholder must use the actual text line height');
        if (!draft) assert.ok(alignment.overflow <= 1, `Empty input must not have a vertical scrollbar at ${size}px / ${page.viewportSize().width}px: ${JSON.stringify(alignment)}`);
        if (size === 14) {
          const theme=await page.locator('html').evaluate(el=>el.classList.contains('dark')?'dark':'light');
          const width=page.viewportSize().width;
          await card.screenshot({path:`test-results/ui-send/composer-alignment-${theme}-${width}-${draft.includes('\n')?'multiline':draft?'text':'empty'}.png`});
        }
      }
    }
    await card.evaluate((el, size) => size ? el.style.setProperty('--chat-content-font-size', size) : el.style.removeProperty('--chat-content-font-size'), previousSize);
    for (const draft of ["Short draft", "First line\nSecond line\nThird line\nFourth line", "A long draft that wraps naturally. ".repeat(80), "Short again"]) {
      await input.fill(draft);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await page.locator(".chat-composer").evaluate((card) => {
        const button = card.querySelector(".composer-send-button");
        const outer = card.getBoundingClientRect();
        const inner = button.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(card).borderBottomRightRadius);
        return {
          height: outer.height,
          width: inner.width,
          buttonHeight: inner.height,
          radius,
          dx: outer.right - radius - (inner.left + inner.width / 2),
          dy: outer.bottom - radius - (inner.top + inner.height / 2),
        };
      });
      assert.ok(Math.abs(geometry.width - geometry.buttonHeight) < 0.5, "Send must remain circular");
      assert.ok(Math.abs(geometry.dx) < 0.5, `Horizontal arc centers must coincide: ${JSON.stringify(geometry)}`);
      assert.ok(Math.abs(geometry.dy) < 0.5, `Vertical arc centers must coincide after resizing: ${JSON.stringify(geometry)}`);
      heights.push(geometry.height);
    }
    assert.ok(heights[1] > heights[0], "Newlines must grow the input card");
    assert.ok(heights[2] >= heights[1], "Wrapped text must preserve the geometry through the height limit");
    assert.ok(Math.abs(heights[3] - heights[0]) < 0.5, "Removing newlines must shrink the card back");
  } finally {
    await card.evaluate((el, size) => size ? el.style.setProperty('--chat-content-font-size', size) : el.style.removeProperty('--chat-content-font-size'), previousSize);
    await input.fill(previousDraft);
  }
}
