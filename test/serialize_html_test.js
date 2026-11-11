import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_element_node as element_node,
  create_text_node as text_node,
  create_comment_node as comment_node,
  create_fragment_node as fragment_node,
} from '../src/virtual_node.js';
import { serialize_to_html, escape_text, escape_attribute_value } from '../src/serialize_html.js';
import { svg_namespace_uri } from './support/fake_dom.js';

test('EC-001 Virtual DOM 노드가 아니면 TypeError', () => {
  for (const invalid_input of [null, undefined, '<p>', {}]) {
    assert.throws(() => serialize_to_html(invalid_input), TypeError);
  }
});

test('EC-002 텍스트의 &, <, >, nbsp를 이스케이프해 innerHTML XSS를 막는다', () => {
  assert.equal(escape_text('a & <img src=x onerror=alert(1)> '), 'a &amp; &lt;img src=x onerror=alert(1)&gt;&nbsp;');
  assert.equal(
    serialize_to_html(fragment_node([element_node('p', null, [text_node('<b>굵게</b>')])])),
    '<p>&lt;b&gt;굵게&lt;/b&gt;</p>',
  );
});

test('EC-003 attribute 값의 따옴표와 &를 이스케이프한다', () => {
  assert.equal(escape_attribute_value('say "hi" & bye'), 'say &quot;hi&quot; &amp; bye');
  assert.equal(
    serialize_to_html(element_node('a', { href: '/?a=1&b=2', title: '"q"' })),
    '<a href="/?a=1&amp;b=2" title="&quot;q&quot;"></a>',
  );
});

test('EC-004 void 요소는 닫는 태그가 없다', () => {
  assert.equal(
    serialize_to_html(fragment_node([element_node('input', { id: 'memo' }), element_node('br')])),
    '<input id="memo"><br>',
  );
});

test('EC-005 style 안의 텍스트는 이스케이프하지 않는다', () => {
  assert.equal(
    serialize_to_html(element_node('style', null, [text_node('p > b { color: red }')])),
    '<style>p > b { color: red }</style>',
  );
});

test('EC-006 주석과 공백 텍스트를 그대로 직렬화한다', () => {
  assert.equal(
    serialize_to_html(fragment_node([comment_node(' 메모 '), text_node('\n  '), element_node('p')])),
    '<!-- 메모 -->\n  <p></p>',
  );
});

test('EC-007 SVG 요소는 이름이 HTML void 요소와 같아도 닫는 태그를 쓴다', () => {
  const svg_tree = element_node(
    'svg',
    { viewBox: '0 0 10 10' },
    [element_node('source', null, [], svg_namespace_uri), element_node('text', null, [text_node('a<b')], svg_namespace_uri)],
    svg_namespace_uri,
  );
  assert.equal(
    serialize_to_html(svg_tree),
    '<svg viewBox="0 0 10 10"><source></source><text>a&lt;b</text></svg>',
  );
});

test('EC-008 빈 루트는 빈 문자열이다', () => {
  assert.equal(serialize_to_html(fragment_node()), '');
});

test('EC-009 pre, textarea, listing의 텍스트가 줄바꿈으로 시작하면 파서가 버릴 줄바꿈을 하나 더 쓴다', () => {
  for (const element_name of ['pre', 'textarea', 'listing']) {
    const block_node = element_node(element_name, null, [text_node('\n둘째 줄')]);
    assert.equal(serialize_to_html(block_node), `<${element_name}>\n\n둘째 줄</${element_name}>`);
  }
  assert.equal(serialize_to_html(element_node('pre', null, [text_node('첫 줄\n')])), '<pre>첫 줄\n</pre>');
  assert.equal(serialize_to_html(element_node('pre', null, [element_node('b', null, [text_node('\n')])])), '<pre><b>\n</b></pre>');
  assert.equal(
    serialize_to_html(element_node('pre', null, [text_node('\n')], svg_namespace_uri)),
    '<pre>\n</pre>',
    'SVG 등 HTML이 아닌 요소에는 줄바꿈 규칙이 없다',
  );
});

test('EC-010 noscript 안의 텍스트는 이스케이프한다 (inert 파싱은 script가 꺼져 있어 일반 요소로 읽는다)', () => {
  const noscript_node = element_node('noscript', null, [text_node('<img src=x onerror=alert(1)>')]);
  assert.equal(serialize_to_html(noscript_node), '<noscript>&lt;img src=x onerror=alert(1)&gt;</noscript>');
});

test('EC-011 plaintext 요소는 문서 끝까지 이어지므로 자신과 조상의 닫는 태그를 쓰지 않는다', () => {
  const plaintext_tree = fragment_node([
    element_node('div', null, [text_node('앞'), element_node('plaintext', null, [text_node('abc</plaintext><p>뒤</p>')])]),
  ]);
  assert.equal(serialize_to_html(plaintext_tree), '<div>앞<plaintext>abc</plaintext><p>뒤</p>');
  assert.equal(
    serialize_to_html(element_node('p', null, [text_node('a')])),
    '<p>a</p>',
    'plaintext를 쓴 뒤의 상태가 다음 호출에 남지 않는다',
  );
});
