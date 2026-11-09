// createHistory(initial) 의 API 계약 (이슈 #6, State History). 이 파일이 명세다.
//
// import { createHistory } from '../../src/phase1/history.js';
//
// createHistory(initial) → history
//   history.current     (getter) 지금 위치의 값. 처음에는 initial.
//   history.index       (getter) 지금 위치, 0 부터.
//   history.size        (getter) 저장된 값의 개수. 처음에는 1.
//   history.canBack     (getter) index > 0
//   history.canForward  (getter) index < size - 1
//   history.push(value)  지금 위치보다 앞쪽(forward) 기록을 모두 버리고 value 를 맨 뒤에 붙인 뒤 그리로 이동.
//                        값이 current 와 같아도 그대로 붙인다 (중복 판단은 호출자 몫).
//   history.back()       canBack 이면 한 칸 뒤로. 아니면 아무것도 바꾸지 않는다. 이동 후의 current 를 돌려준다.
//   history.forward()    canForward 이면 한 칸 앞으로. 아니면 아무것도 바꾸지 않는다. 이동 후의 current 를 돌려준다.
//   - 값은 복사하지 않고 받은 참조 그대로 저장·반환한다. 값의 종류는 상관없다 (Phase 1 은 VNode 배열).
//   - history 객체끼리 상태를 공유하지 않는다.
//
// 상태 전이 (기법 ST)
//   상태: 단일(size 1) / 처음(index 0, size>1) / 중간 / 끝(index size-1, size>1)
//   이벤트: push / back / forward
//   무효 전이: 단일·처음에서 back, 단일·끝에서 forward → 상태 그대로
import { describe, it, expect } from 'vitest';
import { createHistory } from '../../src/phase1/history.js';

function state(hist) {
  return {
    current: hist.current,
    index: hist.index,
    size: hist.size,
    canBack: hist.canBack,
    canForward: hist.canForward,
  };
}

// initial 다음에 values 를 차례로 push 한 history (끝 상태)
function filled(initial, ...values) {
  const hist = createHistory(initial);
  for (const v of values) hist.push(v);
  return hist;
}

describe('History: 단일 상태', () => {
  it('TC-HIST-001 처음 상태: current = initial, 크기 1, 양쪽 이동 불가', () => {
    expect(state(createHistory('a'))).toEqual({ current: 'a', index: 0, size: 1, canBack: false, canForward: false });
  });

  it('TC-HIST-002 단일 상태에서 back / forward 는 무효 전이 (상태 그대로, current 반환)', () => {
    const hist = createHistory('a');
    expect(hist.back()).toBe('a');
    expect(hist.forward()).toBe('a');
    expect(state(hist)).toEqual({ current: 'a', index: 0, size: 1, canBack: false, canForward: false });
  });

  it('TC-HIST-003 단일 --push--> 끝', () => {
    const hist = createHistory('a');
    hist.push('b');
    expect(state(hist)).toEqual({ current: 'b', index: 1, size: 2, canBack: true, canForward: false });
  });
});

describe('History: 처음·중간·끝 사이 전이', () => {
  it('TC-HIST-004 끝 --back--> 중간 --back--> 처음', () => {
    const hist = filled('a', 'b', 'c');
    expect(hist.back()).toBe('b');
    expect(state(hist)).toEqual({ current: 'b', index: 1, size: 3, canBack: true, canForward: true });
    expect(hist.back()).toBe('a');
    expect(state(hist)).toEqual({ current: 'a', index: 0, size: 3, canBack: false, canForward: true });
  });

  it('TC-HIST-005 처음 --forward--> 중간 --forward--> 끝', () => {
    const hist = filled('a', 'b', 'c');
    hist.back();
    hist.back();
    expect(hist.forward()).toBe('b');
    expect(state(hist)).toEqual({ current: 'b', index: 1, size: 3, canBack: true, canForward: true });
    expect(hist.forward()).toBe('c');
    expect(state(hist)).toEqual({ current: 'c', index: 2, size: 3, canBack: true, canForward: false });
  });

  it('TC-HIST-006 처음에서 back 은 무효 전이 (여러 번 눌러도 그대로)', () => {
    const hist = filled('a', 'b');
    hist.back();
    const before = state(hist);
    for (let i = 0; i < 3; i++) expect(hist.back()).toBe('a');
    expect(state(hist)).toEqual(before);
    expect(hist.forward()).toBe('b'); // 앞쪽 기록은 남아 있다
  });

  it('TC-HIST-007 끝에서 forward 는 무효 전이 (여러 번 눌러도 그대로)', () => {
    const hist = filled('a', 'b');
    const before = state(hist);
    for (let i = 0; i < 3; i++) expect(hist.forward()).toBe('b');
    expect(state(hist)).toEqual(before);
    expect(hist.back()).toBe('a');
  });
});

describe('History: 뒤로 간 뒤 push 하면 앞쪽 기록을 버린다', () => {
  it('TC-HIST-008 중간 --push--> 끝: 앞쪽 기록 삭제', () => {
    const hist = filled('a', 'b', 'c', 'd');
    hist.back();
    hist.back(); // b
    hist.push('x');
    expect(state(hist)).toEqual({ current: 'x', index: 2, size: 3, canBack: true, canForward: false });
    expect(hist.forward()).toBe('x'); // c, d 로 갈 수 없다
    expect(hist.back()).toBe('b');
    expect(hist.back()).toBe('a');
    expect(hist.canBack).toBe(false);
  });

  it('TC-HIST-009 처음 --push--> 끝: initial 뒤 기록 전부 삭제', () => {
    const hist = filled('a', 'b', 'c');
    hist.back();
    hist.back();
    hist.push('x');
    expect(state(hist)).toEqual({ current: 'x', index: 1, size: 2, canBack: true, canForward: false });
    expect(hist.back()).toBe('a');
    expect(hist.forward()).toBe('x');
  });

  it('TC-HIST-010 끝 --push--> 끝: 아무것도 버리지 않는다', () => {
    const hist = filled('a', 'b');
    hist.push('c');
    expect(state(hist)).toEqual({ current: 'c', index: 2, size: 3, canBack: true, canForward: false });
    expect(hist.back()).toBe('b');
    expect(hist.back()).toBe('a');
  });
});

describe('History: 값과 인스턴스 (에러 추측)', () => {
  it('TC-HIST-011 값을 복사하지 않고 같은 참조로 돌려준다', () => {
    const v0 = [{ type: 'p' }];
    const v1 = [{ type: 'div' }];
    const hist = createHistory(v0);
    expect(hist.current).toBe(v0);
    hist.push(v1);
    expect(hist.current).toBe(v1);
    expect(hist.back()).toBe(v0);
    expect(hist.forward()).toBe(v1);
  });

  it('TC-HIST-012 current 와 같은 값을 push 해도 기록이 하나 늘어난다', () => {
    const v = ['same'];
    const hist = createHistory(v);
    hist.push(v);
    expect(state(hist)).toEqual({ current: v, index: 1, size: 2, canBack: true, canForward: false });
  });

  it('TC-HIST-013 falsy 값(null, 0, "")도 평범한 값으로 저장한다', () => {
    const hist = createHistory(null);
    hist.push(0);
    hist.push('');
    expect(state(hist)).toEqual({ current: '', index: 2, size: 3, canBack: true, canForward: false });
    expect(hist.back()).toBe(0);
    expect(hist.back()).toBe(null);
    expect(hist.canBack).toBe(false);
  });

  it('TC-HIST-014 두 history 는 상태를 공유하지 않는다', () => {
    const h1 = createHistory('a');
    const h2 = createHistory('z');
    h1.push('b');
    expect(state(h2)).toEqual({ current: 'z', index: 0, size: 1, canBack: false, canForward: false });
    h2.push('y');
    h2.back();
    expect(state(h1)).toEqual({ current: 'b', index: 1, size: 2, canBack: true, canForward: false });
  });

  it('TC-HIST-015 긴 기록(101개): back 100 번으로 처음, 101 번째는 무효; forward 100 번으로 끝', () => {
    const hist = createHistory(0);
    for (let i = 1; i <= 100; i++) hist.push(i);
    for (let i = 99; i >= 0; i--) expect(hist.back()).toBe(i);
    expect(state(hist)).toEqual({ current: 0, index: 0, size: 101, canBack: false, canForward: true });
    expect(hist.back()).toBe(0);
    for (let i = 1; i <= 100; i++) expect(hist.forward()).toBe(i);
    expect(state(hist)).toEqual({ current: 100, index: 100, size: 101, canBack: true, canForward: false });
  });
});
