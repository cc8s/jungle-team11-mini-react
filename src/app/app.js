// Phase 2 데모: 오목. 계약은 tests/integration/app.test.js 맨 위 주석 (결정 0015·0016).
//
//   App      루트 FunctionComponent. hook 은 여기에만 둔다: 판·수순 state, 고정 핸들러(useMemo),
//            URL 저장 effect, popstate 리스너 effect.
//   자식     Toolbar · Lines · Board · Cell 은 props 만 받는 순수 함수다.
//   통계     App 트리 밖의 일반 DOM. 마지막 조작 동안의 렌더 횟수와 patch 수의 합을 보여 준다.
//            측정값을 측정 대상 트리에 넣으면 표시 갱신이 또 렌더·patch 를 만든다.
import { h } from '../vdom/vnode.js';
import { FunctionComponent } from '../core/component.js';
import { useState, useEffect, useMemo } from '../core/hooks.js';
import { batch } from '../core/scheduler.js';
import { SIZE, CELLS, boardFromMoves, gameState, play, encodeMoves, decodeMoves } from './gomoku.js';

const NAMES = { b: '흑', w: '백' };

// URL 의 `a` 에서 수순을 읽는다. 없거나 형식이 맞지 않으면 빈 수순.
const readMoves = () => decodeMoves(new URLSearchParams(location.search).get('a'));

// begin: 조작(칸 클릭 · 초기화 · popstate 리스너 1번 호출)이 시작될 때 통계 집계를 새로 연다. mountApp 이 준다.
function App({ begin }) {
  const [moves, setMoves] = useState(readMoves);
  const [board, setBoard] = useState(() => boardFromMoves(moves));

  // 고정 핸들러가 읽고 쓰는 참조. 렌더 중에는 쓰지 않는다(처음 만들 때만 mount 의 값으로 채운다).
  //   moves:    핸들러가 마지막으로 setMoves 에 넘긴 수순. 한 batch 안의 다음 클릭이 이어서 둔다.
  //   search:   App 이 마지막으로 반영한 location.search (mount 때 읽은 것 · 마지막 push · 마지막 popstate 복원).
  //   skipPush: 다음 URL effect 가 push 를 건너뛸지 (첫 mount · popstate 복원).
  const latest = useMemo(() => ({ moves, search: location.search, skipPush: true }), []);

  // 핸들러를 한 번만 만든다. 렌더마다 새 함수를 넘기면 diff 가 361칸 모두에 PROPS 를 낸다.
  const handlers = useMemo(() => {
    const apply = (next) => {
      latest.moves = next;
      setMoves(next);
      setBoard(boardFromMoves(next));
    };
    return {
      cell(event) {
        begin();
        // '' · '1e2' · '-0' 같은 값을 Number() 로 바꾸면 엉뚱한 칸이 된다. 십진 숫자만 받는다.
        const raw = event.currentTarget.dataset.index;
        if (!/^\d+$/.test(raw ?? '')) return;
        const next = play(latest.moves, Number(raw));
        if (next !== latest.moves) apply(next);
      },
      reset() {
        begin();
        if (latest.moves.length > 0) apply([]);
      },
      // 직접 붙인 리스너는 runHandler 밖이므로 batch 로 감싸 렌더를 1번으로 묶는다.
      // 마지막으로 반영한 search 와 같으면(hash 만 다른 기록) 다시 렌더하지 않는다.
      popstate() {
        begin();
        if (location.search === latest.search) return;
        latest.search = location.search;
        batch(() => {
          latest.skipPush = true;
          apply(readMoves());
        });
      },
    };
  }, []);

  useEffect(() => {
    if (latest.skipPush) {
      latest.skipPush = false;
      return;
    }
    // 기록을 남기지 못해도(SecurityError 등) 게임은 계속한다. 재시도하지 않는다.
    try {
      history.pushState(null, '', `${location.pathname}?a=${encodeMoves(moves)}`);
      latest.search = location.search;
    } catch {
      // 삼킨다
    }
  }, [moves]);

  useEffect(() => {
    window.addEventListener('popstate', handlers.popstate);
    return () => window.removeEventListener('popstate', handlers.popstate);
  }, [handlers]);

  const { winner, draw, next } = gameState(moves);
  const order = Array(CELLS).fill(0);
  moves.forEach((index, k) => {
    order[index] = k + 1;
  });

  return h('div', { class: 'gomoku card', 'data-testid': 'app' },
    h(Toolbar, { status: statusText(winner, draw, next), stones: stonesText(board), onReset: handlers.reset }),
    h('div', { class: 'goban' },
      h(Lines, null),
      h(Board, { board, order, onCell: handlers.cell }),
    ),
  );
}

function statusText(winner, draw, next) {
  if (winner != null) return `${NAMES[winner]} 승리`;
  if (draw) return '무승부';
  return `${NAMES[next]} 차례`;
}

function stonesText(board) {
  const count = (color) => board.filter((s) => s === color).length;
  return `흑 ${count('b')} · 백 ${count('w')}`;
}

function Toolbar({ status, stones, onReset }) {
  return h('div', { class: 'gomoku-bar' },
    h('p', { class: 'gomoku-status', 'data-testid': 'status' }, status),
    h('p', { class: 'gomoku-stones', 'data-testid': 'stones' }, stones),
    h('button', { type: 'button', class: 'ghost_button', 'data-testid': 'reset', onClick: onReset }, '초기화'),
  );
}

// 18×18 선 격자. 바뀌지 않는다.
function Lines() {
  return h('div', { class: 'goban-lines', 'aria-hidden': 'true' },
    Array.from({ length: (SIZE - 1) * (SIZE - 1) }, () => h('div', null)));
}

// 19×19 교차점 격자. 선 격자 위에 반 칸 어긋나게 겹친다.
function Board({ board, order, onCell }) {
  return h('div', { class: 'goban-board', 'data-testid': 'board' },
    board.map((stone, index) => h(Cell, { index, stone, move: order[index], onClick: onCell })));
}

// 수순 번호는 자식 노드가 아니라 data-move 로 둔다 (CSS attr(data-move) 로 보인다).
function Cell({ index, stone, move, onClick }) {
  const place = `${Math.floor(index / SIZE) + 1}행 ${(index % SIZE) + 1}열`;
  return h('button', {
    type: 'button',
    class: stone ? `cell ${stone}` : 'cell',
    'data-index': index,
    'data-move': stone ? move : null,
    'aria-label': stone ? `${place} ${NAMES[stone]} ${move}수` : place,
    onClick,
  });
}

function createStats() {
  const el = document.createElement('aside');
  el.className = 'stats card';
  el.dataset.testid = 'stats';
  const title = document.createElement('h2');
  title.className = 'card_title';
  title.textContent = '마지막 조작';
  el.appendChild(title);

  const item = (testid, label) => {
    const box = document.createElement('div');
    box.className = 'stat';
    const value = document.createElement('span');
    value.className = 'stat-value';
    value.dataset.testid = testid;
    value.textContent = '0';
    const name = document.createElement('span');
    name.className = 'stat-label';
    name.textContent = label;
    box.append(value, name);
    el.appendChild(box);
    return value;
  };
  const renders = item('renders', '렌더');
  const patches = item('patches', 'patch');

  return {
    el,
    show(renderCount, patchCount) {
      renders.textContent = String(renderCount);
      patches.textContent = String(patchCount);
    },
  };
}

export function mountApp(container) {
  const root = document.createElement('div');
  root.className = 'phase2';
  const stats = createStats();

  // 통계 집계. 조작이 시작될 때 begin 이 0 으로 새로 열고, 다음 조작이 열릴 때까지의 update 를 모두 더한다.
  // batch 의 flush 는 핸들러가 돌아온 뒤라 핸들러 끝에서 닫지 않는다. mount 의 렌더는 열린 집계가 없어 세지 않는다.
  let op = null;
  const begin = () => {
    op = { renders: 0, patches: 0 };
  };
  const comp = new FunctionComponent((props) => {
    if (op) op.renders += 1;
    return App(props);
  }, { begin }, {
    // 표시는 update 가 있을 때만 바꾼다: 무시된 조작은 DOM 변화 0.
    onUpdate(patches) {
      if (!op) return;
      op.patches += patches.length;
      stats.show(op.renders, op.patches);
    },
  });

  container.appendChild(root);
  comp.mount(root);
  root.appendChild(stats.el);

  let mounted = true;
  return {
    unmount() {
      if (!mounted) return;
      mounted = false;
      comp.unmount();
      root.remove();
    },
  };
}
