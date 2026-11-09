// diff 가 만든 patch 목록을 실제 DOM 에 적용한다. 계약은 tests/unit/patch.test.js 맨 위 주석.
//
// patch 는 받은 순서 그대로 하나씩 적용하고, path 는 그 시점의 DOM 에서 childNodes 를 따라
// 내려간다. 바뀐 노드만 건드린다: TEXT 는 텍스트 노드의 data 만, PROPS 는 속성만 바꾸고
// 노드를 교체하지 않는다. 루트가 바뀌면(REPLACE / REMOVE / ADD) 새 루트를 돌려준다.
import { render, setProp, removeProp } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

export function patch(dom, patches) {
  let root = dom;
  for (const p of patches) root = apply(root, p);
  return root;
}

function apply(root, p) {
  if (!TYPES.has(p.type)) throw new TypeError(`patch: 알 수 없는 patch type: ${String(p.type)}`);
  const { path } = p;

  if (root == null) {
    if (p.type !== 'ADD' || path.length !== 0) {
      throw new TypeError(`patch: 루트가 없으면 ADD [] 만 적용할 수 있습니다 (받은 값: ${p.type} [${path}])`);
    }
    return render(p.node);
  }

  if (p.type === 'TEXT' || p.type === 'PROPS') {
    applyInPlace(resolve(root, path), p);
    return root;
  }

  if (path.length === 0) return applyAtRoot(root, p);

  const parent = resolve(root, path.slice(0, -1));
  if (parent.nodeType !== Node.ELEMENT_NODE) throw new TypeError(`patch: 부모가 요소가 아닙니다: ${p.type} [${path}]`);
  const i = path[path.length - 1];
  const count = parent.childNodes.length;
  if (p.type === 'ADD') {
    if (!isIndex(i) || i > count) throw new TypeError(`patch: ADD 위치가 범위 밖입니다: [${path}]`);
    parent.insertBefore(render(p.node, childNs(parent)), parent.childNodes[i] ?? null);
  } else {
    if (!isIndex(i) || i >= count) throw new TypeError(`patch: 대상 노드가 없습니다: ${p.type} [${path}]`);
    const target = parent.childNodes[i];
    if (p.type === 'REMOVE') parent.removeChild(target);
    else parent.replaceChild(render(p.node, childNs(parent)), target);
  }
  // textarea 의 텍스트 자식이 생기거나 없어져도 기본값이 바뀌므로 화면 값을 맞춘다.
  syncTextarea(parent);
  return root;
}

const TYPES = new Set(['ADD', 'REMOVE', 'REPLACE', 'TEXT', 'PROPS']);

// 루트 자신의 REPLACE / REMOVE. 부모가 있으면 그 자리에서 바꾸거나 뺀다.
function applyAtRoot(root, p) {
  const parent = root.parentNode;
  if (p.type === 'ADD') throw new TypeError('patch: 루트가 이미 있는데 ADD [] 를 받았습니다');
  if (p.type === 'REMOVE') {
    parent?.removeChild(root);
    return null;
  }
  const next = render(p.node, parent ? childNs(parent) : null);
  parent?.replaceChild(next, root);
  return next;
}

function applyInPlace(node, p) {
  if (p.type === 'TEXT') {
    if (typeof p.text !== 'string') throw new TypeError('patch: TEXT 의 text 는 문자열이어야 합니다');
    if (node.nodeType !== Node.TEXT_NODE) throw new TypeError('patch: TEXT 대상이 텍스트 노드가 아닙니다');
    node.data = p.text;
    syncTextarea(node.parentNode);
    return;
  }
  if (!Array.isArray(p.remove)) throw new TypeError('patch: PROPS 의 remove 는 배열이어야 합니다');
  if (!isPlainObject(p.set)) throw new TypeError('patch: PROPS 의 set 은 일반 객체여야 합니다');
  if (node.nodeType !== Node.ELEMENT_NODE) throw new TypeError('patch: PROPS 대상이 요소가 아닙니다');
  // HTML 속성 이름은 대소문자를 무시하므로 remove 를 먼저 해야 방금 설정한 값을 지우지 않는다.
  for (const name of p.remove) removeProp(node, name);
  for (const [name, value] of Object.entries(p.set)) setProp(node, name, value);
}

function resolve(root, path) {
  let node = root;
  for (const i of path) {
    if (!isIndex(i) || i >= node.childNodes.length) throw new TypeError(`patch: 없는 path 입니다: [${path}]`);
    node = node.childNodes[i];
  }
  return node;
}

const isIndex = (i) => Number.isInteger(i) && i >= 0;

function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// textarea 의 텍스트는 기본값일 뿐이라, 사용자가 입력한 뒤에는 바꿔도 화면 값이 그대로다.
// render 결과와 같도록 화면 값을 새 기본값으로 맞춘다.
function syncTextarea(parent) {
  if (parent?.localName === 'textarea' && parent.namespaceURI === HTML_NS) parent.value = parent.defaultValue;
}

// 새 자식이 물려받을 네임스페이스. render(vnode, ns) 의 규칙과 같다.
const childNs = (parent) =>
  parent.namespaceURI === SVG_NS && parent.localName !== 'foreignObject' ? SVG_NS : null;
