// 함수 컴포넌트. 계약은 tests/unit/component.test.js 맨 위 주석.
//
// 루트 fn 을 실행해 VNode 를 얻고, 그 안의 자식 함수 컴포넌트를 expand 로 모두 펼쳐 일반 VNode
// 트리로 만든다. 첫 렌더는 render, 이후 렌더는 Phase 1 의 diff / patch 를 그대로 쓴다.
// hook 슬롯은 루트 fn 이 실행되는 동안에만 쓸 수 있다: 자식은 props 만 받는 순수 함수다.
// mount / update 한 번이 마지막 commit 까지 성공하면 돌아오기 직전에 effect 단계를 실행한다
// (계약은 tests/unit/effects.test.js 맨 위 주석).
import { createText } from '../vdom/vnode.js';
import { render } from '../vdom/render.js';
import { diff } from '../vdom/diff.js';
import { patch } from '../vdom/patch.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 렌더 중 update() 가 불리면 바로 렌더하지 않고 표시만 해 둔다. 무한 재렌더를 막는 한도.
const MAX_RERENDERS = 25;

// 지금 루트 fn 을 실행 중인 컴포넌트. 그 밖에서는 null.
let current = null;

// hook 슬롯의 init 을 실행 중인 컴포넌트. 그 안에서 같은 컴포넌트의 hook 을 부르면 슬롯 순서가 뒤섞인다.
// init 안에서 다른 컴포넌트를 mount 하는 것은 그 컴포넌트의 슬롯을 쓰므로 괜찮다.
let initializing = null;

// 공개 필드가 아닌 컴포넌트 내부 상태.
//   rendering: 루트 fn 또는 expand 실행 중   committing: 새 트리를 DOM 에 반영하는 중
//   effecting: effect 단계(cleanup·effect 실행) 중
//   pending: 렌더·commit·effect 단계 중 update() 가 불렸다
//   hookCount: 첫 commit 에서 확정된 hook 수 (그 전에는 null)
//   kinds: 자리마다 hook 종류 ('state' / 'effect' / 'memo', useHookSlot 을 직접 쓰면 undefined)
//   unmounted: unmount 를 시작했다. 이후 다시 mount 할 수 없다
//   renders: update() 가 실제로 렌더를 시작한 횟수. batch 표시 뒤 이미 다시 렌더됐는지 확인하는 데 쓴다
//   onUpdate: 생성 옵션의 관찰 콜백 (없으면 null). 계약은 tests/unit/on-update.test.js 맨 위 주석
const internals = new WeakMap();

export function getCurrentComponent() {
  return current;
}

// 현재 컴포넌트의 hook 을 부를 수 없는 상태로 fn 을 실행한다. hook 의 init, useMemo 의 계산에 쓴다.
export function withoutHooks(fn) {
  const outer = initializing;
  initializing = current;
  try {
    return fn();
  } finally {
    initializing = outer;
  }
}

export function isUnmounted(comp) {
  return internals.get(comp).unmounted;
}

// update() 가 렌더를 시작할 때마다 1 씩 는다. 렌더가 예외로 끝나도 센다.
export function renderCount(comp) {
  return internals.get(comp).renders;
}

// 렌더·commit·effect 단계 중이다. 이때의 update() 는 표시만 하고 같은 호출 안에서 다시 렌더한다.
export function isBusy(comp) {
  const state = internals.get(comp);
  return state.rendering || state.committing || state.effecting;
}

// 현재 컴포넌트의 다음 hook 슬롯. 처음 쓰는 슬롯이면 init() 결과를 저장한다.
// init 이 던지면 슬롯도 hookIndex 도 그대로 둔다: 그 호출은 hook 호출로 세지 않는다.
// kind 를 주면 그 자리의 hook 종류가 첫 렌더와 같은지 검사한다.
export function useHookSlot(init, kind) {
  const comp = current;
  if (comp != null && comp === initializing) {
    throw new Error('hook 의 init·계산 함수 안에서는 hook 을 부를 수 없습니다');
  }
  if (comp == null) {
    throw new Error('hook 은 루트 컴포넌트 함수가 렌더되는 동안에만 부를 수 있습니다');
  }
  const i = comp.hookIndex;
  const state = internals.get(comp);
  const { hookCount } = state;
  if (hookCount != null && i >= hookCount) {
    throw new Error(`hook 을 첫 렌더(${hookCount}개)보다 많이 불렀습니다. hook 은 조건 없이 같은 순서로 불러야 합니다`);
  }
  if (i >= comp.hooks.length) {
    const value = withoutHooks(init);
    comp.hooks.push(value);
    state.kinds[i] = kind;
  } else if (kind !== undefined && state.kinds[i] !== kind) {
    throw new Error(`${i}번째 hook 의 종류가 첫 렌더(${state.kinds[i]})와 다릅니다(${kind}). hook 은 조건 없이 같은 순서로 불러야 합니다`);
  }
  comp.hookIndex = i + 1;
  return comp.hooks[i];
}

export class FunctionComponent {
  constructor(fn, props, options) {
    if (typeof fn !== 'function') {
      throw new TypeError(`FunctionComponent: fn 은 함수여야 합니다 (받은 값: ${typeof fn})`);
    }
    const onUpdate = options?.onUpdate ?? null;
    if (onUpdate !== null && typeof onUpdate !== 'function') {
      throw new TypeError(`FunctionComponent: options.onUpdate 는 함수여야 합니다 (받은 값: ${typeof onUpdate})`);
    }
    this.fn = fn;
    this.props = props ?? {};
    this.hooks = [];
    this.hookIndex = 0;
    this.vnode = null;
    this.dom = null;
    this.container = null;
    internals.set(this, {
      rendering: false,
      committing: false,
      effecting: false,
      pending: false,
      hookCount: null,
      kinds: [],
      unmounted: false,
      renders: 0,
      onUpdate,
    });
  }

  // 펼친 트리를 render 해 container 의 기존 자식 뒤에 붙인다. 첫 commit 전에 실패하면
  // container 도 컴포넌트도 처음 상태로 남는다. 첫 렌더·commit 중 update() 가 불렸으면 이어서 다시 렌더한다.
  // 첫 commit 뒤에는 mount 된 상태로 남는다: 그 뒤 재렌더나 effect 가 던져도 되돌리지 않는다.
  mount(container) {
    if (!(container instanceof Node)) throw new TypeError('mount: container 는 DOM Node 여야 합니다');
    const state = internals.get(this);
    if (state.unmounted) throw new Error('mount: unmount 된 컴포넌트는 다시 mount 할 수 없습니다');
    if (this.container != null) throw new Error('mount: 이미 mount 된 컴포넌트입니다');

    let dom = null;
    let vnode;
    try {
      vnode = renderTree(this);
      state.committing = true;
      if (vnode != null) dom = render(vnode, containerNs(container));
      // container 가 Text 노드나 document 면 여기서 던진다. 이것도 첫 commit 전 실패다.
      if (dom != null) container.appendChild(dom);
    } catch (e) {
      state.pending = false;
      this.hooks = [];
      this.hookIndex = 0;
      state.kinds = [];
      throw e;
    } finally {
      state.committing = false;
    }
    this.container = container;
    this.vnode = vnode;
    this.dom = dom;
    state.hookCount = this.hooks.length;

    flushEffects(this, rerender(this, []));
    return this.dom;
  }

  // 다시 렌더해 이전 트리와 diff 하고, 이번 호출이 적용한 patch 전부를 돌려준다.
  // 렌더·commit·effect 단계 중에 불리면 표시만 하고 [] 를 돌려준다: 지금 단계가 끝난 뒤 다시 렌더한다.
  // 예외 없이 끝나면 돌아오기 직전에 onUpdate 를 돌려줄 배열 그대로 한 번 부른다.
  update() {
    const state = internals.get(this);
    if (state.unmounted) throw new Error('update: unmount 된 컴포넌트는 update 할 수 없습니다');
    if (state.rendering || state.committing || state.effecting) {
      state.pending = true;
      return [];
    }
    if (this.container == null) throw new Error('update: mount 하기 전에는 update 할 수 없습니다');

    state.renders += 1;
    const applied = flushEffects(this, rerender(this, commit(this, renderTree(this))));
    state.onUpdate?.(applied);
    return applied;
  }

  // 실행된 effect 의 cleanup 을 선언 순서로 부르고 루트 DOM 을 container 에서 뗀다.
  // cleanup 이 던져도 나머지를 마친 뒤 첫 예외를 던진다. 두 번째부터는 아무것도 하지 않는다.
  unmount() {
    const state = internals.get(this);
    if (state.unmounted) return;
    if (this.container == null) throw new Error('unmount: mount 되지 않은 컴포넌트입니다');
    state.unmounted = true;

    const errors = new FirstError();
    outsideRender(() => {
      this.hooks.forEach((slot, i) => {
        if (state.kinds[i] !== 'effect' || slot.cleanup == null) return;
        const cleanup = slot.cleanup;
        slot.cleanup = null;
        errors.run(cleanup);
      });
    });
    this.dom?.parentNode?.removeChild(this.dom);
    this.dom = null;
    this.vnode = null;
    this.container = null;
    errors.rethrow();
  }
}

// 여러 함수를 끝까지 실행하고, 실행 순서상 첫 예외만 기억한다.
class FirstError {
  constructor() {
    this.failed = false;
    this.error = undefined;
  }

  run(fn) {
    try {
      return fn();
    } catch (e) {
      if (!this.failed) {
        this.failed = true;
        this.error = e;
      }
      return undefined;
    }
  }

  rethrow() {
    if (this.failed) throw this.error;
  }
}

// 호출의 마지막 commit 뒤 effect 단계. effect 단계에서 update() 가 불렸으면 같은 호출 안에서
// 다시 렌더 → commit → effect 단계를 반복한다. 한도를 넘으면 표시를 지우고 Error.
function flushEffects(comp, applied) {
  const state = internals.get(comp);
  let count = 0;
  for (;;) {
    runEffects(comp);
    // effect 단계 도중 unmount 됐으면 표시된 재렌더는 하지 않는다.
    if (state.unmounted || !state.pending) {
      state.pending = false;
      return applied;
    }
    state.pending = false;
    if (count === MAX_RERENDERS) {
      throw new Error(`effect 안의 update() 로 인한 재렌더가 ${MAX_RERENDERS}번을 넘었습니다. effect 안에서 상태를 계속 바꾸고 있지 않은지 확인하세요`);
    }
    count += 1;
    applied.push(...commit(comp, renderTree(comp)));
    rerender(comp, applied);
  }
}

// effect 슬롯(hooks.js 의 useEffect)은 렌더 중에 effect·deps·due(이번에 실행할지)를 기록한다.
// 여기서는 due 인 슬롯의 cleanup 전부 → effect 전부를 선언 순서로 실행하고 ran·lastDeps·cleanup 을 남긴다.
// 던진 effect 도 실행된 것으로 친다 (cleanup 없음). 예외가 있으면 표시된 재렌더를 버리고 첫 예외를 던진다.
// 도중에 이 컴포넌트가 unmount 되면 남은 cleanup·effect 는 실행하지 않는다. unmount 를 부른 effect 가
// 돌려준 cleanup 은 unmount 가 볼 수 없었으므로 여기서 바로 부른다.
function runEffects(comp) {
  const state = internals.get(comp);
  const due = comp.hooks.filter((slot, i) => state.kinds[i] === 'effect' && slot.due);
  if (due.length === 0) return;

  const errors = new FirstError();
  state.effecting = true;
  try {
    outsideRender(() => {
      for (const slot of due) {
        if (state.unmounted) return;
        const cleanup = slot.cleanup;
        slot.cleanup = null;
        if (cleanup != null) errors.run(cleanup);
      }
      for (const slot of due) {
        if (state.unmounted) return;
        slot.due = false;
        slot.ran = true;
        slot.lastDeps = slot.deps;
        const out = errors.run(slot.effect);
        const cleanup = typeof out === 'function' ? out : null;
        if (state.unmounted) {
          if (cleanup != null) errors.run(cleanup);
          return;
        }
        slot.cleanup = cleanup;
      }
    });
  } finally {
    state.effecting = false;
  }
  if (errors.failed) state.pending = false;
  errors.rethrow();
}

// effect·cleanup 은 렌더 밖이다: 다른 컴포넌트의 렌더 안에서 불려도 그 컴포넌트의 hook 을 쓰지 못하게 한다.
function outsideRender(fn) {
  const prev = current;
  const outer = initializing;
  current = null;
  initializing = null;
  try {
    fn();
  } finally {
    current = prev;
    initializing = outer;
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
// commit 도중(patch 의 setAttribute 가 부른 custom element 콜백 등) update() 도 렌더 중처럼 표시만 한다.
function commit(comp, vnode) {
  const state = internals.get(comp);
  state.committing = true;
  try {
    return applyTree(comp, vnode);
  } catch (e) {
    state.pending = false;
    throw e;
  } finally {
    state.committing = false;
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
