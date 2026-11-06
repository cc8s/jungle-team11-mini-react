import { diff } from '../vdom/diff.js';
import { patch } from '../vdom/patch.js';
import { vnodeToDom } from '../vdom/vnode.js';

let current = null;

function use() {
  if (!current) throw new Error('Hook 은 컴포넌트 렌더링 중에만 호출할 수 있다');
  return current;
}

export class FunctionComponent {
  constructor(fn, container, props = {}) {
    Object.assign(this, { fn, container, props, hooks: [], cursor: 0, vnode: null, effects: [], scheduled: false });
  }

  render() {
    this.cursor = 0; this.effects = [];
    const prev = current; current = this;
    try { return this.fn(this.props); } finally { current = prev; }
  }

  mount() {
    this.vnode = this.render();
    this.container.replaceChildren(vnodeToDom(this.vnode));
    this.flushEffects();
  }

  update() {
    const next = this.render();
    patch(this.container.firstChild, diff(this.vnode, next));
    this.vnode = next;
    this.flushEffects();
  }

  // 같은 틱의 여러 setState 를 한 번의 update 로 묶는다 (batching).
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.update(); });
  }

  flushEffects() { this.effects.forEach((run) => run()); this.effects = []; }
}

const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

export function useState(initial) {
  const c = use(); const i = c.cursor++;
  if (!(i in c.hooks)) c.hooks[i] = typeof initial === 'function' ? initial() : initial;
  const setState = (v) => {
    const next = typeof v === 'function' ? v(c.hooks[i]) : v;
    if (Object.is(next, c.hooks[i])) return;
    c.hooks[i] = next; c.schedule();
  };
  return [c.hooks[i], setState];
}

export function useEffect(effect, deps) {
  const c = use(); const i = c.cursor++;
  const prev = c.hooks[i];
  if (prev && deps && same(prev.deps, deps)) return;
  c.hooks[i] = { deps, cleanup: prev?.cleanup };
  c.effects.push(() => {
    c.hooks[i].cleanup?.();
    const cleanup = effect();
    c.hooks[i].cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  });
}

export function useMemo(factory, deps) {
  const c = use(); const i = c.cursor++;
  const prev = c.hooks[i];
  if (prev && deps && same(prev.deps, deps)) return prev.value;
  const value = factory();
  c.hooks[i] = { deps, value };
  return value;
}
