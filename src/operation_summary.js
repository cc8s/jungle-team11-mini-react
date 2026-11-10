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

// BIND는 북마크만 옮기는 내부 연산이라 "변경"으로 세지 않는다.
export function summarize_operations(operations) {
  if (!Array.isArray(operations)) throw new TypeError('operations는 배열이어야 합니다');
  const counts_by_kind = Object.create(null);
  let total_count = 0;
  for (const operation of operations) {
    if (operation.kind === operation_kinds.bind) continue;
    counts_by_kind[operation.kind] = (counts_by_kind[operation.kind] ?? 0) + 1;
    total_count += 1;
  }
  return { total_count, counts_by_kind };
}

export function format_operation_summary(operation_summary) {
  if (operation_summary.total_count === 0) return '변경 사항이 없습니다';
  const count_texts = summary_kind_order
    .filter((kind_name) => operation_summary.counts_by_kind[kind_name])
    .map((kind_name) => `${kind_name} ${operation_summary.counts_by_kind[kind_name]}`);
  return `${operation_summary.total_count}개 변경 반영 (${count_texts.join(', ')})`;
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
