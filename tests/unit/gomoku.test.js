// 오목 순수 로직의 API 계약 (이슈 #11, 결정 0015). 이 파일이 명세다. DOM 을 쓰지 않는다.
//
// import { SIZE, CELLS, boardFromMoves, isWin, gameState, play, encodeMoves, decodeMoves }
//   from '../../src/app/gomoku.js';
//
// ── 표현 ──────────────────────────────────────────────────────────────────────────
//   - SIZE = 19, CELLS = 361. 칸 index = 행 * 19 + 열 (0 부터, 행 우선).
//   - 수순(moves): 놓은 칸 index 의 배열. moves[0] 이 흑, 그다음 백, 번갈아.
//   - 판(board): 길이 361 배열, 각 칸은 'b' | 'w' | null.
//
// ── boardFromMoves(moves) → board ────────────────────────────────────────────────
//   - 새 배열. moves 는 올바른 수순이라고 가정한다(검증은 decodeMoves / play 가 한다).
//
// ── isWin(board, index) → boolean ────────────────────────────────────────────────
//   - board[index] 의 돌이 가로·세로·대각선 ↘·대각선 ↙ 중 한 방향에서 같은 색 **5개 이상** 연속인 줄에 속하면 true.
//     6목 이상도 true (렌주룰 없음). 판 가장자리를 넘어 다음 행으로 이어지지 않는다(index 만 더하면 생기는 함정).
//   - 빈 칸, 범위 밖 index(-1, 361 등)는 false. 예외 없음.
//
// ── gameState(moves) → { board, next, winner, draw } ─────────────────────────────
//   - board  = boardFromMoves(moves)
//   - winner = 처음으로 5목을 만든 수의 색 ('b' | 'w'), 없으면 null
//   - draw   = winner 가 없고 361칸이 모두 찼으면 true
//   - next   = 게임이 끝났으면(winner 또는 draw) null, 아니면 둘 차례 ('b' | 'w')
//
// ── play(moves, index) → moves ───────────────────────────────────────────────────
//   - 둘 수 있으면 index 를 덧붙인 **새 배열**. 입력 배열은 바꾸지 않는다.
//   - 무시(입력과 **같은 참조**를 그대로 돌려줌): index 가 0~360 정수가 아님, 이미 돌이 있는 칸, 게임이 끝남(승부·무승부).
//     같은 참조라서 App 의 setState 가 Object.is 로 건너뛴다 → 무시된 클릭은 렌더 0번.
//
// ── encodeMoves(moves) → string ──────────────────────────────────────────────────
//   - btoa(JSON.stringify(moves)). 레퍼런스(codingapple1/gibo)의 `?a=base64(JSON)` 형식. 빈 수순은 'W10='.
//     (숫자·대괄호·쉼표의 base64 에는 '+' '/' 가 나오지 않아 URL 에 그대로 넣어도 된다.)
//
// ── decodeMoves(param) → number[] ────────────────────────────────────────────────
//   - URLSearchParams.get('a') 의 값을 받는다. 올바르면 수순(새 배열), 아니면 [] . **절대 던지지 않는다.**
//   - 올바름 = 문자열 → atob 성공 → JSON.parse 성공 → 배열 → 모든 원소가 0~360 정수 → 중복 없음
//     → 승부가 난 뒤의 수가 없음 (5목을 만든 수가 마지막 수이거나 5목이 없음).
//   - null / undefined / '' / 문자열이 아닌 값은 [].
//   - 원소 -0 은 0 으로 정규화한다 (JSON '[-0]' 은 -0 을 만든다. 결과는 Object.is 로도 0 과 같아야 한다).
//     '[0,-0]' 은 중복이므로 [].
import { describe, it, expect } from 'vitest';
import {
  SIZE,
  CELLS,
  boardFromMoves,
  isWin,
  gameState,
  play,
  encodeMoves,
  decodeMoves,
} from '../../src/app/gomoku.js';

const idx = (r, c) => r * 19 + c;

function boardWith(stones) {
  const board = Array(361).fill(null);
  for (const [i, color] of stones) board[i] = color;
  return board;
}
const line = (cells, color) => cells.map((i) => [i, color]);

// 흑 (0,0)~(0,4), 백 (1,0)~(1,3) 을 번갈아 둔다: 9번째 수(흑 (0,4))로 흑 승리.
const BLACK_WINS_9 = [idx(0, 0), idx(1, 0), idx(0, 1), idx(1, 1), idx(0, 2), idx(1, 2), idx(0, 3), idx(1, 3), idx(0, 4)];

// 판을 가득 채워도 5목이 없는 무늬: (열 + 2*행) mod 4 < 2 이면 흑. 가로 최대 2, 세로 1, 대각선 최대 2.
// 짝수 행 10흑·9백, 홀수 행 9흑·10백 → 흑 181, 백 180. 흑·백을 번갈아 두면 361수 무승부.
function drawMoves() {
  const blacks = [];
  const whites = [];
  for (let i = 0; i < 361; i++) {
    const r = Math.floor(i / 19);
    const c = i % 19;
    ((c + 2 * r) % 4 < 2 ? blacks : whites).push(i);
  }
  const moves = [];
  for (let k = 0; k < blacks.length; k++) {
    moves.push(blacks[k]);
    if (k < whites.length) moves.push(whites[k]);
  }
  return { moves, blacks, whites };
}

describe('상수와 boardFromMoves', () => {
  it('TC-GMK-001 SIZE 19, CELLS 361, 빈 수순은 빈 판', () => {
    expect(SIZE).toBe(19);
    expect(CELLS).toBe(361);
    const board = boardFromMoves([]);
    expect(board).toHaveLength(361);
    expect(board.every((s) => s === null)).toBe(true);
  });

  it('TC-GMK-002 흑부터 번갈아 놓인다 (모서리 0·360 포함)', () => {
    const board = boardFromMoves([180, 0, 360]);
    expect(board[180]).toBe('b');
    expect(board[0]).toBe('w');
    expect(board[360]).toBe('b');
    expect(board.filter((s) => s !== null)).toHaveLength(3);
  });
});

describe('isWin — 결정 테이블 (방향 × 개수 × 위치)', () => {
  it('TC-GMK-010 DT 가로 5 (윗변 가장자리 (0,0)~(0,4))', () => {
    const cells = [0, 1, 2, 3, 4].map((c) => idx(0, c));
    const board = boardWith(line(cells, 'b'));
    for (const i of cells) expect(isWin(board, i)).toBe(true);
  });

  it('TC-GMK-011 DT 세로 5 (오른쪽 아래 모서리 (14,18)~(18,18)), 백', () => {
    const cells = [14, 15, 16, 17, 18].map((r) => idx(r, 18));
    const board = boardWith(line(cells, 'w'));
    expect(isWin(board, idx(18, 18))).toBe(true);
    expect(isWin(board, idx(14, 18))).toBe(true);
  });

  it('TC-GMK-012 DT 대각선 ↘ 5 (왼쪽 위 모서리 (0,0)~(4,4))', () => {
    const cells = [0, 1, 2, 3, 4].map((k) => idx(k, k));
    const board = boardWith(line(cells, 'b'));
    expect(isWin(board, idx(0, 0))).toBe(true);
    expect(isWin(board, idx(2, 2))).toBe(true);
  });

  it('TC-GMK-013 DT 대각선 ↙ 5 (오른쪽 위 모서리 (0,18)~(4,14)) / 왼쪽 아래 모서리 (18,0)~(14,4)', () => {
    const top = [0, 1, 2, 3, 4].map((k) => idx(k, 18 - k));
    expect(isWin(boardWith(line(top, 'b')), idx(4, 14))).toBe(true);
    const bottom = [0, 1, 2, 3, 4].map((k) => idx(18 - k, k));
    expect(isWin(boardWith(line(bottom, 'w')), idx(18, 0))).toBe(true);
  });

  it('TC-GMK-014 BVA 4목은 승리가 아니다 (네 방향 모두)', () => {
    const rows = [
      [0, 1, 2, 3].map((c) => idx(9, 5 + c)),
      [0, 1, 2, 3].map((r) => idx(5 + r, 9)),
      [0, 1, 2, 3].map((k) => idx(5 + k, 5 + k)),
      [0, 1, 2, 3].map((k) => idx(5 + k, 13 - k)),
    ];
    for (const cells of rows) {
      const board = boardWith(line(cells, 'b'));
      for (const i of cells) expect(isWin(board, i)).toBe(false);
    }
  });

  it('TC-GMK-015 BVA 6목도 승리다 (렌주룰 없음)', () => {
    const cells = [3, 4, 5, 6, 7, 8].map((c) => idx(9, c));
    const board = boardWith(line(cells, 'b'));
    expect(isWin(board, idx(9, 3))).toBe(true);
    expect(isWin(board, idx(9, 8))).toBe(true);
  });

  it('TC-GMK-016 EG 끊긴 5목(4 + 빈칸 + 1)은 아니고, 빈칸을 채우면 승리', () => {
    const cells = [0, 1, 2, 3, 5].map((c) => idx(9, c));
    const board = boardWith(line(cells, 'b'));
    for (const i of cells) expect(isWin(board, i)).toBe(false);
    board[idx(9, 4)] = 'b';
    expect(isWin(board, idx(9, 4))).toBe(true);
  });

  it('TC-GMK-017 EG 다른 색이 끼면 아니다 (흑 4 + 백 1)', () => {
    const board = boardWith([...line([0, 1, 2, 3].map((c) => idx(9, c)), 'b'), [idx(9, 4), 'w']]);
    expect(isWin(board, idx(9, 0))).toBe(false);
    expect(isWin(board, idx(9, 4))).toBe(false);
  });

  it('TC-GMK-018 EG index 로는 연속이지만 행을 넘어가는 줄은 아니다 (가로·↘·↙)', () => {
    // 가로: (0,16) (0,17) (0,18) (1,0) (1,1) = index 16~20
    const h = [16, 17, 18, 19, 20];
    const hb = boardWith(line(h, 'b'));
    for (const i of h) expect(isWin(hb, i)).toBe(false);
    // ↘ (+20): (0,15) (1,16) (2,17) (3,18) 다음이 95 = (5,0)
    const d = [15, 35, 55, 75, 95];
    const db = boardWith(line(d, 'b'));
    for (const i of d) expect(isWin(db, i)).toBe(false);
    // ↙ (+18): (0,3) (1,2) (2,1) (3,0) 다음이 75 = (3,18)
    const a = [3, 21, 39, 57, 75];
    const ab = boardWith(line(a, 'w'));
    for (const i of a) expect(isWin(ab, i)).toBe(false);
  });

  it('TC-GMK-019 EG 빈 칸·범위 밖 index 는 false, 예외 없음', () => {
    const cells = [0, 1, 2, 3, 4].map((c) => idx(0, c));
    const board = boardWith(line(cells, 'b'));
    expect(isWin(board, idx(0, 5))).toBe(false);
    expect(isWin(board, -1)).toBe(false);
    expect(isWin(board, 361)).toBe(false);
    expect(isWin(board, 0)).toBe(true);
  });
});

describe('gameState', () => {
  it('TC-GMK-030 빈 수순: 흑 차례, 승자·무승부 없음', () => {
    const s = gameState([]);
    expect(s.next).toBe('b');
    expect(s.winner).toBeNull();
    expect(s.draw).toBe(false);
    expect(s.board).toHaveLength(361);
  });

  it('TC-GMK-031 차례는 수순 길이로 번갈아 바뀐다', () => {
    expect(gameState([180]).next).toBe('w');
    expect(gameState([180, 181]).next).toBe('b');
    expect(gameState([180, 181]).board[181]).toBe('w');
  });

  it('TC-GMK-032 마지막 수로 5목 완성 → 승자, next null / 하나 전에는 진행 중', () => {
    const won = gameState(BLACK_WINS_9);
    expect(won.winner).toBe('b');
    expect(won.next).toBeNull();
    expect(won.draw).toBe(false);
    const before = gameState(BLACK_WINS_9.slice(0, 8));
    expect(before.winner).toBeNull();
    expect(before.next).toBe('b');
  });

  it('TC-GMK-033 가운데 수로 완성 (흑 XX_XX 에 가운데) — 백 승리 쪽도', () => {
    // 흑: (9,0) (9,1) (9,3) (9,4) 후 (9,2). 백은 (0,*) 에 흩어 둔다.
    const moves = [idx(9, 0), idx(0, 0), idx(9, 1), idx(0, 2), idx(9, 3), idx(0, 4), idx(9, 4), idx(0, 6), idx(9, 2)];
    expect(gameState(moves).winner).toBe('b');
    // 백이 5목: 흑을 흩어 두고 백이 (5,5)~(9,9) ↘
    const white = [idx(0, 0), idx(5, 5), idx(0, 2), idx(6, 6), idx(0, 4), idx(7, 7), idx(0, 6), idx(9, 9), idx(0, 8), idx(8, 8)];
    const ws = gameState(white);
    expect(ws.winner).toBe('w');
    expect(ws.next).toBeNull();
  });

  it('TC-GMK-034 BVA 361수 무승부 / 360수는 진행 중(흑 차례)', () => {
    const { moves, blacks, whites } = drawMoves();
    expect([blacks.length, whites.length, moves.length]).toEqual([181, 180, 361]);
    const full = gameState(moves);
    expect(full.draw).toBe(true);
    expect(full.winner).toBeNull();
    expect(full.next).toBeNull();
    const almost = gameState(moves.slice(0, 360));
    expect(almost.draw).toBe(false);
    expect(almost.next).toBe('b');
  });
});

describe('play — 결정 테이블 (칸 상태 × 게임 상태 × index)', () => {
  it('TC-GMK-040 DT 빈 칸 + 진행 중 → 새 배열, 입력은 그대로', () => {
    const moves = [180];
    const next = play(moves, 181);
    expect(next).toEqual([180, 181]);
    expect(next).not.toBe(moves);
    expect(moves).toEqual([180]);
  });

  it('TC-GMK-041 BVA 모서리 0·360 은 둘 수 있다', () => {
    expect(play([], 0)).toEqual([0]);
    expect(play([0], 360)).toEqual([0, 360]);
  });

  it('TC-GMK-042 DT 이미 돌이 있는 칸 → 같은 참조 (흑 돌·백 돌 모두)', () => {
    const moves = [180, 181];
    expect(play(moves, 180)).toBe(moves);
    expect(play(moves, 181)).toBe(moves);
    expect(play(moves, 182)).toEqual([180, 181, 182]);
  });

  it('TC-GMK-043 DT 승부가 난 뒤 → 같은 참조 / 무승부 뒤 → 같은 참조', () => {
    expect(play(BLACK_WINS_9, idx(10, 10))).toBe(BLACK_WINS_9);
    const { moves } = drawMoves();
    expect(play(moves, 0)).toBe(moves);
    // 대조: 승부 직전에는 둘 수 있다
    const before = BLACK_WINS_9.slice(0, 8);
    expect(play(before, idx(10, 10))).toEqual([...before, idx(10, 10)]);
  });

  it('TC-GMK-044 EG index 가 0~360 정수가 아니면 같은 참조', () => {
    const moves = [180];
    for (const bad of [-1, 361, 1.5, NaN, '3', null, undefined]) {
      expect(play(moves, bad)).toBe(moves);
    }
    expect(play(moves, 3)).toEqual([180, 3]);
  });
});

describe('encodeMoves / decodeMoves', () => {
  it('TC-GMK-050 encode 는 btoa(JSON) (레퍼런스 형식), 빈 수순은 W10=', () => {
    expect(encodeMoves([])).toBe('W10=');
    expect(encodeMoves([180, 181])).toBe(btoa('[180,181]'));
  });

  it('TC-GMK-051 왕복: 빈 수순·한 수·경계 0/360·승부 수순·361수 무승부', () => {
    const { moves } = drawMoves();
    for (const m of [[], [180], [0, 360], BLACK_WINS_9, moves]) {
      expect(decodeMoves(encodeMoves(m))).toEqual(m);
    }
  });

  it('TC-GMK-052 EG 값이 없거나 문자열이 아니면 []', () => {
    for (const bad of [null, undefined, '', 123, {}]) {
      expect(decodeMoves(bad)).toEqual([]);
    }
    expect(decodeMoves(btoa('[5]'))).toEqual([5]);
  });

  it('TC-GMK-053 DT 형식 이상은 모두 [] 이고 던지지 않는다', () => {
    const cases = {
      'base64 아님': '!!!',
      'base64 아님(%)': '%%%',
      'JSON 아님': btoa('abc'),
      '객체': btoa('{"a":1}'),
      '숫자': btoa('5'),
      '문자열': btoa('"x"'),
      'null': btoa('null'),
      '소수 원소': btoa('[1.5]'),
      '문자열 원소': btoa('["3"]'),
      'null 원소': btoa('[null]'),
      'true 원소': btoa('[true]'),
      '배열 원소': btoa('[[1]]'),
      '음수(-1)': btoa('[-1]'),
      '범위 밖(361)': btoa('[361]'),
      '중복': btoa('[0,0]'),
      '중복(떨어짐)': btoa('[7,8,7]'),
      '승부 뒤의 수': btoa(JSON.stringify([...BLACK_WINS_9, idx(10, 10)])),
    };
    for (const [name, param] of Object.entries(cases)) {
      let out;
      expect(() => { out = decodeMoves(param); }, name).not.toThrow();
      expect(out, name).toEqual([]);
    }
  });

  it('TC-GMK-054 결과는 새 배열이다 (두 번 디코딩해도 같은 참조가 아님)', () => {
    const param = encodeMoves([1, 2]);
    const a = decodeMoves(param);
    const b = decodeMoves(param);
    expect(a).toEqual([1, 2]);
    expect(a).not.toBe(b);
  });

  it('TC-GMK-060 EG -0 원소는 0 으로 정규화 (Object.is 기준), [0,-0] 은 중복', () => {
    const one = decodeMoves(btoa('[-0]'));
    expect(one).toHaveLength(1);
    expect(Object.is(one[0], 0)).toBe(true);
    expect(one).toEqual([0]);
    const two = decodeMoves(btoa('[5,-0]'));
    expect(two).toHaveLength(2);
    expect(two[0]).toBe(5);
    expect(Object.is(two[1], 0)).toBe(true);
    expect(decodeMoves(btoa('[0,-0]'))).toEqual([]);
  });
});
