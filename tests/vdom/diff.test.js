import { describe, it, expect } from 'vitest';
import { diff } from '../../src/vdom/diff.js';
import { h } from '../../src/vdom/vnode.js';

const t = (s) => ({ type: '#text', text: s });

describe('diff 5가지 케이스', () => {
  it('변경 없음 → 패치 없음', () => {
    expect(diff(h('div', { a: '1' }, 'x'), h('div', { a: '1' }, 'x'))).toEqual([]);
  });
  it('CREATE: 새 자식 추가', () => {
    const p = diff(h('ul', null, h('li')), h('ul', null, h('li'), h('li')));
    expect(p).toEqual([{ kind: 'CREATE', path: [1], vnode: h('li') }]);
  });
  it('REMOVE: 자식 제거는 뒤에서부터', () => {
    const p = diff(h('ul', null, h('li'), h('li'), h('li')), h('ul', null, h('li')));
    expect(p.map((x) => x.path[0])).toEqual([2, 1]);
    expect(p.every((x) => x.kind === 'REMOVE')).toBe(true);
  });
  it('REPLACE: 태그가 다르면 교체', () => {
    expect(diff(h('p'), h('div'))[0]).toMatchObject({ kind: 'REPLACE', path: [] });
  });
  it('TEXT: 텍스트 변경', () => {
    expect(diff(h('p', null, 'a'), h('p', null, 'b'))).toEqual([{ kind: 'TEXT', path: [0], text: 'b' }]);
  });
  it('PROPS: 추가/변경/삭제', () => {
    const p = diff(h('p', { a: '1', b: '2' }), h('p', { a: '9', c: '3' }));
    expect(p).toEqual([{ kind: 'PROPS', path: [], set: { a: '9', c: '3' }, remove: ['b'] }]);
  });
});

describe('diff 엣지 케이스', () => {
  it('둘 다 null 이면 빈 배열', () => expect(diff(null, null)).toEqual([]));
  it('텍스트 ↔ 요소 교체', () => {
    expect(diff(t('a'), h('b'))[0].kind).toBe('REPLACE');
  });
  it('깊은 곳의 변경 path 가 정확하다', () => {
    const a = h('div', null, h('p'), h('section', null, h('span', null, 'x')));
    const b = h('div', null, h('p'), h('section', null, h('span', null, 'y')));
    expect(diff(a, b)[0].path).toEqual([1, 0, 0]);
  });
});
