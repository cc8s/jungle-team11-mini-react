// attribute 이름으로 원래 네임스페이스를 되찾는다.
// HTML 파서는 SVG·MathML 요소의 attribute 중 아래 11개 이름에만 네임스페이스를 붙인다
// (HTML 표준 "adjust foreign attributes"). Virtual DOM은 이름 문자열만 저장하므로,
// 다시 만들 때 이 표로 파서와 같은 attribute를 만든다. HTML 요소에서는 파서가 붙이지 않으므로 항상 null이다.

export const xlink_namespace = 'http://www.w3.org/1999/xlink';
export const xml_namespace = 'http://www.w3.org/XML/1998/namespace';
export const xmlns_namespace = 'http://www.w3.org/2000/xmlns/';

const html_namespace = 'http://www.w3.org/1999/xhtml';

const namespaces_by_foreign_attribute_name = new Map([
  ['xlink:actuate', xlink_namespace],
  ['xlink:arcrole', xlink_namespace],
  ['xlink:href', xlink_namespace],
  ['xlink:role', xlink_namespace],
  ['xlink:show', xlink_namespace],
  ['xlink:title', xlink_namespace],
  ['xlink:type', xlink_namespace],
  ['xml:lang', xml_namespace],
  ['xml:space', xml_namespace],
  ['xmlns', xmlns_namespace],
  ['xmlns:xlink', xmlns_namespace],
]);

export function resolve_attribute_namespace(element_namespace, attribute_name) {
  if (typeof attribute_name !== 'string') throw new TypeError('attribute_name은 문자열이어야 합니다');
  if (element_namespace === null || element_namespace === undefined || element_namespace === html_namespace) return null;
  return namespaces_by_foreign_attribute_name.get(attribute_name) ?? null;
}
