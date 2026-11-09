// 뒤로/앞으로가 되는 기록. 계약은 tests/unit/history.test.js 맨 위 주석.
//
// 값은 복사하지 않고 받은 참조 그대로 저장한다. 뒤로 간 뒤 push 하면 앞쪽 기록을 버린다.
export function createHistory(initial) {
  const entries = [initial];
  let index = 0;

  return {
    get current() {
      return entries[index];
    },
    get index() {
      return index;
    },
    get size() {
      return entries.length;
    },
    get canBack() {
      return index > 0;
    },
    get canForward() {
      return index < entries.length - 1;
    },
    push(value) {
      entries.length = index + 1;
      entries.push(value);
      index = entries.length - 1;
    },
    back() {
      if (index > 0) index -= 1;
      return entries[index];
    },
    forward() {
      if (index < entries.length - 1) index += 1;
      return entries[index];
    },
  };
}
