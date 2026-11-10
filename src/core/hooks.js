// hook. 계약은 tests/unit/hooks.test.js 맨 위 주석.
//
// 모두 component.js 의 useHookSlot 위에 만든다: 호출 1번 = 슬롯 1개, 루트 fn 렌더 중에만.
import { getCurrentComponent, useHookSlot } from './component.js';

// [state, setState]. 슬롯은 { state, setState } 이고 setState 는 슬롯과 함께 한 번만 만든다.
export function useState(initial) {
  const comp = getCurrentComponent();
  const slot = useHookSlot(() => {
    const created = { state: typeof initial === 'function' ? initial() : initial, setState: null };
    created.setState = (next) => setSlot(comp, created, next);
    return created;
  });
  return [slot.state, slot.setState];
}

// 업데이터를 실행 중이다. 업데이터는 순수 함수여야 하므로 그 안의 setState 는 Error.
let updating = false;

function setSlot(comp, slot, next) {
  if (updating) throw new Error('setState 의 업데이터 안에서는 setState 를 부를 수 없습니다');
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

// 상태가 바뀐 컴포넌트를 다시 렌더한다. 렌더 중이면 component 의 재진입 규칙이 표시만 한다.
function requestUpdate(comp) {
  comp.update();
}
