// patch 결과를 사람이 읽을 수 있는 요약으로 만든다. DOM과 무관한 순수 함수만 둔다.

import { text_node_type, comment_node_type, fragment_node_type } from './virtual_node.js';
import { operation_kinds } from './diff.js';

const summary_kind_order = [
  operation_kinds.add,
  operation_kinds.remove,
  operation_kinds.replace,
  operation_kinds.move,
  operation_kinds.text,
  operation_kinds.attributes,
];
const maximum_preview_length = 24;

export const hidden_change_categories = Object.freeze({
  comment: 'comment',
  whitespace: 'whitespace',
});

const hidden_category_labels = Object.freeze({ comment: '주석', whitespace: '공백' });
// 안의 공백이 그대로 화면에 보이는 요소. 이 안의 공백 변경은 "화면 변화 없음"으로 보지 않는다.
const whitespace_preserving_element_names = new Set(['pre', 'textarea', 'listing', 'plaintext']);
// HTML이 접어서 그리는 공백(ASCII whitespace). nbsp(U+00A0)는 화면에 보이므로 포함하지 않는다.
const collapsible_whitespace_pattern = /^[ \t\n\f\r]*$/;

function is_whitespace_preserving_parent(parent_node) {
  return Boolean(parent_node) && (parent_node.namespace ?? null) === null && whitespace_preserving_element_names.has(parent_node.type);
}

function find_node_category(virtual_node, parent_node) {
  if (!virtual_node) return null;
  if (virtual_node.type === comment_node_type) return hidden_change_categories.comment;
  if (
    virtual_node.type === text_node_type &&
    collapsible_whitespace_pattern.test(virtual_node.text) &&
    !is_whitespace_preserving_parent(parent_node)
  ) {
    return hidden_change_categories.whitespace;
  }
  return null;
}

// 실제 영역 화면에 보이지 않는 변경이면 그 종류(주석, 공백)를, 보이는 변경이면 null을 돌려준다.
// 레이아웃을 보지 않고 연산만으로 판단하는 근사 규칙이다.
// (인라인 요소 사이에 공백을 새로 넣거나 지우는 경우, CSS white-space로 공백을 보존하는 경우는 실제로 보일 수 있다)
export function find_hidden_change_category(operation) {
  switch (operation?.kind) {
    case operation_kinds.text: {
      const old_category = find_node_category(operation.old_node, operation.parent_node);
      const new_category = find_node_category(operation.new_node, operation.parent_node);
      return old_category !== null && old_category === new_category ? new_category : null;
    }
    case operation_kinds.add:
      return find_node_category(operation.new_node, operation.parent_node);
    case operation_kinds.remove:
      return find_node_category(operation.old_node, operation.parent_node);
    case operation_kinds.move:
      return find_node_category(operation.node, operation.parent_node);
    case operation_kinds.replace: {
      // 주석 ↔ 공백처럼 둘 다 안 보이는 노드끼리의 교체만 숨은 변경이다. 부모는 연산에 없으므로 보존 요소 검사는 생략한다.
      const old_category = find_node_category(operation.old_node, null);
      const new_category = find_node_category(operation.new_node, null);
      return old_category !== null && new_category !== null ? new_category : null;
    }
    default:
      return null;
  }
}

export function is_hidden_operation(operation) {
  return find_hidden_change_category(operation) !== null;
}

// BIND는 북마크만 옮기는 내부 연산이라 "변경"으로 세지 않는다.
// 화면에 보이는 변경은 연산 종류별로, 보이지 않는 변경(주석, 공백)은 종류별로 따로 센다.
export function summarize_operations(operations) {
  if (!Array.isArray(operations)) throw new TypeError('operations는 배열이어야 합니다');
  const counts_by_kind = Object.create(null);
  const hidden_counts_by_category = Object.create(null);
  let total_count = 0;
  let hidden_count = 0;
  for (const operation of operations) {
    if (operation.kind === operation_kinds.bind) continue;
    total_count += 1;
    const hidden_category = find_hidden_change_category(operation);
    if (hidden_category !== null) {
      hidden_counts_by_category[hidden_category] = (hidden_counts_by_category[hidden_category] ?? 0) + 1;
      hidden_count += 1;
    } else {
      counts_by_kind[operation.kind] = (counts_by_kind[operation.kind] ?? 0) + 1;
    }
  }
  return { total_count, visible_count: total_count - hidden_count, hidden_count, counts_by_kind, hidden_counts_by_category };
}

// 변경은 있지만 모두 화면에 보이지 않는 경우(주석, 공백만 바뀜).
export function is_hidden_only_summary(operation_summary) {
  return operation_summary.total_count > 0 && operation_summary.visible_count === 0;
}

export function format_operation_summary(operation_summary) {
  if (operation_summary.total_count === 0) return '변경 사항이 없습니다';
  const hidden_counts = operation_summary.hidden_counts_by_category ?? Object.create(null);
  const hidden_categories = [hidden_change_categories.comment, hidden_change_categories.whitespace].filter(
    (category_name) => hidden_counts[category_name],
  );
  if (is_hidden_only_summary(operation_summary)) {
    const hidden_texts = hidden_categories.map((category_name) => `${hidden_category_labels[category_name]} ${hidden_counts[category_name]}개`);
    return `${hidden_texts.join(', ')} 변경 · 화면 변화 없음`;
  }
  const count_texts = summary_kind_order
    .filter((kind_name) => operation_summary.counts_by_kind[kind_name])
    .map((kind_name) => `${kind_name} ${operation_summary.counts_by_kind[kind_name]}`);
  const hidden_texts = hidden_categories.map((category_name) => `${hidden_category_labels[category_name]} ${hidden_counts[category_name]}`);
  return `${operation_summary.total_count}개 변경 반영 (${[...count_texts, ...hidden_texts].join(', ')})`;
}

function shorten_text(text) {
  const single_line_text = text.replace(/\s+/g, ' ').trim();
  if (single_line_text === '') return '(공백)';
  return single_line_text.length > maximum_preview_length
    ? `${single_line_text.slice(0, maximum_preview_length)}…`
    : single_line_text;
}

export function describe_virtual_node(virtual_node) {
  if (!virtual_node) return '(없음)';
  if (virtual_node.type === text_node_type) return `"${shorten_text(virtual_node.text)}"`;
  if (virtual_node.type === comment_node_type) return `<!-- ${shorten_text(virtual_node.text)} -->`;
  if (virtual_node.type === fragment_node_type) return '실제 영역 루트';
  return virtual_node.key === null ? `<${virtual_node.type}>` : `<${virtual_node.type}#${virtual_node.key}>`;
}

export function describe_operation(operation) {
  switch (operation.kind) {
    case operation_kinds.add:
      return `${describe_virtual_node(operation.new_node)} 를 ${describe_virtual_node(operation.parent_node)} 의 ${operation.index}번째에 추가`;
    case operation_kinds.remove:
      return `${describe_virtual_node(operation.old_node)} 제거`;
    case operation_kinds.replace:
      return `${describe_virtual_node(operation.old_node)} → ${describe_virtual_node(operation.new_node)} 교체`;
    case operation_kinds.move:
      return `${describe_virtual_node(operation.node)} 를 ${operation.index}번째로 이동`;
    case operation_kinds.text:
      return `${describe_virtual_node(operation.old_node)} → ${describe_virtual_node(operation.new_node)}`;
    case operation_kinds.attributes: {
      const changed_texts = Object.keys(operation.changed_attributes).map(
        (attribute_name) => `${attribute_name}="${shorten_text(operation.changed_attributes[attribute_name])}"`,
      );
      const removed_texts = operation.removed_attribute_names.map((attribute_name) => `-${attribute_name}`);
      return `${describe_virtual_node(operation.new_node)} ${[...changed_texts, ...removed_texts].join(' ')}`;
    }
    default:
      return describe_virtual_node(operation.new_node ?? operation.old_node);
  }
}

// 화면 로그에 보여 줄 연산만 고른다.
export function select_visible_operations(operations) {
  return operations.filter((operation) => operation.kind !== operation_kinds.bind);
}
