// 통합: 이벤트 dispatch → runHandler 의 batch → 렌더 1번 → diff/patch → effect (이슈 #10, 결정 0016).
// batch(fn) 의 계약은 tests/unit/batching.test.js 맨 위 주석. 여기서는 이벤트 핸들러 쪽 계약을 정한다.
//
// import { batch } from '../../src/core/scheduler.js';
//
// ── runHandler (src/vdom/render.js) ─────────────────────────────────────────────────
//   - 이 라이브러리가 붙인 on* 핸들러(함수 prop)를 부를 때마다 그 호출을 batch 로 감싼다: 리스너 호출 1번 = batch 1개.
//     그래서 한 핸들러 안의 setState 여러 번(같은 컴포넌트의 여러 슬롯, 업데이터 포함)은 핸들러가 끝날 때
//     **컴포넌트마다 렌더 1번 · diff/patch 1번 · effect 단계 1번** 이다. 렌더 횟수는 루트 fn 호출 횟수로 센다.
//   - 핸들러 안에서 DOM 을 읽으면 아직 이전 값이다 (렌더가 핸들러 끝으로 미뤄졌으므로).
//   - dispatch 는 동기다: el.click() / dispatchEvent 가 돌아오면 (await 없이) DOM 에 반영돼 있다.
//   - 핸들러가 던지면 batch 규칙대로 그 전까지의 setState 를 렌더한 뒤 예외를 다시 던진다. 리스너 밖으로 나간
//     예외는 브라우저(jsdom)가 window 의 error 이벤트로 보고한다. 다음 이벤트는 정상이다.
//   - 핸들러 안에서 batch 를 직접 불러도(중첩) 렌더는 핸들러가 끝날 때 1번이다.
//   - 핸들러가 다른 컴포넌트(별도로 mount 한 FunctionComponent)를 setState 해도 그 컴포넌트도 1번이다.
//
//   이벤트 버블링 (알려진 한계)
//   - 자식과 부모에 각각 핸들러가 있으면 리스너가 두 번 불리므로 batch 도 두 개다. 둘 다 setState 하면
//     **렌더 2번**(effect 단계도 2번)이고, 최종 DOM 은 두 상태가 모두 반영된 것이다.
//     React 17 은 루트 하나에 위임한 리스너가 dispatch 전체를 한 batch 로 묶어 1번이다. 이 라이브러리는 요소마다
//     리스너를 붙이므로 dispatch 가 끝나는 시점을 동기로 알 수 없어, 그 차이를 받아들인다 (결정 0016 범위 A).
//
//   batch 밖 (지금처럼 동기)
//   - addEventListener 로 직접 붙인 리스너, 핸들러가 예약한 setTimeout·Promise 콜백 안의 setState 는 batch 밖이다:
//     setState 1번마다 동기로 렌더한다 (React 18 의 microtask batching 과 다른 점, 결정 0016 선택지 B).
//     (TC-BATCH-067 setTimeout·직접 리스너, TC-BATCH-078 Promise)
//
//   flush 도중의 dispatch (#10 리뷰 D1)
//   - 바깥 batch 의 flush 도중(앞 컴포넌트의 effect 안에서) on* 핸들러가 붙은 요소를 el.click() 하면 그 핸들러의 batch 는
//     **자기 핸들러 안에서 표시된 것만** 처리한다: click() 이 돌아오면 그 핸들러의 setState 는 반영돼 있고, 바깥 flush 에
//     남은 컴포넌트는 건드리지 않는다. 그래서 남은 컴포넌트의 렌더 예외는 바깥 batch 가 던지고, 리스너 밖으로 새어
//     window error 로 보고되지 않는다 (TC-BATCH-076). 규칙 전문은 tests/unit/batching.test.js 맨 위 flush 항목.
//
//   핸들러 안의 mount (#10 리뷰 D3)
//   - 핸들러 안에서 다른 컴포넌트를 mount 하면 그 mount 의 effect 단계에서 한 setState 는 mount() 가 돌아올 때 이미
//     반영돼 있다 (mount 중인 컴포넌트는 batch 표시가 아니라 component 재진입 규칙, TC-BATCH-077).
//
//   핸들러 안의 update() 뒤 setState (#10 재리뷰 D2′)
//   - 핸들러 안에서 setState → comp.update() → setState 순서면 update() 는 바로 렌더하고, 그 뒤의 setState 는 새 표시라
//     핸들러가 끝날 때 다시 렌더한다: click 뒤 화면은 마지막 setState 의 값이다 (TC-BATCH-081).
//     규칙 전문은 tests/unit/batching.test.js 맨 위 flush 의 D2′ 항목.
//
//   제어 요소 (결정 0016 규칙 7)
//   - 제어 요소 되돌리기(setTimeout 0)는 batch 렌더가 끝난 뒤에 확인하므로 화면 값은 마지막 VNode 값이다:
//     핸들러가 상태를 바꾸면 바꾼 값(변환한 값 포함), 결국 같은 값으로 돌려놓으면 원래 값으로 되돌아간다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { batch } from '../../src/core/scheduler.js';
import { useState, useEffect } from '../../src/core/hooks.js';
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

function expectConsistent(comp, container) {
  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild).toBe(comp.dom);
  expect(comp.dom.isEqualNode(render(comp.vnode))).toBe(true);
}

afterEach(() => {
  document.body.innerHTML = '';
});

// 자식은 props 만 받는 순수 함수 (Phase 2 원칙).
const Display = ({ n, label }) => h('p', null, `${n}${label}`);
const Button = ({ onPress, text }) => h('button', { onClick: onPress }, text);

describe('이벤트 핸들러 = batch 1개', () => {
  it('TC-BATCH-060 클릭 1번에 setState 3번(슬롯 2개): 렌더 1번, 핸들러 안에서는 이전 DOM, click() 직후 반영, DOM 기록 1건, effect 1번', () => {
    const effects = [];
    const inHandler = [];
    let p;
    const App = vi.fn(() => {
      const [n, setN] = useState(0);
      const [label, setLabel] = useState('a');
      useEffect(() => {
        effects.push(`${n}${label}`);
      });
      return h(
        'div',
        null,
        h(Display, { n, label }),
        h(Button, {
          text: 'go',
          onPress: () => {
            setN((x) => x + 1);
            inHandler.push(p.textContent);
            setN((x) => x + 1);
            setLabel('b');
            inHandler.push(p.textContent);
          },
        }),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    p = container.querySelector('p');
    const button = container.querySelector('button');
    App.mockClear();
    effects.length = 0;
    const rec = record(container);

    button.click();
    expect(App).toHaveBeenCalledTimes(1);
    expect(inHandler).toEqual(['0a', '0a']);
    expect(p.textContent).toBe('2b');
    expect(effects).toEqual(['2b']);
    const records = rec.take();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(container.querySelector('p')).toBe(p);
    expect(container.querySelector('button')).toBe(button);

    button.click();
    expect(App).toHaveBeenCalledTimes(2);
    expect(p.textContent).toBe('4b');
    expect(effects).toEqual(['2b', '4b']);
    expectConsistent(comp, container);
    rec.stop();
  });

  it('TC-BATCH-061 (알려진 한계) 버블링: 자식·부모 핸들러가 각각 setState → 렌더 2번, effect 2번, 최종 DOM 은 둘 다 반영', () => {
    const effects = [];
    const App = vi.fn(() => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      useEffect(() => {
        effects.push(`a${a}b${b}`);
      });
      return h(
        'div',
        { onClick: () => setB((x) => x + 1) },
        h('button', { onClick: () => setA((x) => x + 1) }, `a${a}b${b}`),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    App.mockClear();
    effects.length = 0;

    container.querySelector('button').click();
    expect(App).toHaveBeenCalledTimes(2);
    expect(effects).toEqual(['a1b0', 'a1b1']);
    expect(container.querySelector('button').textContent).toBe('a1b1');
    expectConsistent(comp, container);
  });

  it('TC-BATCH-062 핸들러가 setState 뒤 던짐: 렌더 1번 후 예외가 window error 로 보고되고, 다음 클릭은 정상', () => {
    const err = new Error('handler boom');
    let boom = true;
    const App = vi.fn(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: () => {
            setN((x) => x + 1);
            setN((x) => x + 1);
            if (boom) throw err;
          },
        },
        String(n),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    const button = comp.mount(container);
    App.mockClear();

    const reported = [];
    const onError = (e) => {
      reported.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      button.click();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(reported).toEqual([err]);
    expect(reported[0]).toBe(err);
    expect(App).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('2');

    boom = false;
    button.click();
    expect(App).toHaveBeenCalledTimes(2);
    expect(button.textContent).toBe('4');
    expectConsistent(comp, container);
  });

  it('TC-BATCH-063 핸들러 안에서 batch 를 중첩해 불러도 렌더는 핸들러가 끝날 때 1번', () => {
    const inner = [];
    const App = vi.fn(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: (e) => {
            const el = e.currentTarget;
            batch(() => {
              setN((x) => x + 1);
              batch(() => setN((x) => x + 1));
            });
            inner.push(el.textContent);
            setN((x) => x + 1);
          },
        },
        String(n),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    const button = comp.mount(container);
    App.mockClear();

    button.click();
    expect(inner).toEqual(['0']);
    expect(App).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('3');
  });

  it('TC-BATCH-066 핸들러가 자기 컴포넌트와 별도 컴포넌트 B 를 setState → 각각 렌더 1번', () => {
    let setB;
    const B = vi.fn(() => {
      const [v, s] = useState(0);
      setB = s;
      return h('i', null, String(v));
    });
    const compB = new FunctionComponent(B);
    const boxB = makeContainer();
    compB.mount(boxB);

    const A = vi.fn(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: () => {
            setN((x) => x + 1);
            setB((x) => x + 1);
            setN((x) => x + 1);
            setB((x) => x + 1);
          },
        },
        String(n),
      );
    });
    const compA = new FunctionComponent(A);
    const boxA = makeContainer();
    const button = compA.mount(boxA);
    A.mockClear();
    B.mockClear();

    button.click();
    expect(A).toHaveBeenCalledTimes(1);
    expect(B).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('2');
    expect(boxB.innerHTML).toBe('<i>2</i>');
  });

  it('TC-BATCH-067 batch 밖: addEventListener 로 직접 붙인 리스너와 핸들러의 setTimeout 콜백 안 setState 는 1번마다 동기 렌더', async () => {
    let setN;
    const seen = [];
    const App = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      return h(
        'button',
        {
          onClick: () => {
            setTimeout(() => {
              setN((x) => x + 1);
              seen.push(container.textContent);
              setN((x) => x + 1);
            }, 0);
          },
        },
        String(n),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    const button = comp.mount(container);
    App.mockClear();

    const direct = () => {
      setN((x) => x + 1);
      seen.push(container.textContent);
      setN((x) => x + 1);
    };
    container.addEventListener('keydown', direct);
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    container.removeEventListener('keydown', direct);
    expect(App).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['1']);
    expect(button.textContent).toBe('2');

    App.mockClear();
    button.click();
    await flush();
    expect(App).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['1', '3']);
    expect(button.textContent).toBe('4');
  });
});

// 던진 값이 undefined 여도 구분한다.
function caught(fn) {
  try {
    fn();
  } catch (error) {
    return { threw: true, error };
  }
  return { threw: false, error: undefined };
}

describe('리뷰(#10): flush 도중 dispatch, 핸들러 안 mount, Promise 콜백', () => {
  it('TC-BATCH-076 큐 [A, C]: A 의 effect 가 onClick 버튼을 click() → 그 핸들러의 setState 만 반영, C 의 예외는 바깥 batch 가 던지고 window error 는 없다', () => {
    // 핸들러가 자기 상태를 바꾸는 버튼 H
    const H = new FunctionComponent(() => {
      const [e, s] = useState(0);
      return h('button', { onClick: () => s((x) => x + 1) }, String(e));
    });
    const btn = H.mount(makeContainer());

    let setC;
    const C = vi.fn(() => {
      const [v, s] = useState(0);
      setC = s;
      if (v === 1) throw new Error('C render boom');
      return h('i', null, String(v));
    });
    const compC = new FunctionComponent(C);
    const boxC = makeContainer();
    compC.mount(boxC);
    C.mockClear();

    let setA;
    const seen = [];
    const compA = new FunctionComponent(() => {
      const [a, s] = useState(0);
      setA = s;
      useEffect(() => {
        if (a === 0) return;
        btn.click();
        seen.push(btn.textContent);
      }, [a]);
      return h('p', null, String(a));
    });
    const boxA = makeContainer();
    compA.mount(boxA);

    const reported = [];
    const onError = (e) => {
      reported.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    let r;
    try {
      r = caught(() =>
        batch(() => {
          setA(1);
          setC(1);
        }),
      );
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(reported).toEqual([]);
    expect(r.threw).toBe(true);
    expect(r.error?.message).toBe('C render boom');
    expect(seen).toEqual(['1']);
    expect(boxA.innerHTML).toBe('<p>1</p>');
    expect(C).toHaveBeenCalledTimes(1);
    expect(boxC.innerHTML).toBe('<i>0</i>');
  });

  it('TC-BATCH-077 핸들러 안 child.mount(box): child 의 useEffect(() => setD(1), []) 는 mount() 가 돌아올 때 이미 반영 (<p>1</p>)', () => {
    const child = new FunctionComponent(() => {
      const [d, setD] = useState(0);
      useEffect(() => {
        setD(1);
      }, []);
      return h('p', null, String(d));
    });
    const box = makeContainer();
    let seen = null;
    const App = new FunctionComponent(() =>
      h(
        'button',
        {
          onClick: () => {
            child.mount(box);
            seen = box.innerHTML;
          },
        },
        'mount',
      ),
    );
    const button = App.mount(makeContainer());

    button.click();
    expect(seen).toBe('<p>1</p>');
    expect(box.innerHTML).toBe('<p>1</p>');
    expectConsistent(child, box);
  });

  it('TC-BATCH-078 batch 밖: 핸들러가 예약한 Promise 콜백 안 setState 2번은 각각 동기 렌더 (렌더 2번, 사이 텍스트 "1")', async () => {
    let setN;
    const seen = [];
    let button;
    const App = vi.fn(() => {
      const [n, s] = useState(0);
      setN = s;
      return h(
        'button',
        {
          onClick: () => {
            Promise.resolve().then(() => {
              setN((x) => x + 1);
              seen.push(button.textContent);
              setN((x) => x + 1);
            });
          },
        },
        String(n),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    button = comp.mount(container);
    App.mockClear();

    button.click();
    expect(App).not.toHaveBeenCalled();
    await flush();
    expect(App).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['1']);
    expect(button.textContent).toBe('2');
    expectConsistent(comp, container);
  });

  it('TC-BATCH-081 핸들러 () => { setN(1); comp.update(); setN(2); } → click 뒤 "2" (update() 뒤의 setState 는 새 표시, 재리뷰 D2′)', () => {
    let comp;
    const seen = [];
    const App = vi.fn(() => {
      const [n, setN] = useState(0);
      return h(
        'button',
        {
          onClick: (e) => {
            setN(1);
            comp.update();
            seen.push(e.currentTarget.textContent);
            setN(2);
          },
        },
        String(n),
      );
    });
    comp = new FunctionComponent(App);
    const container = makeContainer();
    const button = comp.mount(container);
    App.mockClear();

    button.click();
    expect(seen).toEqual(['1']);
    expect(App).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('2');
    expectConsistent(comp, container);
  });
});

describe('제어 요소 되돌리기는 batch 렌더 뒤 (결정 0016 규칙 7)', () => {
  it('TC-BATCH-064 상태를 바꾸는 핸들러: input 은 변환한 값(대문자), checkbox 는 켜짐 — 이벤트당 렌더 1번', async () => {
    const App = vi.fn(() => {
      const [text, setText] = useState('');
      const [on, setOn] = useState(false);
      const [count, setCount] = useState(0);
      return h(
        'div',
        null,
        h('input', {
          value: text,
          onInput: (e) => {
            setText(e.target.value.toUpperCase());
            setCount((c) => c + 1);
          },
        }),
        h('input', {
          type: 'checkbox',
          checked: on,
          onChange: (e) => {
            setOn(e.target.checked);
            setCount((c) => c + 1);
          },
        }),
        h('span', null, String(count)),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    const [input, box] = container.querySelectorAll('input');
    const span = container.querySelector('span');
    App.mockClear();

    for (const ch of 'ab') {
      input.value += ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    }
    expect(App).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('AB');
    expect(span.textContent).toBe('2');

    box.click();
    await flush();
    expect(App).toHaveBeenCalledTimes(3);
    expect(box.checked).toBe(true);
    expect(span.textContent).toBe('3');
    expectConsistent(comp, container);
  });

  it('TC-BATCH-065 결국 같은 값으로 돌려놓는 핸들러: 렌더 1번, flush 뒤 input 은 원래 값, checkbox 는 꺼짐', async () => {
    const App = vi.fn(() => {
      const [text, setText] = useState('x');
      const [on, setOn] = useState(false);
      return h(
        'div',
        null,
        h('input', {
          value: text,
          onInput: (e) => {
            setText(e.target.value);
            setText(text);
          },
        }),
        h('input', {
          type: 'checkbox',
          checked: on,
          onClick: () => {
            setOn(true);
            setOn(false);
          },
        }),
      );
    });
    const comp = new FunctionComponent(App);
    const container = makeContainer();
    comp.mount(container);
    const [input, box] = container.querySelectorAll('input');
    App.mockClear();

    input.value = 'xy';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(App).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('x');

    box.click();
    await flush();
    expect(App).toHaveBeenCalledTimes(2);
    expect(box.checked).toBe(false);
    expectConsistent(comp, container);
  });
});
