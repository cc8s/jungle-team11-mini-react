// hook. 계약은 tests/unit/hooks.test.js · tests/unit/effects.test.js 맨 위 주석.
//
// 모두 component.js 의 useHookSlot 위에 만든다: 호출 1번 = 슬롯 1개, 루트 fn 렌더 중에만.
import { getCurrentComponent, isUnmounted, useHookSlot, withoutHooks } from './component.js';

// [state, setState]. 슬롯은 { state, setState } 이고 setState 는 슬롯과 함께 한 번만 만든다.
export function useState(initial) {
  const comp = getCurrentComponent();
  const slot = useHookSlot(() => {
    const created = { state: typeof initial === 'function' ? initial() : initial, setState: null };
    created.setState = (next) => setSlot(comp, created, next);
    return created;
  }, 'state');
  return [slot.state, slot.setState];
}

// 렌더 중에는 이번 렌더의 effect 와 deps, 그리고 이번에 실행할지(due)만 기록한다.
// 실행은 component.js 의 effect 단계가 한다: ran · lastDeps(마지막으로 실행된 deps) · cleanup 을 남긴다.
export function useEffect(effect, deps) {
  if (typeof effect !== 'function') {
    throw new TypeError(`useEffect: effect 는 함수여야 합니다 (받은 값: ${typeof effect})`);
  }
  checkDeps('useEffect', deps);
  const slot = useHookSlot(
    () => ({ effect: null, deps: null, due: false, ran: false, lastDeps: null, cleanup: null }),
    'effect',
  );
  slot.effect = effect;
  slot.deps = deps ?? null;
  slot.due = !slot.ran || slot.deps == null || !sameDeps(slot.lastDeps, slot.deps);
}

// 렌더 중에 compute() 를 부르고, deps 가 마지막으로 계산에 쓴 deps 와 같으면 저장된 값을 돌려준다.
// compute 가 던지면 슬롯은 이전 값과 이전 deps 그대로다.
export function useMemo(compute, deps) {
  if (typeof compute !== 'function') {
    throw new TypeError(`useMemo: compute 는 함수여야 합니다 (받은 값: ${typeof compute})`);
  }
  checkDeps('useMemo', deps);
  let created = false;
  const slot = useHookSlot(() => {
    created = true;
    return { value: compute(), deps: deps ?? null };
  }, 'memo');
  if (!created && (deps == null || !sameDeps(slot.deps, deps))) {
    const value = withoutHooks(compute);
    slot.value = value;
    slot.deps = deps;
  }
  return slot.value;
}

function checkDeps(name, deps) {
  if (deps != null && !Array.isArray(deps)) {
    throw new TypeError(`${name}: deps 는 배열이거나 생략해야 합니다 (받은 값: ${typeof deps})`);
  }
}

// 길이가 같고 원소별 Object.is 가 모두 참이면 같다. 어느 한쪽이라도 배열이 아니면 다르다.
function sameDeps(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) return false;
  return prev.every((item, i) => Object.is(item, next[i]));
}

// 업데이터를 실행 중이다. 업데이터는 순수 함수여야 하므로 그 안의 setState 는 Error.
let updating = false;

function setSlot(comp, slot, next) {
  if (updating) throw new Error('setState 의 업데이터 안에서는 setState 를 부를 수 없습니다');
  // unmount 된(또는 unmount 중인) 컴포넌트의 setState 는 무시한다.
  if (isUnmounted(comp)) return;
  // mount 가 실패하면 hooks 가 비워지고 다시 mount 하면 새 슬롯이 생긴다. 버려진 슬롯은 무시한다.
  if (!comp.hooks.includes(slot)) return;
  const value = typeof next === 'function' ? runUpdater(next, slot.state) : next;
  if (Object.is(slot.state, value)) return;
  slot.state = value;
  requestUpdate(comp);
}

function runUpdater(updater, prev) {
  updating = true;
  try {
    return updater(prev);
  } finally {
    updating = false;
  }
}

// 상태가 바뀐 컴포넌트를 다시 렌더한다. 렌더·commit·effect 단계 중이면 component 의 재진입 규칙이 표시만 한다.
function requestUpdate(comp) {
  comp.update();
}
