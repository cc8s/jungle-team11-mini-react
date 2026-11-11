// Virtual DOM을 테스트 영역(textarea)에 넣을 HTML 문자열로 바꾼다.

import { text_node_type, comment_node_type, fragment_node_type, is_virtual_node } from './virtual_node.js';

const void_element_names = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
// 이 요소들의 텍스트는 HTML 파서가 엔티티 없이 그대로 읽으므로 이스케이프하면 내용이 바뀐다.
// noscript는 넣지 않는다. 테스트 영역은 <template>(script가 꺼진 inert 문서)으로 파싱하므로
// noscript 안을 일반 요소와 텍스트로 읽는다. 이스케이프하지 않으면 텍스트 "<b>"가 다시 파싱될 때 요소가 된다.
const raw_text_element_names = new Set([
  'style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext',
]);
// HTML 파서는 이 요소의 여는 태그 바로 뒤 줄바꿈 하나를 버린다. 텍스트가 줄바꿈으로 시작하면 하나를 더 써야 남는다.
const leading_newline_element_names = new Set(['pre', 'textarea', 'listing']);
// plaintext는 닫는 태그가 없고 문서 끝까지 이어진다. 닫는 태그를 쓰면 다시 파싱할 때 텍스트에 붙어 매번 늘어난다.
const plaintext_element_name = 'plaintext';

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

// serialization_state.has_entered_plaintext: plaintext를 연 뒤에는 그 요소와 조상의 닫는 태그를 쓰지 않는다.
// 파싱한 트리에서 plaintext는 문서 끝까지의 내용을 모두 담으므로 뒤에 오는 것은 닫는 태그뿐이다.
function serialize_node(virtual_node, parent_node, serialization_state) {
  if (virtual_node.type === text_node_type) {
    const is_raw_text_parent =
      parent_node !== null && parent_node.namespace === null && raw_text_element_names.has(parent_node.type);
    return is_raw_text_parent ? virtual_node.text : escape_text(virtual_node.text);
  }
  if (virtual_node.type === comment_node_type) return `<!--${virtual_node.text}-->`;
  if (virtual_node.type === fragment_node_type) {
    return serialize_children(virtual_node, serialization_state);
  }
  const attribute_text = Object.keys(virtual_node.attributes)
    .map((attribute_name) => ` ${attribute_name}="${escape_attribute_value(virtual_node.attributes[attribute_name])}"`)
    .join('');
  const opening_tag = `<${virtual_node.type}${attribute_text}>`;
  const is_html_element = virtual_node.namespace === null;
  if (is_html_element && void_element_names.has(virtual_node.type)) return opening_tag;
  if (is_html_element && virtual_node.type === plaintext_element_name) serialization_state.has_entered_plaintext = true;
  const first_child_node = virtual_node.children[0];
  const leading_newline_text =
    is_html_element &&
    leading_newline_element_names.has(virtual_node.type) &&
    first_child_node?.type === text_node_type &&
    first_child_node.text.startsWith('\n')
      ? '\n'
      : '';
  const children_text = serialize_children(virtual_node, serialization_state);
  const closing_tag = serialization_state.has_entered_plaintext ? '' : `</${virtual_node.type}>`;
  return `${opening_tag}${leading_newline_text}${children_text}${closing_tag}`;
}

function serialize_children(parent_node, serialization_state) {
  return parent_node.children.map((child_node) => serialize_node(child_node, parent_node, serialization_state)).join('');
}

export function serialize_to_html(virtual_node) {
  if (!is_virtual_node(virtual_node)) throw new TypeError('Virtual DOM 노드가 필요합니다');
  return serialize_node(virtual_node, null, { has_entered_plaintext: false });
}
