import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format_relative_time } from '../src/relative_time.js';

test('EC-001 숫자가 아니거나 유한하지 않으면 TypeError', () => {
  for (const invalid_input of [null, undefined, '1000', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => format_relative_time(invalid_input), TypeError);
  }
});

test('EC-002 1분 미만과 음수(시계 역행)는 "방금 전"', () => {
  assert.equal(format_relative_time(0), '방금 전');
  assert.equal(format_relative_time(59_999), '방금 전');
  assert.equal(format_relative_time(-5_000), '방금 전');
});

test('EC-003 분, 시간, 일 경계', () => {
  assert.equal(format_relative_time(60_000), '1분 전');
  assert.equal(format_relative_time(59 * 60_000 + 59_999), '59분 전');
  assert.equal(format_relative_time(60 * 60_000), '1시간 전');
  assert.equal(format_relative_time(24 * 60 * 60_000 - 1), '23시간 전');
  assert.equal(format_relative_time(24 * 60 * 60_000), '1일 전');
  assert.equal(format_relative_time(5 * 24 * 60 * 60_000), '5일 전');
});
