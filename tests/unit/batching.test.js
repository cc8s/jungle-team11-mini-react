// batching 의 API 계약 (이슈 #10, 결정 0016: 이벤트 핸들러 단위, React 17 방식). 이 파일이 명세다.
// 토대는 src/core/hooks.js · src/core/component.js 이고 그 계약(tests/unit/hooks.test.js,
// tests/unit/effects.test.js, tests/unit/component.test.js 맨 위 주석)을 그대로 따른다.
// 이벤트 dispatch 로 확인하는 부분은 tests/integration/batching.test.js.
//
// import { batch } from '../../src/core/scheduler.js';
// (src/vdom/render.js 의 runHandler 가 이벤트 핸들러 호출을 batch 로 감싼다)
//
// ── batch(fn) → fn 의 반환값 ──────────────────────────────────────────────────────
//   - fn 이 함수가 아니면 TypeError, 메시지는 'batch:' 로 시작. 아무것도 실행하지 않고 batch 상태도 바뀌지 않는다.
//   - fn 을 인자 없이 **동기로 한 번** 부르고 그 반환값을 그대로 돌려준다 (undefined, 객체 참조 포함).
//   - batch 안에서 다시 batch 를 부르면(중첩) 안쪽 batch 가 끝날 때는 렌더하지 않는다. **가장 바깥 batch 가
//     끝날 때**(정상이든 예외든, finally) 한 번 "flush" 한다. 안쪽 batch 의 반환값·예외 규칙은 바깥과 같다.
//   - batch 가 (예외로 끝나도) 돌아오면 중첩 깊이는 들어가기 전으로 돌아간다: 가장 바깥 batch 뒤의 setState 는
//     다시 batch 밖(동기)이다.
//
//   flush (가장 바깥 batch 의 끝)
//   - batch 안에서 "다시 그려야 함" 으로 표시된 컴포넌트를 **처음 표시된 순서대로** 하나씩 꺼내 각각 comp.update() 를
//     **한 번** 부른다. 표시는 꺼낼 때 지운다: 다음 batch 는 빈 목록에서 시작한다.
//   - 표시된 뒤 unmount 된 컴포넌트(batch 안에서, 또는 flush 도중 앞 컴포넌트의 effect 가 unmount 한 경우)는
//     건너뛴다: update() 를 부르지 않고 예외도 없다 (결정 0016 규칙 5).
//   - 표시가 없으면 아무것도 렌더하지 않는다.
//   - (#10 리뷰 D1) flush 는 **그 batch 가 실행되는 동안 표시된 것만** 처리하고, 그 처리에서 난 예외만 그 batch 가
//     던진다. flush 도중(앞 컴포넌트의 effect·cleanup 안에서) 새로 열린 batch — batch() 직접 호출이든, 이 라이브러리가
//     붙인 on* 핸들러를 el.click() 등으로 동기 dispatch 한 것이든 — 는 flush 밖의 batch 와 똑같이 동작한다:
//     **자기 안에서 표시된 것만** 자기가 끝날 때 처리하고, 그 처리의 예외만 던지고, 자기 fn 의 반환값을 돌려준다.
//     바깥 flush 에 남은 컴포넌트를 대신 렌더하지 않고, 그 예외를 대신 던지지도 않는다 (TC-BATCH-070·071·073·076).
//     (구현 참고: flush 를 시작할 때 표시 목록을 떼어 간다.)
//   - (#10 리뷰 D2) 꺼낼 때 그 컴포넌트가 **표시된 뒤 이미 다시 렌더됐으면** 건너뛴다: update() 를 부르지 않는다.
//     예: 큐 [A, B] 에서 A 의 effect 가 B 를 setState 해 B 가 동기로 렌더된 경우, flush 도중 열린 batch 가 B 를
//     렌더한 경우. B 의 렌더·effect 단계는 1번이고 DOM·상태는 최신 값이다 (TC-BATCH-072·073).
//   - (#10 재리뷰 D2′) 건너뛰기의 기준은 그 컴포넌트의 **마지막 표시**다. 다시 렌더된 **뒤에** 또 setState 로 표시됐으면
//     그것은 새 표시다: 같은 컴포넌트가 이미 표시돼 있어도(아직 꺼내지 않았어도) flush 는 마지막 표시 기준으로
//     판단하므로, 마지막 표시 뒤에 렌더가 없었으면 update() 를 1번 부른다. 화면은 마지막 setState 의 값이다.
//     예: batch(() => { set(1); comp.update(); set(2); }) → update() 에서 렌더 1번, flush 에서 렌더 1번 더, <p>2</p>
//     (TC-BATCH-079). 큐 [A, B] 에서 A 의 effect 가 batch(() => { b.set(10); b.comp.update(); b.set(20); }) → <b>20</b>
//     (TC-BATCH-080). 핸들러 안에서 같은 순서 → click 뒤 '2' (TC-BATCH-081, integration).
//   - 큐 순서는 **처음 표시된 자리**를 유지한다 (TC-BATCH-016). 새 표시가 생겨도 큐의 뒤로 옮기지 않는다.
//     (표시 횟수와 무관하게 컴포넌트당 update() 는 최대 1번이다.)
//
//   예외 (결정 0016 규칙 3)
//   - fn 이 던지면 flush 를 마친 뒤 **같은 값**(Error 가 아니어도, 같은 참조)을 다시 던진다. 던지기 전에 DOM 은 이미
//     반영돼 있다.
//   - flush 중 어떤 컴포넌트의 update() 가 던지면(렌더 예외, patch 예외, 25회 초과, effect 예외) **남은 컴포넌트도
//     update 한 뒤** 실행 순서상 **첫 예외**를 던진다 (component 의 cleanup 예외 규칙과 같은 "끝까지 하고 첫 예외").
//     던진 컴포넌트는 component 계약대로다: 상태는 되돌리지 않고(슬롯에 새 값), DOM·vnode 는 그 계약의 결과 그대로,
//     표시는 지워져 다음 batch 가 다시 그리지 않는다. 다음 update() / setState 가 남은 값을 그린다.
//   - fn 도 던지고 flush 도 던지면 **fn 의 예외**를 던진다 (실행 순서상 첫 예외. flush 의 예외는 버린다).
//
// ── batch 안의 setState(next) ──────────────────────────────────────────────────────
//   - 업데이터는 그 자리에서 실행하고, 새 값은 **그 자리에서 슬롯에 저장**한다 (결정 0016 규칙 1). 그래서 업데이터는
//     항상 최신 값을 받는다: setN(n => n + 1) 두 번이면 +2. 업데이터 예외, 업데이터 안의 setState Error,
//     unmount 된 / mount 실패한 컴포넌트의 setState 무시 규칙은 hooks 계약 그대로다 (setState 자신이 동기로 던진다).
//   - Object.is(지금 값, 새 값) 이면 아무것도 하지 않는다 (표시 안 함).
//   - 다르면 슬롯에 저장하고 그 컴포넌트를 "다시 그려야 함" 으로 표시만 한다: 루트 fn 을 부르지 않고 DOM 도 그대로다.
//     반환값은 undefined. 같은 컴포넌트를 여러 번 표시해도 flush 에서 update() 는 1번이다 (결정 0016 규칙 4).
//   - **결국 같은 값 (예: 1 → 2 → 1)**: 표시는 남는다. flush 에서 update() 를 1번 부른다 (루트 fn 1번). 상태가
//     렌더 전과 같으므로 diff 결과가 없어 DOM 변경은 0 이다.
//       이유: 슬롯은 setState 마다 바로 바뀌므로 렌더를 생략하려면 "batch 전 값" 을 슬롯마다 따로 기억해야 한다.
//       그 비용과 규칙(언제 스냅샷을 뜨는가, 중첩·여러 슬롯)에 비해 이득은 루트 fn 한 번이다. React 도 이 경우
//       컴포넌트 함수를 다시 실행한다(같은 결과면 자식 단계에서 멈춘다). 화면은 언제나 같다. deps 없는 effect 는
//       렌더된 것이므로 실행된다.
//
//   렌더·commit·effect 중의 setState (결정 0016 규칙 6)
//   - 지금 렌더·commit·effect 단계 중인 컴포넌트의 setState 는 component 의 재진입 규칙 그대로다: 표시 후 **그 update()
//     호출 안에서** 다시 렌더하고, 렌더 중 재진입 25회 · effect 재렌더 25회 한도가 각각 적용된다.
//   - flush 가 부른 update() 안의 effect 가 같은 컴포넌트를 setState 하는 경우도 같다. batch 표시로 바꿔 flush 를
//     다시 도는 방식으로 이 한도를 피하면 안 된다 (멈추지 않는 effect 는 batch 가 `/25/` + "effect" Error 로 끝난다).
//   - flush 도중 **다른** 컴포넌트를 setState 한 경우: 가장 바깥 batch 가 돌아올 때 그 상태가 DOM 에 반영돼 있어야 한다.
//     그 컴포넌트가 이 batch 에서 **이미 표시돼 있고 아직 꺼내지 않았으면** 렌더 1번이다 (위 D2 건너뛰기, TC-BATCH-072).
//     표시돼 있지 않았거나 이미 꺼내 렌더한 뒤라면(TC-BATCH-053) 렌더 횟수는 정하지 않는다.
//   - batch 안이어도, 지금 렌더·commit·effect 단계 중인 컴포넌트의 setState 는 표시가 아니라 위 재진입 규칙이다.
//     batch 안에서 직접 부른 comp.update() / comp.mount() 도 같다: 그 렌더 중 setState, 그 effect 의 setState 는
//     update() / mount() 가 돌아올 때 이미 DOM 에 반영돼 있다 (TC-BATCH-074, TC-BATCH-077).
//
//   update() 직접 호출
//   - batch 는 setState 만 미룬다. batch 안에서 comp.update() 를 직접 부르면 지금처럼 바로 렌더한다.
//
// ── 이벤트 핸들러 (render.js 의 runHandler) ───────────────────────────────────────────
//   - 이 라이브러리가 붙인 on* 핸들러 호출 1번 = batch 1개. 자세한 규칙은 tests/integration/batching.test.js 맨 위.
//
// ── 정하지 않음 (테스트 없음) ────────────────────────────────────────────────────
//   - batch 안에서 comp.update() 를 직접 부른 뒤 **그 뒤로 setState 가 없을 때**, 그 컴포넌트가 flush 에서 다시
//     렌더되는지. (update() 뒤에 값이 바뀐 setState 가 있으면 새 표시이므로 flush 가 렌더한다, D2′ TC-BATCH-079.)
//   - 루트 fn 렌더 중(또는 useMemo 계산 중)에 batch 를 부르는 경우.
//   - fn 을 부를 때의 this.
//   - flush 도중 다른 컴포넌트 setState 의 렌더 횟수·순서: 표시돼 있고 아직 꺼내지 않은 경우(1번)만 정한다.
//   - 표시된 뒤의 렌더가 예외로 끝난 컴포넌트(예: A 의 effect 가 표시된 B 를 setState 했는데 B 렌더가 던짐)를
//     flush 가 꺼낼 때 다시 update() 하는지.
//
// ── 메모 (#10 리뷰로 더한 TC-BATCH-070~078) ─────────────────────────────────
//   070·071 (unit), 076 (integration): flush 재진입(D1). 072: 중복 렌더(D2).
//   073: flush 도중 열린 batch 가 바깥 큐의 컴포넌트를 표시한 경우 (D1 + D2 의 조합 보호).
//   074 (unit), 077 (integration): batch 안 직접 update()/mount() 의 렌더·effect 중 setState (isBusy 분기 보호).
//   075 (unit), 078 (integration): batch 안 mount 실패 컴포넌트의 오래된 setState / Promise 콜백 = batch 밖.
//   079·080 (unit), 081 (integration): 재리뷰 D2′ — update() 뒤의 setState 는 새 표시 (D2 건너뛰기 + 큐 중복 제거 회귀).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { batch } from '../../src/core/scheduler.js';
import { useState, useEffect } from '../../src/core/hooks.js';
import { FunctionComponent, getCurrentComponent } from '../../src/core/component.js';
import { render } from '../../src/vdom/render.js';
import { h } from '../../src/vdom/vnode.js';

function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

// 던진 값이 undefined 여도 구분한다.
function caught(fn) {
  try {
    fn();
  } catch (error) {
    return { threw: true, error };
  }
  return { threw: false, error: undefined };
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

// DOM 과 comp.vnode 가 일치하고 container 안에 루트 하나만 있다.
function expectConsistent(comp, container) {
  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild).toBe(comp.dom);
  expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
}

// 렌더 횟수 = 루트 fn 호출 횟수. mount 직후 0 에서 센다.
// log 를 주면 렌더될 때마다 name 을 남긴다 (컴포넌트 사이 순서 확인용).
function counter(name = 'c', initial = 0, log = null) {
  let setter;
  const fn = vi.fn(() => {
    const [n, s] = useState(initial);
    setter = s;
    log?.push(name);
    return h('p', null, String(n));
  });
  const comp = new FunctionComponent(fn);
  const container = makeContainer();
  comp.mount(container);
  fn.mockClear();
  if (log) log.length = 0;
  return { comp, fn, container, set: (next) => setter(next) };
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─────────────────────────────────────────────────────────────────────────────
describe('batch(fn): 호출 규칙', () => {
  it('TC-BATCH-001 fn 을 인자 없이 동기로 1번 부르고 반환값을 그대로 돌려준다 (객체는 같은 참조, undefined 포함)', () => {
    const obj = { a: 1 };
    const fn = vi.fn(() => obj);
    expect(batch(fn)).toBe(obj);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]).toEqual([]);

    let ran = false;
    batch(() => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(batch(() => 42)).toBe(42);
    expect(batch(() => undefined)).toBeUndefined();
  });

  it('TC-BATCH-002 fn 이 함수가 아니면 TypeError(\'batch:\'), 그 뒤 setState 는 batch 밖(동기)이다', () => {
    const c = counter();
    for (const bad of [undefined, null, 5, 'fn', {}]) {
      const r = caught(() => batch(bad));
      expect(r.threw).toBe(true);
      expect(r.error).toBeInstanceOf(TypeError);
      expect(r.error.message).toMatch(/^batch:/);
    }
    c.set(1);
    expect(c.container.innerHTML).toBe('<p>1</p>');
    expect(c.fn).toHaveBeenCalledTimes(1);
  });

  it('TC-BATCH-003 fn 이 던진 값(Error, 문자열, 0, undefined)을 같은 값으로 다시 던진다', () => {
    for (const value of [new Error('boom'), 'str', 0, undefined]) {
      const r = caught(() =>
        batch(() => {
          throw value;
        }),
      );
      expect(r.threw).toBe(true);
      expect(Object.is(r.error, value)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('결정 테이블: batch 안의 setState → 렌더 횟수', () => {
  it('TC-BATCH-010 setState 0번 → 렌더 0번', () => {
    const c = counter();
    batch(() => {});
    expect(c.fn).not.toHaveBeenCalled();
    expect(c.container.innerHTML).toBe('<p>0</p>');
  });

  it('TC-BATCH-011 같은 값(Object.is)만 setState (값 0, 업데이터 p => p) → 렌더 0번, DOM 기록 0', () => {
    const c = counter();
    const rec = record(c.container);
    batch(() => {
      c.set(0);
      c.set((p) => p);
    });
    expect(c.fn).not.toHaveBeenCalled();
    expect(rec.take()).toHaveLength(0);
    rec.stop();
  });

  it('TC-BATCH-012 setState 1번: batch 안에서는 렌더도 DOM 변경도 없고 반환 undefined, batch 가 끝나면 렌더 1번', () => {
    const c = counter();
    const inside = {};
    batch(() => {
      inside.ret = c.set(1);
      inside.calls = c.fn.mock.calls.length;
      inside.html = c.container.innerHTML;
    });
    expect(inside).toEqual({ ret: undefined, calls: 0, html: '<p>0</p>' });
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>1</p>');
    expectConsistent(c.comp, c.container);
  });

  it('TC-BATCH-013 업데이터 2번은 최신 값을 받아 +2, 값 setState 3번은 마지막 값 — 모두 렌더 1번', () => {
    const c = counter();
    const args = [];
    batch(() => {
      c.set((p) => {
        args.push(p);
        return p + 1;
      });
      c.set((p) => {
        args.push(p);
        return p + 1;
      });
    });
    expect(args).toEqual([0, 1]);
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>2</p>');

    c.fn.mockClear();
    batch(() => {
      c.set(5);
      c.set(6);
      c.set(7);
    });
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>7</p>');
  });

  it('TC-BATCH-014 결국 같은 값(1 → 2 → 1, 업데이터 +1 → -1): 렌더 1번, DOM 기록 0, 화면 그대로', () => {
    const c = counter('c', 1);
    const rec = record(c.container);
    batch(() => {
      c.set(2);
      c.set(1);
    });
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(rec.take()).toHaveLength(0);
    expect(c.container.innerHTML).toBe('<p>1</p>');

    c.fn.mockClear();
    batch(() => {
      c.set((p) => p + 1);
      c.set((p) => p - 1);
    });
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(rec.take()).toHaveLength(0);
    expect(c.container.innerHTML).toBe('<p>1</p>');
    rec.stop();
  });

  it('TC-BATCH-015 한 컴포넌트의 슬롯 2개를 번갈아 setState → 렌더 1번, 둘 다 반영', () => {
    let setA;
    let setB;
    const fn = vi.fn(() => {
      const [a, sa] = useState(0);
      const [b, sb] = useState('x');
      setA = sa;
      setB = sb;
      return h('p', null, `${a}${b}`);
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    batch(() => {
      setA(1);
      setB('y');
      setA((p) => p + 1);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe('<p>2y</p>');
  });

  it('TC-BATCH-016 여러 컴포넌트: 표시된 것만 각각 1번, 처음 표시된 순서대로 (A,B,A → A,B / B,A → B,A)', () => {
    const log = [];
    const a = counter('A', 0, log);
    const b = counter('B', 0, log);
    const untouched = counter('C', 0, log);

    batch(() => {
      a.set(1);
      b.set(1);
      a.set(2);
    });
    expect(log).toEqual(['A', 'B']);
    expect(a.container.innerHTML).toBe('<p>2</p>');
    expect(b.container.innerHTML).toBe('<p>1</p>');
    expect(untouched.fn).not.toHaveBeenCalled();

    log.length = 0;
    batch(() => {
      b.set(2);
      a.set(3);
    });
    expect(log).toEqual(['B', 'A']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('중첩과 깊이 (상태 전이)', () => {
  it('TC-BATCH-017 중첩 2·3단: 안쪽 batch 가 끝날 때는 렌더 없음, 가장 바깥이 끝날 때 1번. 안쪽 반환값은 그대로', () => {
    const c = counter();
    const seen = [];
    const ret = batch(() => {
      const inner = batch(() => {
        c.set(1);
        batch(() => c.set(2));
        seen.push(c.fn.mock.calls.length);
        return 'inner';
      });
      seen.push(c.fn.mock.calls.length, c.container.innerHTML, inner);
      c.set((p) => p + 1);
      return 'outer';
    });
    expect(ret).toBe('outer');
    expect(seen).toEqual([0, 0, '<p>0</p>', 'inner']);
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>3</p>');
  });

  it('TC-BATCH-018 안쪽 batch 가 던지고 바깥이 잡으면: 안쪽에서는 렌더 없음, 바깥이 끝날 때 1번', () => {
    const c = counter();
    const err = new Error('inner boom');
    const seen = [];
    batch(() => {
      const r = caught(() =>
        batch(() => {
          c.set(1);
          throw err;
        }),
      );
      seen.push(r.error, c.fn.mock.calls.length, c.container.innerHTML);
      c.set((p) => p + 1);
    });
    expect(seen).toEqual([err, 0, '<p>0</p>']);
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>2</p>');
  });

  it('TC-BATCH-019 batch 가 정상·예외로 끝난 뒤의 setState 는 동기, 다음 batch 는 새로 1번 렌더한다', () => {
    const c = counter();
    batch(() => c.set(1));
    caught(() =>
      batch(() => {
        c.set(2);
        throw new Error('x');
      }),
    );
    c.fn.mockClear();

    c.set(3);
    expect(c.container.innerHTML).toBe('<p>3</p>');
    expect(c.fn).toHaveBeenCalledTimes(1);
    c.set(4);
    expect(c.container.innerHTML).toBe('<p>4</p>');
    expect(c.fn).toHaveBeenCalledTimes(2);

    c.fn.mockClear();
    batch(() => {
      c.set(5);
      c.set(6);
    });
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>6</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('예외: 렌더 후 전파 (결정 0016 규칙 3)', () => {
  it('TC-BATCH-020 setState 뒤 fn 이 던지면 렌더 1번이 끝난 뒤 같은 예외를 던진다', () => {
    const c = counter();
    const err = new Error('handler boom');
    let atCatch = null;
    try {
      batch(() => {
        c.set(1);
        c.set(2);
        throw err;
      });
    } catch (e) {
      atCatch = { e, calls: c.fn.mock.calls.length, html: c.container.innerHTML };
    }
    expect(atCatch).toEqual({ e: err, calls: 1, html: '<p>2</p>' });
    expect(atCatch.e).toBe(err);
    expectConsistent(c.comp, c.container);
  });

  it('TC-BATCH-021 batch 안에서 업데이터가 던지면 setState 가 그 자리에서 던지고, 앞서 표시된 컴포넌트는 렌더된다', () => {
    const a = counter('A');
    const b = counter('B');
    const err = new Error('updater boom');
    const r = caught(() =>
      batch(() => {
        a.set(1);
        b.set(() => {
          throw err;
        });
      }),
    );
    expect(r.error).toBe(err);
    expect(a.fn).toHaveBeenCalledTimes(1);
    expect(a.container.innerHTML).toBe('<p>1</p>');
    expect(b.fn).not.toHaveBeenCalled();
    expect(b.container.innerHTML).toBe('<p>0</p>');

    b.set((p) => p + 1);
    expect(b.container.innerHTML).toBe('<p>1</p>');
  });

  it('TC-BATCH-022 fn 도 던지고 flush 의 렌더도 던지면 fn 의 예외, 다른 컴포넌트는 렌더된다', () => {
    let fail = false;
    let setA;
    const fnA = vi.fn(() => {
      const [n, s] = useState(0);
      setA = s;
      if (fail) throw new Error('render boom');
      return h('p', null, String(n));
    });
    const compA = new FunctionComponent(fnA);
    const boxA = makeContainer();
    compA.mount(boxA);
    const b = counter('B');

    fail = true;
    const err = new Error('handler boom');
    const r = caught(() =>
      batch(() => {
        setA(1);
        b.set(1);
        throw err;
      }),
    );
    expect(r.error).toBe(err);
    expect(b.fn).toHaveBeenCalledTimes(1);
    expect(b.container.innerHTML).toBe('<p>1</p>');
    expect(boxA.innerHTML).toBe('<p>0</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('flush 중 오류', () => {
  function failing(name, log) {
    const ctl = { fail: false, set: null };
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      ctl.set = s;
      log?.push(name);
      if (ctl.fail) throw new Error(`${name} render boom`);
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();
    if (log) log.length = 0;
    return Object.assign(ctl, { fn, comp, container });
  }

  it('TC-BATCH-030 A 의 렌더가 던져도 B 는 렌더되고 A 의 예외를 던진다. A 는 상태 유지·DOM 그대로·표시는 지워진다', () => {
    const a = failing('A');
    const b = counter('B');
    const vnodeBefore = a.comp.vnode;

    a.fail = true;
    const r = caught(() =>
      batch(() => {
        a.set(1);
        b.set(1);
      }),
    );
    expect(r.threw).toBe(true);
    expect(r.error.message).toBe('A render boom');
    expect(b.fn).toHaveBeenCalledTimes(1);
    expect(b.container.innerHTML).toBe('<p>1</p>');
    expect(a.container.innerHTML).toBe('<p>0</p>');
    expect(a.comp.vnode).toBe(vnodeBefore);
    expect(getCurrentComponent()).toBeNull();

    // 표시는 지워졌다: 아무것도 setState 하지 않은 다음 batch 는 렌더하지 않는다
    a.fail = false;
    a.fn.mockClear();
    batch(() => {});
    expect(a.fn).not.toHaveBeenCalled();

    // 상태는 1 로 남아 있다: 같은 값 setState 는 아무것도 하지 않고, update() 가 그린다
    batch(() => a.set(1));
    expect(a.fn).not.toHaveBeenCalled();
    a.comp.update();
    expect(a.container.innerHTML).toBe('<p>1</p>');
  });

  it('TC-BATCH-031 A·B 둘 다 렌더가 던지면 둘 다 시도하고 먼저 표시된 A 의 예외를 던진다', () => {
    const log = [];
    const a = failing('A', log);
    const b = failing('B', log);
    a.fail = true;
    b.fail = true;
    const r = caught(() =>
      batch(() => {
        a.set(1);
        b.set(1);
      }),
    );
    expect(r.error.message).toBe('A render boom');
    expect(log).toEqual(['A', 'B']);
    expect(a.container.innerHTML).toBe('<p>0</p>');
    expect(b.container.innerHTML).toBe('<p>0</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('unmount (결정 0016 규칙 5)', () => {
  it('TC-BATCH-040 batch 안에서 setState 뒤 unmount → 렌더 없음, 예외 없음, container 비어 있음. unmount 뒤 setState 도 무시', () => {
    const c = counter();
    const other = counter('other');
    const r = caught(() =>
      batch(() => {
        c.set(1);
        other.set(1);
        c.comp.unmount();
        c.set(2);
      }),
    );
    expect(r.threw).toBe(false);
    expect(c.fn).not.toHaveBeenCalled();
    expect(c.container.innerHTML).toBe('');
    expect(other.fn).toHaveBeenCalledTimes(1);
    expect(other.container.innerHTML).toBe('<p>1</p>');
  });

  it('TC-BATCH-041 flush 도중 앞 컴포넌트(A)의 effect 가 표시된 B 를 unmount 하면 B 는 건너뛴다 (예외 없음)', () => {
    const b = counter('B');
    let setA;
    const fnA = vi.fn(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a === 1) b.comp.unmount();
      }, [a]);
      return h('p', null, String(a));
    });
    const compA = new FunctionComponent(fnA);
    const boxA = makeContainer();
    compA.mount(boxA);
    fnA.mockClear();

    const r = caught(() =>
      batch(() => {
        setA(1);
        b.set(1);
      }),
    );
    expect(r.threw).toBe(false);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(boxA.innerHTML).toBe('<p>1</p>');
    expect(b.fn).not.toHaveBeenCalled();
    expect(b.container.innerHTML).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('렌더·commit·effect 중 setState: 기존 재진입 규칙 (결정 0016 규칙 6)', () => {
  // 구현이 무한 반복에 빠져도 테스트가 멈추지 않도록, 200번을 넘으면 다른 예외로 끊는다.
  const RUNAWAY = 200;

  it('TC-BATCH-050 flush 의 effect 가 파생 상태를 setState → 같은 batch 안에서 수렴, 렌더 2번, batch 가 돌아오면 반영', () => {
    let setN;
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      const [double, setDouble] = useState(0);
      setN = s;
      useEffect(() => {
        setDouble(n * 2);
      }, [n]);
      return h('p', null, `${n}:${double}`);
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();

    batch(() => setN(3));
    expect(container.innerHTML).toBe('<p>3:6</p>');
    expect(fn).toHaveBeenCalledTimes(2);
    expectConsistent(comp, container);
  });

  it('TC-BATCH-051 flush 의 effect 가 매번 setState → batch 가 /25/·"effect" Error (무한 반복 없음), DOM 일치, 멈추면 정상', () => {
    let loop = false;
    let runs = 0;
    let setN;
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      useEffect(() => {
        if (!loop) return;
        runs += 1;
        if (runs > RUNAWAY) throw new Error('runaway');
        s((p) => p + 1);
      });
      return h('p', null, String(n));
    });
    const container = makeContainer();
    comp.mount(container);

    loop = true;
    const r = caught(() => batch(() => setN(100)));
    expect(r.threw).toBe(true);
    expect(r.error.message).toMatch(/25/);
    expect(r.error.message).toMatch(/effect/i);
    expect(runs).toBeLessThanOrEqual(30);
    expect(getCurrentComponent()).toBeNull();
    expectConsistent(comp, container);

    loop = false;
    setN(-1);
    expect(container.innerHTML).toBe('<p>-1</p>');
  });

  it('TC-BATCH-052 flush 의 렌더 안 setState: 수렴하면 batch 가 돌아올 때 반영, 매번 바꾸면 /25/ Error (무한 반복 없음)', () => {
    let mode = 'off';
    let renders = 0;
    let setN;
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      renders += 1;
      if (renders > RUNAWAY) throw new Error('runaway');
      if (mode === 'converge' && n < 3) s(n + 1);
      if (mode === 'loop') s((p) => p + 1);
      return h('p', null, String(n));
    });
    const container = makeContainer();
    comp.mount(container);

    mode = 'converge';
    batch(() => setN(1));
    expect(container.innerHTML).toBe('<p>3</p>');

    mode = 'loop';
    renders = 0;
    const r = caught(() => batch(() => setN(100)));
    expect(r.threw).toBe(true);
    expect(r.error.message).toMatch(/25/);
    expect(renders).toBeLessThanOrEqual(30);
    expectConsistent(comp, container);

    mode = 'off';
    setN(-1);
    expect(container.innerHTML).toBe('<p>-1</p>');
  });

  it('TC-BATCH-053 flush 의 A effect 가 다른 컴포넌트 B 를 setState → batch 가 돌아오면 B 에 반영돼 있다 (횟수는 정하지 않음)', () => {
    const b = counter('B');
    let setA;
    const compA = new FunctionComponent(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a > 0) b.set(a * 10);
      }, [a]);
      return h('p', null, String(a));
    });
    const boxA = makeContainer();
    compA.mount(boxA);

    batch(() => setA(1));
    expect(boxA.innerHTML).toBe('<p>1</p>');
    expect(b.container.innerHTML).toBe('<p>10</p>');

    // B 가 A 보다 먼저 표시돼 이미 flush 된 경우도 같다
    batch(() => {
      b.set(5);
      setA(2);
    });
    expect(boxA.innerHTML).toBe('<p>2</p>');
    expect(b.container.innerHTML).toBe('<p>20</p>');
  });

  it('TC-BATCH-054 batch 안에서 comp.update() 를 직접 부르면 바로 렌더한다 (batch 는 setState 만 미룬다)', () => {
    const c = counter();
    const seen = [];
    batch(() => {
      c.set(1);
      seen.push(c.container.innerHTML);
      c.comp.update();
      seen.push(c.container.innerHTML, c.fn.mock.calls.length);
    });
    expect(seen).toEqual(['<p>0</p>', '<p>1</p>', 1]);
    expect(c.container.innerHTML).toBe('<p>1</p>');
    expectConsistent(c.comp, c.container);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('리뷰(#10): flush 재진입(D1)과 중복 렌더(D2)', () => {
  // 값이 1 이 되면 렌더에서 던지는 컴포넌트 C.
  function boomOn1(name = 'C') {
    let setter;
    const fn = vi.fn(() => {
      const [v, s] = useState(0);
      setter = s;
      if (v === 1) throw new Error(`${name} render boom`);
      return h('i', null, String(v));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();
    return { comp, fn, container, set: (next) => setter(next) };
  }

  // deps 없는 effect 를 세는 컴포넌트 B.
  function effectCounter() {
    let setter;
    const out = { effects: 0 };
    const fn = vi.fn(() => {
      const [v, s] = useState(0);
      setter = s;
      useEffect(() => {
        out.effects += 1;
      });
      return h('b', null, String(v));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);
    fn.mockClear();
    out.effects = 0;
    return Object.assign(out, { comp, fn, container, set: (next) => setter(next) });
  }

  it('TC-BATCH-070 큐 [A, C]: A 의 effect 가 setState 뒤 batch 를 열어도 C 를 대신 처리하지 않는다 — 바깥 batch 가 C 의 예외, A 는 <p>1:2</p>', () => {
    let setA;
    const fnA = vi.fn(() => {
      const [a, s] = useState(0);
      const [d, setD] = useState(0);
      setA = s;
      useEffect(() => {
        if (a === 0) return;
        setD(a * 2);
        batch(() => {});
      }, [a]);
      return h('p', null, `${a}:${d}`);
    });
    const compA = new FunctionComponent(fnA);
    const boxA = makeContainer();
    compA.mount(boxA);
    const c = boomOn1('C');

    const r = caught(() =>
      batch(() => {
        setA(1);
        c.set(1);
      }),
    );
    expect(r.threw).toBe(true);
    expect(r.error?.message).toBe('C render boom');
    // 화면과 슬롯이 어긋나지 않는다: effect 의 setD(2) 까지 A 의 update() 안에서 반영
    expect(boxA.innerHTML).toBe('<p>1:2</p>');
    expectConsistent(compA, boxA);
    // C 는 바깥 flush 에서 1번 시도됐고 DOM 은 그대로
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<i>0</i>');
    expect(getCurrentComponent()).toBeNull();
  });

  it('TC-BATCH-071 큐 [A, C]: A 의 effect 안 batch(() => "x") 는 "x" 를 돌려준다 (C 의 예외를 대신 던지지 않음), 바깥 batch 가 C 의 예외', () => {
    let setA;
    const log = [];
    const compA = new FunctionComponent(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a === 0) return;
        log.push(batch(() => 'x'));
      }, [a]);
      return h('p', null, String(a));
    });
    const boxA = makeContainer();
    compA.mount(boxA);
    const c = boomOn1('C');

    const r = caught(() =>
      batch(() => {
        setA(1);
        c.set(1);
      }),
    );
    expect(log).toEqual(['x']);
    expect(r.threw).toBe(true);
    expect(r.error?.message).toBe('C render boom');
    expect(boxA.innerHTML).toBe('<p>1</p>');
    expectConsistent(compA, boxA);
  });

  it('TC-BATCH-072 큐 [A, B]: A 의 effect 가 B 를 setState → B 는 렌더 1번·effect 1번·<b>10</b>, 다음 batch 의 B 표시는 다시 렌더된다', () => {
    const b = effectCounter();
    let setA;
    const compA = new FunctionComponent(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a > 0) b.set(a * 10);
      }, [a]);
      return h('p', null, String(a));
    });
    const boxA = makeContainer();
    compA.mount(boxA);

    batch(() => {
      setA(1);
      b.set(1);
    });
    expect(boxA.innerHTML).toBe('<p>1</p>');
    expect(b.fn).toHaveBeenCalledTimes(1);
    expect(b.effects).toBe(1);
    expect(b.container.innerHTML).toBe('<b>10</b>');
    expectConsistent(b.comp, b.container);

    // 건너뛰기는 그 표시 1번에만 해당한다: 다음 batch 의 표시는 평소대로 렌더 1번
    b.fn.mockClear();
    b.effects = 0;
    batch(() => b.set(11));
    expect(b.fn).toHaveBeenCalledTimes(1);
    expect(b.effects).toBe(1);
    expect(b.container.innerHTML).toBe('<b>11</b>');
  });

  it('TC-BATCH-073 큐 [A, B]: A 의 effect 가 연 batch 안에서 B 를 setState → 그 batch 가 돌아올 때 B 반영, B 는 렌더 1번·effect 1번', () => {
    const b = effectCounter();
    const seen = [];
    let setA;
    const compA = new FunctionComponent(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a === 0) return;
        batch(() => b.set(a * 10));
        seen.push(b.container.innerHTML);
      }, [a]);
      return h('p', null, String(a));
    });
    const boxA = makeContainer();
    compA.mount(boxA);

    batch(() => {
      setA(1);
      b.set(1);
    });
    expect(seen).toEqual(['<b>10</b>']);
    expect(b.fn).toHaveBeenCalledTimes(1);
    expect(b.effects).toBe(1);
    expect(b.container.innerHTML).toBe('<b>10</b>');
    expectConsistent(b.comp, b.container);
  });

  it('TC-BATCH-074 batch 안에서 직접 부른 update() 의 렌더 중 setState·effect 의 setState 는 update() 가 돌아올 때 이미 반영 (<p>2e</p>)', () => {
    let setN;
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      const [t, setT] = useState('-');
      setN = s;
      if (n === 1) s(2);
      useEffect(() => {
        if (n === 2) setT('e');
      }, [n]);
      return h('p', null, `${n}${t}`);
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();
    comp.mount(container);

    const seen = [];
    batch(() => {
      setN(1);
      comp.update();
      seen.push(container.innerHTML);
    });
    expect(seen).toEqual(['<p>2e</p>']);
    expect(container.innerHTML).toBe('<p>2e</p>');
    expectConsistent(comp, container);
  });

  it('TC-BATCH-075 batch 안에서 mount 실패한 컴포넌트의 오래된 setState(값·업데이터)는 무시: 예외·렌더 없음, 다시 mount 한 뒤에도 영향 없음', () => {
    let stale;
    let fail = true;
    const updater = vi.fn((p) => p + 1);
    const fn = vi.fn(() => {
      const [n, s] = useState(0);
      stale = s;
      if (fail) throw new Error('mount boom');
      return h('p', null, String(n));
    });
    const comp = new FunctionComponent(fn);
    const container = makeContainer();

    let mountError;
    const r = caught(() =>
      batch(() => {
        mountError = caught(() => comp.mount(container)).error;
        stale(5);
        stale(updater);
      }),
    );
    expect(mountError?.message).toBe('mount boom');
    expect(r.threw).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(updater).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');

    fail = false;
    const oldStale = stale;
    comp.mount(container);
    fn.mockClear();
    expect(container.innerHTML).toBe('<p>0</p>');
    const r2 = caught(() => batch(() => oldStale(9)));
    expect(r2.threw).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('<p>0</p>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('재리뷰(#10) D2′: update() 뒤의 setState 는 새 표시', () => {
  it('TC-BATCH-079 batch(() => { set(1); comp.update(); set(2); }) → update() 직후 <p>1</p>, flush 에서 렌더 1번 더(합 2번), 최종 <p>2</p>', () => {
    const c = counter('c', 0);
    const seen = [];
    batch(() => {
      c.set(1);
      c.comp.update();
      seen.push(c.container.innerHTML);
      c.set(2);
      seen.push(c.container.innerHTML);
    });
    // update() 는 바로 렌더, 그 뒤 set(2) 는 표시만 (DOM 그대로)
    expect(seen).toEqual(['<p>1</p>', '<p>1</p>']);
    // update() 1번 + flush 1번
    expect(c.fn).toHaveBeenCalledTimes(2);
    expect(c.container.innerHTML).toBe('<p>2</p>');
    expectConsistent(c.comp, c.container);

    // 슬롯은 2: 같은 값 setState 는 아무것도 하지 않고, 다음 값은 평소대로 반영
    c.fn.mockClear();
    batch(() => c.set(2));
    expect(c.fn).not.toHaveBeenCalled();
    batch(() => c.set(3));
    expect(c.fn).toHaveBeenCalledTimes(1);
    expect(c.container.innerHTML).toBe('<p>3</p>');
  });

  it('TC-BATCH-080 큐 [A, B]: A 의 effect 가 batch(() => { b.set(10); b.comp.update(); b.set(20); }) → 그 batch 가 돌아올 때와 바깥 batch 뒤 모두 <b>20</b>', () => {
    let setterB;
    const fnB = vi.fn(() => {
      const [v, s] = useState(0);
      setterB = s;
      return h('b', null, String(v));
    });
    const compB = new FunctionComponent(fnB);
    const boxB = makeContainer();
    compB.mount(boxB);

    const seen = [];
    let setA;
    const compA = new FunctionComponent(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a === 0) return;
        batch(() => {
          setterB(10);
          compB.update();
          setterB(20);
        });
        seen.push(boxB.innerHTML);
      }, [a]);
      return h('p', null, String(a));
    });
    const boxA = makeContainer();
    compA.mount(boxA);

    batch(() => {
      setA(1);
      setterB(1);
    });
    expect(boxA.innerHTML).toBe('<p>1</p>');
    expect(seen).toEqual(['<b>20</b>']);
    expect(boxB.innerHTML).toBe('<b>20</b>');
    expectConsistent(compB, boxB);
  });
});
