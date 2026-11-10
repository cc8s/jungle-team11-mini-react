// 통합: FunctionComponent.update() 가 diff/patch 를 거쳐 만든 DOM 은, 같은 상태로 새로 mount 한
// DOM 과 같다. 계약은 tests/unit/component.test.js 맨 위 주석을 따른다. 요약:
//
//   new FunctionComponent(fn, props?) / comp.mount(container) → 루트 DOM | null
//   comp.update() → 적용한 Patch[]   (fn 다시 실행 → expand → diff → patch)
//   자식 함수 컴포넌트는 expand 가 펼친다 (null/boolean 버림, 문자열 텍스트, 배열은 그 자리에 펼침,
//   함수 VNode 의 key 가 결과 key 를 덮음).
//
// 이 테스트의 상태는 컴포넌트 밖 변수다 (useState 는 #8).
import { describe, it, expect, afterEach } from 'vitest';
import { FunctionComponent } from '../../src/core/component.js';
import { h } from '../../src/vdom/vnode.js';

function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function observe(target) {
  const mo = new MutationObserver(() => {});
  mo.observe(target, { childList: true, attributes: true, characterData: true, subtree: true });
  return mo;
}

// 상태 없는 자식들 + 루트
const Item = ({ text, done }) => h('li', { class: done ? 'done' : null }, text);
const Items = ({ items }) => items.map((it) => h(Item, { key: it.id, text: it.text, done: it.done }));
const Empty = () => null;
const Header = ({ title, children }) => h('header', null, h('h1', null, title), children);
const App = (s) =>
  h(
    'div',
    { id: 'app' },
    h(Header, { title: s.title }, s.filter ? h('small', null, s.filter) : null),
    h('ul', null, s.items.length ? h(Items, { items: s.items }) : h(Empty)),
    h('footer', null, `${s.items.length} items`),
  );

// 같은 상태로 새로 mount 한 컨테이너 (비교 기준)
function fresh(state) {
  const box = document.createElement('div');
  new FunctionComponent(() => App(state)).mount(box);
  return box;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FunctionComponent 통합: update 결과 = 새로 mount 한 결과', () => {
  it('TC-COMP-037 상태 v1 → v2 → v3 → v4 → v1: 매번 새 mount 와 같고, 루트 요소는 같은 객체', () => {
    const versions = [
      { title: 'Todo', filter: null, items: [{ id: 1, text: 'a', done: false }] },
      { title: 'Todo', filter: 'all', items: [{ id: 1, text: 'a', done: true }, { id: 2, text: 'b', done: false }] },
      { title: 'Todos', filter: null, items: [] },
      { title: 'Todos', filter: 'done', items: [{ id: 3, text: 'c', done: true }, { id: 1, text: 'a', done: false }, { id: 4, text: 'd', done: false }] },
    ];
    let state = versions[0];
    const comp = new FunctionComponent(() => App(state));
    const container = makeContainer();
    const root = comp.mount(container);
    expect(container.isEqualNode(fresh(state))).toBe(true);

    for (const next of [versions[1], versions[2], versions[3], versions[0]]) {
      state = next;
      comp.update();
      expect(container.isEqualNode(fresh(state))).toBe(true);
      expect(comp.dom).toBe(root);
      expect(container.firstChild).toBe(root);
    }
    expect(container.innerHTML).toBe(
      '<div id="app"><header><h1>Todo</h1></header><ul><li>a</li></ul><footer>1 items</footer></div>',
    );
  });

  it('TC-COMP-038 시드 고정 무작위 상태 200단계: 매 update 후 새 mount 와 같다', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const randomState = () => {
      const n = Math.floor(rand() * 7);
      const items = [];
      for (let i = 0; i < n; i++) {
        items.push({ id: Math.floor(rand() * 5), text: pick(['a', 'b', 'c', '', '0']), done: rand() < 0.5 });
      }
      return { title: pick(['T', 'Todo', '']), filter: pick([null, 'all', 'done', '']), items };
    };

    let state = randomState();
    const comp = new FunctionComponent(() => App(state));
    const container = makeContainer();
    comp.mount(container);

    for (let step = 0; step < 200; step++) {
      state = randomState();
      comp.update();
      const expected = fresh(state);
      if (!container.isEqualNode(expected)) {
        throw new Error(`step ${step}: ${container.innerHTML} !== ${expected.innerHTML}`);
      }
    }
  });

  it('TC-COMP-039 100단계 중첩 자식 컴포넌트 맨 아래 텍스트만 변경: characterData 1건', () => {
    const Wrap = ({ depth, leaf }) => (depth === 0 ? h('span', null, leaf) : h('div', null, h(Wrap, { depth: depth - 1, leaf })));
    let leaf = 'a';
    const comp = new FunctionComponent(() => h(Wrap, { depth: 100, leaf }));
    const container = makeContainer();
    const root = comp.mount(container);
    const span = container.querySelector('span');
    const mo = observe(container);

    leaf = 'b';
    const patches = comp.update();

    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('TEXT');
    expect(patches[0].path).toHaveLength(101);
    const records = mo.takeRecords();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(records[0].target).toBe(span.firstChild);
    expect(comp.dom).toBe(root);
    expect(span.textContent).toBe('b');
    mo.disconnect();
  });
});
