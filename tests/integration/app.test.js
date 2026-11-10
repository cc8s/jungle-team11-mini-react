// Phase 2 데모(오목) mountApp 의 API 계약 (이슈 #11, 결정 0015·0016). 이 파일이 명세다.
// 순수 규칙은 tests/unit/gomoku.test.js, onUpdate 통로는 tests/unit/on-update.test.js 맨 위 주석.
//
// import { mountApp } from '../../src/app/app.js';
//
// ── mountApp(container) → { unmount() } ─────────────────────────────────────────
//   - container 안에 (1) App 컴포넌트(FunctionComponent 하나, hook 은 이 루트 App 에만)와 (2) 통계 패널을 붙인다.
//     자식(Toolbar·Board·Cell 등 이름 자유)은 props 만 받는 순수 함수다.
//   - 처음 수순은 location.search 의 `a` 를 decodeMoves 한 것이다(없거나 형식 이상이면 빈 판, 예외 없음).
//     mount 는 history 를 건드리지 않는다(push·replace 없음, 형식 이상이어도 URL 은 그대로).
//   - unmount(): App 을 unmount 하고(effect cleanup → popstate 리스너 해제) 통계 패널도 떼어, mountApp 이 붙인 것을
//     container 에서 모두 없앤다. 두 번째 호출은 아무것도 하지 않는다.
//
// ── state 와 계산 ─────────────────────────────────────────────────────────────────
//   - state 는 판(board)과 수순(moves) 두 개. 클릭 1번에 둘 다 바꾸지만 batch 덕에 **렌더 1번**.
//   - 차례·승패·돌 수는 계산한다(gomoku.js). 무시되는 조작(돌이 있는 칸, 승부·무승부 뒤의 칸, 빈 판에서 초기화)은
//     DOM 변화 0, history 변화 0.
//   - 칸의 클릭 핸들러는 useMemo(..., []) 로 한 번만 만든다 → 한 수에 diff 의 PROPS 는 돌을 놓은 칸 하나뿐.
//   - 칸 핸들러는 놓을 칸을 event.currentTarget 의 data-index 에서 읽는다. 값이 /^\d+$/ (십진 숫자만) 이 아니면
//     무시한다('' · ' 5 ' · '1e2' · '0x10' · '-0' 등. Number('') === 0 으로 0번 칸에 두면 안 된다). (TC-APP-042)
//   - 원칙: **렌더 중에 상태(ref·memo 객체 포함)를 쓰지 않는다.** 렌더는 state·props 에서 VNode 를 계산만 한다.
//     고정 핸들러가 "지금 수순" 을 알아야 하면 업데이터(setMoves(prev => …))나 핸들러 쪽에서 갱신하는 ref 를 쓴다.
//     그래서 한 batch 안에서 칸 클릭이 여러 번 일어나도 모두 차례대로 반영된다:
//     batch(() => { cell(200).click(); cell(201).click(); }) → 200 흑 1수, 201 백 2수. (TC-APP-040)
//     (렌더 중 `latest.moves = moves` 로 핸들러에 알려 주면 두 번째 클릭이 첫 수를 덮어쓴다.)
//
// ── DOM 구조 (테스트가 기대는 부분만, 나머지 마크업·CSS 는 자유) ───────────────────────
//   [data-testid="app"]     App 루트 요소.
//   [data-testid="status"]  텍스트 자식 **하나**. '흑 차례' | '백 차례' | '흑 승리' | '백 승리' | '무승부'
//   [data-testid="stones"]  텍스트 자식 **하나**. `흑 ${흑 돌 수} · 백 ${백 돌 수}` (가운뎃점 U+00B7, 양옆 공백 하나)
//   [data-testid="reset"]   <button type="button">, 텍스트 '초기화'.
//   [data-testid="board"]   직계 자식이 정확히 361개의 칸, index 순서. (선 격자 18×18 은 이 요소 밖에 둔다.)
//     칸: <button type="button" class="cell" data-index="i" aria-label="r행 c열">  (r·c 는 1부터)
//         돌이 있으면 class="cell b" | "cell w", data-move="n" (n 은 1부터의 수순 번호), aria-label="r행 c열 흑 n수" | "… 백 n수".
//         빈 칸에는 data-move 가 없다. 칸은 **자식 노드가 없다**(수순 번호는 CSS 의 attr(data-move) 로 보인다).
//   → 그래서 진행 중인 한 수의 diff 는 정확히 3개: 칸 PROPS 1 + status TEXT 1 + stones TEXT 1.
//     (렌더마다 새 핸들러를 넘기면 361칸 모두 PROPS 가 나온다 — TC-APP-020 대조.)
//   통계 패널(App 컴포넌트 **밖**, 같은 container 안. 측정값을 측정 대상 트리에 넣으면 표시 갱신이 또 렌더·patch 를 만든다):
//   [data-testid="stats"] 안에
//     [data-testid="renders"]  마지막 **조작** 동안 App 루트 fn 이 실행된 횟수의 합. 텍스트는 숫자만.
//     [data-testid="patches"]  같은 조작 동안 onUpdate 로 받은 patch 배열 길이의 **합**. 텍스트는 숫자만.
//     mount 직후 둘 다 '0'(mount 의 렌더는 세지 않는다). 무시된 조작은 값을 바꾸지 않는다(DOM 변화 0).
//   통계의 단위 = 조작 1건 (발표 핵심: batching 이 렌더를 묶었는지를 이 숫자로 보인다. 동어반복이면 안 된다):
//     - 조작 = App 의 칸 클릭 핸들러 · 초기화 핸들러 · popstate 리스너 **1번 호출**.
//     - 조작이 시작될 때(핸들러 진입) 집계를 0 으로 새로 연다. 그 뒤 다음 조작이 시작될 때까지 일어난 update 의
//       루트 fn 실행 수와 patch 길이를 모두 더해 표시한다. 핸들러를 감싼 batch 의 flush 는 핸들러가 돌아온 뒤에
//       일어나므로 "핸들러가 끝날 때 닫는다" 로 정하면 안 된다. 표시는 update 가 있을 때만 바꾼다(열기만 해서는 안 바꾼다).
//     - update 1번마다 값을 덮어쓰거나 0 으로 돌리면 안 된다: batching 이 꺼져 한 조작에 update 가 2번 나면
//       renders '2', patches = 두 update 의 patch 길이 합이어야 한다(batching 이 켜져 있으면 '1' · '3').
//       이 경우의 검증은 tests/integration/app-stats.test.js (scheduler 의 batch 를 통과 함수로 바꿔 시험한다).
//     - 한 조작 안의 update 가 던져도(아래 pushState 실패는 삼키므로 해당 없음) 다음 조작은 0 에서 새로 연다.
//
// ── URL (결정 0015-5, 레퍼런스 형식) ─────────────────────────────────────────────────
//   - 수순이 바뀌면 effect 가 history.pushState(…, location.pathname + '?a=' + encodeMoves(moves)) 를 1번 한다
//     (다른 쿼리·hash 는 버린다: '/?x=1#h' 에서 한 수 → search '?a=…', hash ''. TC-APP-044). 초기화도 push 한다(→ '?a=W10=').
//   - pushState 가 던지면(SecurityError 등) **삼킨다**: 예외가 핸들러 밖(window 'error')으로 나가지 않고, 돌은 놓이며,
//     그 조작의 통계도 정상('1' · '3'). 재시도는 하지 않는다. 다음 조작도 정상 통계, 정상 push. (TC-APP-043)
//   - push 하지 않는 경우: 첫 mount, popstate 로 복원한 갱신. 복원 뒤의 다음 수는 다시 push 한다.
//   - popstate 리스너는 effect 에서 window.addEventListener('popstate', fn) 로 붙이고 cleanup 에서
//     window.removeEventListener('popstate', 같은 fn) 으로 뗀다(onpopstate 대입 금지). 복원은 event.state 를 쓰지 않고
//     **location.search 만** 읽는다(`a` 가 없거나 형식 이상이면 빈 판. state 에 무엇이 들어 있어도 무시. TC-APP-045).
//     popstate 는 runHandler 밖이므로 batch(...) 로 감싸 **렌더 1번** 이다(0016: 직접 붙인 리스너는 batch 밖).
//   - popstate 때 location.search 가 App 이 **마지막으로 반영한 search**(mount 때 읽은 것, 마지막 push 한 것,
//     마지막 popstate 로 복원한 것 중 가장 최근)와 문자열로 같으면 무시한다: 렌더 0, DOM 변화 0, 통계 그대로.
//     (hash 만 다른 기록으로 뒤로/앞으로 간 경우. 지금처럼 다시 렌더하면 통계가 patches '0' 으로 바뀐다. TC-APP-041)
//
// ── main.js 탭 전환 (e2e: tests/e2e/app.spec.js) ─────────────────────────────────────
//   - 로드 시 URLSearchParams(location.search).has('a') 이면 Phase 2(app) 탭, 아니면 Phase 1.
//   - 탭을 바꾸면 지금 탭의 화면을 먼저 정리한다: Phase 2 를 떠날 때 handle.unmount().
//     → Phase 1 로 바꾼 뒤 window 에 붙어 있는 popstate 리스너 수는 처음 Phase 1 때와 같다. Phase 2 탭을 다시 눌러도
//       (Phase 2 → Phase 2) 리스너는 늘지 않는다. DOM 만 지우면(replaceChildren) 떼어 낸 App 이 리스너로 살아 있다. (E2E-APP-006)
//   - Phase 1 로 갈 때 history.replaceState(…, location.pathname) 로 쿼리를 지운다(새 기록 없음).
//     그래서 Phase 1 에서 새로고침하면 Phase 1 이고, Phase 2 로 돌아오면 빈 판이다(unmount 로 상태가 사라진 것과 같다).
//   - 탭 버튼 aria-pressed 는 지금처럼 고른 탭만 'true'.
//
// 알려진 한계 (테스트 없음)
//   - Phase 1 로 바꾼 뒤 브라우저 뒤로가기로 `?a=` 기록에 돌아가도 화면은 Phase 1 그대로다(App 이 unmount 돼 있다).
//   - 승리한 줄 강조, 마지막 수 표시는 없다(넣으면 한 수의 patch 수가 바뀐다).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountApp } from '../../src/app/app.js';
import { boardFromMoves, play } from '../../src/app/gomoku.js';
import { FunctionComponent } from '../../src/core/component.js';
import { useState } from '../../src/core/hooks.js';
import { h } from '../../src/vdom/vnode.js';
import { batch } from '../../src/core/scheduler.js';

const idx = (r, c) => r * 19 + c;
const enc = (moves) => btoa(JSON.stringify(moves));

// 흑 (9,5)~(9,9), 백 (10,5)~(10,8) 을 번갈아: 9번째 수로 흑 승리.
const BLACK_WINS_9 = [idx(9, 5), idx(10, 5), idx(9, 6), idx(10, 6), idx(9, 7), idx(10, 7), idx(9, 8), idx(10, 8), idx(9, 9)];

// 361수 무승부 수순 (tests/unit/gomoku.test.js 와 같은 무늬).
function drawMoves() {
  const blacks = [];
  const whites = [];
  for (let i = 0; i < 361; i++) {
    ((i % 19) + 2 * Math.floor(i / 19)) % 4 < 2 ? blacks.push(i) : whites.push(i);
  }
  const moves = [];
  blacks.forEach((b, k) => {
    moves.push(b);
    if (k < whites.length) moves.push(whites[k]);
  });
  return moves;
}

let container;
let handle;

const $ = (id) => container.querySelector(`[data-testid="${id}"]`);
const text = (id) => $(id).textContent;
const cell = (i) => container.querySelector(`[data-index="${i}"]`);
const aParam = () => new URLSearchParams(location.search).get('a');
const stoneAt = (i) => (cell(i).classList.contains('b') ? 'b' : cell(i).classList.contains('w') ? 'w' : null);

function mountAt(search) {
  history.replaceState(null, '', `/${search}`);
  handle = mountApp(container);
}

// 브라우저 뒤로/앞으로 흉내: 현재 기록의 URL 을 바꾸고 popstate 를 보낸다 (event.state 는 null).
function popTo(search) {
  history.replaceState(null, '', `/${search}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

function observe() {
  const mo = new MutationObserver(() => {});
  mo.observe(container, { childList: true, attributes: true, characterData: true, subtree: true });
  return () => {
    const records = mo.takeRecords();
    mo.disconnect();
    return records;
  };
}

function expectEmptyBoard() {
  const cells = $('board').children;
  expect(cells).toHaveLength(361);
  for (const c of cells) {
    expect(c.className).toBe('cell');
    expect(c.hasAttribute('data-move')).toBe(false);
  }
  expect(text('status')).toBe('흑 차례');
  expect(text('stones')).toBe('흑 0 · 백 0');
}

beforeEach(() => {
  history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  handle = null;
});

afterEach(() => {
  handle?.unmount();
  container.remove();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

describe('mount', () => {
  it('TC-APP-001 EP 빈 URL: 361칸(button, index 순서, aria-label), 흑 차례, 통계 0, history 그대로', () => {
    const before = history.length;
    mountAt('');
    expect($('app')).not.toBeNull();
    const cells = [...$('board').children];
    expect(cells).toHaveLength(361);
    cells.forEach((c, i) => {
      expect(c.tagName).toBe('BUTTON');
      expect(c.getAttribute('type')).toBe('button');
      expect(c.dataset.index).toBe(String(i));
      expect(c.childNodes).toHaveLength(0);
    });
    expect(cell(0).getAttribute('aria-label')).toBe('1행 1열');
    expect(cell(20).getAttribute('aria-label')).toBe('2행 2열');
    expect(cell(360).getAttribute('aria-label')).toBe('19행 19열');
    expectEmptyBoard();
    expect($('status').childNodes).toHaveLength(1);
    expect($('stones').childNodes).toHaveLength(1);
    expect(text('reset')).toBe('초기화');
    expect($('reset').getAttribute('type')).toBe('button');
    expect(text('renders')).toBe('0');
    expect(text('patches')).toBe('0');
    expect($('app').contains($('stats'))).toBe(false);
    expect(history.length).toBe(before);
  });

  it('TC-APP-005 EP 올바른 ?a= 에서 복원: 돌·수순 번호·차례, push 없음, 통계 0', () => {
    mountAt(`?a=${enc([180, 181, 0])}`);
    const before = history.length;
    expect(stoneAt(180)).toBe('b');
    expect(stoneAt(181)).toBe('w');
    expect(stoneAt(0)).toBe('b');
    expect(cell(0).dataset.move).toBe('3');
    expect(cell(181).getAttribute('aria-label')).toBe('10행 11열 백 2수');
    expect(text('status')).toBe('백 차례');
    expect(text('stones')).toBe('흑 2 · 백 1');
    expect(text('renders')).toBe('0');
    expect(history.length).toBe(before);
    expect(aParam()).toBe(enc([180, 181, 0]));
  });

  it('TC-APP-006 DT 형식 이상한 ?a= 는 빈 판, 예외·history 변화 없음, URL 은 그대로', () => {
    const cases = ['!!!', btoa('abc'), btoa('{"a":1}'), btoa('[361]'), btoa('[0,0]'), btoa('[1.5]'), ''];
    for (const bad of cases) {
      history.replaceState(null, '', `/?a=${encodeURIComponent(bad)}`);
      const search = location.search;
      const before = history.length;
      expect(() => { handle = mountApp(container); }, bad).not.toThrow();
      expectEmptyBoard();
      expect(location.search).toBe(search);
      expect(history.length).toBe(before);
      handle.unmount();
      handle = null;
      expect(container.innerHTML).toBe('');
    }
  });

  it('TC-APP-007 BVA 361수 무승부 URL: 무승부, 어느 칸을 눌러도 무시', () => {
    const moves = drawMoves();
    mountAt(`?a=${enc(moves)}`);
    expect(text('status')).toBe('무승부');
    expect(text('stones')).toBe('흑 181 · 백 180');
    const before = history.length;
    const take = observe();
    cell(0).click();
    cell(360).click();
    expect(take()).toHaveLength(0);
    expect(history.length).toBe(before);
  });
});

describe('클릭', () => {
  it('TC-APP-002 ST 빈 칸 2번: 흑→백, 수순 번호, 렌더 1번·patch 3개씩, URL push 1번씩', () => {
    mountAt('');
    const before = history.length;
    const corner = cell(0);
    const board = $('board');

    cell(180).click();
    expect(stoneAt(180)).toBe('b');
    expect(cell(180).dataset.move).toBe('1');
    expect(cell(180).getAttribute('aria-label')).toBe('10행 10열 흑 1수');
    expect(cell(180).childNodes).toHaveLength(0);
    expect(text('status')).toBe('백 차례');
    expect(text('stones')).toBe('흑 1 · 백 0');
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
    expect(history.length).toBe(before + 1);
    expect(location.pathname).toBe('/');
    expect(aParam()).toBe(enc([180]));

    cell(181).click();
    expect(stoneAt(181)).toBe('w');
    expect(cell(181).dataset.move).toBe('2');
    expect(text('status')).toBe('흑 차례');
    expect(text('stones')).toBe('흑 1 · 백 1');
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
    expect(history.length).toBe(before + 2);
    expect(aParam()).toBe(enc([180, 181]));

    // 바뀌지 않은 노드는 같은 DOM 객체
    expect(cell(0)).toBe(corner);
    expect($('board')).toBe(board);
  });

  it('TC-APP-003 DT 돌이 있는 칸 클릭은 무시: DOM 변화 0, push 없음, 통계 그대로', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    const before = history.length;
    const take = observe();
    cell(180).click();
    cell(181).click();
    expect(take()).toHaveLength(0);
    expect(history.length).toBe(before);
    expect(aParam()).toBe(enc([180, 181]));
    expect(text('renders')).toBe('1');
  });

  it('TC-APP-004 DT 클릭으로 5목 완성 → 흑 승리, URL 에 9수, 그 뒤 빈 칸 클릭은 무시', () => {
    mountAt('');
    for (const i of BLACK_WINS_9.slice(0, 8)) cell(i).click();
    expect(text('status')).toBe('흑 차례');
    cell(BLACK_WINS_9[8]).click();
    expect(text('status')).toBe('흑 승리');
    expect(text('stones')).toBe('흑 5 · 백 4');
    expect(aParam()).toBe(enc(BLACK_WINS_9));
    const before = history.length;
    const take = observe();
    cell(0).click();
    expect(take()).toHaveLength(0);
    expect(stoneAt(0)).toBeNull();
    expect(history.length).toBe(before);
  });

  it('TC-APP-020 대조: 핸들러를 고정한 App 은 patch 3개, 렌더마다 새 핸들러를 넘기면 361칸 모두 PROPS', () => {
    mountAt('');
    cell(180).click();
    expect(text('patches')).toBe('3');

    // 같은 판을 그리되 칸마다 매 렌더 새 화살표 함수를 넘기는 대조 컴포넌트
    let last = null;
    const box = document.createElement('div');
    document.body.appendChild(box);
    const control = new FunctionComponent(() => {
      const [moves, setMoves] = useState([]);
      const board = boardFromMoves(moves);
      return h('div', null, board.map((s, i) =>
        h('button', { type: 'button', class: s ? `cell ${s}` : 'cell', onClick: () => setMoves((m) => play(m, i)) })));
    }, null, { onUpdate: (patches) => { last = patches; } });
    control.mount(box);
    box.querySelectorAll('button')[180].click();
    expect(last).not.toBeNull();
    const handlerPatches = last.filter((p) => p.type === 'PROPS' && typeof p.set.onClick === 'function');
    expect(handlerPatches).toHaveLength(361);
    expect(last.length).toBeGreaterThanOrEqual(361);
    control.unmount();
    box.remove();
  });
});

describe('popstate (뒤로 = 무르기, 앞으로 = 다시)', () => {
  it('TC-APP-010 ST 뒤로: 2수로 복원, 렌더 1번(batch)·patch 3개, push 없음', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    cell(182).click();
    const before = history.length;
    popTo(`?a=${enc([180, 181])}`);
    expect(stoneAt(182)).toBeNull();
    expect(cell(182).hasAttribute('data-move')).toBe(false);
    expect(cell(182).getAttribute('aria-label')).toBe('10행 12열'); // 182 = 9*19 + 11
    expect(stoneAt(181)).toBe('w');
    expect(text('status')).toBe('흑 차례');
    expect(text('stones')).toBe('흑 1 · 백 1');
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
    expect(history.length).toBe(before);
    expect(aParam()).toBe(enc([180, 181]));
  });

  it('TC-APP-011 ST 복원 뒤 앞으로(다시) 도 push 없음, 그다음 새 수는 다시 push', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    const before = history.length;
    popTo(`?a=${enc([180])}`);
    popTo(`?a=${enc([180, 181])}`);
    expect(stoneAt(181)).toBe('w');
    expect(history.length).toBe(before);
    popTo(`?a=${enc([180])}`);
    cell(200).click();
    expect(stoneAt(200)).toBe('w');
    expect(cell(200).dataset.move).toBe('2');
    expect(history.length).toBe(before + 1);
    expect(aParam()).toBe(enc([180, 200]));
  });

  it('TC-APP-012 DT a 가 없는 기록 / 형식 이상한 a 로 돌아오면 빈 판, 예외 없음', () => {
    mountAt('');
    cell(180).click();
    popTo('');
    expectEmptyBoard();
    cell(100).click();
    expect(stoneAt(100)).toBe('b');
    expect(() => popTo('?a=!!!')).not.toThrow();
    expectEmptyBoard();
  });
});

describe('초기화', () => {
  it('TC-APP-013 ST 3수 뒤 초기화: 빈 판, 렌더 1번·patch 5개, ?a=W10= push / 빈 판에서 다시 누르면 무시', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    cell(182).click();
    const before = history.length;
    $('reset').click();
    expectEmptyBoard();
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('5');
    expect(history.length).toBe(before + 1);
    expect(aParam()).toBe('W10=');

    const take = observe();
    $('reset').click();
    expect(take()).toHaveLength(0);
    expect(history.length).toBe(before + 1);
  });
});

describe('unmount', () => {
  it('TC-APP-014 ST unmount: 붙인 popstate 리스너를 모두 떼고 container 를 비운다, 이후 popstate 무해, 두 번째 unmount 무해', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    mountAt('');
    cell(180).click();
    const added = add.mock.calls.filter(([type]) => type === 'popstate').map(([, fn]) => fn);
    expect(added.length).toBeGreaterThan(0);

    handle.unmount();
    for (const fn of added) {
      expect(remove.mock.calls.some(([type, l]) => type === 'popstate' && l === fn)).toBe(true);
    }
    expect(container.innerHTML).toBe('');

    const before = history.length;
    expect(() => popTo(`?a=${enc([0])}`)).not.toThrow();
    expect(container.innerHTML).toBe('');
    expect(history.length).toBe(before);
    expect(() => handle.unmount()).not.toThrow();
    handle = null;
  });
});

// window 'error' 로 나간(핸들러 밖으로 새어 나간) 예외를 모은다. jsdom 은 리스너 예외를 click() 밖으로 던지지 않고 여기로 보낸다.
function catchWindowErrors() {
  const errors = [];
  const onError = (e) => {
    errors.push(e.error ?? e.message);
    e.preventDefault();
  };
  window.addEventListener('error', onError);
  return () => {
    window.removeEventListener('error', onError);
    return errors;
  };
}

describe('리뷰 재현 회귀 (수정 라운드)', () => {
  it('TC-APP-040 EG 한 batch 안 칸 클릭 2번: 두 수 모두 흑→백 순으로 반영 (렌더 중 쓰기 금지)', () => {
    mountAt('');
    batch(() => {
      cell(200).click();
      cell(201).click();
    });
    expect(stoneAt(200)).toBe('b');
    expect(cell(200).dataset.move).toBe('1');
    expect(stoneAt(201)).toBe('w');
    expect(cell(201).dataset.move).toBe('2');
    expect(text('status')).toBe('흑 차례');
    expect(text('stones')).toBe('흑 1 · 백 1');
    expect(aParam()).toBe(enc([200, 201]));

    // 앞에 수가 있어도 같다: 이어지는 batch 의 두 클릭은 셋째·넷째 수
    batch(() => {
      cell(0).click();
      cell(360).click();
    });
    expect(stoneAt(0)).toBe('b');
    expect(cell(0).dataset.move).toBe('3');
    expect(stoneAt(360)).toBe('w');
    expect(cell(360).dataset.move).toBe('4');
    expect(aParam()).toBe(enc([200, 201, 0, 360]));

    // 한 batch 안에서 같은 칸 두 번: 두 번째는 돌이 있는 칸이므로 무시 (백이 덮어쓰지 않는다)
    batch(() => {
      cell(100).click();
      cell(100).click();
    });
    expect(stoneAt(100)).toBe('b');
    expect(cell(100).dataset.move).toBe('5');
    expect(text('status')).toBe('백 차례');
  });

  it('TC-APP-041 EG 같은 search 로 popstate(hash 만 다른 기록) 는 무시: DOM 변화 0, 통계 그대로, push 없음', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
    const search = location.search;
    const before = history.length;

    const take = observe();
    popTo(`${search}#h`);
    expect(take()).toHaveLength(0);
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
    expect(history.length).toBe(before);
    expect(location.search).toBe(search);

    // 다른 search 로의 popstate 는 여전히 복원하고, 그 뒤 같은 search 로 다시 오면 또 무시
    popTo(`?a=${enc([180])}`);
    expect(stoneAt(181)).toBeNull();
    expect(text('patches')).toBe('3');
    const take2 = observe();
    popTo(`?a=${enc([180])}#x`);
    expect(take2()).toHaveLength(0);
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
  });

  it('TC-APP-041b EG mount 직후 mount 때 읽은 search 와 같은 popstate 는 무시: 통계 0 그대로', () => {
    mountAt(`?a=${enc([0])}`);
    const take = observe();
    popTo(`?a=${enc([0])}#h`);
    expect(take()).toHaveLength(0);
    expect(text('renders')).toBe('0');
    expect(text('patches')).toBe('0');
    expect(stoneAt(0)).toBe('b');
  });

  it('TC-APP-042 EG data-index 가 십진 숫자 문자열이 아니면 무시 ("" · " 5 " · "1e2" · "0x10" · "-0" · "abc")', () => {
    mountAt('');
    const target = cell(180);
    const before = history.length;
    for (const bad of ['', ' 5 ', '1e2', '0x10', '-0', 'abc', '1.0']) {
      target.setAttribute('data-index', bad);
      const take = observe();
      target.click();
      expect(take(), JSON.stringify(bad)).toHaveLength(0);
      expect(history.length, JSON.stringify(bad)).toBe(before);
    }
    expect(stoneAt(0)).toBeNull();
    expect(text('stones')).toBe('흑 0 · 백 0');
    expect(text('renders')).toBe('0');

    // 대조: 손대지 않은 칸은 둘 수 있다
    cell(181).click();
    expect(stoneAt(181)).toBe('b');
  });

  it('TC-APP-043 EG pushState 가 한 번 던져도 삼킨다: 예외가 밖으로 안 나가고 돌은 놓이며 통계는 매 조작 1·3', () => {
    mountAt('');
    const push = vi.spyOn(history, 'pushState');
    push.mockImplementationOnce(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const done = catchWindowErrors();

    cell(180).click();
    expect(stoneAt(180)).toBe('b');
    expect(text('status')).toBe('백 차례');
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');

    cell(181).click();
    expect(stoneAt(181)).toBe('w');
    expect(text('renders')).toBe('1');
    expect(text('patches')).toBe('3');
    expect(aParam()).toBe(enc([180, 181]));

    expect(done()).toEqual([]);
  });

  it('TC-APP-044 EP 다른 쿼리·hash 가 있는 URL 에서 한 수 → search 는 ?a= 만, hash 없음, pathname 그대로', () => {
    mountAt('?x=1#h');
    cell(180).click();
    expect(location.pathname).toBe('/');
    expect(location.search).toBe(`?a=${enc([180])}`);
    expect(location.hash).toBe('');
  });

  it('TC-APP-045 EP popstate 복원은 event.state 를 쓰지 않고 location.search 만 읽는다', () => {
    mountAt('');
    cell(180).click();
    cell(181).click();
    history.replaceState(null, '', `/?a=${enc([180])}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { a: enc([5, 6, 7]), moves: [5, 6, 7] } }));
    expect(stoneAt(180)).toBe('b');
    expect(stoneAt(181)).toBeNull();
    expect(stoneAt(5)).toBeNull();
    expect(text('stones')).toBe('흑 1 · 백 0');

    // state 만 있고 search 에 a 가 없으면 빈 판
    history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { a: enc([5]) } }));
    expectEmptyBoard();
  });
});
