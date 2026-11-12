// State History: 브라우저 뒤로가기·앞으로가기와 같은 한 줄짜리 Virtual DOM 트리 목록.
// 각 항목은 루트부터 완전한 트리이고, 안 바뀐 노드는 이전 트리와 같은 객체를 공유한다.
// 뒤로 간 상태에서 수정해 Patch하면 그 뒤쪽 상태들은 버리고 새 상태를 붙인다(갈래 버리기).
// 모든 함수는 기존 이력을 수정하지 않고 새 이력 객체를 돌려준다.

export const default_maximum_entry_count = 50;

export const commit_outcomes = Object.freeze({
  unchanged: 'unchanged', // 지금 보고 있는 상태와 같음 → 아무것도 바꾸지 않음
  appended: 'appended', // 새 상태 추가 (현재 위치 뒤쪽 상태는 버림)
});

function freeze_history(entries, current_index, next_entry_id, maximum_entry_count) {
  return Object.freeze({
    entries: Object.freeze(entries),
    current_index,
    next_entry_id,
    maximum_entry_count,
  });
}

export function create_state_history(initial_tree, maximum_entry_count = default_maximum_entry_count) {
  if (initial_tree === null || initial_tree === undefined) throw new TypeError('초기 트리가 필요합니다');
  if (!Number.isInteger(maximum_entry_count) || maximum_entry_count < 1) {
    throw new RangeError('maximum_entry_count는 1 이상의 정수여야 합니다');
  }
  return freeze_history([Object.freeze({ entry_id: 0, tree: initial_tree })], 0, 1, maximum_entry_count);
}

export function get_current_entry(state_history) {
  return state_history.entries[state_history.current_index];
}

export function is_at_latest_entry(state_history) {
  return state_history.current_index === state_history.entries.length - 1;
}

export function can_go_back(state_history) {
  return state_history.current_index > 0;
}

export function can_go_forward(state_history) {
  return !is_at_latest_entry(state_history);
}

// 이동은 이력을 바꾸지 않고 현재 위치만 바꾼다. 범위 밖이면 같은 객체를 그대로 돌려준다.
export function go_to_index(state_history, target_index) {
  if (!Number.isInteger(target_index)) return state_history;
  if (target_index < 0 || target_index >= state_history.entries.length) return state_history;
  if (target_index === state_history.current_index) return state_history;
  return freeze_history(
    [...state_history.entries],
    target_index,
    state_history.next_entry_id,
    state_history.maximum_entry_count,
  );
}

export function go_back(state_history) {
  return go_to_index(state_history, state_history.current_index - 1);
}

export function go_forward(state_history) {
  return go_to_index(state_history, state_history.current_index + 1);
}

// Patch 확정. 비교 기준은 "지금 보고 있는 상태"다.
// - 같으면 아무것도 바꾸지 않는다. 뒤로 간 상태여도 뒤쪽 상태를 버리지 않는다.
// - 다르면 현재 위치 뒤쪽 상태를 모두 버리고 새 상태를 붙인다. 버린 항목은 discarded_entries로 알려 준다.
export function commit_tree(state_history, new_tree, are_trees_equal) {
  if (new_tree === null || new_tree === undefined) throw new TypeError('저장할 트리가 필요합니다');
  if (typeof are_trees_equal !== 'function') throw new TypeError('are_trees_equal 함수가 필요합니다');

  const current_entry = get_current_entry(state_history);
  if (are_trees_equal(current_entry.tree, new_tree)) {
    return {
      history: state_history,
      outcome: commit_outcomes.unchanged,
      entry: current_entry,
      tree: current_entry.tree,
      discarded_entries: [],
    };
  }

  const kept_entries = state_history.entries.slice(0, state_history.current_index + 1);
  const discarded_entries = state_history.entries.slice(state_history.current_index + 1);
  const appended_entry = Object.freeze({ entry_id: state_history.next_entry_id, tree: new_tree });
  const next_entries = [...kept_entries, appended_entry];
  // 최대 개수를 넘으면 가장 오래된 항목부터 버린다. 초기 상태도 예외 없이 버린다.
  while (next_entries.length > state_history.maximum_entry_count) discarded_entries.push(next_entries.shift());
  return {
    history: freeze_history(
      next_entries,
      next_entries.length - 1,
      state_history.next_entry_id + 1,
      state_history.maximum_entry_count,
    ),
    outcome: commit_outcomes.appended,
    entry: appended_entry,
    tree: new_tree,
    discarded_entries,
  };
}
