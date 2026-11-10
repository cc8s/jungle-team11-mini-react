// Virtual DOM 노드 정의와 DOM → Virtual DOM 변환.
// 모든 노드는 Object.freeze로 동결한 순수 데이터다. 바뀐 내용은 새 노드로 만든다(불변성).

export const html_namespace = 'http://www.w3.org/1999/xhtml';
export const text_node_type = '#text';
export const comment_node_type = '#comment';
export const fragment_node_type = '#fragment';

const element_node_kind = 1;
const text_node_kind = 3;
const comment_node_kind = 8;
const document_fragment_node_kind = 11;

// 실제 영역에 그대로 만들면 코드가 실행되거나 문서 전체 동작이 바뀌는 요소.
const blocked_element_names = new Set(['script', 'base', 'meta', 'object', 'embed']);
// URL을 값으로 받는 attribute. javascript: 같은 스킴을 막는다.
const url_attribute_names = new Set([
  'href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster', 'background', 'ping',
]);
const blocked_url_pattern = /^(javascript|vbscript|data:text\/html)/i;

const empty_attributes = Object.freeze(Object.create(null));
const empty_children = Object.freeze([]);

export function is_virtual_node(candidate) {
  return candidate !== null && typeof candidate === 'object' && typeof candidate.type === 'string';
}

export function is_text_like_node(virtual_node) {
  return virtual_node.type === text_node_type || virtual_node.type === comment_node_type;
}

// attribute 이름이 "__proto__"여도 안전하도록 prototype 없는 객체에 담는다.
function create_attribute_record(source_attributes) {
  if (source_attributes === null || source_attributes === undefined) return empty_attributes;
  if (typeof source_attributes !== 'object') {
    throw new TypeError('attributes는 객체여야 합니다');
  }
  const attribute_record = Object.create(null);
  for (const attribute_name of Object.keys(source_attributes)) {
    attribute_record[attribute_name] = String(source_attributes[attribute_name]);
  }
  return Object.freeze(attribute_record);
}

function freeze_children(children) {
  if (!Array.isArray(children)) throw new TypeError('children은 배열이어야 합니다');
  for (const child_node of children) {
    if (!is_virtual_node(child_node)) throw new TypeError('children에는 Virtual DOM 노드만 넣을 수 있습니다');
  }
  return children.length === 0 ? empty_children : Object.freeze([...children]);
}

function normalize_namespace(namespace) {
  if (namespace === undefined || namespace === null || namespace === html_namespace) return null;
  return String(namespace);
}

export function create_element_node(element_type, attributes = null, children = [], namespace = null) {
  if (typeof element_type !== 'string' || element_type === '' || element_type.startsWith('#')) {
    throw new TypeError('element_type은 비어 있지 않은 태그 이름이어야 합니다');
  }
  const frozen_attributes = create_attribute_record(attributes);
  const id_attribute = frozen_attributes.id;
  return Object.freeze({
    type: element_type,
    key: id_attribute === undefined || id_attribute === '' ? null : id_attribute,
    namespace: normalize_namespace(namespace),
    attributes: frozen_attributes,
    children: freeze_children(children),
  });
}

export function create_text_node(text) {
  return Object.freeze({ type: text_node_type, key: null, text: String(text ?? '') });
}

export function create_comment_node(text) {
  return Object.freeze({ type: comment_node_type, key: null, text: String(text ?? '') });
}

export function create_fragment_node(children = []) {
  return Object.freeze({
    type: fragment_node_type,
    key: null,
    namespace: null,
    attributes: empty_attributes,
    children: freeze_children(children),
  });
}

// 같은 노드를 children만 바꿔 새로 만든다. 원본은 건드리지 않는다.
export function create_node_with_children(source_node, children) {
  if (source_node.type === fragment_node_type) return create_fragment_node(children);
  return create_element_node(source_node.type, source_node.attributes, children, source_node.namespace);
}

// diff가 "같은 노드를 수정"할 수 있는지 판단하는 기준. 다르면 교체 대상이다.
export function is_same_kind(first_node, second_node) {
  return (
    first_node.type === second_node.type &&
    first_node.key === second_node.key &&
    (first_node.namespace ?? null) === (second_node.namespace ?? null)
  );
}

export function are_attributes_equal(first_attributes, second_attributes) {
  if (first_attributes === second_attributes) return true;
  const first_names = Object.keys(first_attributes);
  if (first_names.length !== Object.keys(second_attributes).length) return false;
  return first_names.every(
    (attribute_name) =>
      Object.hasOwn(second_attributes, attribute_name) &&
      first_attributes[attribute_name] === second_attributes[attribute_name],
  );
}

export function is_same_tree(first_node, second_node) {
  if (first_node === second_node) return true;
  if (!is_virtual_node(first_node) || !is_virtual_node(second_node)) return false;
  if (!is_same_kind(first_node, second_node)) return false;
  if (is_text_like_node(first_node)) return first_node.text === second_node.text;
  if (!are_attributes_equal(first_node.attributes, second_node.attributes)) return false;
  if (first_node.children.length !== second_node.children.length) return false;
  return first_node.children.every((child_node, index) => is_same_tree(child_node, second_node.children[index]));
}

export function is_safe_attribute(attribute_name, attribute_value) {
  if (typeof attribute_name !== 'string' || attribute_name === '') return false;
  const lowered_name = attribute_name.toLowerCase();
  if (lowered_name.startsWith('on')) return false;
  if (lowered_name === 'srcdoc') return false;
  if (url_attribute_names.has(lowered_name)) {
    // 브라우저는 URL 스킴 안의 제어 문자와 공백을 무시하므로("java\tscript:") 먼저 제거하고 검사한다.
    const compact_url = String(attribute_value ?? '').replace(/[\u0000- ]/g, '');
    if (blocked_url_pattern.test(compact_url)) return false;
  }
  return true;
}

export function is_blocked_element_name(element_name) {
  return blocked_element_names.has(String(element_name).toLowerCase());
}

function convert_child_nodes(child_node_list) {
  // childNodes는 live 컬렉션이므로 먼저 배열로 복사한 뒤 순회한다.
  const converted_children = [];
  for (const child_dom_node of Array.from(child_node_list)) {
    const converted_child = create_virtual_node_from_dom(child_dom_node);
    if (converted_child !== null) converted_children.push(converted_child);
  }
  return converted_children;
}

// DOM 노드 하나를 Virtual DOM으로 바꾼다. 지원하지 않거나 막힌 노드는 null을 돌려준다.
export function create_virtual_node_from_dom(dom_node) {
  if (dom_node === null || dom_node === undefined || typeof dom_node.nodeType !== 'number') {
    throw new TypeError('DOM 노드가 필요합니다');
  }
  switch (dom_node.nodeType) {
    case text_node_kind:
      return create_text_node(dom_node.data);
    case comment_node_kind:
      return create_comment_node(dom_node.data);
    case document_fragment_node_kind:
      return create_fragment_node(convert_child_nodes(dom_node.childNodes));
    case element_node_kind: {
      if (is_blocked_element_name(dom_node.localName)) return null;
      const safe_attributes = Object.create(null);
      for (const attribute_node of Array.from(dom_node.attributes)) {
        if (is_safe_attribute(attribute_node.name, attribute_node.value)) {
          safe_attributes[attribute_node.name] = attribute_node.value;
        }
      }
      // <template>의 자식은 childNodes가 아니라 content(DocumentFragment)에 있다.
      const child_source =
        dom_node.localName === 'template' && dom_node.content ? dom_node.content.childNodes : dom_node.childNodes;
      return create_element_node(
        dom_node.localName,
        safe_attributes,
        convert_child_nodes(child_source),
        dom_node.namespaceURI,
      );
    }
    default:
      return null;
  }
}

// 컨테이너 요소 자체가 아니라 그 안의 내용을 루트(#fragment)로 변환한다.
export function create_root_from_container(container_element) {
  if (container_element === null || container_element === undefined || !container_element.childNodes) {
    throw new TypeError('컨테이너 요소가 필요합니다');
  }
  return create_fragment_node(convert_child_nodes(container_element.childNodes));
}
