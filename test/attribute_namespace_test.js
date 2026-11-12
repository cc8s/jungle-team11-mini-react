import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolve_attribute_namespace,
  xlink_namespace,
  xml_namespace,
  xmlns_namespace,
} from '../src/attribute_namespace.js';

const svg_namespace = 'http://www.w3.org/2000/svg';
const mathml_namespace = 'http://www.w3.org/1998/Math/MathML';

test('EC-001 SVG와 MathML 요소에서는 HTML 파서 표의 11개 이름에 네임스페이스를 돌려준다', () => {
  for (const xlink_attribute_name of [
    'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type',
  ]) {
    assert.equal(resolve_attribute_namespace(svg_namespace, xlink_attribute_name), xlink_namespace);
  }
  assert.equal(resolve_attribute_namespace(svg_namespace, 'xml:lang'), xml_namespace);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'xml:space'), xml_namespace);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'xmlns'), xmlns_namespace);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'xmlns:xlink'), xmlns_namespace);
  assert.equal(resolve_attribute_namespace(mathml_namespace, 'xlink:href'), xlink_namespace);
});

test('EC-002 HTML 요소(namespace null)에서는 xlink:href도 네임스페이스가 없다', () => {
  assert.equal(resolve_attribute_namespace(null, 'xlink:href'), null);
  assert.equal(resolve_attribute_namespace(undefined, 'xml:lang'), null);
  assert.equal(resolve_attribute_namespace('http://www.w3.org/1999/xhtml', 'xlink:href'), null);
});

test('EC-003 표에 없는 이름, 대소문자가 다른 이름, 일반 이름은 null이다', () => {
  assert.equal(resolve_attribute_namespace(svg_namespace, 'href'), null);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'viewBox'), null);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'foo:bar'), null);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'XLINK:HREF'), null);
  assert.equal(resolve_attribute_namespace(svg_namespace, 'xlink:'), null);
  assert.equal(resolve_attribute_namespace(svg_namespace, '__proto__'), null);
});

test('EC-004 attribute_name이 문자열이 아니면 TypeError', () => {
  for (const invalid_name of [null, undefined, 42, {}]) {
    assert.throws(() => resolve_attribute_namespace(svg_namespace, invalid_name), TypeError);
  }
});
