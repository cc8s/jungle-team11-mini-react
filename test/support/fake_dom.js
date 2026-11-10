// 테스트용 DOM 대역. 이 프로젝트가 쓰는 DOM API만 DOM 표준(WHATWG DOM) 동작대로 구현한다.
// - childNodes와 attributes는 live 컬렉션(같은 배열을 제자리에서 수정)이다.
// - insertBefore/appendChild는 이미 다른 곳에 있는 노드를 먼저 떼어 낸 뒤 옮긴다.
// - DocumentFragment를 삽입하면 자식들이 옮겨지고 fragment는 비워진다.

export const html_namespace_uri = 'http://www.w3.org/1999/xhtml';
export const svg_namespace_uri = 'http://www.w3.org/2000/svg';

function create_dom_exception(exception_name, message_text) {
  const dom_exception = new Error(message_text);
  dom_exception.name = exception_name;
  return dom_exception;
}

class fake_node {
  constructor(owner_document, node_type) {
    this.ownerDocument = owner_document;
    this.nodeType = node_type;
    this.parentNode = null;
    this.childNodes = [];
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) - 1] ?? null;
  }

  get parentElement() {
    return this.parentNode?.nodeType === 1 ? this.parentNode : null;
  }

  contains(other_node) {
    for (let current_node = other_node; current_node; current_node = current_node.parentNode) {
      if (current_node === this) return true;
    }
    return false;
  }

  get textContent() {
    return this.childNodes.map((child_node) => (child_node.nodeType === 8 ? '' : child_node.textContent)).join('');
  }

  insertBefore(inserted_node, reference_node) {
    if (!(inserted_node instanceof fake_node)) throw new TypeError('Node가 아닙니다');
    if (reference_node !== null && reference_node !== undefined && reference_node.parentNode !== this) {
      throw create_dom_exception('NotFoundError', '기준 노드가 이 노드의 자식이 아닙니다');
    }
    if (inserted_node.contains(this)) {
      throw create_dom_exception('HierarchyRequestError', '조상을 자손 안에 넣을 수 없습니다');
    }
    let effective_reference = reference_node ?? null;
    if (effective_reference === inserted_node) effective_reference = inserted_node.nextSibling;

    const nodes_to_insert =
      inserted_node.nodeType === 11 ? [...inserted_node.childNodes] : [inserted_node];
    for (const moving_node of nodes_to_insert) moving_node.parentNode?.remove_child_internal(moving_node);

    const insert_index =
      effective_reference === null ? this.childNodes.length : this.childNodes.indexOf(effective_reference);
    this.childNodes.splice(insert_index, 0, ...nodes_to_insert);
    for (const moving_node of nodes_to_insert) moving_node.parentNode = this;
    return inserted_node;
  }

  appendChild(appended_node) {
    return this.insertBefore(appended_node, null);
  }

  remove_child_internal(removed_node) {
    this.childNodes.splice(this.childNodes.indexOf(removed_node), 1);
    removed_node.parentNode = null;
  }

  removeChild(removed_node) {
    if (removed_node?.parentNode !== this) {
      throw create_dom_exception('NotFoundError', '이 노드의 자식이 아닙니다');
    }
    this.remove_child_internal(removed_node);
    return removed_node;
  }

  replaceChild(new_node, old_node) {
    if (old_node?.parentNode !== this) {
      throw create_dom_exception('NotFoundError', '교체할 노드가 이 노드의 자식이 아닙니다');
    }
    if (new_node === old_node) return old_node;
    let reference_node = old_node.nextSibling;
    if (reference_node === new_node) reference_node = new_node.nextSibling;
    this.remove_child_internal(old_node);
    this.insertBefore(new_node, reference_node);
    return old_node;
  }
}

class fake_character_data extends fake_node {
  constructor(owner_document, node_type, initial_data) {
    super(owner_document, node_type);
    this.data = String(initial_data);
  }

  get nodeValue() {
    return this.data;
  }

  set nodeValue(next_data) {
    this.data = String(next_data ?? '');
  }

  get textContent() {
    return this.data;
  }

  set textContent(next_data) {
    this.data = String(next_data ?? '');
  }

  insertBefore() {
    throw create_dom_exception('HierarchyRequestError', 'CharacterData는 자식을 가질 수 없습니다');
  }
}

const valid_attribute_name_pattern = /^[^\s"'>/=\u0000]+$/;

class fake_element extends fake_node {
  constructor(owner_document, namespace_uri, qualified_name) {
    super(owner_document, 1);
    this.namespaceURI = namespace_uri;
    this.localName = qualified_name;
    this.attributes = [];
    if (namespace_uri === html_namespace_uri && qualified_name === 'template') {
      this.content = owner_document.createDocumentFragment();
    }
  }

  get tagName() {
    return this.namespaceURI === html_namespace_uri ? this.localName.toUpperCase() : this.localName;
  }

  normalize_attribute_name(attribute_name) {
    const name_text = String(attribute_name);
    if (!valid_attribute_name_pattern.test(name_text)) {
      throw create_dom_exception('InvalidCharacterError', `잘못된 attribute 이름: ${name_text}`);
    }
    // HTML 문서의 HTML 요소에서는 attribute 이름을 소문자로 바꾼다.
    return this.namespaceURI === html_namespace_uri ? name_text.toLowerCase() : name_text;
  }

  getAttribute(attribute_name) {
    const normalized_name = this.normalize_attribute_name(attribute_name);
    return this.attributes.find((attribute_node) => attribute_node.name === normalized_name)?.value ?? null;
  }

  hasAttribute(attribute_name) {
    return this.getAttribute(attribute_name) !== null;
  }

  setAttribute(attribute_name, attribute_value) {
    const normalized_name = this.normalize_attribute_name(attribute_name);
    const existing_attribute = this.attributes.find((attribute_node) => attribute_node.name === normalized_name);
    if (existing_attribute) existing_attribute.value = String(attribute_value);
    else this.attributes.push({ name: normalized_name, localName: normalized_name, namespaceURI: null, value: String(attribute_value) });
  }

  removeAttribute(attribute_name) {
    const normalized_name = this.normalize_attribute_name(attribute_name);
    const attribute_index = this.attributes.findIndex((attribute_node) => attribute_node.name === normalized_name);
    if (attribute_index !== -1) this.attributes.splice(attribute_index, 1);
  }
}

export class fake_document extends fake_node {
  constructor() {
    super(null, 9);
    this.ownerDocument = null;
  }

  createElement(local_name) {
    return new fake_element(this, html_namespace_uri, String(local_name).toLowerCase());
  }

  createElementNS(namespace_uri, qualified_name) {
    return new fake_element(this, namespace_uri, String(qualified_name));
  }

  createTextNode(text_data) {
    return new fake_character_data(this, 3, text_data);
  }

  createComment(comment_data) {
    return new fake_character_data(this, 8, comment_data);
  }

  createDocumentFragment() {
    return new fake_node(this, 11);
  }

  createProcessingInstruction(target_name, instruction_data) {
    const instruction_node = new fake_character_data(this, 7, instruction_data);
    instruction_node.target = target_name;
    return instruction_node;
  }
}

// 테스트에서 DOM 트리를 짧게 만들기 위한 도우미.
export function build_element(owner_document, element_name, attributes = {}, children = []) {
  const element_node = owner_document.createElement(element_name);
  for (const [attribute_name, attribute_value] of Object.entries(attributes)) {
    element_node.setAttribute(attribute_name, attribute_value);
  }
  for (const child_node of children) {
    element_node.appendChild(typeof child_node === 'string' ? owner_document.createTextNode(child_node) : child_node);
  }
  return element_node;
}
