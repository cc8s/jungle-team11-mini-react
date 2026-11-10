// diff 결과를 실제 DOM에 적용한다.
// 양방향 북마크(Virtual DOM → DOM: WeakMap, DOM → Virtual DOM: __virtual_node)는 이 모듈에서만 갱신한다.

import { fragment_node_type, text_node_type, comment_node_type, is_virtual_node } from './virtual_node.js';
import { operation_kinds } from './diff.js';

export function create_bookmark_registry() {
  return Object.freeze({ dom_nodes_by_virtual_node: new WeakMap() });
}

export function bind_bookmark(bookmark_registry, virtual_node, dom_node) {
  bookmark_registry.dom_nodes_by_virtual_node.set(virtual_node, dom_node);
  dom_node.__virtual_node = virtual_node;
}

export function find_dom_node(bookmark_registry, virtual_node) {
  const dom_node = bookmark_registry.dom_nodes_by_virtual_node.get(virtual_node);
  if (dom_node === undefined) {
    throw new Error(`북마크된 DOM 노드가 없습니다: ${virtual_node?.type ?? virtual_node}`);
  }
  return dom_node;
}

export function find_virtual_node(dom_node) {
  return dom_node?.__virtual_node ?? null;
}

// DOM 쪽 북마크를 따라 제거되는 하위 트리의 북마크를 모두 해제한다.
// 같은 Virtual DOM 노드가 그 사이 다른 DOM에 다시 연결됐다면 그 연결은 지우지 않는다.
function unbind_subtree(bookmark_registry, dom_node) {
  const pending_dom_nodes = [dom_node];
  while (pending_dom_nodes.length > 0) {
    const current_dom_node = pending_dom_nodes.pop();
    const bound_virtual_node = current_dom_node.__virtual_node;
    if (bound_virtual_node !== undefined) {
      if (bookmark_registry.dom_nodes_by_virtual_node.get(bound_virtual_node) === current_dom_node) {
        bookmark_registry.dom_nodes_by_virtual_node.delete(bound_virtual_node);
      }
      delete current_dom_node.__virtual_node;
    }
    for (const child_dom_node of Array.from(current_dom_node.childNodes ?? [])) pending_dom_nodes.push(child_dom_node);
  }
}

function require_document(owner_document) {
  if (owner_document === null || owner_document === undefined || typeof owner_document.createElement !== 'function') {
    throw new TypeError('DOM 노드를 만들 document가 필요합니다');
  }
  return owner_document;
}

export function create_dom_tree(bookmark_registry, virtual_node, owner_document) {
  require_document(owner_document);
  if (!is_virtual_node(virtual_node)) throw new TypeError('Virtual DOM 노드가 필요합니다');
  let dom_node;
  if (virtual_node.type === text_node_type) {
    dom_node = owner_document.createTextNode(virtual_node.text);
  } else if (virtual_node.type === comment_node_type) {
    dom_node = owner_document.createComment(virtual_node.text);
  } else if (virtual_node.type === fragment_node_type) {
    throw new TypeError('#fragment 노드는 컨테이너에 mount_tree로만 연결할 수 있습니다');
  } else {
    dom_node = virtual_node.namespace
      ? owner_document.createElementNS(virtual_node.namespace, virtual_node.type)
      : owner_document.createElement(virtual_node.type);
    for (const attribute_name of Object.keys(virtual_node.attributes)) {
      dom_node.setAttribute(attribute_name, virtual_node.attributes[attribute_name]);
    }
    for (const child_node of virtual_node.children) {
      dom_node.appendChild(create_dom_tree(bookmark_registry, child_node, owner_document));
    }
  }
  bind_bookmark(bookmark_registry, virtual_node, dom_node);
  return dom_node;
}

// 컨테이너의 기존 내용을 비우고 #fragment 루트의 자식들을 새로 그린다. 루트는 컨테이너에 연결한다.
export function mount_tree(bookmark_registry, container_element, root_node, owner_document) {
  if (!container_element || typeof container_element.appendChild !== 'function') {
    throw new TypeError('컨테이너 요소가 필요합니다');
  }
  if (!is_virtual_node(root_node) || root_node.type !== fragment_node_type) {
    throw new TypeError('mount_tree의 루트는 #fragment 노드여야 합니다');
  }
  const target_document = require_document(owner_document ?? container_element.ownerDocument);
  while (container_element.firstChild) {
    const existing_child = container_element.firstChild;
    unbind_subtree(bookmark_registry, existing_child);
    container_element.removeChild(existing_child);
  }
  for (const child_node of root_node.children) {
    container_element.appendChild(create_dom_tree(bookmark_registry, child_node, target_document));
  }
  bind_bookmark(bookmark_registry, root_node, container_element);
  return container_element;
}

// 연산을 순서대로 적용하고, 하이라이트할 DOM 노드 목록을 돌려준다.
export function apply_operations(bookmark_registry, operations, owner_document) {
  if (!Array.isArray(operations)) throw new TypeError('operations는 배열이어야 합니다');
  const changed_dom_nodes = [];
  // 어떤 연산이 어떤 DOM을 바꿨는지 함께 남겨, 화면 쪽에서 연산 종류에 따라 표시 여부를 고를 수 있게 한다.
  const changed_records = [];
  const record_change = (operation, dom_node) => {
    changed_dom_nodes.push(dom_node);
    changed_records.push({ operation, dom_node });
  };

  // 떼어 낼 DOM은 적용 전에 미리 찾아 둔다. 앞선 ADD가 같은 Virtual DOM 객체를 새 DOM에 다시 연결해도
  // 원래 자리의 DOM을 지우게 되고, 북마크가 없으면 DOM을 하나도 바꾸기 전에 오류를 낸다.
  const detached_dom_nodes_by_operation = new Map();
  for (const operation of operations) {
    if (operation?.kind === operation_kinds.remove || operation?.kind === operation_kinds.replace) {
      detached_dom_nodes_by_operation.set(operation, find_dom_node(bookmark_registry, operation.old_node));
    }
  }

  for (const operation of operations) {
    switch (operation?.kind) {
      case operation_kinds.bind: {
        bind_bookmark(bookmark_registry, operation.new_node, find_dom_node(bookmark_registry, operation.old_node));
        break;
      }
      case operation_kinds.text: {
        const text_dom_node = find_dom_node(bookmark_registry, operation.old_node);
        text_dom_node.data = operation.text;
        record_change(operation, text_dom_node);
        break;
      }
      case operation_kinds.attributes: {
        const element_dom_node = find_dom_node(bookmark_registry, operation.old_node);
        for (const attribute_name of operation.removed_attribute_names) {
          element_dom_node.removeAttribute(attribute_name);
        }
        for (const attribute_name of Object.keys(operation.changed_attributes)) {
          element_dom_node.setAttribute(attribute_name, operation.changed_attributes[attribute_name]);
        }
        record_change(operation, element_dom_node);
        break;
      }
      case operation_kinds.remove: {
        const removed_dom_node = detached_dom_nodes_by_operation.get(operation);
        unbind_subtree(bookmark_registry, removed_dom_node);
        removed_dom_node.parentNode?.removeChild(removed_dom_node);
        break;
      }
      case operation_kinds.add: {
        const parent_dom_node = find_dom_node(bookmark_registry, operation.parent_node);
        const added_dom_node = create_dom_tree(bookmark_registry, operation.new_node, require_document(owner_document));
        parent_dom_node.insertBefore(added_dom_node, parent_dom_node.childNodes[operation.index] ?? null);
        record_change(operation, added_dom_node);
        break;
      }
      case operation_kinds.move: {
        const parent_dom_node = find_dom_node(bookmark_registry, operation.parent_node);
        const moved_dom_node = find_dom_node(bookmark_registry, operation.node);
        const reference_dom_node = parent_dom_node.childNodes[operation.index] ?? null;
        if (reference_dom_node !== moved_dom_node) parent_dom_node.insertBefore(moved_dom_node, reference_dom_node);
        record_change(operation, moved_dom_node);
        break;
      }
      case operation_kinds.replace: {
        const old_dom_node = detached_dom_nodes_by_operation.get(operation);
        const parent_dom_node = old_dom_node.parentNode;
        if (!parent_dom_node) throw new Error('교체할 노드가 문서에서 분리되어 있습니다');
        unbind_subtree(bookmark_registry, old_dom_node);
        const new_dom_node = create_dom_tree(bookmark_registry, operation.new_node, require_document(owner_document));
        parent_dom_node.replaceChild(new_dom_node, old_dom_node);
        record_change(operation, new_dom_node);
        break;
      }
      default:
        throw new TypeError(`알 수 없는 patch 연산입니다: ${operation?.kind}`);
    }
  }

  return { changed_dom_nodes, changed_records };
}
