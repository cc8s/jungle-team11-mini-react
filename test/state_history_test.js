import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_state_history,
  get_current_entry,
  can_go_back,
  can_go_forward,
  is_at_latest_entry,
  go_back,
  go_forward,
  go_to_index,
  commit_tree,
  commit_outcomes,
} from '../src/state_history.js';

// 이 모듈은 트리 구조를 모르므로 문자열을 트리 대신 쓰고, 비교 함수로 값 비교를 넘긴다.
const are_strings_equal = (first_tree, second_tree) => first_tree === second_tree;

function build_history(tree_names) {
  let state_history = create_state_history(tree_names[0]);
  for (const tree_name of tree_names.slice(1)) state_history = commit_tree(state_history, tree_name, are_strings_equal).history;
  return state_history;
}

function tree_order(state_history) {
  return state_history.entries.map((entry) => entry.tree);
}

test('EC-001 초기 트리나 최대 개수가 잘못되면 오류', () => {
  assert.throws(() => create_state_history(null), TypeError);
  assert.throws(() => create_state_history(undefined), TypeError);
  assert.throws(() => create_state_history('v0', 0), RangeError);
  assert.throws(() => create_state_history('v0', 1.5), RangeError);
  assert.throws(() => commit_tree(create_state_history('v0'), 'v1'), TypeError);
  assert.throws(() => commit_tree(create_state_history('v0'), null, are_strings_equal), TypeError);
});

test('EC-002 맨 처음에서 뒤로가기, 맨 끝에서 앞으로가기는 같은 이력을 돌려준다', () => {
  const state_history = build_history(['v0', 'v1']);
  assert.equal(go_forward(state_history), state_history);
  const first_history = go_back(state_history);
  assert.equal(go_back(first_history), first_history);
  assert.equal(can_go_back(first_history), false);
  assert.equal(can_go_forward(state_history), false);
});

test('EC-003 뒤로가기를 연타해도 경계에서 멈추고 순서는 바뀌지 않는다', () => {
  let state_history = build_history(['v0', 'v1', 'v2']);
  for (let press_index = 0; press_index < 10; press_index += 1) state_history = go_back(state_history);
  assert.equal(state_history.current_index, 0);
  assert.deepEqual(tree_order(state_history), ['v0', 'v1', 'v2']);
  state_history = go_forward(state_history);
  assert.equal(get_current_entry(state_history).tree, 'v1');
});

test('EC-004 뒤로 간 상태에서 수정 없이 Patch하면 그 상태를 맨 앞으로 올리고 중복이 없다', () => {
  let state_history = build_history(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  state_history = go_to_index(state_history, 4);
  const commit_result = commit_tree(state_history, 'v4', are_strings_equal);
  assert.equal(commit_result.outcome, commit_outcomes.promoted);
  assert.deepEqual(tree_order(commit_result.history), ['v0', 'v1', 'v2', 'v3', 'v5', 'v6', 'v4']);
  assert.equal(is_at_latest_entry(commit_result.history), true);
  assert.equal(commit_result.entry.entry_id, 4);
});

test('EC-005 뒤로 간 상태에서 수정 후 Patch하면 새 상태를 맨 앞에 추가한다', () => {
  let state_history = go_back(build_history(['v0', 'v1', 'v2']));
  const commit_result = commit_tree(state_history, 'v3', are_strings_equal);
  assert.equal(commit_result.outcome, commit_outcomes.appended);
  assert.deepEqual(tree_order(commit_result.history), ['v0', 'v1', 'v2', 'v3']);
  assert.equal(commit_result.history.current_index, 3);
  assert.equal(commit_result.entry.entry_id, 3);
});

test('EC-006 맨 앞에서 변경 없이 Patch를 연타하면 이력이 그대로다', () => {
  const state_history = build_history(['v0', 'v1']);
  let current_history = state_history;
  for (let press_index = 0; press_index < 5; press_index += 1) {
    const commit_result = commit_tree(current_history, 'v1', are_strings_equal);
    assert.equal(commit_result.outcome, commit_outcomes.unchanged);
    current_history = commit_result.history;
  }
  assert.equal(current_history, state_history);
});

test('EC-007 이력에 이미 있는 내용으로 Patch하면 그 항목을 맨 앞으로 올리고 그 트리를 돌려준다', () => {
  const state_history = build_history(['v0', 'v1', 'v2']);
  const commit_result = commit_tree(state_history, 'v0', are_strings_equal);
  assert.equal(commit_result.outcome, commit_outcomes.deduplicated);
  assert.deepEqual(tree_order(commit_result.history), ['v1', 'v2', 'v0']);
  assert.equal(commit_result.entry.entry_id, 0);
  assert.equal(commit_result.tree, 'v0');
});

test('EC-008 최대 개수를 넘으면 가장 오래된 항목(초기 상태 포함)부터 버린다', () => {
  let state_history = create_state_history('v0', 3);
  for (const tree_name of ['v1', 'v2', 'v3', 'v4']) state_history = commit_tree(state_history, tree_name, are_strings_equal).history;
  assert.deepEqual(tree_order(state_history), ['v2', 'v3', 'v4']);
  assert.equal(state_history.current_index, 2);
  assert.equal(state_history.next_entry_id, 5);
});

test('EC-009 범위 밖이나 정수가 아닌 index로 이동하면 같은 이력을 돌려준다', () => {
  const state_history = build_history(['v0', 'v1']);
  for (const invalid_index of [-1, 2, 0.5, Number.NaN, '0', null]) {
    assert.equal(go_to_index(state_history, invalid_index), state_history);
  }
  assert.equal(go_to_index(state_history, 1), state_history);
  assert.equal(get_current_entry(go_to_index(state_history, 0)).tree, 'v0');
});

test('EC-010 이력 객체는 불변이라 commit과 이동 후에도 이전 이력은 그대로다', () => {
  const state_history = build_history(['v0', 'v1']);
  const moved_history = go_back(state_history);
  commit_tree(moved_history, 'v2', are_strings_equal);
  assert.deepEqual(tree_order(state_history), ['v0', 'v1']);
  assert.equal(state_history.current_index, 1);
  assert.ok(Object.isFrozen(state_history));
  assert.ok(Object.isFrozen(state_history.entries));
  assert.throws(() => {
    state_history.entries.push({ entry_id: 9, tree: 'x' });
  }, TypeError);
});

test('EC-011 최대 개수 1이면 항상 최신 한 개만 남는다', () => {
  let state_history = create_state_history('v0', 1);
  state_history = commit_tree(state_history, 'v1', are_strings_equal).history;
  assert.deepEqual(tree_order(state_history), ['v1']);
  assert.equal(can_go_back(state_history), false);
});
