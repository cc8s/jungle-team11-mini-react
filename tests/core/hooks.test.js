import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionComponent, useState, useEffect, useMemo } from '../../src/core/function-component.js';
import { h } from '../../src/vdom/vnode.js';

const tick = () => Promise.resolve();
let container;
beforeEach(() => { container = document.createElement('div'); });

describe('useState', () => {
  it('초기값 렌더 후 setState 로 부분 업데이트된다', async () => {
    let set;
    const App = () => { const [n, s] = useState(0); set = s; return h('div', null, h('p', null, `n=${n}`), h('i')); };
    const c = new FunctionComponent(App, container); c.mount();
    const i = container.querySelector('i');
    expect(container.textContent).toBe('n=0');
    set(1); await tick();
    expect(container.textContent).toBe('n=1');
    expect(container.querySelector('i')).toBe(i); // 전체 재렌더가 아님
  });
  it('함수형 업데이트와 batching: 한 틱의 여러 set 은 한 번만 렌더', async () => {
    let set; const render = vi.fn();
    const App = () => { const [n, s] = useState(0); set = s; render(); return h('p', null, String(n)); };
    new FunctionComponent(App, container).mount();
    set((x) => x + 1); set((x) => x + 1); set((x) => x + 1); await tick();
    expect(container.textContent).toBe('3');
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('같은 값이면 리렌더하지 않는다', async () => {
    let set; const render = vi.fn();
    const App = () => { const [n, s] = useState(5); set = s; render(); return h('p', null, String(n)); };
    new FunctionComponent(App, container).mount();
    set(5); await tick();
    expect(render).toHaveBeenCalledTimes(1);
  });
  it('여러 useState 가 각자 상태를 유지한다', async () => {
    let setA, setB;
    const App = () => { const [a, sa] = useState('a'); const [b, sb] = useState('b'); setA = sa; setB = sb; return h('p', null, a + b); };
    new FunctionComponent(App, container).mount();
    setB('B'); await tick();
    expect(container.textContent).toBe('aB');
    setA('A'); await tick();
    expect(container.textContent).toBe('AB');
  });
  it('컴포넌트 밖에서 호출하면 에러', () => {
    expect(() => useState(0)).toThrow();
  });
});

describe('useEffect', () => {
  it('마운트 후 실행, deps 가 같으면 재실행하지 않는다', async () => {
    let set; const eff = vi.fn();
    const App = () => { const [n, s] = useState(0); const [m, sm] = useState(0); set = [s, sm]; useEffect(eff, [n]); return h('p', null, `${n}${m}`); };
    new FunctionComponent(App, container).mount();
    expect(eff).toHaveBeenCalledTimes(1);
    set[1](1); await tick();
    expect(eff).toHaveBeenCalledTimes(1);
    set[0](1); await tick();
    expect(eff).toHaveBeenCalledTimes(2);
  });
  it('재실행 전에 이전 cleanup 이 호출된다', async () => {
    let set; const cleanup = vi.fn();
    const App = () => { const [n, s] = useState(0); set = s; useEffect(() => cleanup, [n]); return h('p', null, String(n)); };
    new FunctionComponent(App, container).mount();
    expect(cleanup).not.toHaveBeenCalled();
    set(1); await tick();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('deps 가 없으면 매 렌더마다 실행', async () => {
    let set; const eff = vi.fn();
    const App = () => { const [n, s] = useState(0); set = s; useEffect(eff); return h('p', null, String(n)); };
    new FunctionComponent(App, container).mount();
    set(1); await tick();
    expect(eff).toHaveBeenCalledTimes(2);
  });
  it('빈 deps 는 마운트 때 한 번만', async () => {
    let set; const eff = vi.fn();
    const App = () => { const [n, s] = useState(0); set = s; useEffect(eff, []); return h('p', null, String(n)); };
    new FunctionComponent(App, container).mount();
    set(1); await tick();
    expect(eff).toHaveBeenCalledTimes(1);
  });
});

describe('useMemo', () => {
  it('deps 가 같으면 factory 를 다시 실행하지 않는다', async () => {
    let set; const factory = vi.fn((n) => n * 2);
    const App = () => {
      const [n, s] = useState(1); const [m, sm] = useState(0); set = [s, sm];
      const v = useMemo(() => factory(n), [n]);
      return h('p', null, `${v}-${m}`);
    };
    new FunctionComponent(App, container).mount();
    set[1](1); await tick();
    expect(factory).toHaveBeenCalledTimes(1);
    set[0](5); await tick();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('10-1');
  });
});
