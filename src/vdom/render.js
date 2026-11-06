// VNode → 실제 DOM. setProp / removeProp 는 patch(#5)가 속성을 바꿀 때 그대로 다시 쓴다.
import { isText } from './vnode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 요소마다 붙인 이벤트 핸들러: Map<'onClick', fn>. 교체·제거하려면 이전 함수를 알아야 한다.
const listeners = new WeakMap();

// 속성만 바꾸면 화면에 반영되지 않는 것들. 사용자가 입력한 뒤에는 value 속성이 아니라
// value 프로퍼티가 화면 값을 정하므로 둘 다 맞춘다.
const LIVE_PROPS = new Set(['value', 'checked', 'selected']);

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
    const prev = map.get(name);
    if (prev === value) return;
    if (prev) el.removeEventListener(eventType(name), prev);
    el.addEventListener(eventType(name), value);
    map.set(name, value);
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
  if (LIVE_PROPS.has(name) && name in el) el[name] = name === 'value' ? attr : true;
}

export function removeProp(el, name) {
  if (dropListener(el, name)) return;
  el.removeAttribute(name);
  if (LIVE_PROPS.has(name) && name in el) el[name] = name === 'value' ? '' : false;
}

// 함수 값일 때만 이벤트로 본다. 사용자 HTML 의 onclick="..." 은 문자열이라 속성으로 남는다.
const isEvent = (name) => /^on/i.test(name);
const eventType = (name) => name.slice(2).toLowerCase(); // onClick → click

function dropListener(el, name) {
  const map = listeners.get(el);
  const prev = map?.get(name);
  if (!prev) return false;
  el.removeEventListener(eventType(name), prev);
  map.delete(name);
  return true;
}
