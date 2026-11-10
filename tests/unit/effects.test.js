// useEffect / useMemo / FunctionComponent.unmount 의 API 계약 (이슈 #9). 이 파일이 명세다.
// 토대는 src/core/component.js · src/core/hooks.js 이고 그 계약(tests/unit/component.test.js,
// tests/unit/hooks.test.js 맨 위 주석)을 그대로 따른다: hook 은 루트 fn 렌더 중에만, hook 개수 검사,
// init 규칙, 렌더·commit 중 재진입(25회 한도), 렌더/patch 예외 복구.
//
// import { useState, useEffect, useMemo } from '../../src/core/hooks.js';
// import { FunctionComponent } from '../../src/core/component.js';   // + comp.unmount()
//
// ── useEffect(effect, deps?) → undefined ───────────────────────────────────────
//   - 현재 컴포넌트의 hook 슬롯 하나를 쓴다. 호출 1번 = hook 1개 (개수 검사에 들어간다).
//   - effect: 인자 없이 부르는 함수. 함수가 아니면 TypeError, 메시지는 'useEffect:' 로 시작 (렌더 예외).
//   - deps: undefined / null(생략과 같음) / 배열. 그 밖의 값(숫자, 문자열, 일반 객체, boolean)은 TypeError,
//     메시지는 'useEffect:' 로 시작 (렌더 예외: DOM·vnode 그대로, mount 중이면 mount 실패).
//   - useEffect 를 부르는 순간에는 effect 를 실행하지 않는다. 렌더 중에는 "이번 렌더의 effect 와 deps" 만 기록한다.
//
//   언제 실행하나 (#8 리뷰 위험 1)
//   - **mount() / update() 한 번의 호출이 예외 없이 마지막 commit 까지 끝났을 때, 그 호출이 돌려주기 직전에 한 번**
//     ("effect 단계"). 기준은 그 호출에서 **마지막으로 commit 된 렌더**다. 렌더 중·commit 중 재진입으로 한 호출 안에서
//     여러 번 commit 돼도 effect 단계는 그 호출의 마지막 commit 뒤 한 번뿐이고, 중간 렌더의 effect·deps 는 버린다.
//   - effect 가 실행될 때 DOM 은 이미 그 렌더대로 바뀌어 있다 (mount 면 container 안, 문서에 붙어 있음).
//     effect·cleanup 실행 중 getCurrentComponent() 는 null 이다 (렌더 밖). **다른 컴포넌트의 렌더 안에서 mount /
//     update 된 컴포넌트의 effect 도 같다**: 바깥 컴포넌트를 가리키지 않으므로 그 안의 hook 은 "hook" Error 이고
//     바깥 컴포넌트의 슬롯은 바뀌지 않는다 (TC-EFF-093).
//   - deps 비교 기준은 "직전 렌더" 가 아니라 **그 슬롯에서 마지막으로 실행된 effect 의 deps** 다. 그래서 중간 렌더에서
//     deps 가 바뀌었다가 돌아오면 실행하지 않는다.
//   - 호출이 예외로 끝나면 그 호출에서는 effect 단계를 하지 않는다 (cleanup 도 effect 도 안 부른다):
//       렌더 예외(mount 실패 포함) / patch 예외(DOM 은 이전 vnode 로 복구) / 렌더 중 재진입 25회 초과 /
//       첫 commit 뒤의 재렌더가 던짐(DOM 에는 앞서 commit 된 렌더가 남아 있어도).
//     놓친 effect 는 다음에 성공한 호출이 "마지막으로 실행된 deps" 와 비교해 따라잡는다.
//   - 첫 mount 의 재렌더가 25회를 넘는 경우의 effect 는 정하지 않는다 (hooks 계약의 "정하지 않음" 과 같다).
//
//   deps 비교 (결정 테이블: 없음 / [] / 같음 / 다름 × cleanup 유무)
//   - 생략(undefined)·null: 성공한 호출마다 실행 (그 호출이 DOM 을 바꾸지 않았어도, update() 가 [] 여도).
//   - []: mount 의 effect 단계에서 한 번. 이후 실행하지 않는다 (cleanup 은 unmount 때만).
//   - 배열: 길이가 같고 원소별 Object.is 가 모두 참이면 "같음" → 실행하지 않음. 아니면 "다름" → 실행.
//     NaN→NaN 같음, 0→-0 다름, 같은 객체 같음, 내용이 같은 새 객체 다름, undefined→null 다름.
//     **길이가 바뀌면 다름** (원소를 비교하지 않는다).
//   - (테스트 없음, React 와 같음) deps 는 렌더마다 새 배열로 넘긴다. 같은 배열 객체를 렌더 사이에 재사용하며
//     원소를 직접 바꾸면 "마지막 실행 deps" 도 같은 객체라 바뀐 것으로 보지 않는다.
//
//   cleanup 과 순서 (#8 리뷰 위험 4, 7)
//   - effect 가 함수를 돌려주면 그것이 그 실행의 cleanup. 인자 없이 부른다. 그 밖의 반환값(undefined, null, 0, 문자열,
//     객체, Promise — async 함수 포함)은 무시한다: 예외 없음, cleanup 없음.
//   - 다시 실행할 effect 는 새 effect 직전에 이전 실행의 cleanup 을 부른다. 실행하지 않는 effect 의 cleanup 은 부르지 않는다.
//   - 한 effect 단계의 순서: **다시 실행할 effect 들의 cleanup 전부(선언 순서) → 그 effect 들 전부(선언 순서)**.
//   - cleanup 은 자기 실행 때의 클로저 값을 본다. effect 는 이번(마지막 commit) 렌더의 클로저를 본다.
//
//   effect 단계 중 setState / update() (#8 리뷰 위험 2)
//   - effect 단계(cleanup·effect 실행) 중 같은 컴포넌트의 setState / update() 는 렌더 중과 같다: 상태만 저장하고
//     "다시 필요" 표시, update() 는 [] 를 돌려준다. 그 자리에서 렌더하지 않는다 (effect 안에서 DOM 은 아직 이전 값).
//   - effect 단계가 끝난 뒤 표시가 있으면 **같은 호출 안에서 동기로** 다시 렌더 → commit → effect 단계를 반복한다.
//     그래서 mount() / update() 가 돌아오면 effect 가 바꾼 상태까지 DOM 에 반영돼 있고, update() 의 반환값에는 그 재렌더의
//     patch 도 이어 붙는다. mount() 의 반환값은 마지막 comp.dom.
//     (이것은 component 의 재진입 규칙이다. #10 batching 이 와도 effect 단계의 setState 는 이 규칙을 유지한다.)
//   - effect 단계로 인한 재렌더는 한 호출에서 **25번까지** 허용하고, 26번째가 필요해지면 Error. 메시지에 25 와 "effect"
//     (대소문자 무관). stack overflow(RangeError) 가 나면 안 된다. 그때까지 commit 된 렌더는 DOM 에 남고 DOM = render(comp.vnode),
//     표시는 지워지고, 다음 update 는 정상. 렌더 중 재진입 25회 한도와는 따로 센다.
//   - deps 가 있어 수렴하는 effect→setState(파생 상태 동기화)는 정상 동작한다. 같은 값으로 setState 하면 재렌더 없음.
//
//   effect·cleanup 예외 (#8 리뷰 위험 5)
//   - effect 단계에서 cleanup 이나 effect 가 던져도 **그 단계의 나머지 cleanup·effect 는 순서대로 모두 실행**하고,
//     단계가 끝난 뒤 **첫 예외**(실행 순서상 처음)를 mount() / update() 가 던진다. 그 단계에서 표시된 재렌더는 버린다
//     (상태는 남고 다음 update 가 그린다).
//   - 던진 effect 도 "실행된 것" 으로 친다: deps 가 기록되고 cleanup 은 없다. 같은 deps 로는 다시 실행하지 않는다.
//     던진 cleanup 도 "부른 것" 으로 친다 (다시 부르지 않는다).
//   - DOM 은 이미 commit 된 그대로다 (DOM = render(comp.vnode)).
//   - mount 의 effect 가 던지면 mount 는 그 예외를 던지지만 **컴포넌트는 mount 된 상태로 남는다** (container 에 DOM,
//     comp.container 설정, update / unmount 가능). 렌더 예외로 인한 mount 실패(되돌림)와 다르다.
//   - effect 안에서 hook 을 부르면 렌더 밖이므로 "hook" Error 이고, 위 규칙대로 그 호출이 던진다.
//   - (#9 리뷰 7) effect 단계 때문에 일어난 재렌더가 렌더 예외 / patch 예외로 끝나면: 앞선 effect 단계는 이미 실행됐고,
//     그 예외를 mount() / update() 가 던지며, 그 뒤 effect 단계는 없다. 컴포넌트는 mount 된 상태로 남는다.
//     patch 예외면 DOM 은 component 계약대로 이전 vnode 로 복구된다 (DOM = render(comp.vnode)) (TC-EFF-095).
//
//   effect 단계 도중 unmount (#9 리뷰 2, 3)
//   - cleanup 이나 effect 가 (직접, 또는 다른 컴포넌트를 거쳐) **자기 컴포넌트를 unmount** 하면: unmount 는 그때까지
//     실행된 effect 의 남은 cleanup 을 모두 부른다. 그 effect 단계의 **남은 cleanup·effect 는 실행하지 않고**, 표시된
//     재렌더도 하지 않는다. mount() / update() 는 예외 없이 돌아온다 (mount 반환값 null, update 는 그때까지 적용한 patch).
//     container 는 비어 있다. cleanup 은 각각 정확히 1번이고 effect 를 실행했으면 그 cleanup 이 반드시 불린다 (누수 없음).
//
//   mount 실패 (#9 리뷰 1)
//   - 첫 commit 이 끝나기 전(렌더, render, **container.appendChild** — container 가 Text 노드나 document 라
//     HierarchyRequestError 인 경우 포함)에 던지면 component 계약대로 mount 되지 않은 상태로 되돌린다: hooks [],
//     hookIndex 0, hook 종류·재렌더 표시도 초기화. 다시 mount 하면 init 을 처음부터 다시 부르고 hook 종류도 새로 정한다.
//     실패한 mount 의 렌더에서 꺼낸 setState 는 조용히 무시한다 (TC-EFF-090).
//
// ── useMemo(compute, deps?) → value ─────────────────────────────────────────────
//   - 현재 컴포넌트의 hook 슬롯 하나를 쓴다. compute 는 **렌더 중에** 인자 없이 부르고 그 반환값을 돌려준다.
//   - 첫 렌더: compute() 를 한 번 부른다. 반환값이 undefined / null / 0 / false / '' 여도 저장한다(다시 안 부름).
//   - 이후 렌더: deps 가 "같음"(useEffect 와 같은 비교: 길이 같고 원소별 Object.is) 이면 저장된 값(같은 참조)을 돌려주고
//     compute 를 부르지 않는다. "다름" 이면 compute 를 다시 불러 저장한다. 비교 기준은 마지막으로 계산에 쓴 deps.
//   - deps 생략(undefined)·null: 렌더마다 계산. []: 첫 렌더에만.
//   - compute 가 함수가 아니거나 deps 가 undefined / null / 배열이 아니면 TypeError, 메시지는 'useMemo:' 로 시작 (렌더 예외).
//   - compute 가 던지면 렌더 예외로 전파한다. 첫 렌더면 init 예외 규칙(mount 실패, hooks []). 이후 렌더면 슬롯은
//     **이전 값과 이전 deps 그대로** (이후 이전 deps 로 돌아오면 compute 없이 이전 값).
//   - compute 안에서는 hook 을 부를 수 없다 (첫 계산·다시 계산 모두): "hook" Error, 렌더 예외.
//   - compute 안의 setState 는 렌더 중 setState 규칙 그대로다 (테스트 없음).
//
// ── hook 종류 검사 (#8 리뷰 위험 3) ────────────────────────────────────────────────
//   - 첫 commit 에서 hook 개수와 함께 **자리마다 hook 종류(useState / useEffect / useMemo)** 가 확정된다.
//     이후 렌더에서 같은 자리에 다른 종류를 부르면 그 호출에서 Error, 메시지에 "hook" (대소문자 무관).
//     렌더 예외와 같다: DOM·vnode·dom 그대로, hooks 길이 그대로, effect·cleanup 실행 없음. 순서를 되돌리면 정상.
//   - useHookSlot 을 직접 쓰는 슬롯의 종류 검사는 정하지 않는다.
//
// ── comp.unmount() → undefined ─────────────────────────────────────────────────
//   - mount 된 컴포넌트에서: 실행된 effect 들의 cleanup 을 **선언 순서**로 모두 부른다 (cleanup 이 있는 것만, 각 1번).
//     cleanup 이 실행될 때 DOM 은 아직 container 안에 있다. 그다음 루트 DOM 을 container 에서 뗀다 (형제는 그대로).
//     끝나면 comp.dom = null, comp.vnode = null, comp.container = null. effect 는 다시 실행하지 않는다.
//   - cleanup 이 던져도 나머지 cleanup 을 부르고 DOM 을 떼어 unmount 를 끝낸 뒤 첫 예외를 던진다.
//   - unmount 된 뒤: setState 는 **조용히 무시** (던지지 않음, 렌더 없음. unmount 중 cleanup 안의 setState 도 같다),
//     update() 는 Error (메시지는 'update:' 로 시작), mount() 는 Error (메시지는 'mount:' 로 시작, container 그대로),
//     unmount() 를 다시 부르면 아무것도 하지 않는다 (cleanup 다시 안 부름, 예외 없음).
//   - mount 전(또는 mount 실패 뒤)의 unmount 는 Error, 메시지는 'unmount:' 로 시작.
//   - 루트가 null 이어도 cleanup 은 부르고 container 는 건드리지 않는다.
//   - 자기 렌더·commit 도중의 unmount 는 정하지 않는다. effect 단계 도중은 위 "effect 단계 도중 unmount".
//
// ── 정하지 않음 (테스트 없음) ────────────────────────────────────────────────────
//   - 렌더가 예외로 끝났을 때, 그 렌더 안에서 이미 다시 계산된 useMemo 값이 남는지.
//   - effect 안에서 다른 컴포넌트를 update / mount / unmount 하는 경우의 순서.
//   - effect 단계 재렌더와 렌더 중 재진입이 섞인 경우의 정확한 렌더 횟수.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState, useEffect, useMemo } from '../../src/core/hooks.js';
import { FunctionComponent, getCurrentComponent } from '../../src/core/component.js';
import { render } from '../../src/vdom/render.js';
import { h } from '../../src/vdom/vnode.js';

function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

// 예약된 갱신이 있으면 끝날 때까지 기다린다 (#10 batching 이 와도 유효하게).
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function caught(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

// DOM 과 comp.vnode 가 일치하고 container 안에 루트 하나만 있다.
function expectConsistent(comp, container) {
  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild).toBe(comp.dom);
  expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
}

// 결정 테이블 하네스: 바깥 값 v 로 렌더하고, deps = depsOf(v). cleanup 여부 선택.
function effectHarness(depsOf, withCleanup) {
  const log = [];
  let v = 0;
  const comp = new FunctionComponent(() => {
    const cur = v;
    useEffect(() => {
      log.push(`effect ${String(cur)}`);
      if (withCleanup) return () => log.push(`cleanup ${String(cur)}`);
      return undefined;
    }, depsOf(cur));
    return h('p', null, 'x');
  });
  comp.mount(makeContainer());
  return {
    comp,
    log,
    set(x) {
      v = x;
      return comp.update();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useEffect: 실행 시점 (commit 뒤, 호출당 한 번)', () => {
  it('TC-EFF-001 mount: effect 는 렌더 중이 아니라 commit 뒤 1번, 인자 없이 실행되고 그때 DOM 은 이미 문서 안에 있다 (루트 null 이어도 실행)', () => {
    const log = [];
    const container = makeContainer();
    let seen = null;
    const effect = vi.fn((...args) => {
      log.push('effect');
      seen = {
        args,
        html: container.innerHTML,
        inDoc: container.firstChild != null && document.body.contains(container.firstChild),
        current: getCurrentComponent(),
      };
    });
    const comp = new FunctionComponent(() => {
      useEffect(effect);
      log.push('render');
      return h('p', null, 'hi');
    });
    const dom = comp.mount(container);

    expect(log).toEqual(['render', 'effect']);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ args: [], html: '<p>hi</p>', inDoc: true, current: null });
    expect(dom).toBe(comp.dom);
    expect(comp.hooks).toHaveLength(1);

    const empty = vi.fn();
    const nullRoot = new FunctionComponent(() => {
      useEffect(empty);
      return null;
    });
    expect(nullRoot.mount(makeContainer())).toBeNull();
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it('TC-EFF-002 update: effect 는 patch 뒤, update() 가 돌아오기 전에 실행되고 update() 반환값은 그대로 patch 목록', () => {
    const container = makeContainer();
    let text = 'a';
    const seen = [];
    const comp = new FunctionComponent(() => {
      useEffect(() => {
        seen.push(container.innerHTML);
      });
      return h('p', null, text);
    });
    comp.mount(container);
    expect(seen).toEqual(['<p>a</p>']);

    text = 'b';
    const ret = comp.update();
    expect(seen).toEqual(['<p>a</p>', '<p>b</p>']);
    expect(ret).toHaveLength(1);
    expect(ret[0].type).toBe('TEXT');
    expect(ret[0].text).toBe('b');
  });

  it('TC-EFF-003 렌더 중 재진입으로 한 호출에 여러 번 commit 돼도 effect 단계는 마지막 commit 뒤 한 번, 마지막 렌더 기준', () => {
    const container = makeContainer();
    const withDeps = [];
    const noDeps = vi.fn();
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      if (n < 3) setN(n + 1);
      useEffect(() => {
        withDeps.push([n, container.innerHTML]);
      }, [n]);
      useEffect(noDeps);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    comp.mount(container);

    expect(fn).toHaveBeenCalledTimes(4);
    expect(withDeps).toEqual([[3, '<p>3</p>']]);
    expect(noDeps).toHaveBeenCalledTimes(1);

    comp.update();
    expect(withDeps).toHaveLength(1);
    expect(noDeps).toHaveBeenCalledTimes(2);
  });

  it('TC-EFF-004 commit 도중(custom element 콜백) setState 로 재렌더돼도 effect 는 한 번, 최종 DOM(data-v="2", <p>2</p>)을 본다', async () => {
    const container = makeContainer();
    let setN;
    const tag = defineEcho((v) => {
      if (v === '1') setN(2);
    });
    const seen = [];
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      useEffect(() => {
        seen.push(container.innerHTML);
      }, [n]);
      return h('div', null, h(tag, { 'data-v': String(n) }), h('p', null, String(n)));
    });
    comp.mount(container);
    expect(seen).toHaveLength(1);

    setN(1);
    await flush();
    expect(seen).toEqual([seen[0], `<div><${tag} data-v="2"></${tag}><p>2</p></div>`]);
    expectConsistent(comp, container);
  });

  it('TC-EFF-005 렌더 예외(mount 실패 / update 실패)면 effect·cleanup 을 부르지 않고, 다음에 성공한 호출에서 실행', () => {
    let fail = true;
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);
    const comp = new FunctionComponent(() => {
      useEffect(effect);
      if (fail) throw new Error('render boom');
      return h('p', null, 'x');
    });
    const container = makeContainer();

    expect(() => comp.mount(container)).toThrow('render boom');
    expect(effect).not.toHaveBeenCalled();
    expect(container.childNodes).toHaveLength(0);

    fail = false;
    comp.mount(container);
    expect(effect).toHaveBeenCalledTimes(1);

    fail = true;
    expect(() => comp.update()).toThrow('render boom');
    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    fail = false;
    comp.update();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('TC-EFF-006 patch 예외면 effect·cleanup 없음 (DOM 은 이전 vnode 로 복구), 비교 기준은 마지막으로 실행된 deps', () => {
    let bad = false;
    const effect = vi.fn();
    const cleanup = vi.fn();
    const comp = new FunctionComponent(() => {
      const flag = bad;
      useEffect(() => {
        effect(flag);
        return cleanup;
      }, [flag]);
      return h('ul', null, h('li', null, 'a'), flag ? h('li', { 'x y': '1' }, 'c') : null);
    });
    const container = makeContainer();
    comp.mount(container);
    expect(effect).toHaveBeenCalledTimes(1);

    bad = true;
    const error = caught(() => comp.update());
    expect(error).not.toBeNull();
    expect(error.name).toBe('InvalidCharacterError');
    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('<ul><li>a</li></ul>');
    expectConsistent(comp, container);

    // deps [false] 는 마지막으로 실행된 deps 와 같다 → 실행하지 않는다
    bad = false;
    comp.update();
    expect(effect).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('TC-EFF-007 첫 commit 뒤의 재렌더가 던지면 앞선 commit 은 DOM 에 남지만 effect 는 실행하지 않고, 다음 성공한 update 에서 한 번', () => {
    let label = 'a';
    let reenter = false;
    const effect = vi.fn();
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      useEffect(() => effect(n));
      if (reenter) {
        if (n === 0) setN(1);
        else throw new Error('second boom');
      }
      return h('p', null, `${label}${n}`);
    });
    const container = makeContainer();
    comp.mount(container);
    expect(effect.mock.calls).toEqual([[0]]);

    label = 'b';
    reenter = true;
    expect(() => comp.update()).toThrow('second boom');
    expect(container.innerHTML).toBe('<p>b0</p>');
    expectConsistent(comp, container);
    expect(effect).toHaveBeenCalledTimes(1);

    reenter = false;
    comp.update();
    expect(container.innerHTML).toBe('<p>b1</p>');
    expect(effect.mock.calls).toEqual([[0], [1]]);
  });

  it('TC-EFF-008 렌더 중 재진입 25회 초과 Error 로 끝난 호출에서는 effect 없음, 멈춘 뒤 update 에서 실행', () => {
    let loop = false;
    const effect = vi.fn();
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      if (loop) setN((p) => p + 1);
      useEffect(effect);
      return h('p', null, String(n));
    });
    const container = makeContainer();
    comp.mount(container);
    expect(effect).toHaveBeenCalledTimes(1);

    loop = true;
    expect(() => comp.update()).toThrow(/25/);
    expect(effect).toHaveBeenCalledTimes(1);
    expectConsistent(comp, container);

    loop = false;
    comp.update();
    expect(effect).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// test-plan: 의존성 없음 / 빈 배열 / 값 같음 / 값 다름 × cleanup 유무 = 8행.
describe('useEffect: deps 결정 테이블', () => {
  it('TC-EFF-010 DT 1행: deps 생략, cleanup 없음 → 성공한 호출마다 실행 (DOM 변화 없는 update 도)', () => {
    const t = effectHarness(() => undefined, false);
    expect(t.set(0)).toEqual([]);
    t.set(1);
    t.set(1);
    expect(t.log).toEqual(['effect 0', 'effect 0', 'effect 1', 'effect 1']);
  });

  it('TC-EFF-011 DT 2행: deps 생략, cleanup 있음 → 매번 이전 cleanup 다음 effect, unmount 에서 마지막 cleanup', () => {
    const t = effectHarness(() => undefined, true);
    t.set(0);
    t.set(1);
    expect(t.log).toEqual(['effect 0', 'cleanup 0', 'effect 0', 'cleanup 0', 'effect 1']);
    t.comp.unmount();
    expect(t.log.at(-1)).toBe('cleanup 1');
    expect(t.log).toHaveLength(6);
  });

  it('TC-EFF-012 DT 3행: [] , cleanup 없음 → mount 에서 한 번만', () => {
    const t = effectHarness(() => [], false);
    t.set(1);
    t.set(2);
    expect(t.log).toEqual(['effect 0']);
  });

  it('TC-EFF-013 DT 4행: [] , cleanup 있음 → update 중에는 cleanup 없음, unmount 에서 한 번', () => {
    const t = effectHarness(() => [], true);
    t.set(1);
    t.set(2);
    expect(t.log).toEqual(['effect 0']);
    t.comp.unmount();
    expect(t.log).toEqual(['effect 0', 'cleanup 0']);
  });

  it('TC-EFF-014 DT 5행: 값 같음, cleanup 없음 → 실행하지 않음', () => {
    const t = effectHarness((v) => [v, 'k'], false);
    t.set(0);
    t.set(0);
    expect(t.log).toEqual(['effect 0']);
  });

  it('TC-EFF-015 DT 6행: 값 같음, cleanup 있음 → cleanup 도 effect 도 없음', () => {
    const t = effectHarness((v) => [v], true);
    t.set(0);
    t.set(0);
    expect(t.log).toEqual(['effect 0']);
    t.comp.unmount();
    expect(t.log).toEqual(['effect 0', 'cleanup 0']);
  });

  it('TC-EFF-016 DT 7행: 값 다름, cleanup 없음 → 바뀔 때마다 실행', () => {
    const t = effectHarness((v) => [v], false);
    t.set(1);
    t.set(2);
    t.set(2);
    expect(t.log).toEqual(['effect 0', 'effect 1', 'effect 2']);
  });

  it('TC-EFF-017 DT 8행: 값 다름, cleanup 있음 → 이전 실행의 cleanup(그때 값, 인자 없음) 다음 새 effect', () => {
    const t = effectHarness((v) => [v], true);
    t.set(1);
    t.set(2);
    expect(t.log).toEqual(['effect 0', 'cleanup 0', 'effect 1', 'cleanup 1', 'effect 2']);

    const args = [];
    let v = 0;
    const comp = new FunctionComponent(() => {
      const cur = v;
      useEffect(() => (...a) => args.push(a), [cur]);
      return null;
    });
    comp.mount(makeContainer());
    v = 1;
    comp.update();
    expect(args).toEqual([[]]);
  });

  it('TC-EFF-018 BVA: 원소 비교는 Object.is (NaN 같음, 0→-0 다름, 같은 객체 같음, 새 객체 다름, undefined→null 다름)', () => {
    const obj = { a: 1 };
    const t = effectHarness((v) => [v], false);
    // mount 는 v=0. 이후 순서대로 바꾸며 실행 여부를 본다.
    const steps = [
      [NaN, true],
      [NaN, false],
      [0, true],
      [-0, true],
      [-0, false],
      [obj, true],
      [obj, false],
      [{ a: 1 }, true],
      [undefined, true],
      [null, true],
      [null, false],
    ];
    for (const [value, runs] of steps) {
      const before = t.log.length;
      t.set(value);
      expect([value, t.log.length - before]).toEqual([value, runs ? 1 : 0]);
    }
  });

  it('TC-EFF-019 BVA: deps 길이가 바뀌면 다름 ([1]→[1,2] 실행, 같으면 안 함, →[1] 실행, →[] 실행)', () => {
    let deps = [1];
    const effect = vi.fn();
    const comp = new FunctionComponent(() => {
      useEffect(effect, deps);
      return null;
    });
    comp.mount(makeContainer());
    const counts = [];
    for (const next of [[1, 2], [1, 2], [1], [], []]) {
      deps = next;
      comp.update();
      counts.push(effect.mock.calls.length);
    }
    expect(counts).toEqual([2, 2, 3, 4, 4]);
  });

  it('TC-EFF-020 EG: deps null 은 생략과 같고, 배열이 아닌 deps·함수가 아닌 effect 는 "useEffect:" TypeError (렌더 예외)', () => {
    const effect = vi.fn();
    const nullDeps = new FunctionComponent(() => {
      useEffect(effect, null);
      return null;
    });
    nullDeps.mount(makeContainer());
    nullDeps.update();
    nullDeps.update();
    expect(effect).toHaveBeenCalledTimes(3);

    for (const bad of [5, 'ab', { length: 0 }, true]) {
      const box = makeContainer();
      const comp = new FunctionComponent(() => {
        useEffect(() => {}, bad);
        return h('p', null, 'x');
      });
      const e = caught(() => comp.mount(box));
      expect(e).toBeInstanceOf(TypeError);
      expect(e.message).toMatch(/^useEffect:/);
      expect(box.childNodes).toHaveLength(0);
      expect(comp.hooks).toEqual([]);
    }

    for (const notFn of [undefined, null, 5, {}]) {
      const box = makeContainer();
      const comp = new FunctionComponent(() => {
        useEffect(notFn);
        return h('p', null, 'x');
      });
      const e = caught(() => comp.mount(box));
      expect(e).toBeInstanceOf(TypeError);
      expect(e.message).toMatch(/^useEffect:/);
      expect(box.childNodes).toHaveLength(0);
    }

    // update 에서 deps 가 잘못되면 렌더 예외: DOM·vnode 그대로, effect 없음
    let deps = [1];
    const ran = vi.fn();
    const comp = new FunctionComponent(() => {
      useEffect(ran, deps);
      return h('p', null, String(deps));
    });
    const container = makeContainer();
    comp.mount(container);
    const vnodeBefore = comp.vnode;
    deps = 7;
    const e = caught(() => comp.update());
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toMatch(/^useEffect:/);
    expect(container.innerHTML).toBe('<p>1</p>');
    expect(comp.vnode).toBe(vnodeBefore);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('TC-EFF-021 EG: 비교 기준은 마지막으로 실행된 deps — 한 호출 안 중간 렌더에서 deps 가 바뀌었다 돌아오면 실행 안 함', async () => {
    let setA;
    const effect = vi.fn();
    const fn = vi.fn(() => {
      const [a, s] = useState(0);
      setA = s;
      if (a === 1) s(0);
      useEffect(effect, [a]);
      return h('p', null, String(a));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    expect(effect).toHaveBeenCalledTimes(1);
    fn.mockClear();

    setA(1);
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toBe('<p>0</p>');
    expect(effect).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useEffect: cleanup 과 실행 순서', () => {
  it('TC-EFF-030 다시 실행할 effect 들의 cleanup 전부(선언 순서) → effect 전부(선언 순서), 안 바뀐 effect 는 손대지 않음', () => {
    const log = [];
    let v = { a: 0, b: 0, c: 0 };
    const comp = new FunctionComponent(() => {
      const cur = v;
      for (const name of ['a', 'b', 'c']) {
        useEffect(() => {
          log.push(`effect ${name}${cur[name]}`);
          return () => log.push(`cleanup ${name}${cur[name]}`);
        }, [cur[name]]);
      }
      return null;
    });
    comp.mount(makeContainer());
    expect(log).toEqual(['effect a0', 'effect b0', 'effect c0']);

    log.length = 0;
    v = { a: 1, b: 0, c: 1 };
    comp.update();
    expect(log).toEqual(['cleanup a0', 'cleanup c0', 'effect a1', 'effect c1']);

    log.length = 0;
    comp.unmount();
    expect(log).toEqual(['cleanup a1', 'cleanup b0', 'cleanup c1']);
  });

  it('TC-EFF-031 EG: effect 가 함수가 아닌 값(undefined, null, 0, 문자열, 객체, Promise, async)을 돌려주면 무시 — 예외·cleanup 없음', async () => {
    const values = [undefined, null, 0, 'str', { destroy: true }, Promise.resolve(1)];
    const asyncEffect = vi.fn(async () => {});
    const comp = new FunctionComponent(() => {
      for (const value of values) useEffect(() => value);
      useEffect(asyncEffect);
      return h('p', null, 'x');
    });
    const container = makeContainer();
    expect(() => comp.mount(container)).not.toThrow();
    expect(() => comp.update()).not.toThrow();
    expect(() => comp.unmount()).not.toThrow();
    expect(asyncEffect).toHaveBeenCalledTimes(2);
    expect(container.childNodes).toHaveLength(0);
    await flush();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useEffect: effect 안의 setState', () => {
  it('TC-EFF-040 수렴하는 effect→setState(파생 상태): mount·update 가 돌아오면 반영 완료, update 반환값에 재렌더 patch 도 이어 붙음', () => {
    let ext = 1;
    const effect = vi.fn();
    const fn = vi.fn(() => {
      const [double, setDouble] = useState(null);
      const cur = ext;
      useEffect(() => {
        effect(cur);
        setDouble(cur * 2);
      }, [cur]);
      return h('p', null, `${cur}:${double}`);
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    const dom = comp.mount(container);

    expect(container.innerHTML).toBe('<p>1:2</p>');
    expect(dom).toBe(comp.dom);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenCalledTimes(1);

    ext = 3;
    const ret = comp.update();
    expect(container.innerHTML).toBe('<p>3:6</p>');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(effect.mock.calls).toEqual([[1], [3]]);
    expect(ret.map((p) => p.type)).toEqual(['TEXT', 'TEXT']);
    expect(ret.map((p) => p.text)).toEqual(['3:2', '3:6']);

    expect(comp.update()).toEqual([]);
    expect(effect).toHaveBeenCalledTimes(2);
    expectConsistent(comp, container);
  });

  it('TC-EFF-041 effect 안의 setState·update() 는 표시만: 그 자리에서 DOM 은 이전 값, update() 는 [], 끝난 뒤 같은 호출 안에서 재렌더 1번', () => {
    const container = makeContainer();
    const inner = [];
    let comp;
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        setN(1);
        inner.push(container.innerHTML);
        inner.push(comp.update());
        inner.push(container.innerHTML);
      }, []);
      return h('p', null, String(n));
    });
    comp = new FunctionComponent(fn);
    comp.mount(container);

    expect(inner).toEqual(['<p>0</p>', [], '<p>0</p>']);
    expect(container.innerHTML).toBe('<p>1</p>');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('TC-EFF-042 EG: deps 없는 effect 가 매번 setState(n + 1) → stack overflow 가 아니라 /25/·/effect/ Error, DOM = render(vnode), 멈추면 정상', () => {
    let loop = false;
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        if (loop) setN(n + 1);
      });
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    loop = true;
    const e = caught(() => comp.update());
    loop = false;
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(RangeError);
    expect(e.message).toMatch(/25/);
    expect(e.message).toMatch(/effect/i);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(28);
    expect(getCurrentComponent()).toBeNull();
    expectConsistent(comp, container);

    fn.mockClear();
    expect(() => comp.update()).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expectConsistent(comp, container);
  });

  it('TC-EFF-043 BVA: 한 호출에서 effect 로 인한 재렌더 25번은 허용, 26번째가 필요하면 Error', () => {
    function make(limit) {
      let on = false;
      const comp = new FunctionComponent(() => {
        const [n, setN] = useState(0);
        useEffect(() => {
          if (on && n < limit) setN(n + 1);
        });
        return h('p', null, String(n));
      });
      const container = makeContainer();
      comp.mount(container);
      return {
        container,
        start() {
          on = true;
          return caught(() => comp.update());
        },
      };
    }

    const ok = make(25);
    expect(ok.start()).toBeNull();
    expect(ok.container.innerHTML).toBe('<p>25</p>');

    const over = make(26);
    const e = over.start();
    expect(e).not.toBeNull();
    expect(e.message).toMatch(/25/);
  });

  it('TC-EFF-044 effect 가 같은 값으로 setState 하면 재렌더 없음 (deps 없어도 루프 아님)', () => {
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => setN(0));
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    comp.mount(makeContainer());
    expect(fn).toHaveBeenCalledTimes(1);
    comp.update();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useEffect: effect·cleanup 예외', () => {
  it('TC-EFF-050 effect 가 던져도 나머지 effect 는 실행, update 가 그 예외를 던짐, DOM 은 commit 된 그대로, 같은 deps 는 다시 안 함', () => {
    const log = [];
    let v = 0;
    const comp = new FunctionComponent(() => {
      const cur = v;
      useEffect(() => {
        log.push(`A${cur}`);
        if (cur === 1) throw new Error('A boom');
      }, [cur]);
      useEffect(() => {
        log.push(`B${cur}`);
      }, [cur]);
      return h('p', null, String(cur));
    });
    const container = makeContainer();
    comp.mount(container);
    expect(log).toEqual(['A0', 'B0']);

    v = 1;
    expect(() => comp.update()).toThrow('A boom');
    expect(log).toEqual(['A0', 'B0', 'A1', 'B1']);
    expect(container.innerHTML).toBe('<p>1</p>');
    expectConsistent(comp, container);

    expect(() => comp.update()).not.toThrow();
    expect(log).toHaveLength(4);

    v = 2;
    comp.update();
    expect(log).toEqual(['A0', 'B0', 'A1', 'B1', 'A2', 'B2']);
  });

  it('TC-EFF-051 cleanup 이 던져도 나머지 cleanup 과 effect 는 모두 실행, 실행 순서상 첫 예외(cleanup 단계)를 던짐', () => {
    const log = [];
    let v = 0;
    const comp = new FunctionComponent(() => {
      const cur = v;
      useEffect(() => {
        log.push(`effect A${cur}`);
        if (cur === 1) throw new Error('effect A boom');
        return () => {
          log.push(`cleanup A${cur}`);
        };
      }, [cur]);
      useEffect(() => {
        log.push(`effect B${cur}`);
        return () => {
          log.push(`cleanup B${cur}`);
          if (cur === 0) throw new Error('cleanup B boom');
        };
      }, [cur]);
      return null;
    });
    comp.mount(makeContainer());

    log.length = 0;
    v = 1;
    expect(() => comp.update()).toThrow('cleanup B boom');
    expect(log).toEqual(['cleanup A0', 'cleanup B0', 'effect A1', 'effect B1']);

    // 던진 effect A1 은 cleanup 이 없고, 던진 cleanup B0 은 다시 부르지 않는다
    log.length = 0;
    v = 2;
    expect(() => comp.update()).not.toThrow();
    expect(log).toEqual(['cleanup B1', 'effect A2', 'effect B2']);
  });

  it('TC-EFF-052 mount 의 effect 가 던지면 mount 는 그 예외를 던지지만 mount 된 상태로 남는다 (DOM 있음, update·unmount 가능)', () => {
    const cleanup = vi.fn();
    let first = true;
    const comp = new FunctionComponent(() => {
      useEffect(() => {
        if (first) {
          first = false;
          throw new Error('mount effect boom');
        }
        return cleanup;
      });
      return h('p', null, 'x');
    });
    const container = makeContainer();
    expect(() => comp.mount(container)).toThrow('mount effect boom');
    expect(comp.container).toBe(container);
    expect(container.innerHTML).toBe('<p>x</p>');
    expect(container.firstChild).toBe(comp.dom);

    expect(() => comp.update()).not.toThrow();
    comp.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
  });

  it('TC-EFF-053 EG: effect 안에서 hook 을 부르면 "hook" Error 를 그 호출이 던진다', () => {
    const comp = new FunctionComponent(() => {
      useEffect(() => {
        useState(0);
      }, []);
      return h('p', null, 'x');
    });
    const container = makeContainer();
    expect(() => comp.mount(container)).toThrow(/hook/i);
    expect(container.innerHTML).toBe('<p>x</p>');
    expect(getCurrentComponent()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('unmount', () => {
  it('TC-EFF-060 cleanup 을 선언 순서로 1번씩(그때 DOM 은 아직 container 안) 부른 뒤 루트를 떼고, dom·vnode·container 는 null, 반환 undefined', () => {
    const container = makeContainer();
    const before = document.createElement('span');
    container.appendChild(before);
    const log = [];
    const effects = { a: vi.fn(), b: vi.fn(), c: vi.fn() };
    let comp;
    comp = new FunctionComponent(() => {
      useEffect(() => {
        effects.a();
        return () => log.push(`a ${container.contains(comp.dom)}`);
      }, []);
      useEffect(() => {
        effects.b();
      });
      useEffect(() => {
        effects.c();
        return () => log.push(`c ${container.contains(comp.dom)}`);
      });
      return h('p', null, 'x');
    });
    const dom = comp.mount(container);

    const ret = comp.unmount();
    expect(ret).toBeUndefined();
    expect(log).toEqual(['a true', 'c true']);
    expect([...container.childNodes]).toEqual([before]);
    expect(dom.parentNode).toBeNull();
    expect(comp.dom).toBeNull();
    expect(comp.vnode).toBeNull();
    expect(comp.container).toBeNull();
    expect(effects.a).toHaveBeenCalledTimes(1);
    expect(effects.b).toHaveBeenCalledTimes(1);
    expect(effects.c).toHaveBeenCalledTimes(1);
  });

  it('TC-EFF-061 unmount 뒤: setState 무시(예외·렌더 없음), update 는 "update:" Error, mount 는 "mount:" Error, 다시 unmount 는 아무것도 안 함', async () => {
    let setN;
    const cleanup = vi.fn();
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      useEffect(() => cleanup, []);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    comp.unmount();
    fn.mockClear();

    expect(() => setN(5)).not.toThrow();
    await flush();
    expect(fn).not.toHaveBeenCalled();
    expect(container.childNodes).toHaveLength(0);

    expect(() => comp.update()).toThrow(/^update:/);
    const other = makeContainer();
    expect(() => comp.mount(other)).toThrow(/^mount:/);
    expect(other.childNodes).toHaveLength(0);
    expect(fn).not.toHaveBeenCalled();

    expect(() => comp.unmount()).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('TC-EFF-062 EG: mount 전 / mount 실패 뒤의 unmount 는 "unmount:" Error', () => {
    const fresh = new FunctionComponent(() => h('p', null, 'x'));
    expect(() => fresh.unmount()).toThrow(/^unmount:/);

    const failed = new FunctionComponent(() => {
      throw new Error('render boom');
    });
    expect(() => failed.mount(makeContainer())).toThrow('render boom');
    expect(() => failed.unmount()).toThrow(/^unmount:/);
  });

  it('TC-EFF-063 BVA: 루트가 null 인 컴포넌트도 cleanup 은 부르고 container 는 그대로', () => {
    const container = makeContainer();
    const sibling = document.createElement('i');
    container.appendChild(sibling);
    const cleanup = vi.fn();
    const comp = new FunctionComponent(() => {
      useEffect(() => cleanup, []);
      return null;
    });
    comp.mount(container);
    comp.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect([...container.childNodes]).toEqual([sibling]);
  });

  it('TC-EFF-064 EG: unmount 중 cleanup 이 던져도 나머지 cleanup 과 DOM 제거를 마치고 첫 예외를 던지며, 그 뒤는 unmount 된 상태', async () => {
    let setN;
    const log = [];
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      useEffect(() => () => {
        log.push('a');
        throw new Error('cleanup a boom');
      }, []);
      useEffect(() => () => {
        log.push('b');
        throw new Error('cleanup b boom');
      }, []);
      useEffect(() => () => log.push('c'), []);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    expect(() => comp.unmount()).toThrow('cleanup a boom');
    expect(log).toEqual(['a', 'b', 'c']);
    expect(container.childNodes).toHaveLength(0);
    expect(comp.dom).toBeNull();

    expect(() => setN(1)).not.toThrow();
    await flush();
    expect(fn).not.toHaveBeenCalled();
    expect(() => comp.unmount()).not.toThrow();
    expect(log).toHaveLength(3);
  });

  it('TC-EFF-065 EG: unmount 중 cleanup 안의 setState 는 무시 (예외·렌더 없음)', async () => {
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => () => setN(9), []);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    expect(() => comp.unmount()).not.toThrow();
    await flush();
    expect(fn).not.toHaveBeenCalled();
    expect(container.childNodes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('hook 규칙: 호출 위치와 종류', () => {
  it('TC-EFF-070 EG: 렌더 밖 / 자식 함수 안 useEffect·useMemo 는 "hook" Error', () => {
    expect(() => useEffect(() => {})).toThrow(/hook/i);
    expect(() => useMemo(() => 1, [])).toThrow(/hook/i);

    for (const Child of [
      () => {
        useEffect(() => {});
        return h('i', null, 'c');
      },
      () => {
        useMemo(() => 1, []);
        return h('i', null, 'c');
      },
    ]) {
      const box = makeContainer();
      const comp = new FunctionComponent(() => h('div', null, h(Child, null)));
      expect(() => comp.mount(box)).toThrow(/hook/i);
      expect(box.childNodes).toHaveLength(0);
    }
  });

  it('TC-EFF-071 EG: 같은 자리의 hook 종류가 바뀌면 "hook" Error (useState↔useMemo, useState↔useEffect, useEffect↔useMemo), DOM·hooks 그대로, 되돌리면 정상', () => {
    const variants = [
      (swap) => (swap ? useMemo(() => 0, []) : useState(0)),
      (swap) => (swap ? useState(0) : useMemo(() => 0, [])),
      (swap) => (swap ? useEffect(() => {}, []) : useState(0)),
      (swap) => (swap ? useMemo(() => 0, []) : useEffect(() => {}, [])),
      (swap) => {
        if (swap) {
          useEffect(() => {}, []);
          useState(0);
        } else {
          useState(0);
          useEffect(() => {}, []);
        }
      },
    ];
    for (const use of variants) {
      let swap = false;
      const cleanup = vi.fn();
      const effect = vi.fn(() => cleanup);
      let label = 'a';
      const comp = new FunctionComponent(() => {
        use(swap);
        useEffect(effect);
        return h('p', null, label);
      });
      const container = makeContainer();
      comp.mount(container);
      const vnodeBefore = comp.vnode;
      const hooksBefore = comp.hooks.length;

      swap = true;
      label = 'b';
      expect(() => comp.update()).toThrow(/hook/i);
      expect(container.innerHTML).toBe('<p>a</p>');
      expect(comp.vnode).toBe(vnodeBefore);
      expect(comp.hooks).toHaveLength(hooksBefore);
      expect(effect).toHaveBeenCalledTimes(1);
      expect(cleanup).not.toHaveBeenCalled();
      expect(getCurrentComponent()).toBeNull();

      swap = false;
      expect(() => comp.update()).not.toThrow();
      expect(container.innerHTML).toBe('<p>b</p>');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useMemo', () => {
  it('TC-MEMO-001 첫 렌더: compute 를 렌더 중에 인자 없이 1번 부르고 그 값을 돌려준다, hook 1개', () => {
    const compute = vi.fn(() => ({ big: 7 }));
    const comp = new FunctionComponent(() => {
      const v = useMemo(compute, [1]);
      return h('p', null, String(v.big));
    });
    const container = makeContainer();
    comp.mount(container);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute.mock.calls[0]).toEqual([]);
    expect(container.innerHTML).toBe('<p>7</p>');
    expect(comp.hooks).toHaveLength(1);
  });

  it('TC-MEMO-002 DT: deps 같으면 이전 값(같은 참조, compute 안 부름), 다르면 다시 계산', () => {
    let a = 1;
    let b = 2;
    const compute = vi.fn(() => ({ sum: a + b }));
    const seen = [];
    const comp = new FunctionComponent(() => {
      seen.push(useMemo(compute, [a, b]));
      return null;
    });
    comp.mount(makeContainer());
    comp.update();
    expect(seen[1]).toBe(seen[0]);
    expect(compute).toHaveBeenCalledTimes(1);

    b = 3;
    comp.update();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(seen[2]).toEqual({ sum: 4 });
    expect(seen[2]).not.toBe(seen[0]);

    comp.update();
    expect(seen[3]).toBe(seen[2]);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('TC-MEMO-003 DT: deps 생략·null 은 렌더마다 계산, [] 는 첫 렌더에만', () => {
    for (const [deps, expected] of [
      [undefined, 3],
      [null, 3],
      [[], 1],
    ]) {
      const compute = vi.fn(() => ({}));
      const comp = new FunctionComponent(() => {
        useMemo(compute, deps);
        return null;
      });
      comp.mount(makeContainer());
      comp.update();
      comp.update();
      expect([deps, compute.mock.calls.length]).toEqual([deps, expected]);
    }
  });

  it('TC-MEMO-004 BVA: Object.is 원소 비교와 길이 변화 (NaN 같음, 0→-0 다름, 새 객체 다름, 길이 바뀌면 다름)', () => {
    const obj = {};
    let deps = [NaN];
    const compute = vi.fn(() => ({}));
    const comp = new FunctionComponent(() => {
      useMemo(compute, deps);
      return null;
    });
    comp.mount(makeContainer());
    const counts = [];
    for (const next of [[NaN], [0], [-0], [-0], [obj], [obj], [{}], [{}, 1], [{}]]) {
      deps = next;
      comp.update();
      counts.push(compute.mock.calls.length);
    }
    // [NaN] 같음, [0] 다름, [-0] 다름, 같음, obj 다름, 같음, 새 객체 다름, 길이 변화 다름, 길이 변화 다름
    expect(counts).toEqual([1, 2, 3, 3, 4, 4, 5, 6, 7]);
  });

  it('TC-MEMO-005 BVA: compute 결과가 undefined / null / 0 / false / \'\' 여도 저장하고 다시 계산하지 않는다', () => {
    for (const value of [undefined, null, 0, false, '']) {
      const compute = vi.fn(() => value);
      const seen = [];
      const comp = new FunctionComponent(() => {
        seen.push(useMemo(compute, []));
        return null;
      });
      comp.mount(makeContainer());
      comp.update();
      comp.update();
      expect(compute).toHaveBeenCalledTimes(1);
      expect(seen.every((s) => Object.is(s, value))).toBe(true);
    }
  });

  it('TC-MEMO-006 EG: compute 가 던지면 렌더 예외 — 첫 렌더는 mount 실패(hooks []), 이후는 DOM 그대로·슬롯은 이전 값과 deps 유지', () => {
    let fail = true;
    const box = makeContainer();
    const first = new FunctionComponent(() => {
      const v = useMemo(() => {
        if (fail) throw new Error('memo boom');
        return 'ok';
      }, []);
      return h('p', null, v);
    });
    expect(() => first.mount(box)).toThrow('memo boom');
    expect(box.childNodes).toHaveLength(0);
    expect(first.hooks).toEqual([]);
    fail = false;
    first.mount(box);
    expect(box.innerHTML).toBe('<p>ok</p>');

    let key = 1;
    let broken = false;
    const compute = vi.fn(() => {
      if (broken) throw new Error('recompute boom');
      return { key };
    });
    const seen = [];
    const comp = new FunctionComponent(() => {
      const v = useMemo(compute, [key]);
      seen.push(v);
      return h('p', null, String(v.key));
    });
    const container = makeContainer();
    comp.mount(container);
    const original = seen[0];

    key = 2;
    broken = true;
    expect(() => comp.update()).toThrow('recompute boom');
    expect(container.innerHTML).toBe('<p>1</p>');

    // 이전 deps [1] 로 돌아오면 compute 없이 이전 값
    key = 1;
    broken = false;
    compute.mockClear();
    comp.update();
    expect(compute).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(original);

    key = 2;
    comp.update();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('<p>2</p>');
  });

  it('TC-MEMO-007 EG: compute 안에서 hook 을 부르면 "hook" Error (첫 계산은 mount 실패, 다시 계산은 update 실패·DOM 그대로)', () => {
    const box = makeContainer();
    const first = new FunctionComponent(() => {
      const v = useMemo(() => {
        useState(0);
        return 'x';
      }, []);
      return h('p', null, v);
    });
    expect(() => first.mount(box)).toThrow(/hook/i);
    expect(box.childNodes).toHaveLength(0);
    expect(first.hooks).toEqual([]);

    let key = 1;
    const comp = new FunctionComponent(() => {
      const [s] = useState('s');
      const v = useMemo(() => {
        if (key === 2) useState('inner');
        return `${s}${key}`;
      }, [key]);
      return h('p', null, v);
    });
    const container = makeContainer();
    comp.mount(container);
    key = 2;
    expect(() => comp.update()).toThrow(/hook/i);
    expect(container.innerHTML).toBe('<p>s1</p>');
    expect(comp.hooks).toHaveLength(2);
    expect(getCurrentComponent()).toBeNull();
  });

  it('TC-MEMO-008 EG: compute 가 함수가 아니거나 deps 가 배열·undefined·null 이 아니면 "useMemo:" TypeError', () => {
    const cases = [
      [5, []],
      [null, []],
      [undefined, []],
      [() => 1, 5],
      [() => 1, 'ab'],
      [() => 1, { length: 0 }],
    ];
    for (const [compute, deps] of cases) {
      const box = makeContainer();
      const comp = new FunctionComponent(() => {
        useMemo(compute, deps);
        return h('p', null, 'x');
      });
      const e = caught(() => comp.mount(box));
      expect(e).toBeInstanceOf(TypeError);
      expect(e.message).toMatch(/^useMemo:/);
      expect(box.childNodes).toHaveLength(0);
    }
  });
});

// custom element 의 attributeChangedCallback 은 setAttribute 안에서(동기로) 불린다: commit 도중의 setState.
let ceSeq = 0;
function defineEcho(onChange) {
  const name = `x-eff-echo-${++ceSeq}`;
  customElements.define(
    name,
    class extends HTMLElement {
      static get observedAttributes() {
        return ['data-v'];
      }
      attributeChangedCallback(_attr, _old, value) {
        onChange(value);
      }
    },
  );
  return name;
}

// ─────────────────────────────────────────────────────────────────────────────
// #9 리뷰에서 재현된 결함 (사용자 결정: 고친다). 계약은 맨 위 "#9 리뷰" 표시 절.
describe('리뷰 보강(#9)', () => {
  it('TC-EFF-090 (1) appendChild 단계의 mount 실패(Text / document container): hooks []·hookIndex 0·종류 초기화, 다시 mount 하면 init 다시, 옛 setState 무시', async () => {
    for (const bad of [() => document.createTextNode('x'), () => document]) {
      let init = 0;
      let useEffectFirst = true;
      const setters = [];
      const fn = vi.fn(() => {
        if (useEffectFirst) {
          useEffect(() => {});
          const [, s] = useState(() => ++init);
          setters.push(s);
        } else {
          const [n, s] = useState(() => ++init);
          setters.push(s);
          useEffect(() => {});
          return h('p', null, String(n));
        }
        return h('p', null, 'x');
      });
      const comp = new FunctionComponent(fn);

      const e = caught(() => comp.mount(bad()));
      expect(e).not.toBeNull();
      expect(e.name).toBe('HierarchyRequestError');
      expect(comp.hooks).toEqual([]);
      expect(comp.hookIndex).toBe(0);
      expect(comp.container).toBeNull();

      // 다른 hook 순서로 다시 mount 해도 종류 Error 가 나지 않고, init 을 다시 부른다
      useEffectFirst = false;
      const box = makeContainer();
      expect(() => comp.mount(box)).not.toThrow();
      expect(init).toBe(2);
      expect(box.innerHTML).toBe('<p>2</p>');

      fn.mockClear();
      expect(() => setters[0](99)).not.toThrow();
      await flush();
      expect(fn).not.toHaveBeenCalled();
      expect(box.innerHTML).toBe('<p>2</p>');
    }
  });

  it('TC-EFF-091 (2) effect 안에서 setState 뒤 자기 unmount: TypeError 없이 mount 가 돌아오고(null), 재렌더 없음, container 비어 있음', () => {
    let comp;
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        if (n === 0) {
          setN(1);
          comp.unmount();
        }
      });
      return h('div', null, String(n));
    });
    comp = new FunctionComponent(fn);
    const container = makeContainer();
    let ret;
    expect(() => {
      ret = comp.mount(container);
    }).not.toThrow();
    expect(ret).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(container.childNodes).toHaveLength(0);
    expect(comp.dom).toBeNull();
  });

  it('TC-EFF-092 (2) 다른 컴포넌트를 거친 unmount: B 의 effect 가 A.update(), A 의 effect 가 B.unmount() → B.update 는 예외 없음, B 의 남은 effect·재렌더 없음', () => {
    let go = false;
    const later = vi.fn();
    let A;
    let B;
    const fnB = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        if (go) {
          setN((p) => p + 1);
          A.update();
        }
      });
      useEffect(() => later());
      return h('b', null, String(n));
    });
    B = new FunctionComponent(fnB);
    A = new FunctionComponent(() => {
      useEffect(() => {
        if (go) B.unmount();
      });
      return h('i', null, 'a');
    });
    const boxA = makeContainer();
    const boxB = makeContainer();
    A.mount(boxA);
    B.mount(boxB);
    later.mockClear();
    fnB.mockClear();

    go = true;
    expect(() => B.update()).not.toThrow();
    go = false;
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    expect(boxB.childNodes).toHaveLength(0);
    expect(boxA.innerHTML).toBe('<i>a</i>');
  });

  it('TC-EFF-093 (3) effect 단계 도중 self unmount: 남은 effect 는 실행하지 않고, 실행된 effect 의 cleanup 은 정확히 1번 (누수 없음)', () => {
    const log = [];
    let comp;
    comp = new FunctionComponent(() => {
      useEffect(() => {
        log.push('A');
        return () => log.push('cA');
      }, []);
      useEffect(() => {
        log.push('B');
        comp.unmount();
      }, []);
      useEffect(() => {
        log.push('C');
        return () => log.push('cC');
      }, []);
      return h('div');
    });
    const container = makeContainer();
    expect(() => comp.mount(container)).not.toThrow();
    expect(() => comp.unmount()).not.toThrow();
    expect(log).toEqual(['A', 'B', 'cA']);
    expect(container.childNodes).toHaveLength(0);
  });

  it('TC-EFF-094 (3) cleanup 단계 도중 self unmount: 각 cleanup 1번, 새 effect 는 실행하지 않음, update 는 예외 없음', () => {
    const log = [];
    let v = 0;
    let comp;
    comp = new FunctionComponent(() => {
      const cur = v;
      useEffect(() => {
        log.push(`eA${cur}`);
        return () => {
          log.push(`cA${cur}`);
          comp.unmount();
        };
      }, [cur]);
      useEffect(() => {
        log.push(`eB${cur}`);
        return () => log.push(`cB${cur}`);
      }, [cur]);
      return h('p', null, String(cur));
    });
    const container = makeContainer();
    comp.mount(container);

    v = 1;
    expect(() => comp.update()).not.toThrow();
    expect(log).toEqual(['eA0', 'eB0', 'cA0', 'cB0']);
    expect(container.childNodes).toHaveLength(0);
    expect(() => comp.unmount()).not.toThrow();
    expect(log).toHaveLength(4);
  });

  it('TC-EFF-095 (4) 다른 컴포넌트의 렌더 안에서 mount 된 B 의 effect: getCurrentComponent() 는 null, 그 안의 hook 은 "hook" Error, A 의 슬롯 그대로', () => {
    let seen = 'unset';
    let hookError = null;
    const other = makeContainer();
    const B = new FunctionComponent(() => {
      useEffect(() => {
        seen = getCurrentComponent();
        try {
          useState('intruder');
        } catch (e) {
          hookError = e;
        }
      });
      return h('i', null, 'b');
    });
    const A = new FunctionComponent(() => {
      const [a] = useState('a');
      if (!B.container) B.mount(other);
      return h('p', null, a);
    });
    const box = makeContainer();
    A.mount(box);

    expect(seen).toBeNull();
    expect(hookError).not.toBeNull();
    expect(hookError.message).toMatch(/hook/i);
    expect(A.hooks).toHaveLength(1);
    expect(box.innerHTML).toBe('<p>a</p>');
    expect(other.innerHTML).toBe('<i>b</i>');
    expect(() => A.update()).not.toThrow();
  });

  it('TC-EFF-096 (5a) effect 가 setState 한 뒤 같은 단계에서 던지면 그 재렌더는 버린다: 다음 update 는 fn 1번, 반환 TEXT 1건', () => {
    let boom = false;
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      useEffect(() => {
        if (boom) {
          setN(5);
          throw new Error('effect boom');
        }
      });
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    boom = true;
    expect(() => comp.update()).toThrow('effect boom');
    boom = false;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('<p>0</p>');

    fn.mockClear();
    const ret = comp.update();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(ret).toHaveLength(1);
    expect(ret[0].type).toBe('TEXT');
    expect(ret[0].text).toBe('5');
    expect(container.innerHTML).toBe('<p>5</p>');
  });

  it('TC-EFF-097 (7) effect 가 일으킨 재렌더가 렌더 예외로 끝남: 앞선 effect 는 실행됨, mount 가 그 예외, mount 된 상태·DOM 일치, 고치면 정상', () => {
    let breakIt = true;
    const log = [];
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      if (n === 1 && breakIt) throw new Error('rerender boom');
      useEffect(() => {
        log.push(n);
        if (n === 0) setN(1);
      }, [n]);
      return h('p', null, String(n));
    });
    const container = makeContainer();
    expect(() => comp.mount(container)).toThrow('rerender boom');
    expect(log).toEqual([0]);
    expect(comp.container).toBe(container);
    expect(container.innerHTML).toBe('<p>0</p>');
    expectConsistent(comp, container);

    breakIt = false;
    expect(() => comp.update()).not.toThrow();
    expect(container.innerHTML).toBe('<p>1</p>');
    expect(log).toEqual([0, 1]);
  });

  it('TC-EFF-098 (7) effect 가 일으킨 재렌더가 patch 예외로 끝남: DOM 은 이전 vnode 로 복구, mount 된 상태, 그 뒤 effect 단계 없음', () => {
    let breakIt = true;
    const log = [];
    const comp = new FunctionComponent(() => {
      const [bad, setBad] = useState(false);
      useEffect(() => {
        log.push(bad);
        if (!bad) setBad(true);
      }, [bad]);
      return h('ul', null, h('li', null, 'a'), bad ? h('li', breakIt ? { 'x y': '1' } : null, 'c') : null);
    });
    const container = makeContainer();
    const e = caught(() => comp.mount(container));
    expect(e).not.toBeNull();
    expect(e.name).toBe('InvalidCharacterError');
    expect(log).toEqual([false]);
    expect(comp.container).toBe(container);
    expect(container.innerHTML).toBe('<ul><li>a</li></ul>');
    expectConsistent(comp, container);

    breakIt = false;
    comp.update();
    expect(container.innerHTML).toBe('<ul><li>a</li><li>c</li></ul>');
    expect(log).toEqual([false, true]);
  });

  it('TC-MEMO-009 (5b) BVA: 같은 원소 참조로 길이만 바뀜 [o] → [o, 1] → [o, 1] → [o] 은 다시 계산 (누적 2, 2, 3)', () => {
    const o = {};
    let deps = [o];
    const compute = vi.fn(() => ({}));
    const comp = new FunctionComponent(() => {
      useMemo(compute, deps);
      return null;
    });
    comp.mount(makeContainer());
    const counts = [];
    for (const next of [[o, 1], [o, 1], [o]]) {
      deps = next;
      comp.update();
      counts.push(compute.mock.calls.length);
    }
    expect(counts).toEqual([2, 2, 3]);
  });
});
