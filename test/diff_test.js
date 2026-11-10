import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_element_node as element_node,
  create_text_node as text_node,
  create_fragment_node as fragment_node,
  is_same_tree,
} from '../src/virtual_node.js';
import { diff_trees, match_children, share_unchanged_nodes, operation_kinds } from '../src/diff.js';
import { summarize_operations } from '../src/operation_summary.js';
import { svg_namespace_uri } from './support/fake_dom.js';

function list_tree(item_keys, text_prefix = '') {
  return fragment_node([
    element_node(
      'ul',
      { id: 'todo_list' },
      item_keys.map((item_key) => element_node('li', { id: item_key }, [text_node(`${text_prefix}${item_key}`)])),
    ),
  ]);
}

// 화면에 보이는지와 상관없이 diff가 만든 연산 종류만 센다(BIND 제외).
function counts_of(operations) {
  const counts_by_kind = {};
  for (const operation of operations) {
    if (operation.kind !== operation_kinds.bind) counts_by_kind[operation.kind] = (counts_by_kind[operation.kind] ?? 0) + 1;
  }
  return counts_by_kind;
}

test('EC-001 diff_trees에 Virtual DOM 노드가 아닌 값을 넣으면 TypeError', () => {
  assert.throws(() => diff_trees(null, fragment_node()), TypeError);
  assert.throws(() => diff_trees(fragment_node(), undefined), TypeError);
  assert.throws(() => diff_trees('div', 'div'), TypeError);
});

test('EC-002 같은 참조면 연산이 없다', () => {
  const tree = list_tree(['a', 'b']);
  assert.deepEqual(diff_trees(tree, tree), []);
});

test('EC-003 내용이 같은 다른 객체는 BIND만 만들고 변경으로 세지 않는다', () => {
  const operations = diff_trees(list_tree(['a', 'b']), list_tree(['a', 'b']));
  assert.ok(operations.length > 0);
  assert.ok(operations.every((operation) => operation.kind === operation_kinds.bind));
  assert.equal(summarize_operations(operations).total_count, 0);
});

test('EC-004 텍스트 하나만 바뀌면 TEXT 1개', () => {
  const old_tree = fragment_node([element_node('p', null, [text_node('안녕')])]);
  const new_tree = fragment_node([element_node('p', null, [text_node('안녕하세요')])]);
  const operations = diff_trees(old_tree, new_tree);
  assert.deepEqual(counts_of(operations), { TEXT: 1 });
  const text_operation = operations.find((operation) => operation.kind === operation_kinds.text);
  assert.equal(text_operation.old_node, old_tree.children[0].children[0]);
  assert.equal(text_operation.text, '안녕하세요');
});

test('EC-005 attribute 변경과 제거를 ATTRIBUTES 1개로 묶는다', () => {
  const old_tree = fragment_node([element_node('p', { class: 'a', title: 'x' })]);
  const new_tree = fragment_node([element_node('p', { class: 'b', lang: 'ko' })]);
  const operations = diff_trees(old_tree, new_tree);
  assert.deepEqual(counts_of(operations), { ATTRIBUTES: 1 });
  const attribute_operation = operations.find((operation) => operation.kind === operation_kinds.attributes);
  assert.deepEqual({ ...attribute_operation.changed_attributes }, { class: 'b', lang: 'ko' });
  assert.deepEqual(attribute_operation.removed_attribute_names, ['title']);
});

test('EC-006 key가 있는 항목의 순서 변경은 MOVE로만 처리한다', () => {
  const operations = diff_trees(list_tree(['a', 'b', 'c']), list_tree(['c', 'a', 'b']));
  assert.deepEqual(counts_of(operations), { MOVE: 1 });
});

test('EC-007 key가 있는 목록 맨 앞에 추가하면 ADD 1개만 생긴다', () => {
  const operations = diff_trees(list_tree(['a', 'b']), list_tree(['z', 'a', 'b']));
  assert.deepEqual(counts_of(operations), { ADD: 1 });
  const add_operation = operations.find((operation) => operation.kind === operation_kinds.add);
  assert.equal(add_operation.index, 0);
});

test('EC-008 key가 없는 형제 맨 앞에 추가해도 내용이 같은 형제를 먼저 짝지어 ADD 1개만 생긴다', () => {
  const old_tree = fragment_node([element_node('p', null, [text_node('1')]), element_node('p', null, [text_node('2')])]);
  const new_tree = fragment_node([
    element_node('p', null, [text_node('0')]),
    element_node('p', null, [text_node('1')]),
    element_node('p', null, [text_node('2')]),
  ]);
  assert.deepEqual(counts_of(diff_trees(old_tree, new_tree)), { ADD: 1 });
});

test('EC-019 들여쓰기 공백 텍스트가 섞인 목록에 항목을 넣으면 요소와 공백 ADD만 생긴다', () => {
  const indent_text = '\n    ';
  const closing_text = '\n  ';
  const old_tree = fragment_node([
    element_node('ul', null, [
      text_node(indent_text), element_node('li', { id: 'a' }, [text_node('a')]),
      text_node(indent_text), element_node('li', { id: 'b' }, [text_node('b')]),
      text_node(closing_text),
    ]),
  ]);
  const new_tree = fragment_node([
    element_node('ul', null, [
      text_node(indent_text), element_node('li', { id: 'a' }, [text_node('a')]),
      text_node(indent_text), element_node('li', { id: 'new' }, [text_node('new')]),
      text_node(indent_text), element_node('li', { id: 'b' }, [text_node('b')]),
      text_node(closing_text),
    ]),
  ]);
  assert.deepEqual(counts_of(diff_trees(old_tree, new_tree)), { ADD: 2 });
});

test('EC-020 key 없는 형제는 내용이 같은 노드를 찾지 못하면 남은 것끼리 위치로 짝짓는다', () => {
  const old_children = [text_node('공백'), element_node('h2', null, [text_node('제목')]), element_node('p', null, [text_node('본문')])];
  const new_children = [text_node('공백'), element_node('h3', null, [text_node('제목')]), element_node('p', null, [text_node('본문!')])];
  const { matched_old_children, replaced_old_children } = match_children(old_children, new_children);
  assert.equal(matched_old_children[0], old_children[0]);
  assert.equal(replaced_old_children[1], old_children[1]);
  assert.equal(matched_old_children[2], old_children[2]);
});

test('EC-009 같은 위치의 태그가 바뀌면 REPLACE', () => {
  const old_tree = fragment_node([element_node('p', null, [text_node('제목')])]);
  const new_tree = fragment_node([element_node('h2', null, [text_node('제목')])]);
  assert.deepEqual(counts_of(diff_trees(old_tree, new_tree)), { REPLACE: 1 });
});

test('EC-010 중복 key는 첫 번째만 key로 짝짓고 나머지는 추가/제거한다', () => {
  const old_children = [element_node('li', { id: 'a' }), element_node('li', { id: 'a', class: 'second' })];
  const new_children = [element_node('li', { id: 'a' }), element_node('li', { id: 'a', class: 'second' })];
  const { matched_old_children } = match_children(old_children, new_children);
  assert.equal(matched_old_children[0], old_children[0]);
  assert.equal(matched_old_children[1], null);
  const operations = diff_trees(fragment_node(old_children), fragment_node(new_children));
  assert.deepEqual(counts_of(operations), { REMOVE: 1, ADD: 1 });
});

test('EC-011 key는 같고 태그가 다르면 REMOVE와 ADD', () => {
  const old_tree = fragment_node([element_node('li', { id: 'a' })]);
  const new_tree = fragment_node([element_node('p', { id: 'a' })]);
  assert.deepEqual(counts_of(diff_trees(old_tree, new_tree)), { REMOVE: 1, ADD: 1 });
});

test('EC-012 루트 종류가 다르면 루트 REPLACE', () => {
  const operations = diff_trees(element_node('div'), element_node('section'));
  assert.equal(operations.length, 1);
  assert.equal(operations[0].kind, operation_kinds.replace);
});

test('EC-013 네임스페이스가 다르면 같은 태그 이름이어도 REPLACE', () => {
  const old_tree = fragment_node([element_node('a')]);
  const new_tree = fragment_node([element_node('a', null, [], svg_namespace_uri)]);
  assert.deepEqual(counts_of(diff_trees(old_tree, new_tree)), { REPLACE: 1 });
});

test('EC-014 share_unchanged_nodes는 안 바뀐 하위 트리를 이전 객체로 공유하고 바뀐 노드와 조상만 새로 만든다', () => {
  const old_tree = list_tree(['a', 'b', 'c']);
  const parsed_tree = fragment_node([
    element_node('ul', { id: 'todo_list' }, [
      element_node('li', { id: 'a' }, [text_node('a')]),
      element_node('li', { id: 'b' }, [text_node('b')]),
      element_node('li', { id: 'c' }, [text_node('C!')]),
    ]),
  ]);
  const shared_tree = share_unchanged_nodes(old_tree, parsed_tree);
  const old_items = old_tree.children[0].children;
  const shared_items = shared_tree.children[0].children;
  assert.equal(shared_items[0], old_items[0]);
  assert.equal(shared_items[1], old_items[1]);
  assert.notEqual(shared_items[2], old_items[2]);
  assert.notEqual(shared_tree, old_tree);
  assert.notEqual(shared_tree.children[0], old_tree.children[0]);
  assert.ok(is_same_tree(shared_tree, parsed_tree));
  // 입력 트리는 바뀌지 않는다(불변성).
  assert.equal(old_items[2].children[0].text, 'c');
  assert.equal(parsed_tree.children[0].children[0].children[0].text, 'a');
});

test('EC-015 내용이 같으면 share_unchanged_nodes는 이전 트리 자체를 돌려준다', () => {
  const old_tree = list_tree(['a', 'b']);
  assert.equal(share_unchanged_nodes(old_tree, list_tree(['a', 'b'])), old_tree);
  assert.throws(() => share_unchanged_nodes(null, old_tree), TypeError);
});

test('EC-016 공유된 하위 트리는 diff에서 건너뛰어 BIND도 만들지 않는다', () => {
  const old_tree = list_tree(['a', 'b', 'c']);
  const shared_tree = share_unchanged_nodes(old_tree, list_tree(['a', 'b', 'c'], 'new_'));
  const unchanged_tree = share_unchanged_nodes(old_tree, list_tree(['a', 'b', 'c']));
  assert.deepEqual(diff_trees(old_tree, unchanged_tree), []);
  const operations = diff_trees(old_tree, shared_tree);
  assert.deepEqual(counts_of(operations), { TEXT: 3 });
});

test('EC-017 1000개 항목을 뒤집으면 MOVE 999개', () => {
  const item_keys = Array.from({ length: 1000 }, (unused_value, item_index) => `item_${item_index}`);
  const operations = diff_trees(list_tree(item_keys), list_tree([...item_keys].reverse()));
  assert.deepEqual(counts_of(operations), { MOVE: 999 });
});

test('EC-018 빈 children에서 추가하고 전부 지우는 경우', () => {
  assert.deepEqual(counts_of(diff_trees(fragment_node(), list_tree(['a']))), { ADD: 1 });
  assert.deepEqual(counts_of(diff_trees(list_tree(['a']), fragment_node())), { REMOVE: 1 });
});

test('EC-021 TEXT 연산은 이전 트리의 부모 노드를 함께 담는다', () => {
  const old_tree = fragment_node([element_node('pre', null, [text_node('a')])]);
  const new_tree = fragment_node([element_node('pre', null, [text_node('b')])]);
  const text_operation = diff_trees(old_tree, new_tree).find((operation) => operation.kind === operation_kinds.text);
  assert.equal(text_operation.parent_node, old_tree.children[0]);
  const root_text_operation = diff_trees(text_node('a'), text_node('b')).find((operation) => operation.kind === operation_kinds.text);
  assert.equal(root_text_operation.parent_node, null);
});
