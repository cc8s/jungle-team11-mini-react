import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate_dependencies, are_dependencies_changed, freeze_dependencies } from '../src/hook_dependencies.js';

test('EC-001 처음 렌더링(이전 의존성 없음)은 항상 바뀐 것이다', () => {
  assert.equal(are_dependencies_changed(null, []), true);
  assert.equal(are_dependencies_changed(undefined, [1]), true);
  assert.equal(are_dependencies_changed(null, undefined), true);
});

test('EC-002 의존성을 생략하면 매번 바뀐 것이다', () => {
  assert.equal(are_dependencies_changed([], undefined), true);
  assert.equal(are_dependencies_changed(undefined, undefined), true);
});

test('EC-003 빈 배열끼리, 같은 값끼리는 바뀌지 않은 것이다', () => {
  const shared_object = { count: 1 };
  assert.equal(are_dependencies_changed([], []), false);
  assert.equal(are_dependencies_changed([1, 'text', shared_object], [1, 'text', shared_object]), false);
});

test('EC-004 Object.is 기준: NaN은 같고 +0과 -0, 내용이 같은 다른 객체는 다르다', () => {
  assert.equal(are_dependencies_changed([Number.NaN], [Number.NaN]), false);
  assert.equal(are_dependencies_changed([0], [-0]), true);
  assert.equal(are_dependencies_changed([{ count: 1 }], [{ count: 1 }]), true);
  assert.equal(are_dependencies_changed([null], [undefined]), true);
});

test('EC-005 길이가 다르면 바뀐 것이다', () => {
  assert.equal(are_dependencies_changed([1], [1, 2]), true);
  assert.equal(are_dependencies_changed([1, 2], [1]), true);
});

test('EC-006 배열이 아닌 의존성(null, 문자열, 객체, 숫자)은 TypeError, 배열과 생략은 통과', () => {
  for (const invalid_dependencies of [null, 'count', { length: 0 }, 3]) {
    assert.throws(() => validate_dependencies(invalid_dependencies, 'use_effect'), /use_effect의 의존성/);
  }
  assert.doesNotThrow(() => validate_dependencies([], 'use_memo'));
  assert.doesNotThrow(() => validate_dependencies(undefined, 'use_memo'));
});

test('EC-007 저장한 의존성은 복사본이라 원본 배열을 고쳐도 바뀌지 않는다', () => {
  const source_dependencies = [1, 2];
  const stored_dependencies = freeze_dependencies(source_dependencies);
  source_dependencies[0] = 99;
  assert.deepEqual(stored_dependencies, [1, 2]);
  assert.equal(Object.isFrozen(stored_dependencies), true);
  assert.equal(freeze_dependencies(undefined), undefined);
});
