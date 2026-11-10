// 통합: setState → update → diff → patch (이슈 #8). 계약은 tests/unit/hooks.test.js 맨 위 주석.
//
//   useState(initial) → [state, setState]  (루트 컴포넌트에서만)
//   setState(값 | prev => next) → 다시 렌더해 바뀐 노드만 patch. Object.is 가 같으면 아무것도 안 함.
//
// 앱 구조는 Phase 2 원칙을 따른다: 상태는 루트에만 있고, 자식은 props 와 콜백만 받는 hook 없는 함수다.
// 확인은 flush() 를 기다린 뒤에 한다 (#10 batching 이 들어와도 유효하도록).
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from '../../src/core/hooks.js';
import { FunctionComponent, expand } from '../../src/core/component.js';
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

afterEach(() => {
  document.body.innerHTML = '';
});

// ── 카운터 ────────────────────────────────────────────────────────────────────
const Display = ({ count }) => h('p', { class: count < 0 ? 'neg' : null }, `count: ${count}`);
const Button = ({ label, onPress }) => h('button', { class: label, onClick: onPress }, label);

function CounterApp() {
  const [count, setCount] = useState(0);
  return h(
    'div',
    { id: 'counter' },
    h(Display, { count }),
    h(Button, { label: 'inc', onPress: () => setCount((c) => c + 1) }),
    h(Button, { label: 'dec', onPress: () => setCount((c) => c - 1) }),
    h(Button, { label: 'reset', onPress: () => setCount(0) }),
  );
}

// ── Todo ──────────────────────────────────────────────────────────────────────
const TodoInput = ({ text, onInput, onAdd }) =>
  h('div', { class: 'input' }, h('input', { value: text, onInput }), h('button', { class: 'add', onClick: onAdd }, 'add'));
const TodoItem = ({ todo, onToggle, onRemove }) =>
  h(
    'li',
    { class: todo.done ? 'done' : null },
    h('span', { class: 'text', onClick: onToggle }, todo.text),
    h('button', { class: 'remove', onClick: onRemove }, 'x'),
  );
const TodoList = ({ todos, onToggle, onRemove }) =>
  todos.length === 0
    ? h('p', { class: 'empty' }, 'empty')
    : h(
        'ul',
        null,
        todos.map((t) => h(TodoItem, { key: t.id, todo: t, onToggle: () => onToggle(t.id), onRemove: () => onRemove(t.id) })),
      );
const Footer = ({ todos }) => h('footer', null, `${todos.filter((t) => !t.done).length} left`);

// 상태 → 화면. 루트와 기대값 계산이 같이 쓴다 (자식은 모두 순수 함수).
const TodoView = ({ todos, text, onInput, onAdd, onToggle, onRemove }) =>
  h('div', { id: 'todo' }, h(TodoInput, { text, onInput, onAdd }), h(TodoList, { todos, onToggle, onRemove }), h(Footer, { todos }));

function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');
  const [nextId, setNextId] = useState(() => 1);
  return h(TodoView, {
    todos,
    text,
    onInput: (e) => setText(e.target.value),
    onAdd: () => {
      if (text.trim() === '') return;
      setTodos((prev) => [...prev, { id: nextId, text, done: false }]);
      setNextId((n) => n + 1);
      setText('');
    },
    onToggle: (id) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
    onRemove: (id) => setTodos((prev) => prev.filter((t) => t.id !== id)),
  });
}

const noop = () => {};
function expected(todos, text) {
  return render(expand(h(TodoView, { todos, text, onInput: noop, onAdd: noop, onToggle: noop, onRemove: noop })));
}

describe('setState → 화면 갱신 (작은 앱)', () => {
  it('TC-HOOK-026 카운터: 루트 state + 자식(props·콜백) — inc×3, dec×4, reset, 같은 값 reset 은 DOM 기록 0, 버튼은 같은 객체', async () => {
    const comp = new FunctionComponent(CounterApp);
    const container = makeContainer();
    const root = comp.mount(container);
    const [inc, dec, reset] = root.querySelectorAll('button');
    const p = root.querySelector('p');
    expect(p.textContent).toBe('count: 0');

    for (let i = 0; i < 3; i++) inc.click();
    await flush();
    expect(p.textContent).toBe('count: 3');

    for (let i = 0; i < 4; i++) dec.click();
    await flush();
    expect(p.textContent).toBe('count: -1');
    expect(p.getAttribute('class')).toBe('neg');

    reset.click();
    await flush();
    expect(p.textContent).toBe('count: 0');
    expect(p.hasAttribute('class')).toBe(false);

    const rec = record(container);
    reset.click();
    await flush();
    expect(rec.take()).toHaveLength(0);
    rec.stop();

    expect(comp.dom).toBe(root);
    expect(root.querySelector('p')).toBe(p);
    const buttons = root.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toBe(inc);
    expect(buttons[1]).toBe(dec);
    expect(buttons[2]).toBe(reset);
    expect(root.outerHTML).toBe(
      '<div id="counter"><p>count: 0</p><button class="inc">inc</button><button class="dec">dec</button><button class="reset">reset</button></div>',
    );
  });

  it('TC-HOOK-027 Todo: 입력 → 추가 ×3 → 토글 → 삭제 → 빈 입력 추가(변화 없음), 매 단계 같은 상태의 새 render 와 같고 input 은 같은 객체', async () => {
    const comp = new FunctionComponent(TodoApp);
    const container = makeContainer();
    comp.mount(container);
    const input = container.querySelector('input');
    const addButton = container.querySelector('button.add');
    const matches = (todos, text) => expect(comp.dom.isEqualNode(expected(todos, text))).toBe(true);

    matches([], '');
    expect(container.querySelector('p.empty')).not.toBeNull();

    const type = async (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    };
    const add = async (value) => {
      await type(value);
      addButton.click();
      await flush();
    };

    await type('milk');
    expect(input.value).toBe('milk');
    matches([], 'milk');

    addButton.click();
    await flush();
    expect(input.value).toBe('');
    const milk = { id: 1, text: 'milk', done: false };
    matches([milk], '');
    expect(container.querySelector('footer').textContent).toBe('1 left');

    await add('eggs');
    await add('bread');
    const eggs = { id: 2, text: 'eggs', done: false };
    const bread = { id: 3, text: 'bread', done: false };
    matches([milk, eggs, bread], '');
    expect([...container.querySelectorAll('li span')].map((s) => s.textContent)).toEqual(['milk', 'eggs', 'bread']);

    container.querySelectorAll('li span')[1].click();
    await flush();
    matches([milk, { ...eggs, done: true }, bread], '');
    expect(container.querySelectorAll('li')[1].getAttribute('class')).toBe('done');
    expect(container.querySelector('footer').textContent).toBe('2 left');

    container.querySelectorAll('li button.remove')[0].click();
    await flush();
    matches([{ ...eggs, done: true }, bread], '');
    expect(container.querySelector('footer').textContent).toBe('1 left');

    // 빈 입력으로 추가: 루트 핸들러가 무시하므로 화면 변화 없음
    const rec = record(container);
    addButton.click();
    await flush();
    expect(rec.take()).toHaveLength(0);
    rec.stop();

    // 새로 추가한 항목의 id 는 이어진다 (lazy init 은 첫 렌더에만)
    await add('tea');
    matches([{ ...eggs, done: true }, bread, { id: 4, text: 'tea', done: false }], '');

    // 마지막 하나까지 지우면 빈 목록 표시로 돌아간다
    for (let i = 0; i < 3; i++) {
      container.querySelector('li button.remove').click();
      await flush();
    }
    matches([], '');
    expect(container.querySelector('p.empty')).not.toBeNull();
    expect(container.querySelector('input')).toBe(input);
    expect(container.querySelector('button.add')).toBe(addButton);
  });
});
