// Phase 2 데모 통계 패널의 "조작 1건 = 합" 계약 (이슈 #11 수정 라운드, 리뷰 S1). 계약 전체는 tests/integration/app.test.js 맨 위 주석.
//
// 왜 이 파일이 따로 있는가
//   통계는 "batching 이 한 조작의 렌더를 1번으로 묶었다" 를 보여 주는 발표용 숫자다. update 1번마다 값을 덮어쓰면
//   batching 이 꺼져도 화면은 마지막 update 의 '1' 을 보여 준다(동어반복). 이것을 잡으려면 한 조작 안에서 update 가
//   2번 나는 상황이 필요한데, App 의 경로(칸 클릭 = runHandler 의 batch, popstate = App 이 직접 감싼 batch)는 모두
//   batch 안이라 테스트가 바깥에서 만들 수 없다.
//   그래서 이 파일은 vi.mock 으로 두 가지를 바꾼다 (tests/integration/phase1-error.test.js 의 vi.mock 선례).
//     1) core/scheduler.js — ctl.bypass 가 true 이면 batch(fn) 는 fn() 을 그대로 부르고 isBatching() 은 false.
//        = "batching 이 없는 런타임". render.js runHandler 의 batch 를 지운 변이와 같은 조건이다.
//     2) core/component.js — FunctionComponent 를 감싸 (a) 루트 fn 실행 횟수와 (b) onUpdate 로 받은 patch 길이를 센다.
//        mountApp 이 FunctionComponent 하나를 만들고 options.onUpdate 로 patch 를 받는다는 것은 이미 계약이다.
//   그 뒤 화면의 renders / patches 가 "그 조작 동안 센 값의 합" 과 같은지 본다. 정확한 patch 수(3 등)는 setMoves·setBoard
//   순서에 따라 중간 상태가 달라지므로 여기서는 고정하지 않고, 센 합과 같은지 + update 가 실제로 2번 났는지만 본다.
//   batching 이 켜져 있으면(ctl.bypass false) update 1번이므로 '1' · 각 조작의 patch 수다(TC-APP-030).
//
// 그 밖의 대안을 쓰지 않은 이유
//   - 통계 집계 함수를 export 해 단위 시험: mountApp 의 연결(어느 훅에서 열고 닫는가)을 검증하지 못한다.
//   - FunctionComponent 를 mountApp 인자로 주입: 공개 API 를 시험용으로 넓힌다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ctl = vi.hoisted(() => ({ bypass: false, comps: 0, renders: 0, patches: 0, updates: 0 }));

vi.mock('../../src/core/scheduler.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    batch: (fn) => (ctl.bypass ? fn() : orig.batch(fn)),
    isBatching: () => !ctl.bypass && orig.isBatching(),
  };
});

vi.mock('../../src/core/component.js', async (importOriginal) => {
  const orig = await importOriginal();
  class CountingComponent extends orig.FunctionComponent {
    constructor(fn, props, options) {
      const counted = typeof fn === 'function'
        ? (p) => {
          ctl.renders += 1;
          return fn(p);
        }
        : fn;
      const onUpdate = options?.onUpdate;
      super(counted, props, {
        ...options,
        onUpdate(patches) {
          ctl.updates += 1;
          ctl.patches += patches.length;
          if (typeof onUpdate === 'function') onUpdate(patches);
        },
      });
      ctl.comps += 1;
    }
  }
  return { ...orig, FunctionComponent: CountingComponent };
});

const { mountApp } = await import('../../src/app/app.js');

const enc = (moves) => btoa(JSON.stringify(moves));

let container;
let handle;

const $ = (id) => container.querySelector(`[data-testid="${id}"]`);
const text = (id) => $(id).textContent;
const cell = (i) => container.querySelector(`[data-index="${i}"]`);
const stoneAt = (i) => (cell(i).classList.contains('b') ? 'b' : cell(i).classList.contains('w') ? 'w' : null);

function popTo(search) {
  history.replaceState(null, '', `/${search}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

// 조작 하나를 실행하고, 그 동안 센 값과 화면 값을 돌려준다.
function operate(fn) {
  ctl.renders = 0;
  ctl.patches = 0;
  ctl.updates = 0;
  fn();
  return {
    counted: { renders: ctl.renders, patches: ctl.patches, updates: ctl.updates },
    shown: { renders: text('renders'), patches: text('patches') },
  };
}

function mountAt(search) {
  history.replaceState(null, '', `/${search}`);
  ctl.comps = 0;
  handle = mountApp(container);
  expect(ctl.comps).toBe(1);
}

beforeEach(() => {
  ctl.bypass = false;
  history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  handle = null;
});

afterEach(() => {
  ctl.bypass = false;
  handle?.unmount();
  container.remove();
  history.replaceState(null, '', '/');
});

describe('통계 = 조작 1건 동안의 합', () => {
  it('TC-APP-030 EP batching 켬: 클릭·초기화·popstate 각각 update 1번, 화면 = 센 값 (1·3 / 1·5 / 1·3)', () => {
    mountAt('');
    expect(text('renders')).toBe('0');

    const click = operate(() => cell(180).click());
    expect(click.counted.updates).toBe(1);
    expect(click.shown).toEqual({ renders: '1', patches: '3' });
    expect(click.shown).toEqual({ renders: String(click.counted.renders), patches: String(click.counted.patches) });

    cell(181).click();
    cell(182).click();
    const reset = operate(() => $('reset').click());
    expect(reset.counted.updates).toBe(1);
    expect(reset.shown).toEqual({ renders: '1', patches: '5' });

    cell(180).click();
    cell(181).click();
    const pop = operate(() => popTo(`?a=${enc([180])}`));
    expect(pop.counted.updates).toBe(1);
    expect(pop.shown).toEqual({ renders: '1', patches: '3' });
  });

  it('TC-APP-031 EG batching 끔: 칸 클릭 1번에 update 2번 → renders "2", patches = 두 update 의 합', () => {
    mountAt('');
    ctl.bypass = true;
    const r = operate(() => cell(180).click());
    expect(stoneAt(180)).toBe('b');
    expect(r.counted.updates).toBe(2);
    expect(r.counted.renders).toBe(2);
    expect(r.shown.renders).toBe('2');
    expect(r.shown.patches).toBe(String(r.counted.patches));
    expect(r.counted.patches).toBeGreaterThanOrEqual(3);
  });

  it('TC-APP-032 EG batching 끔: popstate 복원 1번 → renders "2", patches 합', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    cell(182).click();
    ctl.bypass = true;
    const r = operate(() => popTo(`?a=${enc([180, 181])}`));
    expect(stoneAt(182)).toBeNull();
    expect(r.counted.updates).toBe(2);
    expect(r.shown.renders).toBe('2');
    expect(r.shown.patches).toBe(String(r.counted.patches));
  });

  it('TC-APP-033 EG batching 끔: 초기화 1번 → renders "2", patches 합', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    cell(182).click();
    ctl.bypass = true;
    const r = operate(() => $('reset').click());
    expect(stoneAt(180)).toBeNull();
    expect(r.counted.updates).toBe(2);
    expect(r.shown.renders).toBe('2');
    expect(r.shown.patches).toBe(String(r.counted.patches));
  });

  it('TC-APP-034 ST batching 끔: 조작끼리 누적하지 않는다 (둘째 조작은 0 에서 다시), 무시된 조작은 표시 그대로', () => {
    mountAt('');
    ctl.bypass = true;
    operate(() => cell(180).click());
    const second = operate(() => cell(181).click());
    expect(stoneAt(181)).toBe('w');
    expect(second.counted.updates).toBe(2);
    expect(second.shown.renders).toBe('2');
    expect(second.shown.patches).toBe(String(second.counted.patches));

    const ignored = operate(() => cell(181).click());
    expect(ignored.counted.updates).toBe(0);
    expect(ignored.shown).toEqual(second.shown);
  });
});
