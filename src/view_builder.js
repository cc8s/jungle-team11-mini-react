// 컴포넌트가 화면 모양(Virtual DOM)을 만들 때 쓰는 도우미.
// 이벤트 핸들러는 Virtual DOM 노드 안에 넣지 않고 노드 밖 WeakMap에 둔다.
// 노드는 순수 데이터로 남고(동결, diff 대상 아님), 이벤트 때는 DOM → __virtual_node → 핸들러 순서로 찾는다.

import {
  create_element_node,
  create_text_node,
  create_fragment_node,
  fragment_node_type,
  is_virtual_node,
  is_text_like_node,
  is_safe_attribute,
  is_blocked_element_name,
  is_url_animation_element,
} from './virtual_node.js';

const event_handlers_by_virtual_node = new WeakMap();
const event_type_pattern = /^[a-z][a-z0-9_:-]*$/;

function create_attribute_record(source_attributes) {
  const attribute_record = Object.create(null);
  if (source_attributes === null || source_attributes === undefined) return attribute_record;
  if (typeof source_attributes !== 'object' || Array.isArray(source_attributes)) {
    throw new TypeError('attributes는 객체여야 합니다');
  }
  for (const attribute_name of Object.keys(source_attributes)) {
    const attribute_source = source_attributes[attribute_name];
    if (typeof attribute_source === 'function') {
      throw new TypeError(`attribute "${attribute_name}"에 함수를 넣을 수 없습니다. event_handlers를 쓰세요`);
    }
    // null, undefined, false는 attribute가 없는 것, true는 값이 빈 불리언 attribute다(DOM의 hasAttribute 기준).
    if (attribute_source === null || attribute_source === undefined || attribute_source === false) continue;
    const attribute_text = attribute_source === true ? '' : String(attribute_source);
    // on*, srcdoc, javascript: URL은 실제 DOM에서 코드를 실행하므로 만들지 않는다.
    if (!is_safe_attribute(attribute_name, attribute_text)) continue;
    attribute_record[attribute_name] = attribute_text;
  }
  return attribute_record;
}

function create_event_handler_record(source_event_handlers) {
  if (source_event_handlers === null || source_event_handlers === undefined) return null;
  if (typeof source_event_handlers !== 'object' || Array.isArray(source_event_handlers)) {
    throw new TypeError('event_handlers는 객체여야 합니다');
  }
  const event_handler_record = Object.create(null);
  let has_event_handler = false;
  for (const event_type of Object.keys(source_event_handlers)) {
    if (!event_type_pattern.test(event_type)) {
      throw new TypeError(`잘못된 이벤트 이름입니다: ${event_type}`);
    }
    const event_handler = source_event_handlers[event_type];
    if (event_handler === null || event_handler === undefined) continue;
    if (typeof event_handler !== 'function') {
      throw new TypeError(`"${event_type}" 이벤트 핸들러는 함수여야 합니다`);
    }
    event_handler_record[event_type] = event_handler;
    has_event_handler = true;
  }
  return has_event_handler ? Object.freeze(event_handler_record) : null;
}

// 렌더링 결과로 받을 수 있는 값을 Virtual DOM 노드 배열로 펼친다.
// 문자열·숫자 → 텍스트 노드, 배열 → 펼침, #fragment → 자식을 펼침, null/undefined/불리언 → 건너뜀.
// 깊게 중첩된 배열에서도 스택이 넘치지 않도록 반복문으로 처리한다.
export function normalize_view_children(view_children) {
  const normalized_children = [];
  const pending_items = [view_children];
  while (pending_items.length > 0) {
    const current_item = pending_items.pop();
    if (current_item === null || current_item === undefined || typeof current_item === 'boolean') continue;
    if (Array.isArray(current_item)) {
      for (let index = current_item.length - 1; index >= 0; index -= 1) pending_items.push(current_item[index]);
      continue;
    }
    if (typeof current_item === 'string' || typeof current_item === 'number' || typeof current_item === 'bigint') {
      normalized_children.push(create_text_node(String(current_item)));
      continue;
    }
    if (is_virtual_node(current_item)) {
      if (current_item.type === fragment_node_type) {
        for (let index = current_item.children.length - 1; index >= 0; index -= 1) {
          pending_items.push(current_item.children[index]);
        }
      } else {
        normalized_children.push(current_item);
      }
      continue;
    }
    throw new TypeError(`화면에 그릴 수 없는 값입니다: ${Object.prototype.toString.call(current_item)}`);
  }
  return normalized_children;
}

// view_options: { attributes, event_handlers, namespace }
export function create_view_element(element_type, view_options = null, view_children = []) {
  if (typeof element_type !== 'string') throw new TypeError('element_type은 문자열이어야 합니다');
  if (is_blocked_element_name(element_type)) {
    throw new TypeError(`${element_type} 요소는 만들 수 없습니다`);
  }
  if (view_options !== null && (typeof view_options !== 'object' || Array.isArray(view_options))) {
    throw new TypeError('view_options는 객체여야 합니다');
  }
  const attribute_record = create_attribute_record(view_options?.attributes);
  // SVG animate·set은 values, to 값으로 href를 javascript: URL로 바꿀 수 있어 URL 검사를 피해 간다.
  if (is_url_animation_element(element_type, attribute_record)) {
    throw new TypeError(`URL attribute를 바꾸는 ${element_type} 요소는 만들 수 없습니다`);
  }
  const element_node = create_element_node(
    element_type,
    attribute_record,
    normalize_view_children(view_children),
    view_options?.namespace ?? null,
  );
  const event_handler_record = create_event_handler_record(view_options?.event_handlers);
  if (event_handler_record !== null) event_handlers_by_virtual_node.set(element_node, event_handler_record);
  return element_node;
}

// 렌더링 결과 전체를 컨테이너에 그릴 #fragment 루트로 만든다.
// 같은 노드 객체가 트리 두 곳에 있으면 북마크(WeakMap)가 DOM 하나만 가리킬 수 있어 patch가 틀어지므로 막는다.
// 이전 렌더링의 노드를 다시 쓰는 것(use_memo)은 트리 안에서 한 번만 나오면 괜찮다.
export function create_view_root(view_output) {
  const root_node = create_fragment_node(normalize_view_children(view_output));
  const seen_nodes = new Set();
  const pending_nodes = [...root_node.children];
  while (pending_nodes.length > 0) {
    const current_node = pending_nodes.pop();
    if (seen_nodes.has(current_node)) {
      throw new TypeError('같은 Virtual DOM 노드 객체를 트리의 두 곳에 넣을 수 없습니다. 노드를 따로 만드세요');
    }
    seen_nodes.add(current_node);
    if (is_text_like_node(current_node)) continue;
    for (const child_node of current_node.children) pending_nodes.push(child_node);
  }
  return root_node;
}

export function find_event_handler(virtual_node, event_type) {
  if (!is_virtual_node(virtual_node)) return null;
  return event_handlers_by_virtual_node.get(virtual_node)?.[event_type] ?? null;
}

// 트리에 등록된 이벤트 이름을 모두 모은다. 컨테이너에 위임 리스너를 붙일 때 쓴다.
export function collect_event_types(root_node) {
  const event_types = new Set();
  const pending_nodes = [root_node];
  while (pending_nodes.length > 0) {
    const current_node = pending_nodes.pop();
    if (!is_virtual_node(current_node) || is_text_like_node(current_node)) continue;
    const event_handler_record = event_handlers_by_virtual_node.get(current_node);
    if (event_handler_record) for (const event_type of Object.keys(event_handler_record)) event_types.add(event_type);
    for (const child_node of current_node.children) pending_nodes.push(child_node);
  }
  return event_types;
}

// 루트(#fragment)를 뺀 노드 수. 화면에 "전체 N개 노드 중 몇 개가 바뀌었는지" 보여 줄 때 쓴다.
export function count_view_nodes(root_node) {
  let node_count = 0;
  const pending_nodes = is_virtual_node(root_node) && root_node.type === fragment_node_type ? [...root_node.children] : [root_node];
  while (pending_nodes.length > 0) {
    const current_node = pending_nodes.pop();
    if (!is_virtual_node(current_node)) continue;
    node_count += 1;
    if (is_text_like_node(current_node)) continue;
    for (const child_node of current_node.children) pending_nodes.push(child_node);
  }
  return node_count;
}
