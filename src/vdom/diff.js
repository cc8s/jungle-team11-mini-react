// 이전 VNode 와 새 VNode 를 비교해 patch 목록을 만든다. 판단 순서는 결정 테이블 0012.
//
//   { type: 'ADD',     path, node }
//   { type: 'REMOVE',  path }
//   { type: 'REPLACE', path, node }
//   { type: 'TEXT',    path, text }
//   { type: 'PROPS',   path, set, remove }
//
// path 는 루트에서 대상까지의 children 인덱스 배열. 결과를 앞에서부터 순서대로 적용하면
// old 가 new 가 된다. key 재정렬은 아직 없으므로 자식은 같은 인덱스끼리 짝짓고,
// 같은 위치에서 key 가 다르면 다른 노드로 보고 교체한다.
import { isText } from './vnode.js';

export function diff(oldVNode, newVNode) {
  const patches = [];
  walk(oldVNode, newVNode, [], patches, false);
  return patches;
}

// inSvg: 부모에게서 물려받은 네임스페이스가 SVG 인가. render(vnode, ns) 의 규칙과 같다.
function walk(oldVNode, newVNode, path, patches, inSvg) {
  if (oldVNode == null && newVNode == null) return;
  if (oldVNode == null) {
    patches.push({ type: 'ADD', path, node: newVNode });
    return;
  }
  if (newVNode == null) {
    patches.push({ type: 'REMOVE', path });
    return;
  }
  if (oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key) {
    patches.push({ type: 'REPLACE', path, node: newVNode });
    return;
  }
  if (isText(oldVNode)) {
    if (oldVNode.text !== newVNode.text) patches.push({ type: 'TEXT', path, text: newVNode.text });
    return;
  }

  const svg = inSvg || newVNode.type === 'svg';
  const props = diffProps(slots(oldVNode.props, !svg), slots(newVNode.props, !svg));
  if (props) patches.push({ type: 'PROPS', path, ...props });
  diffChildren(oldVNode.children, newVNode.children, path, patches, svg && newVNode.type !== 'foreignObject');
}

// render.js setProp 과 같은 규칙: null / undefined / false 는 속성이 없는 것과 같다.
const isEmpty = (value) => value == null || value === false;

// props 를 DOM 의 속성 자리별로 모은다: Map<자리, { name, value }>. HTML 요소는 속성 이름의
// 대소문자를 무시하므로 title 과 Title 은 한 자리이고, render 처럼 나중 것이 이긴다.
// SVG 속성은 대소문자를 구분한다(viewBox). 'constructor', '__proto__' 같은 이름도 평범한 prop 이다.
function slots(props, foldCase) {
  const out = new Map();
  for (const [name, value] of Object.entries(props)) {
    out.set(foldCase ? name.toLowerCase() : name, { name, value });
  }
  return out;
}

function diffProps(oldSlots, newSlots) {
  const set = {};
  const remove = [];
  for (const [slot, { name, value }] of newSlots) {
    if (isEmpty(value)) continue;
    const prev = oldSlots.get(slot)?.value;
    if (isEmpty(prev) || !Object.is(prev, value)) {
      // 대입하면 '__proto__' 가 프로토타입을 바꾸므로 자기 속성으로 정의한다.
      Object.defineProperty(set, name, { value, writable: true, enumerable: true, configurable: true });
    }
  }
  for (const [slot, { name, value }] of oldSlots) {
    if (!isEmpty(value) && isEmpty(newSlots.get(slot)?.value)) remove.push(name);
  }
  return Object.keys(set).length || remove.length ? { set, remove } : null;
}

// 겹치는 인덱스를 먼저 비교하고, 남는 새 자식은 오름차순 ADD, 남는 옛 자식은 내림차순
// REMOVE. 뒤에서부터 지워야 앞쪽 인덱스가 밀리지 않는다.
function diffChildren(oldChildren, newChildren, path, patches, inSvg) {
  const common = Math.min(oldChildren.length, newChildren.length);
  for (let i = 0; i < common; i++) walk(oldChildren[i], newChildren[i], [...path, i], patches, inSvg);
  for (let i = common; i < newChildren.length; i++) {
    patches.push({ type: 'ADD', path: [...path, i], node: newChildren[i] });
  }
  for (let i = oldChildren.length - 1; i >= common; i--) {
    patches.push({ type: 'REMOVE', path: [...path, i] });
  }
}
