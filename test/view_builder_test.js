import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_view_element,
  create_view_root,
  normalize_view_children,
  find_event_handler,
  collect_event_types,
  count_view_nodes,
} from '../src/view_builder.js';
import { create_text_node, create_fragment_node, is_same_tree } from '../src/virtual_node.js';
import { svg_namespace_uri } from './support/fake_dom.js';

test('EC-001 문자열·숫자는 텍스트 노드, 배열과 #fragment는 펼치고 null·undefined·불리언은 건너뛴다', () => {
  const normalized_children = normalize_view_children([
    'first',
    7,
    null,
    undefined,
    false,
    true,
    ['nested', ['deep']],
    create_fragment_node([create_text_node('fragment_child')]),
    '',
  ]);
  assert.deepEqual(
    normalized_children.map((child_node) => child_node.text),
    ['first', '7', 'nested', 'deep', 'fragment_child', ''],
  );
});

test('EC-002 그릴 수 없는 값(일반 객체, 함수, Symbol)은 TypeError', () => {
  for (const invalid_child of [{ text: 'fake' }, () => 'text', Symbol('child')]) {
    assert.throws(() => normalize_view_children([invalid_child]), TypeError);
  }
});

test('EC-003 attribute: null·undefined·false는 없음, true는 빈 값, 숫자는 문자열, "__proto__"도 일반 값', () => {
  const button_node = create_view_element('button', {
    attributes: { disabled: true, hidden: false, title: null, tabindex: 0, 'aria-label': undefined },
  });
  assert.deepEqual(Object.keys(button_node.attributes).sort(), ['disabled', 'tabindex']);
  assert.equal(button_node.attributes.disabled, '');
  assert.equal(button_node.attributes.tabindex, '0');

  const proto_node = create_view_element('div', { attributes: JSON.parse('{"__proto__":"safe"}') });
  assert.equal(Object.getPrototypeOf(proto_node.attributes), null);
  assert.equal(proto_node.attributes.__proto__, 'safe');
});

test('EC-004 attribute에 함수를 넣으면 TypeError (event_handlers로 안내)', () => {
  assert.throws(() => create_view_element('button', { attributes: { onclick: () => {} } }), /event_handlers/);
});

test('EC-005 on* 문자열, srcdoc, javascript: URL attribute는 만들지 않는다 (innerHTML XSS 방지)', () => {
  const link_node = create_view_element('a', {
    attributes: { href: ' JaVa\tScript:alert(1)', onclick: 'alert(1)', class: 'link' },
  });
  assert.deepEqual(Object.keys(link_node.attributes), ['class']);
  const frame_node = create_view_element('iframe', { attributes: { srcdoc: '<script>alert(1)</script>' } });
  assert.deepEqual(Object.keys(frame_node.attributes), []);
  const text_node = create_view_element('p', null, ['<img src=x onerror=alert(1)>']);
  assert.equal(text_node.children[0].type, '#text');
});

test('EC-006 script 등 막힌 요소와 잘못된 element_type은 TypeError', () => {
  for (const blocked_name of ['script', 'SCRIPT', 'base', 'object']) {
    assert.throws(() => create_view_element(blocked_name), TypeError);
  }
  for (const invalid_type of [null, undefined, '', 3, '#text']) {
    assert.throws(() => create_view_element(invalid_type), TypeError);
  }
});

test('EC-007 view_options와 attributes, event_handlers가 객체가 아니면 TypeError', () => {
  assert.throws(() => create_view_element('div', 'class'), TypeError);
  assert.throws(() => create_view_element('div', []), TypeError);
  assert.throws(() => create_view_element('div', { attributes: 'class' }), TypeError);
  assert.throws(() => create_view_element('div', { event_handlers: [] }), TypeError);
});

test('EC-008 이벤트 핸들러는 노드 밖에 저장되고 노드는 동결된 순수 데이터로 남는다', () => {
  const click_handler = () => {};
  const button_node = create_view_element('button', { event_handlers: { click: click_handler } }, ['go']);
  assert.equal(Object.isFrozen(button_node), true);
  assert.deepEqual(Object.keys(button_node), ['type', 'key', 'namespace', 'attributes', 'children']);
  assert.equal(find_event_handler(button_node, 'click'), click_handler);
  assert.equal(find_event_handler(button_node, 'input'), null);
  // 핸들러는 diff 비교 대상이 아니다: 핸들러만 다른 두 노드는 같은 트리다.
  const other_button_node = create_view_element('button', { event_handlers: { click: () => {} } }, ['go']);
  assert.equal(is_same_tree(button_node, other_button_node), true);
});

test('EC-009 핸들러가 함수가 아니면 TypeError, null 핸들러는 없는 것, 잘못된 이벤트 이름은 TypeError', () => {
  assert.throws(() => create_view_element('button', { event_handlers: { click: 'alert(1)' } }), TypeError);
  assert.throws(() => create_view_element('button', { event_handlers: { onClick: () => {} } }), TypeError);
  assert.throws(() => create_view_element('button', { event_handlers: { '': () => {} } }), TypeError);
  const button_node = create_view_element('button', { event_handlers: { click: null } });
  assert.equal(find_event_handler(button_node, 'click'), null);
  assert.deepEqual([...collect_event_types(create_view_root(button_node))], []);
});

test('EC-010 find_event_handler에 노드가 아닌 값을 넣으면 null', () => {
  for (const non_node of [null, undefined, 'button', {}]) assert.equal(find_event_handler(non_node, 'click'), null);
});

test('EC-011 collect_event_types는 트리 전체의 이벤트 이름을 중복 없이 모은다', () => {
  const root_node = create_view_root([
    create_view_element('form', { event_handlers: { submit: () => {} } }, [
      create_view_element('input', { event_handlers: { input: () => {}, focus: () => {} } }),
      create_view_element('button', { event_handlers: { click: () => {} } }, ['저장']),
    ]),
    create_view_element('button', { event_handlers: { click: () => {} } }, ['취소']),
  ]);
  assert.deepEqual([...collect_event_types(root_node)].sort(), ['click', 'focus', 'input', 'submit']);
});

test('EC-012 create_view_root는 같은 노드 객체가 두 곳에 있으면 TypeError', () => {
  const shared_icon_node = create_view_element('span', null, ['★']);
  assert.throws(
    () => create_view_root([create_view_element('p', null, [shared_icon_node]), shared_icon_node]),
    /두 곳/,
  );
  const shared_text_node = create_text_node('같은 텍스트');
  assert.throws(() => create_view_root([shared_text_node, shared_text_node]), /두 곳/);
});

test('EC-013 SVG 네임스페이스는 namespace 옵션으로 지정한다', () => {
  const svg_node = create_view_element('svg', { namespace: svg_namespace_uri, attributes: { viewBox: '0 0 10 10' } });
  assert.equal(svg_node.namespace, svg_namespace_uri);
  assert.equal(svg_node.attributes.viewBox, '0 0 10 10');
});

test('EC-014 깊게 중첩된 배열(10000단계)과 대량 형제(5000개)도 스택 넘침 없이 펼친다', () => {
  let nested_children = 'leaf';
  for (let depth = 0; depth < 10000; depth += 1) nested_children = [nested_children];
  assert.equal(normalize_view_children(nested_children)[0].text, 'leaf');
  const many_children = Array.from({ length: 5000 }, (unused_entry, index) => create_view_element('li', null, [String(index)]));
  assert.equal(create_view_root(create_view_element('ul', null, many_children)).children[0].children.length, 5000);
});

test('EC-015 count_view_nodes는 루트 #fragment를 빼고 요소·텍스트 노드를 모두 센다', () => {
  const root_node = create_view_root([
    create_view_element('ul', null, [create_view_element('li', null, ['하나']), create_view_element('li', null, ['둘'])]),
    '끝',
  ]);
  assert.equal(count_view_nodes(root_node), 6);
  assert.equal(count_view_nodes(create_view_root(null)), 0);
  assert.equal(count_view_nodes(create_view_element('p', null, ['단독'])), 2, '#fragment가 아닌 노드는 자신도 셈');
  assert.equal(count_view_nodes(null), 0);
});
