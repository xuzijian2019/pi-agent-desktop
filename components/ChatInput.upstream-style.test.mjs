import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(new URL('../app/native-theme.css', import.meta.url), 'utf8'));
function declarations(selector) {
  const result = {};
  css.walkRules(selector, rule => {
    if (rule.parent.type !== 'root') return;
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

test('composer card, textarea and send use desktop upstream geometry in either session state', () => {
  assert.equal(declarations('.chat-composer')['--composer-send-size'], '36px');
  assert.equal(declarations('.chat-composer-editor').padding, '0 0 0 4px');
  assert.equal(declarations('.chat-composer .chat-input-textarea::placeholder')['line-height'], 'var(--composer-line-height)');
  assert.equal(declarations('.chat-empty-state')['max-width'], '820px');
  assert.equal(declarations('.composer-send-button').background, 'var(--accent)');
  assert.equal(declarations('.composer-send-button:disabled').background, 'var(--bg-hover)');
  assert.equal(declarations('.composer-send-button:disabled').color, 'var(--text-dim)');
  assert.equal(declarations('.composer-attach-button').flex, '0 0 auto');
});

test('fork-only second layout rules no longer override the upstream input or controls', () => {
  for (const selector of ['.composer-textarea', '.chat-composer-controls.is-narrow', '.composer-controls-group.is-narrow', '.composer-send-row']) {
    assert.deepEqual(declarations(selector), {}, selector);
  }
  assert.notEqual(declarations('.chat-composer-editor').padding, '10px 10px 10px 14px');
});

test('separate workspace header truncates long branches without clipping the popup', () => {
  const header = declarations('.chat-workspace-header');
  assert.equal(header.display, 'flex');
  assert.equal(header['min-width'], '0');
  assert.equal(header['max-width'], '100%');
  assert.equal(header.overflow, 'visible');
  const trigger = declarations('.chat-workspace-header .workbench-branch-control > button');
  assert.equal(trigger['max-width'], 'min(240px, 100%)');
  assert.equal(trigger['text-overflow'], 'ellipsis');
});
