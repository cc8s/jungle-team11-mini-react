// use_effect, use_memo의 의존성 배열 비교. DOM과 무관한 순수 함수다.

// 의존성 인자는 배열이거나 생략(undefined)이어야 한다. 생략하면 매 렌더링마다 바뀐 것으로 본다.
export function validate_dependencies(dependencies, hook_name) {
  if (dependencies === undefined || Array.isArray(dependencies)) return;
  throw new TypeError(`${hook_name}의 의존성은 배열이거나 생략해야 합니다`);
}

// 처음 렌더링(이전 의존성 없음), 의존성 생략, 길이 차이, 값 하나라도 다름(Object.is) → 바뀐 것.
// Object.is를 쓰므로 NaN은 NaN과 같고, +0과 -0은 다르다.
export function are_dependencies_changed(previous_dependencies, next_dependencies) {
  if (previous_dependencies === null || previous_dependencies === undefined) return true;
  if (next_dependencies === undefined) return true;
  if (previous_dependencies.length !== next_dependencies.length) return true;
  return next_dependencies.some(
    (next_dependency, index) => !Object.is(previous_dependencies[index], next_dependency),
  );
}

// 바깥에서 배열을 고쳐도 저장된 의존성이 바뀌지 않도록 복사해 동결한다.
export function freeze_dependencies(dependencies) {
  return dependencies === undefined ? undefined : Object.freeze([...dependencies]);
}
