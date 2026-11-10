// VNode → 실제 DOM. setProp / removeProp 는 patch(#5)가 속성을 바꿀 때 그대로 다시 쓴다.
import { isText } from './vnode.js';
import { batch } from '../core/scheduler.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

// 요소마다 붙인 이벤트 핸들러: Map<'onclick', { handler, listener }>. listener 는 실제로 붙인 함수로,
// handler 를 부른 뒤 제어 요소의 화면 값을 되돌린다. on* 이름은 대소문자를 무시한다.
const listeners = new WeakMap();

// 제어 요소(VNode 에 value / checked 가 있는 input·select·textarea)의 마지막 VNode 값: { value?, checked? }.
// 화면 값은 항상 이 값이다: 사용자 입력이 바꿔도 핸들러가 끝나면 되돌린다.
const controlled = new WeakMap();
const CONTROLLABLE = new Set(['input', 'select', 'textarea']);

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
  // select 는 option 이 생긴 뒤에야 값을 고를 수 있고, textarea 는 텍스트 자식보다 value prop 이 우선이다.
  if (controlled.get(el)?.value !== undefined) syncValue(el);
  return el;
}

// 값 규칙: 함수(on*) → 이벤트, null/undefined/false → 제거, true → '', 그 외 → 문자열 속성.
export function setProp(el, name, value) {
  if (isEvent(name) && typeof value === 'function') {
    const map = listeners.get(el) ?? new Map();
    const slot = name.toLowerCase();
    const prev = map.get(slot);
    if (prev) {
      prev.handler = value;
      return;
    }
    // onclick="..." 문자열 속성이 남아 있으면 그 코드도 실행되므로 지운다.
    if (el.hasAttribute(name)) el.removeAttribute(name);
    const entry = { handler: value, listener: null };
    entry.listener = (event) => runHandler(el, entry.handler, event);
    el.addEventListener(eventType(name), entry.listener);
    map.set(slot, entry);
    listeners.set(el, map);
    return;
  }
  if (value == null || value === false) {
    if (value === false) {
      // checked: false 는 "꺼진 상태로 제어" 다. value 의 false 는 비제어.
      clearProp(el, name);
      markControlled(el, name, false);
    } else {
      removeProp(el, name);
    }
    return;
  }
  dropListener(el, name); // 함수였다가 문자열이 된 on* 정리

  const attr = value === true ? '' : String(value);
  el.setAttribute(name, attr);
  const live = liveProp(el, name);
  if (live) el[live] = live === 'value' ? attr : true;
  markControlled(el, name, live === 'value' ? attr : true);
}

export function removeProp(el, name) {
  clearProp(el, name);
  unmarkControlled(el, name);
}

function clearProp(el, name) {
  if (dropListener(el, name)) return;
  el.removeAttribute(name);
  const live = liveProp(el, name);
  if (live === 'value') resetValue(el);
  else if (live) el[live] = false;
}

// 제어 select / textarea 의 화면 값을 value prop 으로 맞춘다. 비제어 textarea 는 텍스트 자식(기본값)으로.
// patch 가 자식을 바꾼 뒤에도 부른다.
export function syncValue(el) {
  if (el.namespaceURI !== HTML_NS) return;
  const value = controlled.get(el)?.value;
  if (el.localName === 'textarea') el.value = value ?? el.defaultValue;
  else if (el.localName === 'select' && value !== undefined) el.value = value;
}

function markControlled(el, name, value) {
  const live = liveProp(el, name);
  if ((live !== 'value' && live !== 'checked') || !CONTROLLABLE.has(el.localName)) return;
  const record = controlled.get(el) ?? {};
  record[live] = live === 'checked' ? value !== false : value;
  controlled.set(el, record);
}

// diff 는 checked: false 와 checked 가 없는 것을 구분하지 않고 remove 로 보낸다. 그래서 제어되던
// checked 를 지우면 "꺼진 상태로 제어" 로 남긴다. value 를 지우면 비제어로 돌아간다.
function unmarkControlled(el, name) {
  const live = liveProp(el, name);
  const record = controlled.get(el);
  if (record == null) return;
  if (live === 'checked' && record.checked !== undefined) record.checked = false;
  else if (live === 'value') delete record.value;
}

// 값을 바꾸는 이벤트. 이 종류의 핸들러가 경로에 있으면 dispatch 가 끝난 뒤 제어 요소를 되돌린다.
const RESTORE_EVENTS = new Set(['input', 'change', 'click']);
const restoreScheduled = new WeakSet();

// 핸들러 호출 1번 = batch 1개: 안의 setState 는 핸들러가 끝날 때 컴포넌트마다 한 번 렌더한다.
// 되돌리기는 다음 작업에서 하므로 batch 렌더가 끝난 뒤에 화면 값을 확인한다.
function runHandler(el, handler, event) {
  if (RESTORE_EVENTS.has(event?.type)) scheduleRestore(event, el);
  return batch(() => handler.call(el, event));
}

// 되돌리기는 다음 작업에서 한다. click 의 activation 은 dispatch 가 끝난 뒤에 input / change 를 내고
// (그 핸들러는 토글된 값을 봐야 한다), preventDefault 된 체크박스는 dispatch 뒤에 checked 를 되돌리기 때문이다.
// 경로는 dispatch 가 끝나면 비므로 대상은 지금 정한다.
function scheduleRestore(event, el) {
  if (restoreScheduled.has(event)) return;
  restoreScheduled.add(event);
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const nodes = path.length ? path : [el];
  const targets = new Set();
  for (const node of nodes) {
    if (!controlled.has(node)) continue;
    targets.add(node);
    if (node.localName === 'input' && node.type === 'radio' && node.name) {
      for (const radio of radioGroup(node)) if (controlled.has(radio)) targets.add(radio);
    }
  }
  if (targets.size) setTimeout(() => restoreControlled(targets), 0);
}

// 같은 name 의 radio: 같은 form, form 이 없으면 같은 문서(트리)에서 form 이 없는 것.
function radioGroup(radio) {
  const scope = radio.form ?? radio.getRootNode();
  if (typeof scope.querySelectorAll !== 'function') return [];
  return [...scope.querySelectorAll('input[type="radio"]')].filter(
    (other) => other.name === radio.name && other.form === radio.form,
  );
}

function restoreControlled(nodes) {
  for (const node of nodes) {
    const record = controlled.get(node);
    if (record == null) continue;
    if (record.value !== undefined && node.value !== record.value) node.value = record.value;
    if (record.checked !== undefined && node.checked !== record.checked) node.checked = record.checked;
  }
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
  el.removeEventListener(eventType(name), prev.listener);
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
