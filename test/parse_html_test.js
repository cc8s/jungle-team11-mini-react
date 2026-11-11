import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse_html_to_virtual_tree } from '../src/parse_html.js';
import { fake_document } from './support/fake_dom.js';

test('EC-001 html_text가 문자열이 아니면 TypeError', () => {
  const owner_document = new fake_document();
  for (const invalid_text of [null, undefined, 42, {}, ['<p>']]) {
    assert.throws(() => parse_html_to_virtual_tree(invalid_text, owner_document), TypeError);
  }
});

test('EC-002 document가 없거나 createElement가 없으면 TypeError', () => {
  for (const invalid_document of [null, undefined, {}, { createElement: 'div' }]) {
    assert.throws(() => parse_html_to_virtual_tree('<p>a</p>', invalid_document), TypeError);
  }
});
