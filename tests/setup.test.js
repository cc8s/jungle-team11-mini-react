import { describe, it, expect } from 'vitest';

describe('테스트 환경', () => {
  it('jsdom 에서 DOM API 를 쓸 수 있다', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>hello</p>';
    expect(div.firstChild.tagName).toBe('P');
  });
});
