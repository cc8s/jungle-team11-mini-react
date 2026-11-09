// VNode → 실제 DOM. setProp / removeProp 는 patch(#5)가 속성을 바꿀 때 그대로 다시 쓴다.
import { isText } from './vnode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

// 요소마다 붙인 이벤트 핸들러: Map<'onclick', fn>. 교체·제거하려면 이전 함수를 알아야 한다.
// on* 이름은 대소문자를 무시한다: onClick 과 onclick 은 같은 자리다.
const listeners = new WeakMap();

// 속성만 바꾸면 화면에 반영되지 않는 것들. 사용자가 입력한 뒤에는 value 속성이 아니라
// value 프로퍼티가 화면 값을 정하므로 둘 다 맞춘다.
const LIVE_PROPS = new Set(['value', 'checked', 'selected']);

// value 속성이 화면 값 자체인 input type. 사용자가 입력하면 속성과 화면 값이 갈라진다.
// 나머지(checkbox, button 등)는 value 프로퍼티가 속성을 그대로 비추므로 속성만 지우면 된다.
const DEFAULT_VALUE_TYPES = new Set(['hidden', 'submit', 'image', 'reset', 'button', 'checkbox', 'radio', 'file']);

// ns: 부모에게서 물려받은 네임스페이스. <svg> 안에서는 SVG, foreignObject 안에서는 다시 HTML.
export function render(vnode, ns = null) {
  if (isText(vnode)) return document.createTextNode(vnode.text);
  if (typeof vnode.type !== 'string') {
    throw new TypeError(`render: 요소 type 은 문자열이어야 합니다 (받은 값: ${typeof vnode.type}). 함수 컴포넌트는 먼저 실행해 VNode 로 바꾸세요.`);
  }

  const elNs = vnode.type === 'svg' ? SVG_NS : ns;
  const el = elNs ? document.createElementNS(elNs, vnode.type) : document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) setProp(el, name, value);

  const childNs = vnode.type === 'foreignObject' ? null : elNs;
  for (const child of vnode.children) el.appendChild(render(child, childNs));
  return el;
}

// 값 규칙: 함수(on*) → 이벤트, null/undefined/false → 제거, true → '', 그 외 → 문자열 속성.
export function setProp(el, name, value) {
  if (isEvent(name) && typeof value === 'function') {
    const map = listeners.get(el) ?? new Map();
    const slot = name.toLowerCase();
    const prev = map.get(slot);
    if (prev === value) return;
    if (prev) el.removeEventListener(eventType(name), prev);
    // onclick="..." 문자열 속성이 남아 있으면 그 코드도 실행되므로 지운다.
    if (el.hasAttribute(name)) el.removeAttribute(name);
    el.addEventListener(eventType(name), value);
    map.set(slot, value);
    listeners.set(el, map);
    return;
  }
  if (value == null || value === false) {
    removeProp(el, name);
    return;
  }
  dropListener(el, name); // 함수였다가 문자열이 된 on* 정리

  const attr = value === true ? '' : String(value);
  el.setAttribute(name, attr);
  const live = liveProp(el, name);
  if (live) el[live] = live === 'value' ? attr : true;
}

export function removeProp(el, name) {
  if (dropListener(el, name)) return;
  el.removeAttribute(name);
  const live = liveProp(el, name);
  if (live === 'value') resetValue(el);
  else if (live) el[live] = false;
}

// 함수 값일 때만 이벤트로 본다. 사용자 HTML 의 onclick="..." 은 문자열이라 속성으로 남는다.
const isEvent = (name) => /^on/i.test(name);
const eventType = (name) => name.slice(2).toLowerCase(); // onClick → click

// HTML 속성 이름은 대소문자를 무시하므로 Checked, Value 도 프로퍼티까지 맞춘다. SVG 는 구분한다.
function liveProp(el, name) {
  const key = el.namespaceURI === HTML_NS ? name.toLowerCase() : name;
  return LIVE_PROPS.has(key) && key in el ? key : null;
}

function dropListener(el, name) {
  if (!isEvent(name)) return false;
  const map = listeners.get(el);
  const slot = name.toLowerCase();
  const prev = map?.get(slot);
  if (!prev) return false;
  el.removeEventListener(eventType(name), prev);
  map.delete(slot);
  return true;
}

// value 속성을 지운 뒤 화면 값을 render 가 처음 만든 상태로 되돌린다. 빈 문자열을 대입하면
// option·li·button 처럼 value 프로퍼티가 속성을 비추는 요소에 value="" 가 다시 생긴다.
function resetValue(el) {
  if (el.localName === 'select') resetSelect(el);
  else if (el.localName === 'textarea' || (el.localName === 'input' && !DEFAULT_VALUE_TYPES.has(el.type))) {
    el.value = el.defaultValue;
  }
}

// 각 option 을 selected 속성대로 되돌리고, 하나도 없으면 첫 번째로 고를 수 있는 option 을 고른다.
function resetSelect(select) {
  const options = [...select.options];
  for (const option of options) option.selected = option.defaultSelected;
  if (!select.multiple && select.selectedIndex === -1) {
    select.selectedIndex = options.findIndex((option) => !option.disabled);
  }
}
