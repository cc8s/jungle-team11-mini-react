// 오목 순수 로직. 계약은 tests/unit/gomoku.test.js 맨 위 주석 (결정 0015). DOM 을 쓰지 않는다.
//
//   수순(moves): 놓은 칸 index 의 배열. 짝수 번째가 흑, 홀수 번째가 백.
//   판(board):   길이 361 배열, 칸마다 'b' | 'w' | null. 수순에서 만든다.
// 차례와 승패는 저장하지 않고 수순에서 계산한다.

export const SIZE = 19;
export const CELLS = SIZE * SIZE;

// 가로 · 세로 · 대각선 ↘ · 대각선 ↙ 의 [행, 열] 증분.
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

const colorOf = (k) => (k % 2 === 0 ? 'b' : 'w');
const isCell = (index) => Number.isInteger(index) && index >= 0 && index < CELLS;

export function boardFromMoves(moves) {
  const board = Array(CELLS).fill(null);
  moves.forEach((index, k) => {
    board[index] = colorOf(k);
  });
  return board;
}

// index 의 돌이 한 방향에서 같은 색 5개 이상 연속인 줄에 속하는가. 행·열로 걸어 가장자리를 넘지 않는다.
export function isWin(board, index) {
  if (!isCell(index)) return false;
  const color = board[index];
  if (color == null) return false;
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  return DIRECTIONS.some(([dr, dc]) => 1 + run(board, row, col, dr, dc, color) + run(board, row, col, -dr, -dc, color) >= 5);
}

// (row, col) 에서 (dr, dc) 쪽으로 같은 색이 몇 개 이어지는가 (자기 자신 제외).
function run(board, row, col, dr, dc, color) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === color) {
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
}

export function gameState(moves) {
  const board = Array(CELLS).fill(null);
  let winner = null;
  moves.forEach((index, k) => {
    board[index] = colorOf(k);
    if (winner == null && isWin(board, index)) winner = board[index];
  });
  const draw = winner == null && moves.length === CELLS;
  const next = winner != null || draw ? null : colorOf(moves.length);
  return { board, next, winner, draw };
}

// 둘 수 없으면 입력과 같은 참조를 돌려준다: App 의 setState 가 Object.is 로 건너뛴다.
export function play(moves, index) {
  if (!isCell(index)) return moves;
  const { board, next } = gameState(moves);
  if (next == null || board[index] != null) return moves;
  return [...moves, index];
}

// 레퍼런스(codingapple1/gibo)의 `?a=base64(JSON)` 형식.
export function encodeMoves(moves) {
  return btoa(JSON.stringify(moves));
}

// URL 의 `a` 값 → 수순. 형식이 맞지 않으면 [] 이고 던지지 않는다.
export function decodeMoves(param) {
  if (typeof param !== 'string' || param === '') return [];
  let value;
  try {
    value = JSON.parse(atob(param));
  } catch {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isCell)) return [];
  // JSON '[-0]' 은 -0 을 만든다. 0 으로 맞춰 둔다 (Set 은 -0 과 0 을 같게 봐 중복으로 거른다).
  value = value.map((index) => index + 0);
  if (new Set(value).size !== value.length) return [];
  // 승부가 난 뒤의 수가 있으면 거부한다: 5목은 마지막 수에서만 나올 수 있다.
  const board = Array(CELLS).fill(null);
  for (let k = 0; k < value.length; k++) {
    board[value[k]] = colorOf(k);
    if (k < value.length - 1 && isWin(board, value[k])) return [];
  }
  return value;
}
