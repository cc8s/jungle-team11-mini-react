// State History: "확정(Patch)한 순서"로 쌓이는 Virtual DOM 트리 목록.
// 각 항목은 루트부터 완전한 트리이고, 안 바뀐 노드는 이전 트리와 같은 객체를 공유한다.
// 모든 함수는 기존 이력을 수정하지 않고 새 이력 객체를 돌려준다.

export const default_maximum_entry_count = 50;

export const commit_outcomes = Object.freeze({
  unchanged: 'unchanged', // 맨 앞에서 변경 없음 → 저장하지 않음
  promoted: 'promoted', // 이전 상태에서 변경 없음 → 그 상태를 맨 앞으로 올림
  deduplicated: 'deduplicated', // 이력에 이미 있는 내용 → 그 항목을 맨 앞으로 올림
  appended: 'appended', // 새 상태 추가
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

// 이동은 이력 순서를 바꾸지 않고 현재 위치만 바꾼다. 범위 밖이면 같은 객체를 그대로 돌려준다.
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

function move_entry_to_latest(state_history, entry_index) {
  const reordered_entries = state_history.entries.filter((entry, index) => index !== entry_index);
  reordered_entries.push(state_history.entries[entry_index]);
  return freeze_history(
    reordered_entries,
    reordered_entries.length - 1,
    state_history.next_entry_id,
    state_history.maximum_entry_count,
  );
}

// Patch 확정. 비교 기준은 "지금 보고 있는 상태"다.
// 돌려주는 tree가 실제 영역에 그려야 할 정식 트리다(중복 제거 시 기존 항목의 트리).
export function commit_tree(state_history, new_tree, are_trees_equal) {
  if (new_tree === null || new_tree === undefined) throw new TypeError('저장할 트리가 필요합니다');
  if (typeof are_trees_equal !== 'function') throw new TypeError('are_trees_equal 함수가 필요합니다');

  const current_entry = get_current_entry(state_history);
  if (are_trees_equal(current_entry.tree, new_tree)) {
    if (is_at_latest_entry(state_history)) {
      return { history: state_history, outcome: commit_outcomes.unchanged, entry: current_entry, tree: current_entry.tree };
    }
    const promoted_history = move_entry_to_latest(state_history, state_history.current_index);
    return { history: promoted_history, outcome: commit_outcomes.promoted, entry: current_entry, tree: current_entry.tree };
  }

  const duplicate_index = state_history.entries.findIndex(
    (entry, index) => index !== state_history.current_index && are_trees_equal(entry.tree, new_tree),
  );
  if (duplicate_index !== -1) {
    const duplicate_entry = state_history.entries[duplicate_index];
    return {
      history: move_entry_to_latest(state_history, duplicate_index),
      outcome: commit_outcomes.deduplicated,
      entry: duplicate_entry,
      tree: duplicate_entry.tree,
    };
  }

  const appended_entry = Object.freeze({ entry_id: state_history.next_entry_id, tree: new_tree });
  const appended_entries = [...state_history.entries, appended_entry];
  // 최대 개수를 넘으면 가장 오래된 항목부터 버린다. 초기 상태도 예외 없이 버린다.
  while (appended_entries.length > state_history.maximum_entry_count) appended_entries.shift();
  return {
    history: freeze_history(
      appended_entries,
      appended_entries.length - 1,
      state_history.next_entry_id + 1,
      state_history.maximum_entry_count,
    ),
    outcome: commit_outcomes.appended,
    entry: appended_entry,
    tree: new_tree,
  };
}
