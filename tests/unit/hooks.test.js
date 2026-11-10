// useState 의 API 계약 (이슈 #8). 이 파일이 명세다.
// 토대는 src/core/component.js 이고 그 계약(tests/unit/component.test.js 맨 위 주석)을 그대로 따른다:
// hook 은 루트 fn 렌더 중에만, hook 개수 검사, init 예외 규칙, 렌더 중 재진입(25회 한도).
//
// import { useState } from '../../src/core/hooks.js';
// (#9 의 useEffect / useMemo 도 같은 파일에 더한다. #10 batching 은 src/core/scheduler.js)
//
// ── useState(initial) → [state, setState] ─────────────────────────────────────
//   - 현재 컴포넌트의 hook 슬롯 하나를 쓴다 (useHookSlot 위에 만든다). 호출 1번 = hook 1개.
//     반환값은 길이 2 배열: [0] 지금 상태, [1] setState 함수.
//   - 첫 렌더: initial 이 함수면 인자 없이 **한 번만** 불러 그 결과가 상태(lazy). 아니면 initial 그대로
//     (undefined / null / 0 / '' / false / NaN / 객체 참조 모두 그대로). 이후 렌더에서는 initial 을
//     무시한다 (값이 바뀌어도, 함수여도 부르지 않는다).
//   - lazy init 이 던지면 useHookSlot 의 init 예외 규칙과 같다: 그 예외가 그대로 전파된다
//     (mount 중이면 mount 실패, hooks [] ).
//   - 렌더 밖, 자식 함수 컴포넌트 안에서 부르면 Error (메시지에 "hook"). 조건부 호출은 hook 개수 Error.
//
// ── setState(next) → undefined ────────────────────────────────────────────────
//   - next 가 함수면 업데이터: next(최신 상태) 의 반환값이 새 상태. "최신" = 이 슬롯에 지금 저장된 값
//     (같은 이벤트에서 여러 번 불러도 누적된다). 업데이터는 setState 1번에 1번 부른다.
//     함수 자체를 상태로 저장하려면 () => fn 처럼 감싼다.
//   - 함수가 아니면 그 값이 새 상태. 인자 없이 부르면 undefined.
//   - Object.is(이전, 새) 면 아무것도 하지 않는다 (렌더 없음). NaN → NaN 은 같음, 0 → -0 은 다름,
//     내용이 같아도 새 객체면 다름.
//   - 다르면 슬롯에 새 상태를 저장하고 그 컴포넌트를 다시 렌더한다. 언제 렌더하는지는 부른 자리에 따라 다르다.
//       batch 밖(직접 addEventListener 한 리스너, setTimeout·Promise 콜백, 최상위 코드 등, 그 컴포넌트가 렌더·
//         commit·effect 단계 중이 아닐 때): **동기로** update() → diff → patch. setState 가 돌아오면 DOM 에 반영돼
//         있다. 아래 "동기 반영" describe 는 이 경우를 batch 밖에서 확인한다.
//       batch 안(이 라이브러리가 붙인 on* 핸들러(runHandler)와 batch(fn) 안, #10): 표시만 하고 가장 바깥 batch 가
//         끝날 때 컴포넌트마다 1번 렌더한다. 계약은 tests/unit/batching.test.js 맨 위 (TC-HOOK-022 가 이에 맞춰
//         바뀌었다). 나머지 테스트는 setState 뒤 flush() 를 기다리고 확인하므로 어느 경우든 유효하다.
//       렌더 중(같은 컴포넌트의 루트 fn·자식 함수): component 의 재진입 규칙 그대로. 지금 렌더가 commit 된
//         뒤 동기로 다시 렌더하고, 그 사이 여러 setState 는 누적되어 재렌더 1번이다. 매 렌더 상태를 바꾸면
//         25회 초과 Error. 렌더 중 같은 값으로 setState 하면 재렌더 없음. **batch 안이어도 같다** (그 컴포넌트가
//         렌더·commit·effect 단계 중이면 batch 표시가 아니라 그 update()/mount() 호출 안에서 다시 렌더한다).
//   - 반환값은 항상 undefined (patch 목록을 돌려주지 않는다).
//   - setState 의 정체성: 같은 슬롯이면 렌더가 바뀌어도 **같은 함수 객체**. 슬롯이 다르거나
//     컴포넌트 인스턴스가 다르면 다른 함수.
//   - 오래된 클로저: 이전 렌더에서 꺼낸 setState 도 자기 슬롯에 쓰고, 업데이터는 최신 상태를 받는다.
//
// ── 예외와 생명주기 ─────────────────────────────────────────────────────────────
//   - update 가 예외로 끝나면(렌더가 던짐, hook 개수 Error, patch 예외, 25회 초과) 그 예외를 그대로 던진다.
//     batch 밖(동기 렌더)이면 setState 가 던진다. batch 안이면 setState 는 표시만 하고 던지지 않으며, 그 표시를
//     처리한 batch 가 던진다 (batching 계약의 "끝까지 하고 첫 예외"). 어느 경우든
//     **상태는 되돌리지 않는다**: 슬롯에는 새 값이 남고 DOM·comp.vnode 는
//     component 계약대로 이전 그대로다. 그래서 같은 값으로 다시 setState 하면 Object.is 로 아무것도 하지
//     않고, 다음 update() 가 남은 값을 그린다.
//   - 업데이터가 던지면 그 예외를 그대로 던지고 상태도 렌더도 바뀌지 않는다.
//   - mount 가 실패한 컴포넌트의 setState(그 실패한 렌더에서 꺼낸 것)는 **조용히 무시**한다: 던지지 않고,
//     렌더하지 않으며, 나중에 다시 mount 한 컴포넌트의 상태에도 영향이 없다 (다시 mount 하면 슬롯이 새로
//     생기고 setState 도 새 함수다). mount 전에 setState 를 얻는 길은 첫 렌더 안뿐이고, 그 안에서
//     부르는 것은 위의 "렌더 중" 규칙이다.
//
// ── #8 리뷰에서 재현된 결함으로 더한 규칙 (TC-HOOK-028~041, E2E-HOOK-*) ─────────────
//   hook 실행 규칙
//   - (e2) init 안에서는 **같은 컴포넌트의** hook 을 부를 수 없다: useState 의 lazy init, useHookSlot 의 init
//     안에서 그 컴포넌트의 hook 을 부르면 "hook" Error (대소문자 무관). 슬롯이 뒤섞이지 않고, 예외는 init 예외
//     규칙대로 전파된다 (mount 중이면 mount 실패, hooks [], container 그대로).
//     (r8) init 안에서 **다른** FunctionComponent 를 mount 하는 것(그 컴포넌트가 자기 렌더에서 hook 을 쓰는 것)은
//     허용한다: 둘 다 성공하고 각자 슬롯을 가지며, init 이 끝난 뒤 바깥 컴포넌트의 다음 hook 도 정상이다 (TC-HOOK-040).
//   - (e3) commit 도중(첫 mount 의 render·appendChild, update 의 patch 적용) 같은 컴포넌트의 setState /
//     update() 는 렌더 중과 같다: 상태만 저장하고 "다시 필요" 표시, commit 이 끝난 뒤 같은 호출 안에서
//     동기로 재렌더. 재렌더 25회 한도는 렌더 중 재진입과 **공유**한다. 결과는 항상 DOM = render(comp.vnode).
//     (예: custom element 의 attributeChangedCallback 이 patch 의 setAttribute 안에서 setState)
//   - (e4) 업데이터(setState 에 넘긴 함수) 실행 중에 setState(어느 슬롯이든) 를 부르면 Error. 업데이터 예외
//     규칙대로 바깥 setState 가 그 예외를 던지고, 어느 상태도 바뀌지 않으며 렌더도 없다.
//   제어 요소 (controlled) — 원칙: VNode 에 value / checked 가 있는 요소의 화면 값은 항상 마지막 VNode 값이다.
//   - (e1, 재리뷰 r1·r2·r6 으로 고침 — React 방식) 되돌리기 규칙
//       언제: **값을 바꾸는 이벤트 input / change / click** 의 dispatch 가 끝난 **뒤**에만. 그 이벤트의 경로에
//         이 라이브러리가 붙인 **그 이벤트 종류의** 핸들러(onInput / onChange / onClick)가 하나라도 있을 때만.
//         keydown·keyup·mousemove·scroll 등 다른 이벤트는 (핸들러가 있어도) 되돌리기를 일으키지 않는다.
//         핸들러 직후 동기로 되돌리지 않는다: click 의 activation 뒤에 오는 input / change 핸들러는 토글된
//         값(e.target.checked 등)을 본다. 확인 시점: 이벤트(와 activation 이 낸 input/change)가 끝나고 flush() 뒤.
//       무엇을: 그 이벤트 경로에 있는 제어 요소(VNode 에 value / checked 가 있는 요소)와, 경로에 있는 radio 와
//         같은 name(같은 form, form 이 없으면 같은 문서)의 제어 radio 전부. 값은 마지막 VNode 값.
//       VNode 에 value / checked 가 없는 요소(비제어)는 건드리지 않는다.
//       예: `{value:v, onChange}` 인 input 에 타이핑 → input 이벤트 경로에 onInput 이 없으므로 되돌리지 않아
//         화면에 타이핑한 값이 남고, blur 로 change 가 오면 onChange 가 상태를 바꾼다. onKeyDown 이 더 있어도 같다.
//       예: 체크박스 `{checked:on, onChange: e => setOn(e.target.checked)}` 를 onClick 이 있는 부모 안에서
//         클릭 → change 핸들러가 true 를 보고 상태 true, 화면 true.
//   - (e5) 체크박스 onClick 에서 preventDefault + setState 해도, dispatch 가 끝난 뒤 .checked 는 상태 값이다
//     (브라우저가 취소된 activation 을 dispatch 뒤에 되돌리는 것까지 이긴다). 실제 클릭은 e2e 로 고정.
//   - (e6) textarea 에 value prop 과 텍스트 자식이 같이 있으면 .value 는 value prop (render·patch 모두).
//   - (e7) select 의 value 는 option 을 다 만든 뒤 적용한 것과 같다 (render·patch 모두).
//     (r4·r5) option 의 value / selected 가 select 의 value 와 같은 patch 에서 바뀌어도 patch 결과 = render(new):
//     select 의 value prop 이 이긴다 (TC-PATCH-115~116).
//   render / patch 수준 단언은 TC-RND-016, TC-PATCH-113~116. 어느 계층에서 고치는지는 정하지 않는다.
//
// ── 정하지 않음 (테스트 없음) ────────────────────────────────────────────────────
//   - 첫 mount 렌더에서 매번 setState 해 25회를 넘는 경우의 mount 결과.
//   - 렌더 중, useState 를 부르기 전에 오래된 setState 로 그 슬롯을 바꾸는 경우의 이번 렌더 값.
//   - 다른 컴포넌트의 렌더 중에 이 컴포넌트의 setState 를 부르는 경우.
//   - 컴포넌트 밖에서 직접 addEventListener 한 리스너가 끝난 뒤의 제어 요소 값 (e1 은 컴포넌트 핸들러만).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from '../../src/core/hooks.js';
import { FunctionComponent, getCurrentComponent, useHookSlot } from '../../src/core/component.js';
import { render } from '../../src/vdom/render.js';
import { h } from '../../src/vdom/vnode.js';

function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

// 콜백으로 전달된 기록과 아직 쌓여 있는 기록을 모두 모은다 (await 뒤에도 기록을 잃지 않게).
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

function allNodes(root) {
  const out = [root];
  for (const child of root.childNodes) out.push(...allNodes(child));
  return out;
}

// 다음 작업까지 기다린다. batch 렌더는 batch 가 돌아올 때 끝나므로 렌더를 기다리는 용도는 아니고,
// 다음 작업에서 하는 일(제어 요소 되돌리기 등)과 Promise 콜백을 끝내기 위해 쓴다.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
describe('useState: 초기값과 호출 규칙', () => {
  it('TC-HOOK-001 첫 렌더: [initial, 함수] 길이 2 배열, hook 1개', () => {
    let got;
    const comp = new FunctionComponent(() => {
      got = useState(42);
      return h('p', null, String(got[0]));
    });
    const container = makeContainer();
    comp.mount(container);

    expect(Array.isArray(got)).toBe(true);
    expect(got).toHaveLength(2);
    expect(got[0]).toBe(42);
    expect(typeof got[1]).toBe('function');
    expect(comp.hooks).toHaveLength(1);
    expect(container.innerHTML).toBe('<p>42</p>');
  });

  it('TC-HOOK-002 initial 이 undefined / 생략 / null / 0 / \'\' / false / NaN / 객체면 그대로 (객체는 같은 참조)', () => {
    const obj = { a: 1 };
    const cases = [[undefined], [], [null], [0], [''], [false], [NaN], [obj]];
    for (const args of cases) {
      let state = 'unset';
      const comp = new FunctionComponent(() => {
        [state] = useState(...args);
        return h('p', null, 'x');
      });
      comp.mount(makeContainer());
      if (args.length === 0) expect(state).toBeUndefined();
      else expect(Object.is(state, args[0])).toBe(true);
    }
  });

  it('TC-HOOK-003 lazy init: 함수 initial 은 첫 렌더에 인자 없이 1번만, 이후 렌더는 initial 을 무시 (값이 바뀌어도)', () => {
    const init = vi.fn(() => 10);
    const seen = [];
    const lazy = new FunctionComponent(() => {
      const [n] = useState(init);
      seen.push(n);
      return h('p', null, String(n));
    });
    lazy.mount(makeContainer());
    lazy.update();
    lazy.update();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]).toEqual([]);
    expect(seen).toEqual([10, 10, 10]);

    let start = 1;
    const values = [];
    const plain = new FunctionComponent(() => {
      const [n] = useState(start);
      values.push(n);
      return h('p', null, String(n));
    });
    const box = makeContainer();
    plain.mount(box);
    start = 5;
    plain.update();
    expect(values).toEqual([1, 1]);
    expect(box.innerHTML).toBe('<p>1</p>');
  });

  it('TC-HOOK-004 lazy init 이 던지면 mount 가 같은 예외로 실패 (container 그대로, hooks []), 고친 뒤 다시 mount 하면 init 을 다시 부른다', () => {
    let fail = true;
    const init = vi.fn(() => {
      if (fail) throw new Error('init boom');
      return 'ok';
    });
    const comp = new FunctionComponent(() => {
      const [v] = useState(init);
      return h('p', null, v);
    });
    const box = makeContainer();
    expect(() => comp.mount(box)).toThrow('init boom');
    expect(box.childNodes).toHaveLength(0);
    expect(comp.hooks).toEqual([]);
    expect(getCurrentComponent()).toBeNull();

    fail = false;
    comp.mount(box);
    expect(box.innerHTML).toBe('<p>ok</p>');
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('TC-HOOK-005 렌더 밖, 자식 함수 컴포넌트 안에서 useState → "hook" Error', () => {
    expect(() => useState(0)).toThrow(/hook/i);

    const Child = () => {
      const [n] = useState(0);
      return h('span', null, String(n));
    };
    const box = makeContainer();
    const comp = new FunctionComponent(() => h('div', null, h(Child)));
    expect(() => comp.mount(box)).toThrow(/hook/i);
    expect(box.childNodes).toHaveLength(0);
    expect(comp.hooks).toHaveLength(0);
  });

  it('TC-HOOK-006 조건부 useState: 개수가 달라지면 "hook" Error, DOM 그대로, 원래대로 돌아오면 같은 상태', async () => {
    let cond = true;
    let setB;
    const comp = new FunctionComponent(() => {
      const [a] = cond ? useState('A') : ['-'];
      const [b, s] = useState('B');
      setB = s;
      return h('p', null, a + b);
    });
    const container = makeContainer();
    comp.mount(container);

    cond = false;
    expect(() => comp.update()).toThrow(/hook/i);
    expect(container.innerHTML).toBe('<p>AB</p>');
    expect(comp.hooks).toHaveLength(2);

    cond = true;
    comp.update();
    expect(container.innerHTML).toBe('<p>AB</p>');
    setB('C');
    await flush();
    expect(container.innerHTML).toBe('<p>AC</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('setState: 값과 업데이터', () => {
  it('TC-HOOK-007 setState(값) → 다시 렌더해 화면 반영, 이후 update 에서도 그 값이 유지, 반환값 undefined', async () => {
    let setN;
    const seen = [];
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      seen.push(n);
      return h('p', null, String(n));
    });
    const container = makeContainer();
    comp.mount(container);

    expect(setN(7)).toBeUndefined();
    await flush();
    expect(container.innerHTML).toBe('<p>7</p>');

    comp.update();
    comp.update();
    expect(container.innerHTML).toBe('<p>7</p>');
    expect(seen[seen.length - 1]).toBe(7);

    setN('seven');
    await flush();
    expect(container.innerHTML).toBe('<p>seven</p>');
  });

  it('TC-HOOK-008 업데이터는 최신 상태를 받는다: 한 핸들러에서 p => p + 1 세 번 → 3, 업데이터 인자 0·1·2, 각 1번', async () => {
    const args = [];
    const inc = (p) => {
      args.push(p);
      return p + 1;
    };
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: () => {
            setN(inc);
            setN(inc);
            setN(inc);
          },
        },
        String(n),
      );
    });
    const container = makeContainer();
    const button = comp.mount(container);

    button.click();
    await flush();
    expect(args).toEqual([0, 1, 2]);
    expect(container.innerHTML).toBe('<button>3</button>');

    button.click();
    await flush();
    expect(args).toEqual([0, 1, 2, 3, 4, 5]);
    expect(container.innerHTML).toBe('<button>6</button>');
  });

  it('TC-HOOK-009 값으로 넘기면 클로저의 값 기준: 한 핸들러에서 setN(n + 1) 세 번 → 1', async () => {
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: () => {
            setN(n + 1);
            setN(n + 1);
            setN(n + 1);
          },
        },
        String(n),
      );
    });
    const container = makeContainer();
    comp.mount(container);

    container.firstChild.click();
    await flush();
    expect(container.innerHTML).toBe('<button>1</button>');
  });

  it('TC-HOOK-010 Object.is 가 같으면 렌더하지 않는다: 같은 원시값, NaN → NaN, 같은 객체 참조, prev 를 돌려주는 업데이터', async () => {
    const obj = { k: 1 };
    for (const [initial, next] of [
      [5, 5],
      ['a', 'a'],
      [NaN, NaN],
      [null, null],
      [undefined, undefined],
      [obj, obj],
      [3, (p) => p],
    ]) {
      let set;
      const fn = vi.fn(() => {
        const [v, s] = useState(initial);
        set = s;
        return h('p', null, typeof v);
      });
      const comp = new FunctionComponent(fn);
      const container = makeContainer();
      comp.mount(container);
      const rec = record(container);
      fn.mockClear();

      expect(() => set(next)).not.toThrow();
      await flush();

      expect(fn).not.toHaveBeenCalled();
      expect(rec.take()).toHaveLength(0);
      rec.stop();
    }
  });

  it('TC-HOOK-011 Object.is 가 다르면 렌더한다: 0 → -0, 내용 같은 새 객체, undefined → null, 인자 없이 호출 → undefined', async () => {
    const obj = { k: 1 };
    for (const [initial, args, check] of [
      [0, [-0], (v) => Object.is(v, -0)],
      [obj, [{ k: 1 }], (v) => v !== obj && v.k === 1],
      [undefined, [null], (v) => v === null],
      [1, [], (v) => v === undefined],
    ]) {
      let set;
      let last = 'unset';
      const fn = vi.fn(() => {
        const [v, s] = useState(initial);
        set = s;
        last = v;
        return h('p', null, 'x');
      });
      const comp = new FunctionComponent(fn);
      comp.mount(makeContainer());
      fn.mockClear();

      set(...args);
      await flush();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(check(last)).toBe(true);
    }
  });

  it('TC-HOOK-012 setState 정체성: 렌더 사이에 같은 함수, 슬롯마다 다른 함수, 인스턴스마다 다른 함수', async () => {
    const renders = new Map();
    const fn = () => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      const me = getCurrentComponent();
      if (!renders.has(me)) renders.set(me, []);
      renders.get(me).push({ setA, setB });
      return h('p', null, `${a},${b}`);
    };
    const c1 = new FunctionComponent(fn);
    const c2 = new FunctionComponent(fn);
    c1.mount(makeContainer());
    c2.mount(makeContainer());
    c1.update();
    renders.get(c1)[0].setA(1);
    await flush();
    c1.update();

    const r1 = renders.get(c1);
    expect(r1.length).toBeGreaterThanOrEqual(3);
    for (const r of r1) {
      expect(r.setA).toBe(r1[0].setA);
      expect(r.setB).toBe(r1[0].setB);
    }
    expect(r1[0].setA).not.toBe(r1[0].setB);
    const r2 = renders.get(c2);
    expect(r2[0].setA).not.toBe(r1[0].setA);
    expect(r2[0].setB).not.toBe(r1[0].setB);
  });

  it('TC-HOOK-013 여러 useState 는 독립: setB 는 b 만 바꾸고 a 는 유지, hook 2개', async () => {
    let setA;
    let setB;
    const comp = new FunctionComponent(() => {
      const [a, sa] = useState('a0');
      const [b, sb] = useState(0);
      setA = sa;
      setB = sb;
      return h('div', null, h('span', null, a), h('b', null, String(b)));
    });
    const container = makeContainer();
    comp.mount(container);

    setB((p) => p + 1);
    await flush();
    expect(container.innerHTML).toBe('<div><span>a0</span><b>1</b></div>');

    setA('a1');
    await flush();
    expect(container.innerHTML).toBe('<div><span>a1</span><b>1</b></div>');

    setB(10);
    await flush();
    expect(container.innerHTML).toBe('<div><span>a1</span><b>10</b></div>');
    expect(comp.hooks).toHaveLength(2);
  });

  it('TC-HOOK-014 오래된 클로저: 첫 렌더에서 꺼낸 setState 를 여러 렌더 뒤에 불러도 자기 슬롯에, 업데이터는 최신 상태로', async () => {
    const renders = [];
    const comp = new FunctionComponent(() => {
      const [a, setA] = useState('a0');
      const [b, setB] = useState(0);
      renders.push({ setA, setB });
      return h('p', null, `${a}|${b}`);
    });
    const container = makeContainer();
    comp.mount(container);
    const first = renders[0];

    renders[0].setB(5);
    await flush();
    comp.update();
    comp.update();

    first.setB((p) => p + 10);
    await flush();
    expect(container.innerHTML).toBe('<p>a0|15</p>');

    first.setB((p) => p + 1);
    await flush();
    expect(container.innerHTML).toBe('<p>a0|16</p>');

    first.setA('x');
    await flush();
    expect(container.innerHTML).toBe('<p>x|16</p>');
  });

  it('TC-HOOK-015 두 인스턴스는 독립: A 의 setState 는 B 를 렌더하지 않고 B 의 화면·상태를 바꾸지 않는다', async () => {
    const setters = new Map();
    const rendered = [];
    const Counter = () => {
      const [n, setN] = useState(0);
      const me = getCurrentComponent();
      setters.set(me, setN);
      rendered.push(me);
      return h('p', null, String(n));
    };
    const a = new FunctionComponent(Counter);
    const b = new FunctionComponent(Counter);
    const boxA = makeContainer();
    const boxB = makeContainer();
    a.mount(boxA);
    b.mount(boxB);
    rendered.length = 0;

    setters.get(a)((p) => p + 3);
    await flush();
    expect(boxA.innerHTML).toBe('<p>3</p>');
    expect(boxB.innerHTML).toBe('<p>0</p>');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((c) => c === a)).toBe(true);

    setters.get(b)((p) => p + 1);
    await flush();
    expect(boxA.innerHTML).toBe('<p>3</p>');
    expect(boxB.innerHTML).toBe('<p>1</p>');
  });

  it('TC-HOOK-016 클릭 → setState → 바뀐 텍스트 노드 하나만 갱신 (characterData 1건, 나머지 노드는 같은 객체)', async () => {
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      return h(
        'div',
        { id: 'app' },
        h('h1', null, 'Counter'),
        h('button', { onClick: () => setN((p) => p + 1) }, String(n)),
        h('p', { class: 'static' }, 'static'),
      );
    });
    const container = makeContainer();
    const root = comp.mount(container);
    const button = root.childNodes[1];
    const before = allNodes(root);
    const rec = record(container);

    button.click();
    await flush();

    const records = rec.take();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(records[0].target).toBe(button.firstChild);
    expect(root.outerHTML).toBe('<div id="app"><h1>Counter</h1><button>1</button><p class="static">static</p></div>');
    const after = allNodes(root);
    expect(after).toHaveLength(before.length);
    after.forEach((node, i) => expect(node).toBe(before[i]));
    expect(comp.dom).toBe(root);

    // 핸들러는 쌓이지 않는다: 클릭 1번 = +1
    button.click();
    await flush();
    expect(button.textContent).toBe('2');
    rec.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('렌더 중 setState (재진입 규칙)', () => {
  it('TC-HOOK-017 렌더 중 setState 로 파생 상태: if (n < 3) setN(n + 1) → mount 가 fn 4번 뒤 <p>3</p>, 밖에서 0 으로 되돌려도 다시 3', async () => {
    let setOuter;
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      setOuter = setN;
      if (n < 3) setN(n + 1);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();

    const dom = comp.mount(container);

    expect(fn).toHaveBeenCalledTimes(4);
    expect(container.innerHTML).toBe('<p>3</p>');
    expect(dom).toBe(comp.dom);
    expect(container.firstChild).toBe(comp.dom);
    expect(getCurrentComponent()).toBeNull();

    setOuter(0);
    await flush();
    expect(container.innerHTML).toBe('<p>3</p>');
    expect(container.childNodes).toHaveLength(1);
  });

  it('TC-HOOK-018 한 렌더 안의 여러 setState 는 누적되어 재렌더 1번, 그 렌더의 지역 변수는 이전 값', () => {
    const seen = [];
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      seen.push(n);
      if (n === 0) {
        setN((p) => p + 1);
        setN((p) => p + 1);
        seen.push(`local ${n}`);
      }
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([0, 'local 0', 2]);
    expect(container.innerHTML).toBe('<p>2</p>');
  });

  it('TC-HOOK-019 렌더마다 같은 값으로 setState 하면 재렌더 없음 (무한 루프·25회 Error 아님)', () => {
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      setN(n);
      setN((p) => p);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    expect(fn).toHaveBeenCalledTimes(1);

    expect(() => comp.update()).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toBe('<p>0</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('mount 실패한 컴포넌트의 setState', () => {
  it('TC-HOOK-020 실패한 렌더에서 꺼낸 setState 는 조용히 무시: 던지지 않고 렌더 없음, 다시 mount 한 상태에 영향 없음', async () => {
    let fail = true;
    const setters = [];
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      setters.push(setN);
      if (fail) throw new Error('mount fail');
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const box = makeContainer();
    expect(() => comp.mount(box)).toThrow('mount fail');

    expect(() => setters[0](7)).not.toThrow();
    expect(() => setters[0]((p) => p + 1)).not.toThrow();
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(box.childNodes).toHaveLength(0);

    fail = false;
    comp.mount(box);
    expect(box.innerHTML).toBe('<p>0</p>');
    expect(setters[1]).not.toBe(setters[0]);

    expect(() => setters[0](9)).not.toThrow();
    await flush();
    expect(box.innerHTML).toBe('<p>0</p>');
    expect(fn).toHaveBeenCalledTimes(2);

    setters[1](5);
    await flush();
    expect(box.innerHTML).toBe('<p>5</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 동기 반영: #8 의 계약. batch 밖 setState 는 #10 이후에도 동기다. 핸들러 안 여러 setState(TC-HOOK-022)만 #10 에서 바뀌었다.
describe('동기 반영 (#10 batching 에서 바뀌는 부분)', () => {
  it('TC-HOOK-021 렌더 밖 setState 는 돌아오기 전에 DOM 에 반영된다 (await 없이), setState 1번 = 렌더 1번', () => {
    let setN;
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    const ret = setN(1);
    expect(ret).toBeUndefined();
    expect(container.innerHTML).toBe('<p>1</p>');
    expect(fn).toHaveBeenCalledTimes(1);

    setN((p) => p + 1);
    expect(container.innerHTML).toBe('<p>2</p>');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // #10 batching 으로 계약이 바뀐 케이스 (결정 0016, tests/unit/batching.test.js). 이전 계약: 렌더 3번, 텍스트 1·2·3.
  it('TC-HOOK-022 (#10 변경) 한 핸들러의 업데이터 3번 → 핸들러가 끝날 때 렌더 1번, 핸들러 안에서는 DOM 이 아직 이전 값', () => {
    const texts = [];
    const fn = vi.fn(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: (e) => {
            const el = e.currentTarget;
            setN((p) => p + 1);
            texts.push(el.textContent);
            setN((p) => p + 1);
            texts.push(el.textContent);
            setN((p) => p + 1);
            texts.push(el.textContent);
          },
        },
        String(n),
      );
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    const button = comp.mount(container);
    fn.mockClear();

    button.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(texts).toEqual(['0', '0', '0']);
    expect(button.textContent).toBe('3');
  });

  it('TC-HOOK-023 setState 뒤 렌더가 던지면 setState 가 같은 예외를 던지고 DOM·vnode 그대로, 상태는 되돌리지 않는다', () => {
    let fail = false;
    let setN;
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      if (fail) throw new Error('render boom');
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    const root = comp.mount(container);
    const vnodeBefore = comp.vnode;
    const rec = record(container);

    fail = true;
    expect(() => setN(5)).toThrow('render boom');
    expect(rec.take()).toHaveLength(0);
    expect(container.innerHTML).toBe('<p>0</p>');
    expect(comp.vnode).toBe(vnodeBefore);
    expect(comp.dom).toBe(root);
    expect(getCurrentComponent()).toBeNull();

    // 상태는 이미 5: 같은 값이면 아무것도 하지 않는다 (렌더도, 예외도 없음)
    fn.mockClear();
    expect(() => setN(5)).not.toThrow();
    expect(fn).not.toHaveBeenCalled();

    fail = false;
    comp.update();
    expect(container.innerHTML).toBe('<p>5</p>');

    setN((p) => p + 1);
    expect(container.innerHTML).toBe('<p>6</p>');
    rec.stop();
  });

  it('TC-HOOK-024 렌더마다 상태를 바꾸면 setState 가 25회 초과 Error, DOM = render(vnode), 멈추면 다음 setState 정상', () => {
    let loop = false;
    let setN;
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      if (loop) s((p) => p + 1);
      return h('p', null, String(n));
    });
    const container = makeContainer();
    comp.mount(container);

    loop = true;
    expect(() => setN(100)).toThrow(/25/);
    expect(getCurrentComponent()).toBeNull();
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(comp.dom);
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);

    loop = false;
    setN(-1);
    expect(container.innerHTML).toBe('<p>-1</p>');
  });

  it('TC-HOOK-025 업데이터가 던지면 setState 가 같은 예외, 상태·화면 그대로, 렌더 없음, 다음 setState 정상', () => {
    let setN;
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    expect(() =>
      setN(() => {
        throw new Error('updater boom');
      }),
    ).toThrow('updater boom');
    expect(fn).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('<p>0</p>');

    setN((p) => p + 1);
    expect(container.innerHTML).toBe('<p>1</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #8 리뷰에서 재현된 결함 (사용자 결정: 전부 고친다). 계약은 맨 위 "#8 리뷰" 절.
describe('리뷰 보강(#8): hook 실행 규칙', () => {
  it('TC-HOOK-028 (e2) lazy init / useHookSlot init 안에서 hook 을 부르면 "hook" Error, 슬롯이 섞이지 않고 mount 실패', () => {
    const box = makeContainer();
    const comp = new FunctionComponent(() => {
      const [a] = useState(() => {
        useState('inner');
        return 'outer';
      });
      const [b] = useState('B');
      return h('p', null, `${a}|${b}`);
    });
    expect(() => comp.mount(box)).toThrow(/hook/i);
    expect(box.childNodes).toHaveLength(0);
    expect(comp.hooks).toEqual([]);
    expect(getCurrentComponent()).toBeNull();

    const box2 = makeContainer();
    const raw = new FunctionComponent(() => {
      const v = useHookSlot(() => {
        useHookSlot(() => 'inner');
        return 'outer';
      });
      return h('p', null, String(v));
    });
    expect(() => raw.mount(box2)).toThrow(/hook/i);
    expect(box2.childNodes).toHaveLength(0);
    expect(raw.hooks).toEqual([]);

    // 그 뒤 정상 컴포넌트는 영향 없음, init 밖에서는 hook 이 정상
    const box3 = makeContainer();
    const ok = new FunctionComponent(() => {
      const [a] = useState(() => 'outer');
      const [b] = useState('B');
      return h('p', null, `${a}|${b}`);
    });
    ok.mount(box3);
    expect(box3.innerHTML).toBe('<p>outer|B</p>');
  });

  it('TC-HOOK-029 (e4, 동기) 업데이터 안에서 setState (같은 슬롯 / 다른 슬롯) → 바깥 setState 가 Error, 상태·화면 그대로, 렌더 없음', () => {
    let setN;
    let setM;
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      const [m, t] = useState(0);
      setN = s;
      setM = t;
      return h('p', null, `${n},${m}`);
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    expect(() =>
      setN((p) => {
        setN((q) => q + 10);
        return p + 1;
      }),
    ).toThrow();
    expect(fn).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('<p>0,0</p>');

    expect(() =>
      setN((p) => {
        setM(5);
        return p;
      }),
    ).toThrow();
    expect(fn).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('<p>0,0</p>');

    // 규칙 위반 뒤에도 정상 동작: 상태는 그대로 0 에서 시작한다
    setN((p) => p + 1);
    setM((p) => p + 2);
    expect(container.innerHTML).toBe('<p>1,2</p>');
  });
});

// custom element 의 attributeChangedCallback 은 setAttribute 안에서(동기로) 불린다:
// patch / render 가 속성을 쓰는 도중, 즉 commit 도중에 setState 가 끼어드는 지점이다.
let ceSeq = 0;
function defineEcho(onChange) {
  const name = `x-echo-${++ceSeq}`;
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

describe('리뷰 보강(#8): commit 도중 setState', () => {
  it('TC-HOOK-030 (e3) patch 도중 setState → commit 뒤 재렌더, DOM 과 vnode 가 일치 (data-v="2" 와 <p>2</p>)', async () => {
    let setN;
    const tag = defineEcho((v) => {
      if (v === '1') setN(2);
    });
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      return h('div', null, h(tag, { 'data-v': String(n) }), h('p', null, String(n)));
    });
    const container = makeContainer();
    comp.mount(container);
    expect(container.innerHTML).toBe(`<div><${tag} data-v="0"></${tag}><p>0</p></div>`);

    setN(1);
    await flush();

    expect(container.innerHTML).toBe(`<div><${tag} data-v="2"></${tag}><p>2</p></div>`);
    expect(comp.vnode).toEqual(h('div', null, h(tag, { 'data-v': '2' }), h('p', null, '2')));
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
    expect(container.childNodes).toHaveLength(1);
    expect(getCurrentComponent()).toBeNull();
  });

  it('TC-HOOK-031 (e3) 첫 mount 의 render 도중 setState → mount 성공, 이어서 재렌더 (data-v="5" 와 <p>5</p>)', () => {
    let setN;
    const tag = defineEcho((v) => {
      if (v === '0') setN(5);
    });
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      return h('div', null, h(tag, { 'data-v': String(n) }), h('p', null, String(n)));
    });
    const container = makeContainer();
    const dom = comp.mount(container);

    expect(container.innerHTML).toBe(`<div><${tag} data-v="5"></${tag}><p>5</p></div>`);
    expect(dom).toBe(comp.dom);
    expect(container.childNodes).toHaveLength(1);
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
  });

  it('TC-HOOK-032 (e3, 동기) commit 마다 setState 하면 렌더 중 재진입과 같은 25회 한도로 Error, DOM = render(vnode), 멈추면 정상', () => {
    let loop = false;
    let setN;
    const tag = defineEcho(() => {
      if (loop) setN((p) => p + 1);
    });
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      return h('div', null, h(tag, { 'data-v': String(n) }), h('p', null, String(n)));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    loop = true;
    expect(() => setN(100)).toThrow(/25/);
    loop = false;
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(27);
    expect(getCurrentComponent()).toBeNull();
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(comp.dom);
    expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);

    setN(-1);
    expect(container.innerHTML).toBe(`<div><${tag} data-v="-1"></${tag}><p>-1</p></div>`);
  });
});

// 사용자 입력을 흉내 낸다: 화면 값을 바꾸고 input 이벤트를 보낸 뒤 갱신을 기다린다.
async function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}

describe('리뷰 보강(#8): 제어 요소 (화면 값 = 마지막 VNode 값)', () => {
  it('TC-HOOK-033 (e1) 숫자만 받는 input: "1" → "1a" 는 상태가 그대로라 렌더가 없어도 화면 "1", "1a2" → "12", 비제어 input 은 그대로', async () => {
    const fn = vi.fn(() => {
      const [v, setV] = useState('');
      return h('div', null,
        h('input', { class: 'num', value: v, onInput: (e) => setV(e.target.value.replace(/\D/g, '')) }),
        h('input', { class: 'free', onInput: () => {} }),
      );
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    const num = container.querySelector('input.num');
    const free = container.querySelector('input.free');

    await typeInto(num, '1');
    expect(num.value).toBe('1');

    fn.mockClear();
    await typeInto(num, '1a');
    expect(fn).not.toHaveBeenCalled();
    expect(num.value).toBe('1');

    await typeInto(num, '1a2');
    expect(num.value).toBe('12');

    await typeInto(num, 'abc');
    expect(num.value).toBe('');
    expect(container.querySelector('input.num')).toBe(num);

    // 비제어(VNode 에 value 없음)는 되돌리지 않는다
    await typeInto(free, 'hello');
    expect(free.value).toBe('hello');
  });

  it('TC-HOOK-034 (e1) 제어 select·checkbox 도 핸들러가 상태를 안 바꾸면 VNode 값으로 돌아간다', async () => {
    const comp = new FunctionComponent(() => {
      const [sel] = useState('a');
      const [on] = useState(false);
      return h('div', null,
        h('select', { value: sel, onChange: () => {} }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
        h('input', { type: 'checkbox', checked: on, onClick: () => {} }),
      );
    });
    const container = makeContainer();
    comp.mount(container);
    const select = container.querySelector('select');
    const box = container.querySelector('input');

    select.value = 'b';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(select.value).toBe('a');

    box.click();
    await flush();
    expect(box.checked).toBe(false);
  });

  it('TC-HOOK-035 (e5) 체크박스 onClick 에서 preventDefault + setState(p => !p) → dispatch 뒤 .checked 는 상태 값', async () => {
    const comp = new FunctionComponent(() => {
      const [on, setOn] = useState(false);
      return h('label', null,
        h('input', { type: 'checkbox', checked: on, onClick: (e) => { e.preventDefault(); setOn((p) => !p); } }),
        h('span', null, on ? 'on' : 'off'),
      );
    });
    const container = makeContainer();
    comp.mount(container);
    const box = container.querySelector('input');
    const label = container.querySelector('span');

    box.click();
    await flush();
    expect(label.textContent).toBe('on');
    expect(box.checked).toBe(true);

    box.click();
    await flush();
    expect(label.textContent).toBe('off');
    expect(box.checked).toBe(false);
  });

  it('TC-HOOK-036 (e6·e7) 상태로 그리는 제어 textarea·select: 자식 텍스트가 바뀌어도 value prop, value 와 새 option 이 같은 렌더에 와도 선택', async () => {
    let set;
    const comp = new FunctionComponent(() => {
      const [s, setS] = useState({ opts: ['a', 'b'], sel: 'b', text: 'a', note: 'x' });
      set = setS;
      return h('div', null,
        h('select', { value: s.sel }, s.opts.map((o) => h('option', { value: o }, o.toUpperCase()))),
        h('textarea', { value: s.text }, s.note),
      );
    });
    const container = makeContainer();
    comp.mount(container);
    const select = container.querySelector('select');
    const area = container.querySelector('textarea');
    expect(select.value).toBe('b');
    expect(area.value).toBe('a');

    set((p) => ({ ...p, opts: ['a', 'b', 'c'], sel: 'c' }));
    await flush();
    expect(select.value).toBe('c');

    set((p) => ({ ...p, note: 'y' }));
    await flush();
    expect(area.value).toBe('a');

    set((p) => ({ ...p, text: 'z', note: 'w' }));
    await flush();
    expect(area.value).toBe('z');
    expect(container.querySelector('select')).toBe(select);
    expect(container.querySelector('textarea')).toBe(area);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #8 수정 라운드 재리뷰에서 재현된 결함 (사용자 결정: React 방식). 계약은 맨 위 e1 절.
describe('재리뷰(#8): 되돌리기는 input/change/click dispatch 뒤에만', () => {
  // 클릭 가능한 제어 체크박스. wrap 은 체크박스를 감싸는 방식(부모 onClick 등)
  const checkboxApp = (wrap, boxProps = {}) => () => {
    const [on, setOn] = useState(false);
    const box = h('input', { type: 'checkbox', checked: on, onChange: (e) => setOn(e.target.checked), ...boxProps });
    return h('div', null, wrap(box), h('span', { class: 'state' }, on ? 'on' : 'off'));
  };

  it.each([
    ['부모 div 에 onClick', (box) => h('div', { onClick: () => {} }, box), {}],
    ['체크박스 자신에 onClick(stopPropagation) + onChange', (box) => box, { onClick: (e) => e.stopPropagation() }],
    ['onClick 이 있는 tr 안의 체크박스', (box) => h('table', null, h('tbody', null, h('tr', { onClick: () => {} }, h('td', null, box)))), {}],
  ])('TC-HOOK-037 (r1) %s: onChange 가 토글된 값을 보고 켜고 끌 수 있다', async (_name, wrap, boxProps) => {
    const comp = new FunctionComponent(checkboxApp(wrap, boxProps));
    const container = makeContainer();
    comp.mount(container);
    const box = container.querySelector('input');
    const state = container.querySelector('span.state');

    box.click();
    await flush();
    expect(state.textContent).toBe('on');
    expect(box.checked).toBe(true);

    box.click();
    await flush();
    expect(state.textContent).toBe('off');
    expect(box.checked).toBe(false);
  });

  it('TC-HOOK-038 (r2) 같은 name 의 제어 radio: 상태를 안 바꾸는 onChange 면 b 클릭 뒤 a true·b false, 상태를 바꾸면 a false·b true', async () => {
    const radios = (onChange) => () => {
      const [sel, setSel] = useState('a');
      return h('form', null,
        h('input', { type: 'radio', name: 'g', value: 'a', checked: sel === 'a', onChange: onChange(setSel) }),
        h('input', { type: 'radio', name: 'g', value: 'b', checked: sel === 'b', onChange: onChange(setSel) }),
      );
    };

    const fixed = makeContainer();
    new FunctionComponent(radios(() => () => {})).mount(fixed);
    const [a, b] = fixed.querySelectorAll('input');
    expect([a.checked, b.checked]).toEqual([true, false]);
    b.click();
    await flush();
    expect([a.checked, b.checked]).toEqual([true, false]);

    const live = makeContainer();
    new FunctionComponent(radios((setSel) => (e) => setSel(e.target.value))).mount(live);
    const [la, lb] = live.querySelectorAll('input');
    lb.click();
    await flush();
    expect([la.checked, lb.checked]).toEqual([false, true]);
    la.click();
    await flush();
    expect([la.checked, lb.checked]).toEqual([true, false]);
  });

  it('TC-HOOK-039 (r6) {value, onChange} input 에 타이핑: onKeyDown·onMouseMove 유무와 무관하게 화면 "ab", change 뒤 상태 "ab"', async () => {
    const results = [];
    for (const extra of [{}, { onKeyDown: () => {}, onMouseMove: () => {} }]) {
      const comp = new FunctionComponent(() => {
        const [v, setV] = useState('');
        return h('div', null,
          h('input', { value: v, onChange: (e) => setV(e.target.value), ...extra }),
          h('span', null, v),
        );
      });
      const container = makeContainer();
      comp.mount(container);
      const input = container.querySelector('input');
      const span = container.querySelector('span');

      for (const ch of 'ab') {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        input.value += ch;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        await flush();
      }
      input.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      input.dispatchEvent(new Event('scroll'));
      await flush();
      const typed = input.value;

      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      results.push([typed, input.value, span.textContent]);
    }
    expect(results).toEqual([
      ['ab', 'ab', 'ab'],
      ['ab', 'ab', 'ab'],
    ]);
  });

  it('TC-HOOK-041 (r1) 즉시 되돌리지 않는다: onClick 이 있는 체크박스의 onChange 는 토글된 값(true)을 보고, 상태를 안 바꾸면 끝에는 false', async () => {
    const seen = [];
    const comp = new FunctionComponent(() => {
      const [on] = useState(false);
      return h('input', { type: 'checkbox', checked: on, onClick: () => {}, onChange: (e) => seen.push(e.target.checked) });
    });
    const container = makeContainer();
    const box = comp.mount(container);

    box.click();
    await flush();
    expect(seen).toEqual([true]);
    expect(box.checked).toBe(false);
  });
});

describe('재리뷰(#8): init 안의 다른 컴포넌트', () => {
  it('TC-HOOK-040 (r8) lazy init 안에서 다른 FunctionComponent(useState 사용)를 mount 하면 둘 다 성공, 각자 슬롯', () => {
    const boxB = makeContainer();
    let setX;
    const b = new FunctionComponent(() => {
      const [x, s] = useState('b');
      setX = s;
      return h('i', null, x);
    });
    const a = new FunctionComponent(() => {
      const [first] = useState(() => {
        b.mount(boxB);
        return 'a';
      });
      const [second] = useState('c');
      return h('p', null, first + second);
    });
    const boxA = makeContainer();

    expect(() => a.mount(boxA)).not.toThrow();
    expect(boxA.innerHTML).toBe('<p>ac</p>');
    expect(boxB.innerHTML).toBe('<i>b</i>');
    expect(a.hooks).toHaveLength(2);
    expect(b.hooks).toHaveLength(1);
    expect(getCurrentComponent()).toBeNull();

    a.update();
    expect(boxA.innerHTML).toBe('<p>ac</p>');
    setX('B');
    return flush().then(() => expect(boxB.innerHTML).toBe('<i>B</i>'));
  });
});
