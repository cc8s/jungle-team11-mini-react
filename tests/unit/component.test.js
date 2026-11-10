// FunctionComponent 의 API 계약 (이슈 #7). 이 파일이 명세다.
//
// import { FunctionComponent, expand, useHookSlot, getCurrentComponent } from '../../src/core/component.js';
//
// ── new FunctionComponent(fn, props?) ────────────────────────────────────────────
//   - fn: 루트 컴포넌트 함수. fn(props) → VNode | string | number | null | undefined | boolean.
//     함수가 아니면 TypeError.
//   - props: 루트에 넘길 객체. null / undefined 면 {}. fn 은 렌더마다 이 객체를 받는다.
//   - 공개 필드 (생성 직후 값)
//       fn, props
//       hooks      : []    렌더 사이에 유지되는 hook 슬롯 배열
//       hookIndex  : 0     이번 렌더에서 다음에 쓸 슬롯 번호. **매 렌더 시작에 0**
//       vnode      : null  마지막으로 성공한 렌더의 "펼친" VNode 트리 (함수 type 없음). 루트가 없으면 null
//       dom        : null  지금 container 안에 있는 루트 DOM 노드. 루트가 없으면 null
//       container  : null  mount 한 컨테이너
//
// ── comp.mount(container) → Node | null ────────────────────────────────────────
//   - 첫 렌더: fn(props) 실행 → expand → render → container.appendChild (기존 자식은 건드리지 않음).
//   - 반환값 = comp.dom (루트가 null 이면 아무것도 붙이지 않고 null). 재렌더(아래)가 있었으면 그 뒤의 dom.
//   - 네임스페이스: render(vnode, ns) 의 ns 는 container 에서 정한다. container 가 SVG 요소이고
//     foreignObject 가 아니면 SVG, 그 밖에는 HTML. 루트 REPLACE / ADD 도 같은 규칙 (TC-COMP-051).
//   - container 가 Node 가 아니면 TypeError. 이미 mount 된 컴포넌트를 다시 mount 하면 Error.
//   - mount 가 **첫 commit 이 끝나기 전에**(렌더, render, container.appendChild — container 가 Text 노드나
//     document 라 HierarchyRequestError 인 경우 포함) 예외로 끝나면 container 는 그대로이고, 컴포넌트는 mount
//     되지 않은 상태로 남는다 (update 는 Error, 고친 뒤 mount 를 다시 할 수 있다). **hooks 는 [] , hookIndex 는 0,
//     hook 종류·재렌더 표시도 초기화**: 다시 mount 하면 init 을 처음부터 다시 부른다 (TC-COMP-048, TC-EFF-090).
//     첫 commit 뒤의 예외(재렌더 예외, 25회 초과, effect 예외, effect 가 일으킨 재렌더의 예외)는 mount 가 던지지만
//     컴포넌트는 **mount 된 상태로 남는다** (tests/unit/effects.test.js 맨 위 계약).
//
// ── comp.update() → Patch[] ───────────────────────────────────────────────────
//   - fn 을 다시 실행 → expand → diff(comp.vnode, 새 트리) → patch(comp.dom, patches).
//     **이번 호출이 DOM 에 적용한 patch 전부를 적용 순서대로 돌려준다** (변화 없으면 []).
//     재렌더가 일어났으면 각 렌더의 patch 목록을 이어 붙인 것이다.
//   - 바뀐 노드만 건드린다: 나머지 노드는 같은 DOM 객체, MutationObserver 기록 없음.
//   - 루트가 바뀌어도 container 안에서 올바르다
//       REPLACE []: 같은 자리에서 교체 (형제 유지), comp.dom = 새 노드
//       REMOVE  []: container 에서 빠짐, comp.dom = null
//       ADD     []: (이전 루트가 null) 새 노드를 container **맨 뒤**에 붙임, comp.dom = 새 노드
//   - mount 전에 부르면 Error 이고 fn 을 부르지 않는다 (루트가 null 인 컴포넌트도 같다).
//     단 mount 의 첫 렌더 중에 부르는 것은 "렌더 중 재진입" 이다 (아래).
//   - 렌더 중 예외(fn 이나 자식 함수가 던짐, 자식이 hook 호출, hook 개수 불일치 등): 예외를 그대로
//     전파한다. DOM·comp.vnode·comp.dom 은 바뀌지 않고, 다음 update 는 정상 동작한다.
//   - patch 중 예외(예: setAttribute 가 던지는 이름 `'x y'`): 앞쪽 patch 가 이미 반영됐을 수 있으므로
//     container 안의 루트를 **이전 comp.vnode 를 render 한 새 노드로 같은 자리에서 교체**해 DOM 과
//     comp.vnode 를 다시 일치시키고, 같은 예외를 다시 던진다. comp.vnode 는 이전 값 그대로,
//     comp.dom 은 새로 render 한 노드. 다음 update 는 정상 동작한다 (TC-COMP-050).
//
// ── 렌더 중 재진입 (TC-COMP-041~045) ─────────────────────────────────────────────
//   - 루트 fn 실행 중 또는 expand(자식 함수) 중에 **같은 컴포넌트**의 update() 가 불리면 즉시 렌더하지
//     않고 "다시 필요" 만 표시하고 [] 를 돌려준다. mount 의 첫 렌더 중이어도 같다.
//   - 지금 렌더가 commit(patch / 첫 appendChild) 된 뒤, 같은 호출 안에서 동기로 한 번 더 렌더한다.
//     그 렌더 중에 또 불리면 또 반복한다.
//   - 재렌더가 **25번**을 넘으면 Error (메시지에 25). 그때까지 commit 된 렌더는 DOM 에 남고,
//     DOM 과 comp.vnode 는 일치한다. 표시는 지워진다.
//   - 렌더가 예외로 끝나면 표시도 버린다 (재렌더 없음).
//
// ── hook 개수 (TC-COMP-046~047) ───────────────────────────────────────────────────
//   - 첫 렌더가 commit 되면 그 렌더의 hook 호출 수(= hooks.length)가 확정된다.
//   - 이후 렌더에서 확정된 수보다 많이 부르면 넘친 호출에서 즉시 Error, 적게 부르면 루트 fn 이
//     끝났을 때 Error. 둘 다 메시지에 "hook". 렌더 중 예외와 같게 처리하고 hooks 는 늘어나지 않는다.
//
// ── 알려진 한계 (테스트 없음) ─────────────────────────────────────────────────────
//   - VNode 는 불변으로 취급한다. 렌더 사이에 캐시해 둔 VNode 를 직접 바꾸면 diff 가 못 본다.
//   - 사용자가 container 에서 루트 DOM 을 떼어 낸 뒤의 update 는 정하지 않는다.
//   - 루트가 null → 노드로 돌아오면 container 맨 뒤에 붙는다 (형제가 있으면 순서가 바뀔 수 있다).
//   - 다른 컴포넌트의 렌더 중에 이 컴포넌트를 update / mount 하는 경우는 정하지 않는다.
//   - effect 실행 시점·unmount 는 #9 계약(tests/unit/effects.test.js 맨 위 주석)을 따른다: mount / update 한 번이
//     예외 없이 마지막 commit 까지 끝났을 때 돌아오기 직전에 한 번.
//
// ── expand(value) → VNode | null ──────────────────────────────────────────────
//   함수 type 을 모두 실행해 일반 VNode 트리로 바꾼다. 입력을 바꾸지 않는다(얼린 입력 가능).
//   - value 가 null / undefined / boolean → null
//   - string / number → 텍스트 VNode (createText)
//   - 배열 → TypeError (루트는 노드 하나. 배열은 자식 자리에서만 펼친다)
//   - type 이 함수인 VNode → type({ ...vnode.props, children: vnode.children }) 를 호출하고
//     그 결과에 같은 규칙을 다시 적용한다 (연쇄 가능). props 에 key 는 없다.
//     children 은 vnode.children 그대로(h 가 정규화한 배열, 펼치기 전). 자식이 없으면 [].
//   - key: 함수 VNode 의 key 가 null 이 아니면 펼친 결과(요소/텍스트 VNode)의 key 를 그 값으로
//     덮는다. null 이면 결과 자신의 key 를 유지한다. 결과가 배열이면 key 는 적용하지 않는다.
//   - 요소 VNode 의 자식 자리에서 함수 결과가
//       null / undefined / boolean → 그 자리를 버린다 (뒤 형제가 앞으로 당겨짐, h 와 같은 규칙)
//       string / number            → 텍스트 VNode ('' 와 0 도 유지)
//       배열                        → 부모 children 의 그 자리에 펼쳐 넣는다 (중첩 배열도 평탄화,
//                                     안의 null/boolean 은 버림, 안의 함수 VNode 도 펼침)
//   - 함수 결과가 위 어느 것도 아니면(함수, type 없는 객체 등) TypeError.
//   - 함수 type 은 결과에 남지 않으므로, 자식 컴포넌트 함수가 바뀌어도 펼친 결과가 같으면
//     diff 는 [] 다 (자식은 상태 없는 순수 함수라서 문제없다).
//
// ── hook 슬롯 (#8 useState / #9 useEffect·useMemo 가 이 위에 만든다) ───────────
//   getCurrentComponent() → FunctionComponent | null
//     **루트 fn 이 실행되는 동안에만** 그 컴포넌트. 자식 함수 컴포넌트를 펼치는 동안,
//     렌더 밖, 렌더가 예외로 끝난 뒤에는 null.
//   useHookSlot(init) → slot
//     현재 컴포넌트의 hooks[hookIndex] 를 돌려주고 hookIndex 를 1 올린다.
//     그 슬롯이 처음이면 init() 결과를 저장해 돌려준다. init 은 슬롯마다 **한 번만** 부른다
//     (결과가 undefined / null / 0 / false 여도 다시 부르지 않는다).
//     현재 컴포넌트가 없으면(렌더 밖, 자식 컴포넌트 안) Error, 메시지에 "hook" (대소문자 무관).
//     init 이 던지면 그 예외를 그대로 전파하고, 슬롯을 저장하지 않으며 **hookIndex 도 올리지 않는다**
//     (그 호출은 hook 호출로 세지 않는다). 루트가 잡고 계속하면 다음 호출이 같은 번호를 받는다.
//     첫 렌더에서 그렇게 하면 hook 수가 하나 적게 확정되므로, 다음 렌더에서 같은 코드는 hook 개수
//     불일치 Error 가 된다 (조건부 hook 과 같은 취급, TC-COMP-049).
//   이 규칙으로 "Hook 은 루트 컴포넌트에서만" 이 강제된다.
//
// ── 이벤트 ─────────────────────────────────────────────────────────────────────
//   렌더마다 새 핸들러 함수가 만들어져도 리스너는 쌓이지 않는다: 클릭 1번 = 최신 핸들러 1번.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { FunctionComponent, expand, useHookSlot, getCurrentComponent } from '../../src/core/component.js';
import { diff } from '../../src/vdom/diff.js';
import { render } from '../../src/vdom/render.js';
import { h, createText } from '../../src/vdom/vnode.js';

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

function allNodes(root) {
  const out = [root];
  for (const child of root.childNodes) out.push(...allNodes(child));
  return out;
}

function deepFreeze(v) {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

// VNode 트리에 함수 type 이 남아 있는가
function hasFunctionType(vnode) {
  if (vnode == null) return false;
  if (typeof vnode.type === 'function') return true;
  return vnode.children.some(hasFunctionType);
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
describe('생성과 mount', () => {
  it('TC-COMP-001 생성 직후 필드: hooks [], hookIndex 0, vnode·dom·container null, props 기본값 {}', () => {
    const fn = () => h('p', null, 'x');
    const comp = new FunctionComponent(fn);
    expect(comp.fn).toBe(fn);
    expect(comp.props).toEqual({});
    expect(comp.hooks).toEqual([]);
    expect(comp.hookIndex).toBe(0);
    expect(comp.vnode).toBeNull();
    expect(comp.dom).toBeNull();
    expect(comp.container).toBeNull();

    expect(new FunctionComponent(fn, null).props).toEqual({});
    expect(new FunctionComponent(fn, { a: 1 }).props).toEqual({ a: 1 });
  });

  it('TC-COMP-002 fn 이 함수가 아니면 TypeError', () => {
    for (const bad of [undefined, null, 'div', 1, {}, h('p', null)]) {
      expect(() => new FunctionComponent(bad)).toThrow(TypeError);
    }
  });

  it('TC-COMP-003 mount: fn(props) 1회 실행, 펼친 트리를 render 해 container 에 붙이고 루트를 돌려줌', () => {
    const fn = vi.fn((props) => h('div', { id: 'app' }, h('p', null, props.msg)));
    const comp = new FunctionComponent(fn, { msg: 'hi' });
    const container = makeContainer();

    const dom = comp.mount(container);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual({ msg: 'hi' });
    expect(container.innerHTML).toBe('<div id="app"><p>hi</p></div>');
    expect(dom).toBe(container.firstChild);
    expect(comp.dom).toBe(dom);
    expect(comp.container).toBe(container);
    expect(comp.vnode).toEqual(h('div', { id: 'app' }, h('p', null, 'hi')));
  });

  it('TC-COMP-004 mount 는 container 의 기존 자식 뒤에 붙이고 기존 자식은 건드리지 않는다', () => {
    const container = makeContainer();
    const existing = document.createElement('span');
    existing.textContent = 'before';
    container.appendChild(existing);

    const comp = new FunctionComponent(() => h('p', null, 'x'));
    comp.mount(container);

    expect(container.childNodes).toHaveLength(2);
    expect(container.childNodes[0]).toBe(existing);
    expect(container.childNodes[1]).toBe(comp.dom);
    expect(existing.textContent).toBe('before');
  });

  it('TC-COMP-005 잘못된 호출: container 가 Node 아님 → TypeError, 두 번 mount → Error, mount 전 update → Error', () => {
    const fn = () => h('p', null, 'x');
    for (const bad of [null, undefined, 'div', {}]) {
      expect(() => new FunctionComponent(fn).mount(bad)).toThrow(TypeError);
    }

    const comp = new FunctionComponent(fn);
    expect(() => comp.update()).toThrow();

    const container = makeContainer();
    comp.mount(container);
    expect(() => comp.mount(container)).toThrow();
    expect(container.childNodes).toHaveLength(1);
  });

  it('TC-COMP-006 루트가 null / undefined / false 면 아무것도 붙이지 않고, 문자열·숫자면 텍스트 노드', () => {
    for (const empty of [null, undefined, false, true]) {
      const container = makeContainer();
      const comp = new FunctionComponent(() => empty);
      expect(comp.mount(container)).toBeNull();
      expect(comp.dom).toBeNull();
      expect(comp.vnode).toBeNull();
      expect(container.childNodes).toHaveLength(0);
    }

    for (const [value, text] of [['hi', 'hi'], ['', ''], [0, '0'], [42, '42']]) {
      const container = makeContainer();
      const comp = new FunctionComponent(() => value);
      const dom = comp.mount(container);
      expect(dom.nodeType).toBe(Node.TEXT_NODE);
      expect(dom.data).toBe(text);
      expect(container.firstChild).toBe(dom);
      expect(comp.vnode).toEqual(createText(text));
    }
  });

  it('TC-COMP-007 루트가 배열이면 TypeError, container 그대로, mount 되지 않은 상태', () => {
    const container = makeContainer();
    const comp = new FunctionComponent(() => [h('p', null, 'a'), h('p', null, 'b')]);
    expect(() => comp.mount(container)).toThrow(TypeError);
    expect(container.childNodes).toHaveLength(0);
    expect(comp.dom).toBeNull();
    expect(() => comp.update()).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('expand: 함수 컴포넌트 펼치기', () => {
  it('TC-COMP-008 자식 함수 컴포넌트를 type({...props, children}) 결과로 바꾼다', () => {
    const Child = vi.fn(({ label }) => h('span', { class: 'c' }, label));
    const comp = new FunctionComponent(() => h('div', null, h(Child, { label: 'a' }), h('p', null, 'b')));
    const container = makeContainer();
    comp.mount(container);

    expect(Child).toHaveBeenCalledTimes(1);
    expect(Child.mock.calls[0][0]).toEqual({ label: 'a', children: [] });
    expect(hasFunctionType(comp.vnode)).toBe(false);
    expect(comp.vnode).toEqual(h('div', null, h('span', { class: 'c' }, 'a'), h('p', null, 'b')));
    expect(container.innerHTML).toBe('<div><span class="c">a</span><p>b</p></div>');
  });

  it('TC-COMP-009 자식이 또 함수 VNode 를 돌려주면 연쇄로 펼친다 (3단계, 루트 자리 포함)', () => {
    const C = ({ v }) => h('b', null, v);
    const B = ({ v }) => h(C, { v: v + '!' });
    const A = ({ v }) => h(B, { v });
    expect(expand(h(A, { v: 'x' }))).toEqual(h('b', null, 'x!'));

    const comp = new FunctionComponent(() => h(A, { v: 'y' }));
    const container = makeContainer();
    comp.mount(container);
    expect(container.innerHTML).toBe('<b>y!</b>');
    expect(hasFunctionType(comp.vnode)).toBe(false);
  });

  it('TC-COMP-010 children 은 펼치기 전 VNode 배열로 넘어가고, 자식이 배치한 뒤 펼쳐진다', () => {
    const Inner = () => h('i', null, 'in');
    let received;
    const Box = (props) => {
      received = props;
      return h('section', null, h('h2', null, 'box'), props.children);
    };
    const tree = h(Box, null, 'text', h(Inner));

    expect(expand(tree)).toEqual(h('section', null, h('h2', null, 'box'), 'text', h('i', null, 'in')));
    expect(received.children).toEqual([createText('text'), h(Inner)]);
    expect(received.children[1].type).toBe(Inner);
  });

  it('TC-COMP-011 자식 함수 결과가 null/undefined/true/false 면 그 자리를 버리고, 문자열·숫자(0, \'\' 포함)는 텍스트', () => {
    const Ret = ({ v }) => v;
    const tree = h(
      'ul',
      null,
      h('li', null, 'first'),
      h(Ret, { v: null }),
      h(Ret, { v: undefined }),
      h(Ret, { v: true }),
      h(Ret, { v: false }),
      h(Ret, { v: 'str' }),
      h(Ret, { v: 0 }),
      h(Ret, { v: '' }),
      h('li', null, 'last'),
    );
    expect(expand(tree)).toEqual(
      h('ul', null, h('li', null, 'first'), createText('str'), createText('0'), createText(''), h('li', null, 'last')),
    );

    const container = makeContainer();
    new FunctionComponent(() => tree).mount(container);
    expect(container.firstChild.childNodes).toHaveLength(5);
    expect(container.firstChild.childNodes[1].data).toBe('str');
    expect(container.firstChild.childNodes[2].data).toBe('0');
    expect(container.firstChild.childNodes[3].data).toBe('');
  });

  it('TC-COMP-012 자식 함수가 배열을 돌려주면 부모 children 의 그 자리에 펼친다 (중첩, null, 함수 VNode 포함)', () => {
    const Leaf = ({ t }) => h('em', null, t);
    const List = () => [h('li', null, '1'), [h('li', null, '2'), null, false], 'x', h(Leaf, { t: '3' })];
    const tree = h('ul', null, h('li', null, '0'), h(List), h('li', null, 'end'));

    expect(expand(tree)).toEqual(
      h('ul', null, h('li', null, '0'), h('li', null, '1'), h('li', null, '2'), 'x', h('em', null, '3'), h('li', null, 'end')),
    );

    const Empty = () => [];
    expect(expand(h('ul', null, h('li', null, 'a'), h(Empty), h('li', null, 'b')))).toEqual(
      h('ul', null, h('li', null, 'a'), h('li', null, 'b')),
    );
  });

  it('TC-COMP-013 key: props 로 넘기지 않고, 함수 VNode 의 key 가 결과 key 를 덮으며, 없으면 결과 key 유지', () => {
    let received;
    const Item = (props) => {
      received = props;
      return h('li', { key: 'inner' }, props.t);
    };

    expect(expand(h(Item, { key: 'outer', t: 'a' }))).toEqual(h('li', { key: 'outer' }, 'a'));
    expect(received).toEqual({ t: 'a', children: [] });
    expect('key' in received).toBe(false);

    expect(expand(h(Item, { t: 'b' }))).toEqual(h('li', { key: 'inner' }, 'b'));

    const Plain = ({ t }) => h('li', null, t);
    const out = expand(h('ul', null, h(Plain, { key: 'k1', t: 'x' }), h(Plain, { key: 'k2', t: 'y' })));
    expect(out.children.map((c) => c.key)).toEqual(['k1', 'k2']);
  });

  it('TC-COMP-014 함수 결과가 함수 / type 없는 객체면 TypeError (자식 자리, 루트 자리)', () => {
    const RetFn = () => () => h('p');
    const RetObj = () => ({ foo: 1 });
    expect(() => expand(h('div', null, h(RetFn)))).toThrow(TypeError);
    expect(() => expand(h('div', null, h(RetObj)))).toThrow(TypeError);
    expect(() => expand(h(RetFn))).toThrow(TypeError);

    const container = makeContainer();
    expect(() => new FunctionComponent(() => h('div', null, h(RetFn))).mount(container)).toThrow(TypeError);
    expect(container.childNodes).toHaveLength(0);
  });

  it('TC-COMP-015 expand 의 경계 입력과 불변성: null/boolean → null, 문자열 → 텍스트, 배열 → TypeError, 얼린 입력', () => {
    expect(expand(null)).toBeNull();
    expect(expand(undefined)).toBeNull();
    expect(expand(false)).toBeNull();
    expect(expand(true)).toBeNull();
    expect(expand('a')).toEqual(createText('a'));
    expect(expand(7)).toEqual(createText('7'));
    expect(() => expand([h('p')])).toThrow(TypeError);

    const ArrRoot = () => [h('p')];
    expect(() => expand(h(ArrRoot))).toThrow(TypeError);
    const NullRoot = () => null;
    expect(expand(h(NullRoot))).toBeNull();

    const Child = ({ t, children }) => h('span', null, t, children);
    const build = () => h('div', { id: 'r' }, h(Child, { t: 'a', key: 'k' }, h('b', null, 'x')), 'tail');
    const frozen = deepFreeze(build());
    let out;
    expect(() => {
      out = expand(frozen);
    }).not.toThrow();
    expect(frozen).toEqual(build());
    expect(out).toEqual(h('div', { id: 'r' }, h('span', { key: 'k' }, 'a', h('b', null, 'x')), 'tail'));
    expect(hasFunctionType(out)).toBe(false);
  });

  it('TC-COMP-016 자식 함수가 다른 함수로 바뀌어도 펼친 결과가 같으면 update 는 [] 이고 DOM 기록 0', () => {
    const A = () => h('span', null, 'same');
    const B = () => h('span', null, 'same');
    let useA = true;
    const comp = new FunctionComponent(() => h('div', null, useA ? h(A) : h(B)));
    const container = makeContainer();
    comp.mount(container);
    const before = allNodes(container.firstChild);
    const mo = observe(container);

    useA = false;
    expect(comp.update()).toEqual([]);
    expect(mo.takeRecords()).toHaveLength(0);
    expect(allNodes(container.firstChild)).toHaveLength(before.length);
    allNodes(container.firstChild).forEach((n, i) => expect(n).toBe(before[i]));
    mo.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('update: 다시 렌더 → diff → patch', () => {
  it('TC-COMP-017 바뀐 텍스트 하나만 건드린다: characterData 1건, 나머지는 같은 객체, 반환값은 적용한 patch 목록', () => {
    const Header = () => h('h1', null, 'Title');
    const Counter = ({ n }) => h('p', null, `count: ${n}`);
    let n = 0;
    const comp = new FunctionComponent(() =>
      h('div', { id: 'app' }, h(Header), h(Counter, { n }), h('ul', null, h('li', null, 'a'), h('li', null, 'b'))),
    );
    const container = makeContainer();
    const root = comp.mount(container);
    const before = allNodes(root);
    const countText = root.childNodes[1].firstChild;
    const mo = observe(container);

    n = 1;
    const patches = comp.update();

    expect(patches).toEqual([{ type: 'TEXT', path: [1, 0], text: 'count: 1' }]);
    const records = mo.takeRecords();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(records[0].target).toBe(countText);
    expect(comp.dom).toBe(root);
    const after = allNodes(root);
    expect(after).toHaveLength(before.length);
    after.forEach((node, i) => expect(node).toBe(before[i]));
    expect(root.outerHTML).toBe('<div id="app"><h1>Title</h1><p>count: 1</p><ul><li>a</li><li>b</li></ul></div>');
    mo.disconnect();
  });

  it('TC-COMP-018 변화 없는 update: [] 반환, DOM 기록 0, fn 은 다시 실행됨', () => {
    const fn = vi.fn(() => h('div', null, h('p', { class: 'x' }, 'a')));
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    const mo = observe(container);

    expect(comp.update()).toEqual([]);
    expect(comp.update()).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(mo.takeRecords()).toHaveLength(0);
    mo.disconnect();
  });

  it('TC-COMP-019 루트 type 변경(REPLACE []): container 의 같은 자리에서 교체, 형제 유지, comp.dom 갱신', () => {
    const container = makeContainer();
    const before = document.createElement('span');
    container.appendChild(before);
    let tag = 'p';
    const comp = new FunctionComponent(() => h(tag, { id: 'r' }, 'x'));
    const oldRoot = comp.mount(container);
    const after = document.createElement('span');
    container.appendChild(after);

    tag = 'section';
    const patches = comp.update();

    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('REPLACE');
    expect(patches[0].path).toEqual([]);
    expect(container.childNodes).toHaveLength(3);
    expect(container.childNodes[0]).toBe(before);
    expect(container.childNodes[2]).toBe(after);
    expect(container.childNodes[1]).toBe(comp.dom);
    expect(comp.dom).not.toBe(oldRoot);
    expect(comp.dom.outerHTML).toBe('<section id="r">x</section>');
    expect(oldRoot.parentNode).toBeNull();
    expect(comp.vnode).toEqual(h('section', { id: 'r' }, 'x'));
  });

  it('TC-COMP-020 루트 key 변경(요소 key, 함수 VNode key) → 교체 / 텍스트 루트 변경 → 같은 Text 노드 / 텍스트 ↔ 요소', () => {
    // 요소 key
    let k = 'a';
    const c1 = new FunctionComponent(() => h('p', { key: k }, 'x'));
    const box1 = makeContainer();
    const r1 = c1.mount(box1);
    k = 'b';
    c1.update();
    expect(c1.dom).not.toBe(r1);
    expect(box1.firstChild).toBe(c1.dom);
    expect(box1.childNodes).toHaveLength(1);

    // 함수 VNode 의 key 가 결과에 붙으므로 루트 교체가 일어난다
    const Child = () => h('p', null, 'x');
    let ck = 'a';
    const c2 = new FunctionComponent(() => h(Child, { key: ck }));
    const box2 = makeContainer();
    const r2 = c2.mount(box2);
    ck = 'b';
    c2.update();
    expect(c2.dom).not.toBe(r2);
    expect(box2.firstChild).toBe(c2.dom);

    // 텍스트 루트
    let v = 'a';
    const c3 = new FunctionComponent(() => v);
    const box3 = makeContainer();
    const t = c3.mount(box3);
    v = 'b';
    expect(c3.update()).toEqual([{ type: 'TEXT', path: [], text: 'b' }]);
    expect(c3.dom).toBe(t);
    expect(t.data).toBe('b');

    v = h('i', null, 'el');
    c3.update();
    expect(box3.innerHTML).toBe('<i>el</i>');
    expect(box3.firstChild).toBe(c3.dom);
    v = 'back';
    c3.update();
    expect(box3.childNodes).toHaveLength(1);
    expect(box3.firstChild.nodeType).toBe(Node.TEXT_NODE);
    expect(box3.firstChild.data).toBe('back');
    expect(c3.dom).toBe(box3.firstChild);
  });

  it('TC-COMP-021 루트 있음 ↔ 없음: REMOVE 면 container 에서 빠지고 dom null, ADD 면 맨 뒤에 붙고 dom 갱신, null → null 은 []', () => {
    let show = true;
    const comp = new FunctionComponent(() => (show ? h('p', null, 'x') : null));
    const container = makeContainer();
    const first = comp.mount(container);

    show = false;
    expect(comp.update()).toEqual([{ type: 'REMOVE', path: [] }]);
    expect(container.childNodes).toHaveLength(0);
    expect(first.parentNode).toBeNull();
    expect(comp.dom).toBeNull();
    expect(comp.vnode).toBeNull();

    expect(comp.update()).toEqual([]);
    expect(container.childNodes).toHaveLength(0);

    show = true;
    const patches = comp.update();
    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('ADD');
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(comp.dom);
    expect(container.innerHTML).toBe('<p>x</p>');

    // 처음부터 null 로 mount 한 경우
    let on = false;
    const late = new FunctionComponent(() => (on ? h('b', null, 'late') : null));
    const box = makeContainer();
    late.mount(box);
    on = true;
    late.update();
    expect(box.innerHTML).toBe('<b>late</b>');
    expect(late.dom).toBe(box.firstChild);
  });

  it('TC-COMP-022 update 후 comp.vnode 는 새로 펼친 트리이고, 다음 update 의 diff 기준이 된다', () => {
    const Item = ({ t }) => h('li', null, t);
    let items = ['a'];
    const comp = new FunctionComponent(() => h('ul', null, items.map((t) => h(Item, { t }))));
    const container = makeContainer();
    comp.mount(container);

    items = ['a', 'b'];
    expect(comp.update()).toEqual([{ type: 'ADD', path: [1], node: h('li', null, 'b') }]);
    expect(comp.vnode).toEqual(h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
    expect(hasFunctionType(comp.vnode)).toBe(false);

    items = ['a', 'b', 'c'];
    expect(comp.update()).toEqual([{ type: 'ADD', path: [2], node: h('li', null, 'c') }]);
    expect(container.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');

    // 반환한 patch 는 이전 트리와 새 트리의 diff 와 같다
    const prev = comp.vnode;
    items = ['x'];
    const patches = comp.update();
    expect(patches).toEqual(diff(prev, comp.vnode));
    expect(container.innerHTML).toBe('<ul><li>x</li></ul>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('이벤트 핸들러', () => {
  it('TC-COMP-023 렌더마다 새 핸들러여도 클릭 1번에 최신 핸들러만 1번 호출, on* 속성은 없음', () => {
    let n = 0;
    const calls = [];
    const comp = new FunctionComponent(() => {
      const v = n;
      return h('button', { onClick: () => calls.push(v) }, String(v));
    });
    const container = makeContainer();
    const button = comp.mount(container);

    for (n = 1; n <= 3; n++) comp.update();

    expect(comp.dom).toBe(button);
    button.click();
    expect(calls).toEqual([3]);
    expect(button.attributes).toHaveLength(0);
  });

  it('TC-COMP-024 자식 컴포넌트 안의 핸들러도 쌓이지 않는다', () => {
    const Btn = ({ onPress, label }) => h('button', { onClick: onPress }, label);
    let n = 0;
    const calls = [];
    const comp = new FunctionComponent(() => {
      const v = n;
      return h('div', null, h(Btn, { label: `b${v}`, onPress: () => calls.push(v) }));
    });
    const container = makeContainer();
    comp.mount(container);
    const button = container.querySelector('button');

    for (n = 1; n <= 4; n++) comp.update();

    expect(container.querySelector('button')).toBe(button);
    button.click();
    expect(calls).toEqual([4]);
    expect(button.textContent).toBe('b4');
  });

  it('TC-COMP-025 같은 핸들러 함수를 계속 넘기면 속성 기록 없이 텍스트만 바뀌고 클릭은 1번', () => {
    const handler = vi.fn();
    let n = 0;
    const comp = new FunctionComponent(() => h('button', { onClick: handler }, String(n)));
    const container = makeContainer();
    const button = comp.mount(container);
    const mo = observe(container);

    n = 1;
    comp.update();
    n = 2;
    comp.update();

    const records = mo.takeRecords();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.type === 'characterData')).toBe(true);
    expect(records.every((r) => r.target === button.firstChild)).toBe(true);
    expect(button.textContent).toBe('2');
    expect(comp.dom).toBe(button);
    button.click();
    expect(handler).toHaveBeenCalledTimes(1);
    mo.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('hook 슬롯과 현재 컴포넌트', () => {
  it('TC-COMP-026 getCurrentComponent: 렌더 밖 null, 루트 fn 안에서는 그 컴포넌트 (mount·update 모두), 끝나면 다시 null', () => {
    const seen = [];
    const comp = new FunctionComponent(() => {
      seen.push(getCurrentComponent());
      return h('p', null, 'x');
    });
    expect(getCurrentComponent()).toBeNull();
    comp.mount(makeContainer());
    expect(getCurrentComponent()).toBeNull();
    comp.update();
    expect(getCurrentComponent()).toBeNull();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(comp);
    expect(seen[1]).toBe(comp);
  });

  it('TC-COMP-027 hookIndex 는 매 렌더 시작에 0, useHookSlot 마다 1씩 오름', () => {
    const seen = [];
    const comp = new FunctionComponent(() => {
      const c = getCurrentComponent();
      seen.push(c.hookIndex);
      useHookSlot(() => ({}));
      seen.push(c.hookIndex);
      useHookSlot(() => ({}));
      seen.push(c.hookIndex);
      return h('p', null, 'x');
    });
    comp.mount(makeContainer());
    comp.update();
    comp.update();
    expect(seen).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    expect(comp.hooks).toHaveLength(2);
  });

  it('TC-COMP-028 useHookSlot: 첫 렌더에 init 결과를 저장, 이후 렌더는 같은 순서로 같은 슬롯 객체, init 은 슬롯마다 1번', () => {
    const initA = vi.fn(() => ({ name: 'a' }));
    const initB = vi.fn(() => ({ name: 'b' }));
    const renders = [];
    const comp = new FunctionComponent(() => {
      const a = useHookSlot(initA);
      const b = useHookSlot(initB);
      renders.push([a, b]);
      return h('p', null, 'x');
    });
    comp.mount(makeContainer());
    comp.update();
    comp.update();

    expect(initA).toHaveBeenCalledTimes(1);
    expect(initB).toHaveBeenCalledTimes(1);
    const [a0, b0] = renders[0];
    expect(a0).toEqual({ name: 'a' });
    expect(b0).toEqual({ name: 'b' });
    expect(a0).not.toBe(b0);
    for (const [a, b] of renders) {
      expect(a).toBe(a0);
      expect(b).toBe(b0);
    }
    expect(comp.hooks).toHaveLength(2);
    expect(comp.hooks[0]).toBe(a0);
    expect(comp.hooks[1]).toBe(b0);
  });

  it('TC-COMP-029 init 결과가 undefined / null / 0 / false / \'\' 여도 init 을 다시 부르지 않고 그 값을 돌려준다', () => {
    for (const value of [undefined, null, 0, false, '']) {
      const init = vi.fn(() => value);
      const got = [];
      const comp = new FunctionComponent(() => {
        got.push(useHookSlot(init));
        return h('p', null, 'x');
      });
      comp.mount(makeContainer());
      comp.update();
      comp.update();
      expect(init).toHaveBeenCalledTimes(1);
      expect(got).toEqual([value, value, value]);
      expect(comp.hooks).toHaveLength(1);
    }
  });

  it('TC-COMP-030 렌더 밖에서 useHookSlot → "hook" 이 들어간 Error (mount 전, mount 후 모두)', () => {
    expect(() => useHookSlot(() => ({}))).toThrow(/hook/i);
    const comp = new FunctionComponent(() => h('p', null, 'x'));
    comp.mount(makeContainer());
    expect(() => useHookSlot(() => ({}))).toThrow(/hook/i);
    expect(comp.hooks).toHaveLength(0);
  });

  it('TC-COMP-031 자식 함수 컴포넌트 안에서는 현재 컴포넌트가 null 이고, hook 을 부르면 mount 가 "hook" Error', () => {
    // hook 을 안 쓰는 자식: 현재 컴포넌트가 null 인지만 확인
    let inChild = 'unset';
    const Pure = () => {
      inChild = getCurrentComponent();
      return h('span', null, 'ok');
    };
    const ok = new FunctionComponent(() => h('div', null, h(Pure)));
    ok.mount(makeContainer());
    expect(inChild).toBeNull();

    // 자식 자리에서 hook
    const Bad = () => {
      useHookSlot(() => ({}));
      return h('span', null, 'bad');
    };
    const box = makeContainer();
    const comp = new FunctionComponent(() => h('div', null, h(Bad)));
    expect(() => comp.mount(box)).toThrow(/hook/i);
    expect(box.childNodes).toHaveLength(0);
    expect(getCurrentComponent()).toBeNull();
    expect(comp.hooks).toHaveLength(0);

    // 루트 fn 이 함수 VNode 를 돌려줘도 그 함수는 자식이다
    const box2 = makeContainer();
    const comp2 = new FunctionComponent(() => h(Bad));
    expect(() => comp2.mount(box2)).toThrow(/hook/i);
    expect(box2.childNodes).toHaveLength(0);
    expect(comp2.hooks).toHaveLength(0);
  });

  it('TC-COMP-032 update 에서 처음 나타난 자식이 hook 을 부르거나 던지면: 예외 전파, DOM·vnode·dom 그대로, 다음 update 정상', () => {
    const Bad = () => {
      useHookSlot(() => ({}));
      return h('span', null, 'bad');
    };
    const Throws = () => {
      throw new Error('child boom');
    };
    let mode = 'ok';
    let text = 'a';
    const comp = new FunctionComponent(() =>
      h('div', null, h('p', null, text), mode === 'hook' ? h(Bad) : null, mode === 'throw' ? h(Throws) : null),
    );
    const container = makeContainer();
    const root = comp.mount(container);
    const vnodeBefore = comp.vnode;
    const htmlBefore = container.innerHTML;
    const mo = observe(container);

    text = 'b';
    mode = 'hook';
    expect(() => comp.update()).toThrow(/hook/i);
    mode = 'throw';
    expect(() => comp.update()).toThrow('child boom');

    expect(mo.takeRecords()).toHaveLength(0);
    expect(container.innerHTML).toBe(htmlBefore);
    expect(comp.vnode).toBe(vnodeBefore);
    expect(comp.dom).toBe(root);
    expect(getCurrentComponent()).toBeNull();

    mode = 'ok';
    expect(comp.update()).toEqual([{ type: 'TEXT', path: [0, 0], text: 'b' }]);
    expect(container.innerHTML).toBe('<div><p>b</p></div>');
    mo.disconnect();
  });

  it('TC-COMP-033 루트 fn 이 mount 중 던지면: 같은 예외 전파, 현재 컴포넌트 null, container 그대로, 다른 컴포넌트에 새지 않음, 다시 mount 가능', () => {
    let fail = true;
    const a = new FunctionComponent(() => {
      useHookSlot(() => ({ owner: 'a' }));
      if (fail) throw new Error('boom');
      return h('p', null, 'a');
    });
    const box = makeContainer();
    expect(() => a.mount(box)).toThrow('boom');
    expect(getCurrentComponent()).toBeNull();
    expect(box.childNodes).toHaveLength(0);
    expect(a.dom).toBeNull();
    expect(() => a.update()).toThrow();
    expect(() => useHookSlot(() => ({}))).toThrow(/hook/i);

    const aHooks = a.hooks.length;
    const b = new FunctionComponent(() => {
      useHookSlot(() => ({ owner: 'b' }));
      return h('p', null, 'b');
    });
    b.mount(makeContainer());
    expect(b.hooks).toEqual([{ owner: 'b' }]);
    expect(a.hooks).toHaveLength(aHooks);

    fail = false;
    a.mount(box);
    expect(box.innerHTML).toBe('<p>a</p>');
    expect(a.dom).toBe(box.firstChild);
  });

  it('TC-COMP-034 루트 fn 이 update 중 던지면: DOM·vnode 그대로, 현재 컴포넌트 null, 다음 update 는 같은 슬롯으로 정상', () => {
    let fail = false;
    let text = 'a';
    let made = 0;
    const slots = [];
    const comp = new FunctionComponent(() => {
      slots.push(useHookSlot(() => ({ id: ++made })));
      if (fail) throw new Error('boom');
      return h('p', null, text);
    });
    const container = makeContainer();
    const root = comp.mount(container);
    const vnodeBefore = comp.vnode;
    const mo = observe(container);

    fail = true;
    text = 'b';
    expect(() => comp.update()).toThrow('boom');
    expect(mo.takeRecords()).toHaveLength(0);
    expect(comp.vnode).toBe(vnodeBefore);
    expect(comp.dom).toBe(root);
    expect(getCurrentComponent()).toBeNull();

    fail = false;
    comp.update();
    expect(container.innerHTML).toBe('<p>b</p>');
    expect(made).toBe(1);
    expect(slots).toHaveLength(3);
    slots.forEach((s) => expect(s).toBe(slots[0]));
    expect(comp.hooks).toHaveLength(1);
    mo.disconnect();
  });

  it('TC-COMP-035 두 컴포넌트를 번갈아 렌더해도 hook 슬롯과 현재 컴포넌트가 섞이지 않는다', () => {
    const seenA = [];
    const seenB = [];
    const a = new FunctionComponent(() => {
      seenA.push(getCurrentComponent());
      useHookSlot(() => ({ owner: 'a' }));
      return h('p', null, 'a');
    });
    const b = new FunctionComponent(() => {
      seenB.push(getCurrentComponent());
      useHookSlot(() => ({ owner: 'b' }));
      useHookSlot(() => ({ owner: 'b2' }));
      return h('p', null, 'b');
    });
    a.mount(makeContainer());
    b.mount(makeContainer());
    a.update();
    b.update();
    a.update();

    expect(seenA).toHaveLength(3);
    seenA.forEach((c) => expect(c).toBe(a));
    expect(seenB).toHaveLength(2);
    seenB.forEach((c) => expect(c).toBe(b));
    expect(a.hooks).toEqual([{ owner: 'a' }]);
    expect(b.hooks).toEqual([{ owner: 'b' }, { owner: 'b2' }]);
  });

  it('TC-COMP-036 루트 fn 렌더 결과는 render 로 직접 만든 것과 같다 (펼친 트리 = 일반 VNode)', () => {
    const Item = ({ t }) => h('li', { class: 'i' }, t);
    const comp = new FunctionComponent(() => h('ul', null, ['a', 'b'].map((t) => h(Item, { t, key: t }))));
    const container = makeContainer();
    comp.mount(container);
    expect(container.firstChild.isEqualNode(render(comp.vnode))).toBe(true);
    expect(comp.vnode).toEqual(h('ul', null, h('li', { class: 'i', key: 'a' }, 'a'), h('li', { class: 'i', key: 'b' }, 'b')));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #7 리뷰에서 재현된 결함 (TC-COMP-040~051)
const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';

describe('리뷰 보강: mount 전 update', () => {
  it('TC-COMP-040 mount 전 update 는 Error 이고 fn 을 부르지 않는다 (루트가 요소 / null 모두)', () => {
    for (const result of [h('p', null, 'x'), null]) {
      const fn = vi.fn(() => result);
      const comp = new FunctionComponent(fn);
      expect(() => comp.update()).toThrow();
      expect(fn).not.toHaveBeenCalled();
      expect(comp.vnode).toBeNull();
      expect(comp.dom).toBeNull();
    }
  });
});

describe('리뷰 보강: 렌더 중 재진입', () => {
  it('TC-COMP-041 루트 fn 안에서 update() → 안쪽 호출은 [] , commit 뒤 동기로 한 번 더 렌더, 바깥 반환값은 두 렌더의 patch 를 이어 붙인 것', () => {
    let renders = 0;
    let reenter = false;
    const inner = [];
    let comp;
    const fn = vi.fn(() => {
      renders += 1;
      if (reenter) {
        reenter = false;
        inner.push(comp.update());
      }
      return h('div', null, h('h1', null, 'T'), h('p', null, String(renders)));
    });
    comp = new FunctionComponent(fn);
    const container = makeContainer();
    const root = comp.mount(container);
    const text = root.childNodes[1].firstChild;
    const mo = observe(container);

    reenter = true;
    const patches = comp.update();

    expect(fn).toHaveBeenCalledTimes(3);
    expect(inner).toEqual([[]]);
    expect(patches).toEqual([
      { type: 'TEXT', path: [1, 0], text: '2' },
      { type: 'TEXT', path: [1, 0], text: '3' },
    ]);
    const records = mo.takeRecords();
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.type === 'characterData' && r.target === text)).toBe(true);
    expect(root.outerHTML).toBe('<div><h1>T</h1><p>3</p></div>');
    expect(comp.vnode).toEqual(h('div', null, h('h1', null, 'T'), h('p', null, '3')));
    expect(getCurrentComponent()).toBeNull();
    mo.disconnect();
  });

  it('TC-COMP-042 mount 의 첫 렌더 중 update() → mount 는 성공하고 이어서 다시 렌더, hooks 2개, init 각 1번, 같은 슬롯', () => {
    let once = true;
    let renders = 0;
    const initA = vi.fn(() => ({ n: 'a' }));
    const initB = vi.fn(() => ({ n: 'b' }));
    const seen = [];
    let comp;
    const fn = vi.fn(() => {
      renders += 1;
      const a = useHookSlot(initA);
      if (once) {
        once = false;
        comp.update();
      }
      const b = useHookSlot(initB);
      seen.push([a, b]);
      return h('p', null, `r${renders}`);
    });
    comp = new FunctionComponent(fn);
    const container = makeContainer();

    const dom = comp.mount(container);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(comp.hooks).toHaveLength(2);
    expect(initA).toHaveBeenCalledTimes(1);
    expect(initB).toHaveBeenCalledTimes(1);
    expect(seen[1][0]).toBe(seen[0][0]);
    expect(seen[1][1]).toBe(seen[0][1]);
    expect(container.innerHTML).toBe('<p>r2</p>');
    expect(dom).toBe(comp.dom);
    expect(container.firstChild).toBe(comp.dom);

    // 이후 update 도 정상
    comp.update();
    expect(container.innerHTML).toBe('<p>r3</p>');
    expect(comp.hooks).toHaveLength(2);
  });

  it('TC-COMP-043 자식 함수(expand 중)가 루트의 update() 를 불러도 commit 뒤 한 번 더 렌더한다', () => {
    let once = false;
    let renders = 0;
    let comp;
    const Child = ({ n }) => {
      if (once) {
        once = false;
        comp.update();
      }
      return h('span', null, String(n));
    };
    const fn = vi.fn(() => {
      renders += 1;
      return h('div', null, h(Child, { n: renders }));
    });
    comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);

    once = true;
    const patches = comp.update();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(patches).toEqual([
      { type: 'TEXT', path: [0, 0], text: '2' },
      { type: 'TEXT', path: [0, 0], text: '3' },
    ]);
    expect(container.innerHTML).toBe('<div><span>3</span></div>');
  });

  it('TC-COMP-044 update() 를 부른 렌더가 예외로 끝나면 재렌더 예약도 버린다', () => {
    let mode = 'ok';
    let comp;
    const fn = vi.fn(() => {
      if (mode === 'reenter-then-throw') {
        comp.update();
        throw new Error('boom');
      }
      return h('p', null, mode);
    });
    comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);

    mode = 'reenter-then-throw';
    expect(() => comp.update()).toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toBe('<p>ok</p>');

    mode = 'next';
    comp.update();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(container.innerHTML).toBe('<p>next</p>');
  });

  it('TC-COMP-045 매 렌더마다 update() 를 부르면 재렌더 25번을 넘을 때 Error (메시지에 25), DOM 과 vnode 는 일치, 다음 update 정상', () => {
    let loop = false;
    let renders = 0;
    let comp;
    const fn = vi.fn(() => {
      renders += 1;
      if (loop) comp.update();
      return h('p', null, String(renders));
    });
    comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    loop = true;
    expect(() => comp.update()).toThrow(/25/);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(27);
    expect(getCurrentComponent()).toBeNull();
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(comp.dom);
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);

    loop = false;
    fn.mockClear();
    comp.update();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe(`<p>${renders}</p>`);
  });
});

describe('리뷰 보강: hook 개수 검사', () => {
  it('TC-COMP-046 조건부로 첫 hook 을 건너뛰면 다른 슬롯을 읽지 않고 "hook" Error, DOM·vnode 그대로, 원래대로 돌아오면 같은 슬롯으로 정상', () => {
    let cond = true;
    const seen = [];
    const comp = new FunctionComponent(() => {
      const a = cond ? useHookSlot(() => ({ name: 'A' })) : null;
      const b = useHookSlot(() => ({ name: 'B' }));
      seen.push([a, b]);
      return h('p', null, b.name);
    });
    const container = makeContainer();
    const root = comp.mount(container);
    const vnodeBefore = comp.vnode;
    const mo = observe(container);

    cond = false;
    expect(() => comp.update()).toThrow(/hook/i);
    expect(mo.takeRecords()).toHaveLength(0);
    expect(container.innerHTML).toBe('<p>B</p>');
    expect(comp.vnode).toBe(vnodeBefore);
    expect(comp.dom).toBe(root);
    expect(comp.hooks).toHaveLength(2);
    expect(getCurrentComponent()).toBeNull();

    cond = true;
    expect(comp.update()).toEqual([]);
    const last = seen[seen.length - 1];
    expect(last[0]).toBe(seen[0][0]);
    expect(last[1]).toBe(seen[0][1]);
    mo.disconnect();
  });

  it('TC-COMP-047 첫 렌더보다 hook 을 더 부르면 "hook" Error, hooks 는 늘지 않고 DOM·vnode 그대로', () => {
    let extra = false;
    const slots = [];
    const comp = new FunctionComponent(() => {
      slots.push(useHookSlot(() => ({ i: 0 })));
      if (extra) useHookSlot(() => ({ i: 1 }));
      return h('p', null, extra ? 'extra' : 'base');
    });
    const container = makeContainer();
    comp.mount(container);
    const vnodeBefore = comp.vnode;
    const mo = observe(container);

    extra = true;
    expect(() => comp.update()).toThrow(/hook/i);
    expect(comp.hooks).toHaveLength(1);
    expect(mo.takeRecords()).toHaveLength(0);
    expect(container.innerHTML).toBe('<p>base</p>');
    expect(comp.vnode).toBe(vnodeBefore);
    expect(getCurrentComponent()).toBeNull();

    extra = false;
    comp.update();
    expect(comp.hooks).toHaveLength(1);
    slots.forEach((s) => expect(s).toBe(slots[0]));
    mo.disconnect();
  });
});

describe('리뷰 보강: mount 실패와 init 예외', () => {
  it('TC-COMP-048 mount 가 실패하면 hooks [] · hookIndex 0, 다시 mount 하면 init 을 처음부터 다시 부른다', () => {
    let fail = true;
    const init = vi.fn(() => ({ v: 0 }));
    const comp = new FunctionComponent(() => {
      const s = useHookSlot(init);
      s.v += 1;
      if (fail) throw new Error('x');
      return h('p', null, String(s.v));
    });
    expect(() => comp.mount(makeContainer())).toThrow('x');
    expect(comp.hooks).toEqual([]);
    expect(comp.hookIndex).toBe(0);

    fail = false;
    const box = makeContainer();
    comp.mount(box);
    expect(box.textContent).toBe('1');
    expect(init).toHaveBeenCalledTimes(2);
    expect(comp.hooks).toHaveLength(1);

    // render 단계(잘못된 속성 이름)에서 실패해도 같다
    const bad = new FunctionComponent(() => {
      useHookSlot(() => ({}));
      return h('p', { 'x y': '1' }, 'z');
    });
    const box2 = makeContainer();
    expect(() => bad.mount(box2)).toThrow();
    expect(box2.childNodes).toHaveLength(0);
    expect(bad.hooks).toEqual([]);
    expect(bad.hookIndex).toBe(0);
  });

  it('TC-COMP-049 init 이 던지면 hookIndex 를 올리지 않는다: 잡고 계속하면 다음 hook 이 같은 번호, 다음 렌더는 hook 개수 Error, 안 잡으면 mount 실패·hooks []', () => {
    const indexAfterCatch = [];
    let comp;
    comp = new FunctionComponent(() => {
      try {
        useHookSlot(() => {
          throw new Error('init');
        });
      } catch {
        indexAfterCatch.push(getCurrentComponent().hookIndex);
      }
      const b = useHookSlot(() => 'B');
      return h('p', null, String(b));
    });
    const container = makeContainer();
    comp.mount(container);
    expect(indexAfterCatch).toEqual([0]);
    expect(container.innerHTML).toBe('<p>B</p>');
    expect(comp.hooks).toEqual(['B']);

    // 확정된 hook 수는 1. 같은 코드가 다음 렌더에서는 hook 2번 → 개수 Error, DOM 그대로
    expect(() => comp.update()).toThrow(/hook/i);
    expect(container.innerHTML).toBe('<p>B</p>');
    expect(comp.hooks).toEqual(['B']);

    // 잡지 않으면 mount 실패, 슬롯 없음
    const c2 = new FunctionComponent(() => {
      useHookSlot(() => {
        throw new Error('init2');
      });
      return h('p', null, 'never');
    });
    const box = makeContainer();
    expect(() => c2.mount(box)).toThrow('init2');
    expect(c2.hooks).toEqual([]);
    expect(c2.hookIndex).toBe(0);
    expect(box.childNodes).toHaveLength(0);
  });
});

describe('리뷰 보강: patch 중간 예외 복구', () => {
  it('TC-COMP-050 patch 가 중간에 던지면 루트를 이전 vnode 의 render 결과로 같은 자리에서 교체하고 같은 예외를 다시 던진다', () => {
    let bad = false;
    const comp = new FunctionComponent(() =>
      h('ul', null, h('li', null, 'a'), bad ? h('li', null, 'b') : null, bad ? h('li', { 'x y': '1' }, 'c') : null),
    );
    const container = makeContainer();
    const before = document.createElement('span');
    container.appendChild(before);
    comp.mount(container);
    const after = document.createElement('span');
    container.appendChild(after);
    const vnodeBefore = comp.vnode;

    bad = true;
    let error = null;
    try {
      comp.update();
    } catch (e) {
      error = e;
    }
    expect(error).not.toBeNull();
    expect(error.name).toBe('InvalidCharacterError');

    expect(comp.vnode).toBe(vnodeBefore);
    expect(container.childNodes).toHaveLength(3);
    expect(container.childNodes[0]).toBe(before);
    expect(container.childNodes[2]).toBe(after);
    expect(container.childNodes[1]).toBe(comp.dom);
    expect(comp.dom.outerHTML).toBe('<ul><li>a</li></ul>');
    expect(comp.dom.isEqualNode(render(vnodeBefore))).toBe(true);
    expect(getCurrentComponent()).toBeNull();

    bad = false;
    expect(comp.update()).toEqual([]);
    expect(comp.dom.outerHTML).toBe('<ul><li>a</li></ul>');
  });
});

describe('리뷰 보강: SVG container', () => {
  it('TC-COMP-051 SVG container 에서는 mount · 루트 REPLACE · 루트 ADD 모두 SVG 네임스페이스, foreignObject container 는 HTML', () => {
    const svg = document.createElementNS(SVG, 'svg');
    document.body.appendChild(svg);
    let t = 'circle';
    const comp = new FunctionComponent(() => (t ? h(t, { r: '1' }) : null));
    comp.mount(svg);
    expect(comp.dom.namespaceURI).toBe(SVG);

    t = 'rect';
    comp.update();
    expect(comp.dom.namespaceURI).toBe(SVG);
    expect(comp.dom.localName).toBe('rect');

    t = null;
    comp.update();
    t = 'ellipse';
    comp.update();
    expect(comp.dom.namespaceURI).toBe(SVG);
    expect(svg.lastChild).toBe(comp.dom);

    const fo = document.createElementNS(SVG, 'foreignObject');
    svg.appendChild(fo);
    const inFo = new FunctionComponent(() => h('div', null, 'x'));
    inFo.mount(fo);
    expect(inFo.dom.namespaceURI).toBe(XHTML);
  });
});
