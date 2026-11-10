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
