// useEffect / useMemo 통합 테스트 (이슈 #9). 계약은 tests/unit/effects.test.js 맨 위 주석.
// 사용자 이벤트 → setState → update → diff/patch → effect 의 흐름을 앱 모양 컴포넌트로 확인한다.
// 렌더 밖 setState 뒤에는 flush() 를 기다린다 (#10 batching 이 와도 유효하게).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState, useEffect, useMemo } from '../../src/core/hooks.js';
import { FunctionComponent } from '../../src/core/component.js';
import { render } from '../../src/vdom/render.js';
import { h } from '../../src/vdom/vnode.js';

function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function record(target) {
  const delivered = [];
  const mo = new MutationObserver((rs) => delivered.push(...rs));
  mo.observe(target, { childList: true, attributes: true, characterData: true, subtree: true });
  return {
    take() {
      const out = [...delivered, ...mo.takeRecords()];
      delivered.length = 0;
      return out;
    },
    stop() {
      mo.disconnect();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const texts = (container, selector) => [...container.querySelectorAll(selector)].map((el) => el.textContent);

afterEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('useEffect 통합', () => {
  it('TC-EFF-080 구독 effect: 채널을 바꾸면 이전 구독을 cleanup 으로 끊고 새 채널을 구독, unmount 하면 모두 끊김', async () => {
    const bus = new EventTarget();
    const add = vi.spyOn(bus, 'addEventListener');
    const remove = vi.spyOn(bus, 'removeEventListener');
    const send = (channel, detail) => bus.dispatchEvent(new CustomEvent(channel, { detail }));

    const App = () => {
      const [channel, setChannel] = useState('a');
      const [msgs, setMsgs] = useState([]);
      useEffect(() => {
        const on = (e) => setMsgs((m) => [...m, `${channel}:${e.detail}`]);
        bus.addEventListener(channel, on);
        return () => bus.removeEventListener(channel, on);
      }, [channel]);
      return h(
        'div',
        null,
        h('button', { onClick: () => setChannel((c) => (c === 'a' ? 'b' : 'a')) }, channel),
        h('ul', null, ...msgs.map((m) => h('li', { key: m }, m))),
      );
    };
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    expect(add).toHaveBeenCalledTimes(1);

    send('a', 1);
    await flush();
    expect(texts(container, 'li')).toEqual(['a:1']);

    container.querySelector('button').click();
    await flush();
    expect(container.querySelector('button').textContent).toBe('b');
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);

    send('a', 2);
    send('b', 3);
    await flush();
    expect(texts(container, 'li')).toEqual(['a:1', 'b:3']);

    comp.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(container.childNodes).toHaveLength(0);
    expect(() => send('b', 4)).not.toThrow();
    await flush();
    expect(container.childNodes).toHaveLength(0);
  });

  it('TC-EFF-081 effect 가 갱신된 DOM 을 읽어 document.title 에 반영, 같은 값 클릭(상태 그대로)은 effect·DOM 기록 없음', async () => {
    const effect = vi.fn();
    let comp;
    const App = () => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        effect();
        document.title = `count ${comp.dom.querySelector('b').textContent}`;
      }, [count]);
      return h(
        'div',
        null,
        h('b', null, String(count)),
        h('button', { class: 'inc', onClick: () => setCount((c) => c + 1) }, '+'),
        h('button', { class: 'same', onClick: () => setCount((c) => c) }, '='),
      );
    };
    comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    expect(document.title).toBe('count 0');

    container.querySelector('.inc').click();
    await flush();
    container.querySelector('.inc').click();
    await flush();
    expect(document.title).toBe('count 2');
    expect(effect).toHaveBeenCalledTimes(3);

    const rec = record(container);
    container.querySelector('.same').click();
    await flush();
    expect(rec.take()).toHaveLength(0);
    expect(effect).toHaveBeenCalledTimes(3);
    rec.stop();
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
  });
});

describe('useMemo 통합', () => {
  it('TC-MEMO-020 useMemo 로 만든 VNode 서브트리는 다른 상태가 바뀌어도 다시 계산되지 않고, DOM 기록은 바뀐 텍스트 1건뿐', async () => {
    const items = ['x', 'y', 'z'];
    const compute = vi.fn(() => h('ul', null, ...items.map((t) => h('li', { key: t }, t))));
    const App = () => {
      const [n, setN] = useState(0);
      const list = useMemo(compute, [items]);
      return h('div', null, h('button', { onClick: () => setN((p) => p + 1) }, String(n)), list);
    };
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    const lis = [...container.querySelectorAll('li')];
    const button = container.querySelector('button');
    const rec = record(container);

    button.click();
    await flush();
    button.click();
    await flush();

    const records = rec.take();
    rec.stop();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.type === 'characterData' && r.target.parentNode === button)).toBe(true);
    expect(button.textContent).toBe('2');
    expect(compute).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll('li')]).toEqual(lis);
  });

  it('TC-MEMO-021 필터 목록: 검색어가 바뀔 때만 다시 거르고, 상관없는 상태(테마)는 다시 거르지 않는다', async () => {
    const all = ['apple', 'banana', 'avocado', 'cherry'];
    const filter = vi.fn((q) => all.filter((f) => f.includes(q)));
    const App = () => {
      const [query, setQuery] = useState('');
      const [dark, setDark] = useState(false);
      const shown = useMemo(() => filter(query), [query]);
      return h(
        'div',
        { class: dark ? 'dark' : 'light' },
        h('input', { value: query, onInput: (e) => setQuery(e.target.value) }),
        h('button', { onClick: () => setDark((d) => !d) }, 'theme'),
        h('ul', null, ...shown.map((f) => h('li', { key: f }, f))),
      );
    };
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    expect(filter).toHaveBeenCalledTimes(1);
    expect(texts(container, 'li')).toEqual(all);

    const input = container.querySelector('input');
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(filter).toHaveBeenCalledTimes(2);
    expect(texts(container, 'li')).toEqual(['apple', 'banana', 'avocado']);

    container.querySelector('button').click();
    await flush();
    container.querySelector('button').click();
    await flush();
    expect(filter).toHaveBeenCalledTimes(2);
    expect(comp.dom.className).toBe('light');

    input.value = 'av';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(filter).toHaveBeenCalledTimes(3);
    expect(texts(container, 'li')).toEqual(['avocado']);
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
  });
});
