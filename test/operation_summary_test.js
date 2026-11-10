import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_element_node as element_node,
  create_text_node as text_node,
  create_comment_node as comment_node,
  create_fragment_node as fragment_node,
} from '../src/virtual_node.js';
import { diff_trees } from '../src/diff.js';
import {
  summarize_operations,
  format_operation_summary,
  describe_virtual_node,
  describe_operation,
  select_visible_operations,
  find_hidden_change_category,
  is_hidden_operation,
  is_hidden_only_summary,
} from '../src/operation_summary.js';

test('EC-001 연산이 없으면 "변경 사항이 없습니다"', () => {
  assert.equal(format_operation_summary(summarize_operations([])), '변경 사항이 없습니다');
});

test('EC-002 BIND는 세지 않고 종류는 정해진 순서로 표시한다', () => {
  const operations = [{ kind: 'BIND' }, { kind: 'TEXT' }, { kind: 'ADD' }, { kind: 'TEXT' }, { kind: 'BIND' }];
  const operation_summary = summarize_operations(operations);
  assert.equal(operation_summary.total_count, 3);
  assert.equal(format_operation_summary(operation_summary), '3개 변경 반영 (ADD 1, TEXT 2)');
  assert.deepEqual(select_visible_operations(operations).map((operation) => operation.kind), ['TEXT', 'ADD', 'TEXT']);
  assert.equal(format_operation_summary(summarize_operations([{ kind: 'BIND' }])), '변경 사항이 없습니다');
});

test('EC-003 배열이 아니면 TypeError', () => {
  for (const invalid_input of [null, undefined, 'ADD', {}]) {
    assert.throws(() => summarize_operations(invalid_input), TypeError);
  }
});

test('EC-004 노드 설명: key, 긴 텍스트 줄임, 공백 텍스트, 주석, 루트, 없음', () => {
  assert.equal(describe_virtual_node(element_node('li', { id: 'todo_a' })), '<li#todo_a>');
  assert.equal(describe_virtual_node(element_node('p')), '<p>');
  assert.equal(describe_virtual_node(text_node('가'.repeat(30))), `"${'가'.repeat(24)}…"`);
  assert.equal(describe_virtual_node(text_node('\n   ')), '"(공백)"');
  assert.equal(describe_virtual_node(comment_node(' 메모 ')), '<!-- 메모 -->');
  assert.equal(describe_virtual_node(fragment_node()), '실제 영역 루트');
  assert.equal(describe_virtual_node(null), '(없음)');
});

test('EC-005 연산 종류별 설명 문장', () => {
  const old_tree = fragment_node([
    element_node('p', { class: 'a', title: 'x' }, [text_node('전')]),
    element_node('span'),
    element_node('li', { id: 'b' }),
    element_node('li', { id: 'c' }),
    element_node('em'),
  ]);
  const new_tree = fragment_node([
    element_node('p', { class: 'b' }, [text_node('후')]),
    element_node('strong'),
    element_node('li', { id: 'c' }),
    element_node('li', { id: 'b' }),
    element_node('li', { id: 'd' }),
  ]);
  const descriptions = select_visible_operations(diff_trees(old_tree, new_tree)).map(
    (operation) => `${operation.kind} ${describe_operation(operation)}`,
  );
  assert.deepEqual(descriptions, [
    'REMOVE <em> 제거',
    'REPLACE <span> → <strong> 교체',
    'MOVE <li#c> 를 2번째로 이동',
    'ADD <li#d> 를 실제 영역 루트 의 4번째에 추가',
    'ATTRIBUTES <p> class="b" -title',
    'TEXT "전" → "후"',
  ]);
});

// 테스트 영역의 샘플과 비슷한 구조: 섹션 안에 공백 텍스트, 주석, 문단이 섞여 있다.
function section_tree(comment_text, indent_text, paragraph_text) {
  return fragment_node([
    element_node('section', { id: 'card' }, [
      text_node(indent_text),
      comment_node(comment_text),
      text_node(indent_text),
      element_node('p', null, [text_node(paragraph_text)]),
    ]),
  ]);
}

test('EC-006 주석 안에 공백을 넣고 Patch하면 기록은 남기되 "화면 변화 없음"으로 분류한다', () => {
  const operations = diff_trees(section_tree(' 메모 ', '\n  ', '본문'), section_tree(' 메모  ', '\n  ', '본문'));
  const operation_summary = summarize_operations(operations);
  assert.equal(operation_summary.total_count, 1);
  assert.equal(is_hidden_only_summary(operation_summary), true);
  assert.equal(format_operation_summary(operation_summary), '주석 1개 변경 · 화면 변화 없음');
});

test('EC-007 주석에 이모지를 넣어도 화면 변화 없음, 본문에 넣으면 보이는 변경', () => {
  const comment_operations = diff_trees(section_tree(' 메모 ', '\n  ', '본문'), section_tree(' 메모 🙂 ', '\n  ', '본문'));
  assert.equal(format_operation_summary(summarize_operations(comment_operations)), '주석 1개 변경 · 화면 변화 없음');
  const text_operations = diff_trees(section_tree(' 메모 ', '\n  ', '본문'), section_tree(' 메모 ', '\n  ', '본문 🙂'));
  assert.equal(is_hidden_only_summary(summarize_operations(text_operations)), false);
  assert.equal(format_operation_summary(summarize_operations(text_operations)), '1개 변경 반영 (TEXT 1)');
});

test('EC-008 태그 사이 공백만 바꾸면 "공백 N개 변경 · 화면 변화 없음"', () => {
  const operations = diff_trees(section_tree(' 메모 ', '\n  ', '본문'), section_tree(' 메모 ', '\n    ', '본문'));
  assert.equal(format_operation_summary(summarize_operations(operations)), '공백 2개 변경 · 화면 변화 없음');
});

test('EC-009 보이는 변경과 숨은 변경이 섞이면 함께 세고 숨은 변경은 이름으로 표시한다', () => {
  const operations = diff_trees(section_tree(' 메모 ', '\n  ', '본문'), section_tree(' 메모! ', '\n  ', '본문!'));
  const operation_summary = summarize_operations(operations);
  assert.equal(is_hidden_only_summary(operation_summary), false);
  assert.equal(format_operation_summary(operation_summary), '2개 변경 반영 (TEXT 1, 주석 1)');
});

test('EC-010 <pre> 안의 공백 변경은 화면에 보이므로 숨은 변경이 아니다', () => {
  const old_tree = fragment_node([element_node('pre', null, [text_node('  ')])]);
  const new_tree = fragment_node([element_node('pre', null, [text_node('    ')])]);
  const operations = diff_trees(old_tree, new_tree).filter((operation) => operation.kind === 'TEXT');
  assert.equal(operations.length, 1);
  assert.equal(find_hidden_change_category(operations[0]), null);
});

test('EC-011 nbsp는 접히지 않는 공백이라 보이는 변경, 공백 → 글자도 보이는 변경', () => {
  const nbsp_operations = diff_trees(
    fragment_node([element_node('p', null, [text_node(' ')])]),
    fragment_node([element_node('p', null, [text_node('\u00a0')])]),
  );
  assert.equal(is_hidden_only_summary(summarize_operations(nbsp_operations)), false);
  const word_operations = diff_trees(
    fragment_node([element_node('p', null, [text_node(' ')])]),
    fragment_node([element_node('p', null, [text_node('글')])]),
  );
  assert.equal(is_hidden_only_summary(summarize_operations(word_operations)), false);
});

test('EC-012 주석이나 공백 노드를 추가, 제거, 이동, 서로 교체해도 숨은 변경으로 분류한다', () => {
  const parent_node = element_node('div');
  assert.equal(find_hidden_change_category({ kind: 'ADD', parent_node, new_node: comment_node('새 주석'), index: 0 }), 'comment');
  assert.equal(find_hidden_change_category({ kind: 'REMOVE', parent_node, old_node: text_node('\n') }), 'whitespace');
  assert.equal(find_hidden_change_category({ kind: 'MOVE', parent_node, node: comment_node('x'), index: 1 }), 'comment');
  assert.equal(find_hidden_change_category({ kind: 'REPLACE', old_node: comment_node('x'), new_node: text_node(' ') }), 'whitespace');
  assert.equal(find_hidden_change_category({ kind: 'REPLACE', old_node: comment_node('x'), new_node: element_node('p') }), null);
  assert.equal(find_hidden_change_category({ kind: 'ADD', parent_node, new_node: element_node('p'), index: 0 }), null);
});

test('EC-013 ATTRIBUTES, BIND, 노드 정보가 없는 연산, null은 숨은 변경이 아니다', () => {
  assert.equal(is_hidden_operation({ kind: 'ATTRIBUTES', changed_attributes: {}, removed_attribute_names: [] }), false);
  assert.equal(is_hidden_operation({ kind: 'BIND' }), false);
  assert.equal(is_hidden_operation({ kind: 'TEXT' }), false);
  assert.equal(is_hidden_operation(null), false);
});
