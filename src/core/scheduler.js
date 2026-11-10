// batching. 계약은 tests/unit/batching.test.js 맨 위 주석 (결정 0016: 이벤트 핸들러 단위).
//
// batch 안의 setState 는 컴포넌트를 "다시 그려야 함" 으로 표시만 하고, 가장 바깥 batch 가 끝날 때
// 표시된 순서대로 한 번씩 다시 그린다. 이 모듈은 다른 모듈을 import 하지 않는다: 표시할 때 받은
// run 함수가 unmount 확인과 update() 를 맡는다 (hooks.js ↔ component.js ↔ render.js 와 고리를 만들지 않는다).

// 지금 실행 중인 batch 의 중첩 깊이. 0 이면 batch 밖이다.
let depth = 0;

// 표시된 컴포넌트 → 다시 그리는 함수. Map 은 처음 넣은 순서를 지킨다.
// flush 는 시작할 때 이 목록을 떼어 가고 새 목록으로 바꾼다: flush 도중 열린 batch 는 새 목록만 처리한다.
let queue = new Map();

export function isBatching() {
  return depth > 0;
}

// 같은 컴포넌트를 여러 번 표시해도 한 번만 다시 그린다. 자리는 처음 표시된 곳에 남고(Map.set 은 기존 키의 순서를 바꾸지 않는다),
// 다시 그리는 함수는 마지막 표시의 것으로 바꾼다: 건너뛰기 판단이 그 컴포넌트의 마지막 표시를 기준으로 한다.
export function markDirty(comp, run) {
  queue.set(comp, run);
}

export function batch(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`batch: fn 은 함수여야 합니다 (받은 값: ${fn === null ? 'null' : typeof fn})`);
  }
  depth += 1;
  let failed = false;
  let error;
  let result;
  try {
    result = fn();
  } catch (e) {
    failed = true;
    error = e;
  } finally {
    depth -= 1;
  }
  if (depth === 0) {
    // 깊이를 0 으로 돌린 뒤 flush 한다: flush 가 부른 update() 안의 setState 는 batch 밖이므로
    // component 의 재진입 규칙(25회 한도)을 그대로 따른다.
    const flushed = flush();
    if (!failed && flushed.failed) {
      failed = true;
      error = flushed.error;
    }
  }
  if (failed) throw error;
  return result;
}

// 이 batch 동안 표시된 컴포넌트를 모두 다시 그린다. 하나가 던져도 나머지를 마치고 첫 예외를 돌려준다.
function flush() {
  const out = { failed: false, error: undefined };
  const marked = queue;
  queue = new Map();
  for (const run of marked.values()) {
    try {
      run();
    } catch (e) {
      if (!out.failed) {
        out.failed = true;
        out.error = e;
      }
    }
  }
  return out;
}
