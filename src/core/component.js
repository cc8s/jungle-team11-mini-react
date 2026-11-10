// 함수 컴포넌트. 계약은 tests/unit/component.test.js 맨 위 주석.
//
// 루트 fn 을 실행해 VNode 를 얻고, 그 안의 자식 함수 컴포넌트를 expand 로 모두 펼쳐 일반 VNode
// 트리로 만든다. 첫 렌더는 render, 이후 렌더는 Phase 1 의 diff / patch 를 그대로 쓴다.
// hook 슬롯은 루트 fn 이 실행되는 동안에만 쓸 수 있다: 자식은 props 만 받는 순수 함수다.
import { createText } from '../vdom/vnode.js';
import { render } from '../vdom/render.js';
import { diff } from '../vdom/diff.js';
import { patch } from '../vdom/patch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 렌더 중 update() 가 불리면 바로 렌더하지 않고 표시만 해 둔다. 무한 재렌더를 막는 한도.
const MAX_RERENDERS = 25;

// 지금 루트 fn 을 실행 중인 컴포넌트. 그 밖에서는 null.
let current = null;

// 공개 필드가 아닌 컴포넌트 내부 상태.
//   rendering: 루트 fn 또는 expand 실행 중   pending: 렌더 중 update() 가 불렸다
//   hookCount: 첫 commit 에서 확정된 hook 수 (그 전에는 null)
const internals = new WeakMap();

export function getCurrentComponent() {
  return current;
}

// 현재 컴포넌트의 다음 hook 슬롯. 처음 쓰는 슬롯이면 init() 결과를 저장한다.
// init 이 던지면 슬롯도 hookIndex 도 그대로 둔다: 그 호출은 hook 호출로 세지 않는다.
export function useHookSlot(init) {
  const comp = current;
  if (comp == null) {
    throw new Error('hook 은 루트 컴포넌트 함수가 렌더되는 동안에만 부를 수 있습니다');
  }
  const i = comp.hookIndex;
  const { hookCount } = internals.get(comp);
  if (hookCount != null && i >= hookCount) {
    throw new Error(`hook 을 첫 렌더(${hookCount}개)보다 많이 불렀습니다. hook 은 조건 없이 같은 순서로 불러야 합니다`);
  }
  if (i >= comp.hooks.length) comp.hooks.push(init());
  comp.hookIndex = i + 1;
  return comp.hooks[i];
}

export class FunctionComponent {
  constructor(fn, props) {
    if (typeof fn !== 'function') {
      throw new TypeError(`FunctionComponent: fn 은 함수여야 합니다 (받은 값: ${typeof fn})`);
    }
    this.fn = fn;
    this.props = props ?? {};
    this.hooks = [];
    this.hookIndex = 0;
    this.vnode = null;
    this.dom = null;
    this.container = null;
    internals.set(this, { rendering: false, pending: false, hookCount: null });
  }

  // 펼친 트리를 render 해 container 의 기존 자식 뒤에 붙인다. 첫 commit 전에 실패하면
  // container 도 컴포넌트도 처음 상태로 남는다. 첫 렌더 중 update() 가 불렸으면 이어서 다시 렌더한다.
  mount(container) {
    if (!(container instanceof Node)) throw new TypeError('mount: container 는 DOM Node 여야 합니다');
    if (this.container != null) throw new Error('mount: 이미 mount 된 컴포넌트입니다');

    const state = internals.get(this);
    let dom = null;
    let vnode;
    try {
      vnode = renderTree(this);
      if (vnode != null) dom = render(vnode, containerNs(container));
    } catch (e) {
      state.pending = false;
      this.hooks = [];
      this.hookIndex = 0;
      throw e;
    }
    if (dom != null) container.appendChild(dom);
    this.container = container;
    this.vnode = vnode;
    this.dom = dom;
    state.hookCount = this.hooks.length;

    rerender(this, []);
    return this.dom;
  }

  // 다시 렌더해 이전 트리와 diff 하고, 이번 호출이 적용한 patch 전부를 돌려준다.
  // 렌더 중에 불리면 표시만 하고 [] 를 돌려준다: 지금 렌더가 commit 된 뒤 다시 렌더한다.
  update() {
    const state = internals.get(this);
    if (state.rendering) {
      state.pending = true;
      return [];
    }
    if (this.container == null) throw new Error('update: mount 하기 전에는 update 할 수 없습니다');

    const applied = commit(this, renderTree(this));
    return rerender(this, applied);
  }
}

// 렌더 중 update() 가 불렸으면 같은 호출 안에서 다시 렌더한다. 한도를 넘으면 표시를 지우고 Error.
function rerender(comp, applied) {
  const state = internals.get(comp);
  let count = 0;
  while (state.pending) {
    if (count === MAX_RERENDERS) {
      state.pending = false;
      throw new Error(`렌더 중 update() 로 인한 재렌더가 ${MAX_RERENDERS}번을 넘었습니다. 렌더 안에서 상태를 계속 바꾸고 있지 않은지 확인하세요`);
    }
    count += 1;
    state.pending = false;
    applied.push(...commit(comp, renderTree(comp)));
  }
  return applied;
}

// 새 트리를 DOM 에 반영하고 적용한 patch 목록을 돌려준다. 실패하면 표시된 재렌더도 버린다.
function commit(comp, vnode) {
  try {
    return applyTree(comp, vnode);
  } catch (e) {
    internals.get(comp).pending = false;
    throw e;
  }
}

function applyTree(comp, vnode) {
  const patches = diff(comp.vnode, vnode);
  const prev = comp.dom;
  const ns = containerNs(comp.container);
  let dom;
  if (prev == null) {
    // 루트 ADD: patch 는 부모를 몰라 네임스페이스를 정할 수 없으므로 여기서 render 해 맨 뒤에 붙인다.
    dom = vnode == null ? null : render(vnode, ns);
    if (dom != null) comp.container.appendChild(dom);
  } else {
    try {
      dom = patch(prev, patches);
    } catch (e) {
      // 앞쪽 patch 가 이미 반영됐을 수 있다. 이전 트리로 다시 그려 DOM 과 comp.vnode 를 맞춘다.
      const fresh = render(comp.vnode, ns);
      prev.parentNode?.replaceChild(fresh, prev);
      comp.dom = fresh;
      throw e;
    }
  }
  comp.vnode = vnode;
  comp.dom = dom;
  return patches;
}

// container 안에 둘 루트의 네임스페이스. render(vnode, ns) 의 규칙과 같다.
const containerNs = (container) =>
  container.namespaceURI === SVG_NS && container.localName !== 'foreignObject' ? SVG_NS : null;

// 루트 fn 만 현재 컴포넌트로 실행하고, 자식 펼치기는 그 밖에서 한다.
// 렌더가 예외로 끝나면 그 사이에 표시된 재렌더도 버린다.
function renderTree(comp) {
  const state = internals.get(comp);
  const prev = current;
  state.rendering = true;
  try {
    current = comp;
    comp.hookIndex = 0;
    let result;
    try {
      result = comp.fn(comp.props);
    } finally {
      current = prev;
    }
    if (state.hookCount != null && comp.hookIndex !== state.hookCount) {
      throw new Error(`hook 을 첫 렌더(${state.hookCount}개)보다 적게(${comp.hookIndex}개) 불렀습니다. hook 은 조건 없이 같은 순서로 불러야 합니다`);
    }
    return expand(result);
  } catch (e) {
    state.pending = false;
    throw e;
  } finally {
    state.rendering = false;
  }
}

// 함수 type 을 모두 실행해 일반 VNode 트리로 바꾼다. 루트는 노드 하나이므로 배열은 받지 않는다.
export function expand(value) {
  const out = resolve(value);
  if (Array.isArray(out)) throw new TypeError('expand: 루트 자리에는 배열이 올 수 없습니다');
  return out;
}

// value → null | VNode | 배열(아직 펼치지 않은 자식 목록). 함수 VNode 는 결과가 나올 때까지 연쇄로 실행한다.
function resolve(value) {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'string' || typeof value === 'number') return createText(value);
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') throw new TypeError(`expand: VNode 가 아닌 값입니다 (받은 값: ${typeof value})`);

  if (typeof value.type === 'function') {
    const out = resolve(callComponent(value));
    // 함수 VNode 의 key 가 결과 key 를 덮는다. 배열 결과에는 붙일 자리가 없다.
    if (value.key != null && out != null && !Array.isArray(out)) return { ...out, key: value.key };
    return out;
  }
  if (typeof value.type !== 'string') throw new TypeError('expand: type 이 없는 객체는 VNode 가 아닙니다');
  if (value.children.length === 0) return value;
  const children = [];
  for (const child of value.children) place(child, children);
  return { ...value, children };
}

// 자식 자리: null 은 버리고, 배열은 그 자리에 펼쳐 넣는다.
function place(value, out) {
  const node = resolve(value);
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) place(item, out);
  } else {
    out.push(node);
  }
}

// 자식 컴포넌트는 hook 을 쓸 수 없도록 현재 컴포넌트 없이 실행한다.
function callComponent(vnode) {
  const prev = current;
  current = null;
  try {
    return vnode.type({ ...vnode.props, children: vnode.children });
  } finally {
    current = prev;
  }
}
