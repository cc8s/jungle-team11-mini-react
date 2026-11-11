import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve_page_name, default_page_name } from '../src/page_route.js';

test('EC-001 알려진 hash는 해당 페이지, 대소문자와 공백은 무시', () => {
  assert.equal(resolve_page_name('#phase1'), 'phase1');
  assert.equal(resolve_page_name('#phase2'), 'phase2');
  assert.equal(resolve_page_name('#PHASE2 '), 'phase2');
  assert.equal(resolve_page_name('phase2'), 'phase2');
});

test('EC-002 빈 hash, 모르는 hash, 문자열이 아닌 값은 기본 페이지', () => {
  for (const unknown_hash of ['', '#', '#phase3', '#real_area', null, undefined, 2]) {
    assert.equal(resolve_page_name(unknown_hash), default_page_name);
  }
});
