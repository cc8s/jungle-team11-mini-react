// 두 Virtual DOM 트리를 비교해 patch 연산 목록을 만든다.
// 연산은 DOM 위치가 아니라 이전 트리의 노드(북마크 키)를 가리키므로 patch가 DOM을 바로 찾을 수 있다.

import {
  is_virtual_node,
  is_same_kind,
  is_text_like_node,
  is_same_tree,
  are_attributes_equal,
  create_node_with_children,
} from './virtual_node.js';

export const operation_kinds = Object.freeze({
  bind: 'BIND',
  add: 'ADD',
  remove: 'REMOVE',
  replace: 'REPLACE',
  move: 'MOVE',
  text: 'TEXT',
  attributes: 'ATTRIBUTES',
});

// 새 children 각각에 대응하는 이전 child를 찾는다.
// - key(id)가 있으면 같은 key와 같은 종류의 이전 child와 짝짓는다. 중복 key는 첫 번째만 쓴다.
// - key가 없으면 두 단계로 짝짓는다.
//   1) 내용이 완전히 같은 이전 child를 앞에서부터 순서를 유지하며 찾는다.
//      (HTML 들여쓰기 공백 텍스트가 한 칸씩 밀려 TEXT/MOVE가 쏟아지는 것을 막는다)
//   2) 남은 것끼리 순서대로 짝짓고, 종류가 다르면 교체(replace) 대상으로 표시한다.
export function match_children(old_children, new_children) {
  const old_children_by_key = new Map();
  const unkeyed_old_children = [];
  for (const old_child of old_children) {
    if (old_child.key === null) unkeyed_old_children.push(old_child);
    else if (!old_children_by_key.has(old_child.key)) old_children_by_key.set(old_child.key, old_child);
  }

  const used_old_children = new Set();
  const matched_old_children = new Array(new_children.length).fill(null);
  const replaced_old_children = new Array(new_children.length).fill(null);
  const unkeyed_new_indexes = [];

  new_children.forEach((new_child, new_index) => {
    if (new_child.key === null) {
      unkeyed_new_indexes.push(new_index);
      return;
    }
    const candidate_child = old_children_by_key.get(new_child.key);
    if (candidate_child && !used_old_children.has(candidate_child) && is_same_kind(candidate_child, new_child)) {
      matched_old_children[new_index] = candidate_child;
      used_old_children.add(candidate_child);
    }
  });

  let search_start_index = 0;
  const positional_new_indexes = [];
  for (const new_index of unkeyed_new_indexes) {
    const new_child = new_children[new_index];
    let exact_old_child = null;
    for (let old_index = search_start_index; old_index < unkeyed_old_children.length; old_index += 1) {
      const candidate_child = unkeyed_old_children[old_index];
      if (candidate_child.type === new_child.type && is_same_tree(candidate_child, new_child)) {
        exact_old_child = candidate_child;
        search_start_index = old_index + 1;
        break;
      }
    }
    if (exact_old_child) {
      matched_old_children[new_index] = exact_old_child;
      used_old_children.add(exact_old_child);
    } else {
      positional_new_indexes.push(new_index);
    }
  }

  const leftover_old_children = unkeyed_old_children.filter((old_child) => !used_old_children.has(old_child));
  positional_new_indexes.forEach((new_index, leftover_index) => {
    const candidate_child = leftover_old_children[leftover_index];
    if (!candidate_child) return;
    if (is_same_kind(candidate_child, new_children[new_index])) matched_old_children[new_index] = candidate_child;
    else replaced_old_children[new_index] = candidate_child;
    used_old_children.add(candidate_child);
  });

  return { matched_old_children, replaced_old_children, used_old_children };
}

function diff_attributes(old_node, new_node, operations) {
  if (are_attributes_equal(old_node.attributes, new_node.attributes)) return;
  const changed_attributes = Object.create(null);
  const removed_attribute_names = [];
  for (const attribute_name of Object.keys(new_node.attributes)) {
    if (old_node.attributes[attribute_name] !== new_node.attributes[attribute_name]) {
      changed_attributes[attribute_name] = new_node.attributes[attribute_name];
    }
  }
  for (const attribute_name of Object.keys(old_node.attributes)) {
    if (!Object.hasOwn(new_node.attributes, attribute_name)) removed_attribute_names.push(attribute_name);
  }
  operations.push({
    kind: operation_kinds.attributes,
    old_node,
    new_node,
    changed_attributes,
    removed_attribute_names,
  });
}

// 연산 적용 순서: 제거 → (교체, 추가, 이동을 새 index 오름차순으로) → 짝지어진 자식 재귀.
// 이동 여부는 "제거 후 남은 순서"를 그대로 흉내 내며 판단하므로 patch 결과와 개수가 일치한다.
// ADD와 MOVE에는 새 순서에서 바로 앞에 오는 형제(previous_node, 맨 앞이면 null)를 싣는다.
// index 오름차순으로 적용하므로 앞 형제는 이미 제자리에 있고, patch는 그 형제의 DOM 바로 뒤에 넣는다.
// 넣을 자리를 childNodes[index]로 세지 않으므로 외부 코드가 부모에 노드를 끼워 넣어도 순서가 밀리지 않는다.
function diff_children(old_parent, new_parent, operations) {
  const old_children = old_parent.children;
  const new_children = new_parent.children;
  const { matched_old_children, replaced_old_children, used_old_children } = match_children(
    old_children,
    new_children,
  );

  for (const old_child of old_children) {
    if (!used_old_children.has(old_child)) {
      operations.push({ kind: operation_kinds.remove, parent_node: old_parent, old_node: old_child });
    }
  }

  const simulated_order = old_children.filter((old_child) => used_old_children.has(old_child));

  new_children.forEach((new_child, index) => {
    const matched_old_child = matched_old_children[index];
    const replaced_old_child = replaced_old_children[index];
    let positioned_node;

    if (matched_old_child) {
      positioned_node = matched_old_child;
    } else if (replaced_old_child) {
      operations.push({ kind: operation_kinds.replace, old_node: replaced_old_child, new_node: new_child });
      simulated_order[simulated_order.indexOf(replaced_old_child)] = new_child;
      positioned_node = new_child;
    } else {
      const previous_node = index > 0 ? simulated_order[index - 1] : null;
      operations.push({ kind: operation_kinds.add, parent_node: old_parent, new_node: new_child, index, previous_node });
      simulated_order.splice(index, 0, new_child);
      return;
    }

    if (simulated_order[index] !== positioned_node) {
      const previous_node = index > 0 ? simulated_order[index - 1] : null;
      operations.push({ kind: operation_kinds.move, parent_node: old_parent, node: positioned_node, index, previous_node });
      simulated_order.splice(simulated_order.indexOf(positioned_node), 1);
      simulated_order.splice(index, 0, positioned_node);
    }
  });

  new_children.forEach((new_child, index) => {
    const matched_old_child = matched_old_children[index];
    if (matched_old_child) diff_matched_pair(matched_old_child, new_child, operations, old_parent);
  });
}

// parent_node는 이전 트리의 부모다. TEXT 연산에 실어서 화면 변화 여부(예: <pre> 안 공백)를 판단할 수 있게 한다.
function diff_matched_pair(old_node, new_node, operations, parent_node) {
  // 노드 공유 덕분에 같은 참조면 하위 트리 전체가 같으므로 비교를 건너뛴다.
  if (old_node === new_node) return;
  operations.push({ kind: operation_kinds.bind, old_node, new_node });
  if (is_text_like_node(old_node)) {
    if (old_node.text !== new_node.text) {
      operations.push({ kind: operation_kinds.text, parent_node, old_node, new_node, text: new_node.text });
    }
    return;
  }
  diff_attributes(old_node, new_node, operations);
  diff_children(old_node, new_node, operations);
}

export function diff_trees(old_root, new_root) {
  if (!is_virtual_node(old_root) || !is_virtual_node(new_root)) {
    throw new TypeError('diff_trees에는 두 개의 Virtual DOM 노드가 필요합니다');
  }
  const operations = [];
  if (old_root === new_root) return operations;
  if (!is_same_kind(old_root, new_root)) {
    operations.push({ kind: operation_kinds.replace, old_node: old_root, new_node: new_root });
    return operations;
  }
  diff_matched_pair(old_root, new_root, operations, null);
  return operations;
}

// 새 트리에서 바뀌지 않은 하위 트리를 이전 트리의 같은 객체로 바꿔 끼운다(노드 공유).
// 새로 만들어지는 것은 바뀐 노드와 그 조상뿐이다. 입력 트리는 수정하지 않는다.
export function share_unchanged_nodes(old_node, new_node) {
  if (!is_virtual_node(old_node) || !is_virtual_node(new_node)) {
    throw new TypeError('share_unchanged_nodes에는 두 개의 Virtual DOM 노드가 필요합니다');
  }
  if (old_node === new_node) return old_node;
  if (!is_same_kind(old_node, new_node)) return new_node;
  if (is_text_like_node(old_node)) return old_node.text === new_node.text ? old_node : new_node;

  const { matched_old_children } = match_children(old_node.children, new_node.children);
  let is_every_child_from_old = old_node.children.length === new_node.children.length;
  let has_shared_child = false;
  const shared_children = new_node.children.map((new_child, index) => {
    const matched_old_child = matched_old_children[index];
    const shared_child = matched_old_child ? share_unchanged_nodes(matched_old_child, new_child) : new_child;
    if (shared_child !== new_child) has_shared_child = true;
    if (shared_child !== old_node.children[index]) is_every_child_from_old = false;
    return shared_child;
  });

  if (is_every_child_from_old && are_attributes_equal(old_node.attributes, new_node.attributes)) return old_node;
  if (!has_shared_child) return new_node;
  return create_node_with_children(new_node, shared_children);
}
