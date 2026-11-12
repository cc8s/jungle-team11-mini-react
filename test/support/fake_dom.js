// 테스트용 DOM 대역. 이 프로젝트가 쓰는 DOM API만 DOM 표준(WHATWG DOM) 동작대로 구현한다.
// - childNodes와 attributes는 live 컬렉션(같은 배열을 제자리에서 수정)이다.
// - insertBefore/appendChild는 이미 다른 곳에 있는 노드를 먼저 떼어 낸 뒤 옮긴다.
// - DocumentFragment를 삽입하면 자식들이 옮겨지고 fragment는 비워진다.

export const html_namespace_uri = 'http://www.w3.org/1999/xhtml';
export const svg_namespace_uri = 'http://www.w3.org/2000/svg';
export const xlink_namespace_uri = 'http://www.w3.org/1999/xlink';
export const xml_namespace_uri = 'http://www.w3.org/XML/1998/namespace';
export const xmlns_namespace_uri = 'http://www.w3.org/2000/xmlns/';

function create_dom_exception(exception_name, message_text) {
  const dom_exception = new Error(message_text);
  dom_exception.name = exception_name;
  return dom_exception;
}

// DOM 표준 Event의 대역. 이 프로젝트가 쓰는 속성과 메서드만 둔다.
export class fake_event {
  constructor(event_type, event_options = {}) {
    this.type = String(event_type);
    this.bubbles = Boolean(event_options.bubbles);
    this.cancelable = Boolean(event_options.cancelable);
    this.target = null;
    this.currentTarget = null;
    this.eventPhase = 0;
    this.defaultPrevented = false;
    this.is_propagation_stopped = false;
    this.is_immediate_propagation_stopped = false;
  }

  // DOM 표준: stopPropagation()을 부르면 cancelBubble이 true가 된다.
  get cancelBubble() {
    return this.is_propagation_stopped;
  }

  stopPropagation() {
    this.is_propagation_stopped = true;
  }

  stopImmediatePropagation() {
    this.is_propagation_stopped = true;
    this.is_immediate_propagation_stopped = true;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
}

class fake_node {
  constructor(owner_document, node_type) {
    this.ownerDocument = owner_document;
    this.nodeType = node_type;
    this.parentNode = null;
    this.childNodes = [];
    this.registered_listeners = [];
  }

  // DOM 표준: 같은 type, callback, capture 조합은 한 번만 등록된다.
  addEventListener(event_type, listener_callback, listener_options = false) {
    if (typeof listener_callback !== 'function') return;
    const is_capture = typeof listener_options === 'boolean' ? listener_options : Boolean(listener_options?.capture);
    const is_duplicate = this.registered_listeners.some(
      (registered_listener) =>
        registered_listener.event_type === event_type &&
        registered_listener.listener_callback === listener_callback &&
        registered_listener.is_capture === is_capture,
    );
    if (!is_duplicate) {
      this.registered_listeners.push({ event_type, listener_callback, is_capture, is_removed: false });
    }
  }

  removeEventListener(event_type, listener_callback, listener_options = false) {
    const is_capture = typeof listener_options === 'boolean' ? listener_options : Boolean(listener_options?.capture);
    const listener_index = this.registered_listeners.findIndex(
      (registered_listener) =>
        registered_listener.event_type === event_type &&
        registered_listener.listener_callback === listener_callback &&
        registered_listener.is_capture === is_capture,
    );
    if (listener_index === -1) return;
    // 전파 중에 제거된 리스너는 호출되지 않는다(removed 플래그).
    this.registered_listeners[listener_index].is_removed = true;
    this.registered_listeners.splice(listener_index, 1);
  }

  // DOM 표준의 dispatch: capture(루트 → 부모) → target(capture 먼저, 그다음 bubble 리스너) → bubble(부모 → 루트).
  dispatchEvent(dispatched_event) {
    if (!(dispatched_event instanceof fake_event)) throw new TypeError('Event가 아닙니다');
    dispatched_event.target = this;
    const propagation_path = [];
    for (let current_node = this; current_node; current_node = current_node.parentNode) {
      propagation_path.push(current_node);
    }
    const invoke_listeners = (current_node, phase_number, should_invoke) => {
      if (dispatched_event.is_propagation_stopped) return;
      dispatched_event.currentTarget = current_node;
      dispatched_event.eventPhase = phase_number;
      // 전파 중 추가된 리스너는 이번 전파에서 호출되지 않도록 목록을 복사한다.
      for (const registered_listener of [...current_node.registered_listeners]) {
        if (registered_listener.is_removed) continue;
        if (registered_listener.event_type !== dispatched_event.type) continue;
        if (!should_invoke(registered_listener)) continue;
        registered_listener.listener_callback.call(current_node, dispatched_event);
        if (dispatched_event.is_immediate_propagation_stopped) return;
      }
    };
    for (let path_index = propagation_path.length - 1; path_index >= 1; path_index -= 1) {
      invoke_listeners(propagation_path[path_index], 1, (registered_listener) => registered_listener.is_capture);
    }
    invoke_listeners(this, 2, (registered_listener) => registered_listener.is_capture);
    invoke_listeners(this, 2, (registered_listener) => !registered_listener.is_capture);
    if (dispatched_event.bubbles) {
      for (let path_index = 1; path_index < propagation_path.length; path_index += 1) {
        invoke_listeners(propagation_path[path_index], 3, (registered_listener) => !registered_listener.is_capture);
      }
    }
    dispatched_event.currentTarget = null;
    dispatched_event.eventPhase = 0;
    return !dispatched_event.defaultPrevented;
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

const form_control_names = new Set(['input', 'textarea', 'select', 'button']);
// DOM 표준 "valid attribute local name": ASCII 공백(탭, LF, FF, CR, 스페이스), NULL, /, =, >만 거부한다.
// 따옴표나 U+00A0 같은 비 ASCII 공백은 허용한다(2026-11-11 Chrome 156에서 setAttribute('"a') 성공 확인).
const valid_attribute_name_pattern = /^[^\t\n\f\r \u0000/=>]+$/;

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
    else {
      this.attributes.push({
        name: normalized_name,
        prefix: null,
        localName: normalized_name,
        namespaceURI: null,
        value: String(attribute_value),
      });
    }
  }

  // DOM 표준 "validate and extract": qualified name을 prefix와 localName으로 나누고 네임스페이스 조합을 검사한다.
  // 같은 (namespaceURI, localName) attribute가 있으면 값만 바꾸고, 없으면 새로 붙인다.
  setAttributeNS(namespace_uri, qualified_name, attribute_value) {
    const normalized_namespace = namespace_uri === '' || namespace_uri === undefined ? null : namespace_uri;
    const qualified_text = String(qualified_name);
    if (!valid_attribute_name_pattern.test(qualified_text)) {
      throw create_dom_exception('InvalidCharacterError', `잘못된 attribute 이름: ${qualified_text}`);
    }
    const separator_index = qualified_text.indexOf(':');
    const prefix_text = separator_index === -1 ? null : qualified_text.slice(0, separator_index);
    const local_name = separator_index === -1 ? qualified_text : qualified_text.slice(separator_index + 1);
    const is_xmlns_name = qualified_text === 'xmlns' || prefix_text === 'xmlns';
    if (
      (prefix_text !== null && normalized_namespace === null) ||
      (prefix_text === 'xml' && normalized_namespace !== xml_namespace_uri) ||
      (is_xmlns_name && normalized_namespace !== xmlns_namespace_uri) ||
      (normalized_namespace === xmlns_namespace_uri && !is_xmlns_name)
    ) {
      throw create_dom_exception('NamespaceError', `네임스페이스와 이름이 맞지 않습니다: ${qualified_text}`);
    }
    const existing_attribute = this.attributes.find(
      (attribute_node) => attribute_node.namespaceURI === normalized_namespace && attribute_node.localName === local_name,
    );
    if (existing_attribute) existing_attribute.value = String(attribute_value);
    else {
      this.attributes.push({
        name: qualified_text,
        prefix: prefix_text,
        localName: local_name,
        namespaceURI: normalized_namespace,
        value: String(attribute_value),
      });
    }
  }

  getAttributeNS(namespace_uri, local_name) {
    const normalized_namespace = namespace_uri === '' || namespace_uri === undefined ? null : namespace_uri;
    return (
      this.attributes.find(
        (attribute_node) => attribute_node.namespaceURI === normalized_namespace && attribute_node.localName === local_name,
      )?.value ?? null
    );
  }

  removeAttribute(attribute_name) {
    const normalized_name = this.normalize_attribute_name(attribute_name);
    const attribute_index = this.attributes.findIndex((attribute_node) => attribute_node.name === normalized_name);
    if (attribute_index !== -1) this.attributes.splice(attribute_index, 1);
  }

  // HTML 표준: input의 value property는 사용자가 고치기 전(dirty 아님)에는 value attribute를 따르고,
  // 한 번 고치면 attribute와 따로 논다. form.reset()은 dirty 표시를 지워 다시 attribute를 따르게 한다.
  get value() {
    if (this.dirty_value !== undefined) return this.dirty_value;
    return this.getAttribute('value') ?? '';
  }

  set value(next_value) {
    this.dirty_value = String(next_value ?? '');
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  list_form_controls() {
    const form_controls = [];
    const pending_nodes = [...this.childNodes].reverse();
    while (pending_nodes.length > 0) {
      const current_node = pending_nodes.pop();
      if (current_node.nodeType !== 1) continue;
      if (form_control_names.has(current_node.localName)) form_controls.push(current_node);
      for (let index = current_node.childNodes.length - 1; index >= 0; index -= 1) pending_nodes.push(current_node.childNodes[index]);
    }
    return form_controls;
  }

  // HTMLFormElement.elements: 폼 안의 컨트롤을 문서 순서로 담고, namedItem은 id 또는 name이 같은 첫 컨트롤을 찾는다.
  get elements() {
    if (this.localName !== 'form') return undefined;
    const form_controls = this.list_form_controls();
    return {
      length: form_controls.length,
      namedItem: (control_name) =>
        form_controls.find(
          (form_control) => form_control.getAttribute('id') === control_name || form_control.getAttribute('name') === control_name,
        ) ?? null,
    };
  }

  reset() {
    if (this.localName !== 'form') return;
    for (const form_control of this.list_form_controls()) delete form_control.dirty_value;
  }
}

export class fake_document extends fake_node {
  constructor() {
    super(null, 9);
    this.ownerDocument = null;
    this.activeElement = null;
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

// HTML 파서가 만든 attribute를 흉내 낸다. 파서(tokenizer)는 이름을 검사하지 않으므로
// <p =x>에서 이름이 "=x"인 attribute를 만들지만, 같은 이름을 setAttribute에 넘기면 InvalidCharacterError가 난다.
export function append_parsed_attribute(element_node, attribute_name, attribute_value) {
  element_node.attributes.push({
    name: attribute_name,
    prefix: null,
    localName: attribute_name,
    namespaceURI: null,
    value: String(attribute_value),
  });
}
