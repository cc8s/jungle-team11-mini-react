// Virtual DOM을 테스트 영역(textarea)에 넣을 HTML 문자열로 바꾼다.

import { text_node_type, comment_node_type, fragment_node_type, is_virtual_node } from './virtual_node.js';

const void_element_names = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
// 이 요소들의 텍스트는 HTML 파서가 엔티티 없이 그대로 읽으므로 이스케이프하면 내용이 바뀐다.
const raw_text_element_names = new Set([
  'style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript',
]);

export function escape_text(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll(' ', '&nbsp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function escape_attribute_value(attribute_value) {
  return String(attribute_value)
    .replaceAll('&', '&amp;')
    .replaceAll(' ', '&nbsp;')
    .replaceAll('"', '&quot;');
}

function serialize_node(virtual_node, parent_node) {
  if (virtual_node.type === text_node_type) {
    const is_raw_text_parent =
      parent_node !== null && parent_node.namespace === null && raw_text_element_names.has(parent_node.type);
    return is_raw_text_parent ? virtual_node.text : escape_text(virtual_node.text);
  }
  if (virtual_node.type === comment_node_type) return `<!--${virtual_node.text}-->`;
  if (virtual_node.type === fragment_node_type) {
    return virtual_node.children.map((child_node) => serialize_node(child_node, virtual_node)).join('');
  }
  const attribute_text = Object.keys(virtual_node.attributes)
    .map((attribute_name) => ` ${attribute_name}="${escape_attribute_value(virtual_node.attributes[attribute_name])}"`)
    .join('');
  const opening_tag = `<${virtual_node.type}${attribute_text}>`;
  if (virtual_node.namespace === null && void_element_names.has(virtual_node.type)) return opening_tag;
  const children_text = virtual_node.children.map((child_node) => serialize_node(child_node, virtual_node)).join('');
  return `${opening_tag}${children_text}</${virtual_node.type}>`;
}

export function serialize_to_html(virtual_node) {
  if (!is_virtual_node(virtual_node)) throw new TypeError('Virtual DOM 노드가 필요합니다');
  return serialize_node(virtual_node, null);
}
