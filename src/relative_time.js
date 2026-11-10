// 히스토리 카드에 표시할 "방금 전", "3분 전" 같은 상대 시간 문구. DOM과 무관한 순수 함수.

const minute_ms = 60 * 1000;
const hour_ms = 60 * minute_ms;
const day_ms = 24 * hour_ms;

export function format_relative_time(elapsed_ms) {
  if (typeof elapsed_ms !== 'number' || !Number.isFinite(elapsed_ms)) {
    throw new TypeError('elapsed_ms는 유한한 숫자여야 합니다');
  }
  // 시계가 뒤로 조정되어 음수가 나와도 미래 시각으로 표시하지 않는다.
  if (elapsed_ms < minute_ms) return '방금 전';
  if (elapsed_ms < hour_ms) return `${Math.floor(elapsed_ms / minute_ms)}분 전`;
  if (elapsed_ms < day_ms) return `${Math.floor(elapsed_ms / hour_ms)}시간 전`;
  return `${Math.floor(elapsed_ms / day_ms)}일 전`;
}
