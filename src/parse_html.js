// 테스트 영역의 HTML 문자열을 Virtual DOM으로 바꾼다.
// <template>.innerHTML로 파싱하면 결과가 inert 문서에 만들어지므로 script가 실행되거나 이미지가 로드되지 않는다.

import { create_virtual_node_from_dom } from './virtual_node.js';

export function parse_html_to_virtual_tree(html_text, owner_document) {
  if (typeof html_text !== 'string') throw new TypeError('html_text는 문자열이어야 합니다');
  if (!owner_document || typeof owner_document.createElement !== 'function') {
    throw new TypeError('HTML을 파싱할 document가 필요합니다');
  }
  const template_element = owner_document.createElement('template');
  template_element.innerHTML = html_text;
  return create_virtual_node_from_dom(template_element.content);
}
