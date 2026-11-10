// FunctionComponent 의 onUpdate 관찰 통로 (이슈 #11, 결정 0015 의 "patch 수 표시"). 이 파일이 명세다.
//
// import { FunctionComponent } from '../../src/core/component.js';
//
// ── new FunctionComponent(fn, props?, options?) ──────────────────────────────────
//   - 세 번째 인자 options 를 새로 받는다. null / undefined / {} 이면 지금과 똑같이 동작한다(기존 계약 유지).
//   - options.onUpdate: 함수 | undefined | null. 그 밖의 값이면 생성자에서 TypeError (메시지에 'onUpdate').
//
// ── onUpdate(patches) 호출 규칙 ───────────────────────────────────────────────────
//   - comp.update() 가 **실제로 렌더를 시작해 예외 없이 끝났을 때**, 돌아오기 직전(effect 단계와 그 재렌더까지 끝난 뒤)
//     **한 번** 부른다. 인자는 update() 가 돌려줄 배열 그 자체(같은 참조)다: 이번 호출이 적용한 patch 전부, 적용 순서.
//     변화가 없어도 렌더했으면 [] 로 부른다.
//   - 부르지 않는 경우: mount() (첫 렌더와 mount 안의 재렌더 모두), 렌더·commit·effect 단계 중이라 표시만 하고 [] 를
//     돌려준 update() (재진입), 예외로 끝난 update().
//   - batch flush 와 이벤트 핸들러도 결국 update() 를 부르므로 같은 규칙이다: 핸들러 안 setState 여러 번 → onUpdate 1번.
//
// 왜 이 방식인가
//   - batch flush 는 update() 의 반환값을 버리므로, 데모(App)가 "이번 클릭의 patch 수" 를 알 통로가 없다.
//   - 생성 옵션의 콜백은 기존 생성자 인자(fn, props)와 update() 반환값 계약을 바꾸지 않고, 전역 상태도 만들지 않는다.
//     scheduler(batch) 에 반환값을 모으는 방식은 컴포넌트가 여럿일 때 누구의 patch 인지 섞이고, 핸들러 밖 setState
//     (popstate 등)는 놓친다.
//
// 알려진 한계 (테스트 없음)
//   - onUpdate 안에서 같은 컴포넌트를 setState / update 하는 경우는 정하지 않는다 (재진입 규칙 밖, 동기 재귀가 된다).
//   - onUpdate 가 던지면 그 예외는 update() 밖으로 나간다. DOM 은 이미 반영돼 있다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { FunctionComponent } from '../../src/core/component.js';
import { useState, useEffect } from '../../src/core/hooks.js';
import { h } from '../../src/vdom/vnode.js';

const containers = [];
function makeContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  return container;
}
afterEach(() => {
  while (containers.length) containers.pop().remove();
});

describe('onUpdate(patches)', () => {
  it('TC-COMP-060 update 1번 → onUpdate 1번, 인자는 update 의 반환값과 같은 배열', () => {
    let n = 0;
    const onUpdate = vi.fn();
    const comp = new FunctionComponent(() => h('p', null, String(n)), null, { onUpdate });
    comp.mount(makeContainer());
    n = 1;
    const out = comp.update();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0]).toHaveLength(1);
    expect(onUpdate.mock.calls[0][0]).toBe(out);
    expect(out).toEqual([{ type: 'TEXT', path: [0], text: '1' }]);
  });

  it('TC-COMP-061 BVA 변화 없는 update 도 [] 로 1번 부른다', () => {
    const onUpdate = vi.fn();
    const comp = new FunctionComponent(() => h('p', null, 'same'), null, { onUpdate });
    comp.mount(makeContainer());
    const out = comp.update();
    expect(out).toEqual([]);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toBe(out);
  });

  it('TC-COMP-062 mount 는 부르지 않는다 (mount 안의 렌더 중 재렌더 포함), 그 뒤 update 는 부른다', () => {
    const onUpdate = vi.fn();
    const comp = new FunctionComponent(() => {
      const [n, setN] = useState(0);
      if (n === 0) setN(1); // 첫 렌더 중 재진입 → mount 안에서 다시 렌더
      return h('p', null, String(n));
    }, null, { onUpdate });
    const container = makeContainer();
    comp.mount(container);
    expect(container.innerHTML).toBe('<p>1</p>');
    expect(onUpdate).not.toHaveBeenCalled();
    comp.update();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('TC-COMP-063 effect 가 일으킨 재렌더의 patch 까지 한 번에 받는다', () => {
    let ext = 0;
    const onUpdate = vi.fn();
    const comp = new FunctionComponent(() => {
      const [m, setM] = useState(0);
      useEffect(() => setM(ext * 10), [ext]);
      return h('p', null, `${ext}:${m}`);
    }, null, { onUpdate });
    const container = makeContainer();
    comp.mount(container);
    ext = 1;
    const out = comp.update();
    expect(container.innerHTML).toBe('<p>1:10</p>');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toBe(out);
    expect(out).toEqual([
      { type: 'TEXT', path: [0], text: '1:0' },
      { type: 'TEXT', path: [0], text: '1:10' },
    ]);
  });

  it('TC-COMP-064 클릭 핸들러 안 setState 2번(슬롯 2개) → onUpdate 1번, patch 2개', () => {
    const onUpdate = vi.fn();
    // 핸들러는 첫 렌더에서 한 번만 만들어 고정한다(setState 는 렌더 사이에 같은 함수):
    // 매 렌더 새 함수를 넘기면 diff 가 onClick PROPS 를 하나 더 낸다 (TC-APP-020 과 같은 동작).
    let onClick = null;
    const comp = new FunctionComponent(() => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      onClick ??= () => { setA(1); setB(2); };
      return h('div', null,
        h('p', null, String(a)),
        h('p', null, String(b)),
        h('button', { onClick }, 'go'),
      );
    }, null, { onUpdate });
    const container = makeContainer();
    comp.mount(container);
    container.querySelector('button').click();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toEqual([
      { type: 'TEXT', path: [0, 0], text: '1' },
      { type: 'TEXT', path: [1, 0], text: '2' },
    ]);
  });

  it('TC-COMP-065 EG 렌더가 던진 update 는 부르지 않고, 고친 뒤 update 는 부른다', () => {
    let boom = false;
    let n = 0;
    const onUpdate = vi.fn();
    const comp = new FunctionComponent(() => {
      if (boom) throw new Error('render boom');
      return h('p', null, String(n));
    }, null, { onUpdate });
    comp.mount(makeContainer());
    boom = true;
    expect(() => comp.update()).toThrow('render boom');
    expect(onUpdate).not.toHaveBeenCalled();
    boom = false;
    n = 2;
    comp.update();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toEqual([{ type: 'TEXT', path: [0], text: '2' }]);
  });

  it('TC-COMP-066 EG 렌더 중 재진입한 update() 는 부르지 않는다: 바깥 update 의 1번뿐', () => {
    let n = 0;
    let reenter = false;
    const onUpdate = vi.fn();
    let inner;
    const comp = new FunctionComponent(() => {
      if (reenter) {
        reenter = false;
        n = 5;
        inner = comp.update();
      }
      return h('p', null, String(n));
    }, null, { onUpdate });
    comp.mount(makeContainer());
    n = 1;
    reenter = true;
    const out = comp.update();
    expect(inner).toEqual([]);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toBe(out);
    expect(out).toEqual([{ type: 'TEXT', path: [0], text: '5' }]);
  });

  it('TC-COMP-067 EG options 검사: onUpdate 가 함수·null·undefined 가 아니면 TypeError, 나머지는 기존과 같다', () => {
    const fn = () => h('p', null, 'x');
    for (const bad of [5, 'f', {}, true]) {
      expect(() => new FunctionComponent(fn, null, { onUpdate: bad })).toThrow(TypeError);
      expect(() => new FunctionComponent(fn, null, { onUpdate: bad })).toThrow(/onUpdate/);
    }
    for (const ok of [undefined, null, {}, { onUpdate: undefined }, { onUpdate: null }]) {
      const comp = new FunctionComponent(fn, null, ok);
      const container = makeContainer();
      comp.mount(container);
      expect(comp.update()).toEqual([]);
      expect(container.innerHTML).toBe('<p>x</p>');
    }
  });
});
