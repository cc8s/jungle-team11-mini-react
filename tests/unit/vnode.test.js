import { describe, it, expect } from 'vitest';
import { h, createText, isText, TEXT } from '../../src/vdom/vnode.js';

describe('h()', () => {
  it('TC-VNODE-001 태그, props, 텍스트 자식으로 VNode 를 만든다', () => {
    expect(h('div', { id: 'a' }, 'x')).toEqual({
      type: 'div',
      props: { id: 'a' },
      key: null,
      children: [{ type: TEXT, props: {}, key: null, children: [], text: 'x' }],
    });
  });

  it('TC-VNODE-002 props 가 null 이나 undefined 면 빈 객체가 된다', () => {
    expect(h('div', null).props).toEqual({});
    expect(h('div', undefined).props).toEqual({});
    expect(h('div').props).toEqual({});
  });

  it('TC-VNODE-003 중첩 배열 자식을 평탄화한다', () => {
    const a = h('i', null);
    const b = h('b', null);
    const c = h('u', null);
    expect(h('p', null, a, [b, [c]]).children).toEqual([a, b, c]);
  });

  it('TC-VNODE-004 null, undefined, true, false 자식은 버린다', () => {
    const child = h('span', null);
    expect(h('p', null, null, undefined, true, false, child).children).toEqual([child]);
  });

  it('TC-VNODE-005 0 과 빈 문자열은 falsy 여도 텍스트로 남긴다', () => {
    expect(h('p', null, 0, '').children).toEqual([createText('0'), createText('')]);
  });

  it('TC-VNODE-006 key 는 props 에서 빼서 key 필드로 옮긴다', () => {
    const v = h('li', { key: 'k1', class: 'x' });
    expect(v.key).toBe('k1');
    expect(v.props).toEqual({ class: 'x' });
  });

  it('TC-VNODE-007 넘긴 props 객체를 바꾸지 않는다', () => {
    const props = { key: 'k', id: 'a' };
    h('li', props);
    expect(props).toEqual({ key: 'k', id: 'a' });
  });
});

describe('createText / isText', () => {
  it('숫자를 문자열 텍스트로 만들고 텍스트 여부를 판별한다', () => {
    const t = createText(42);
    expect(t.text).toBe('42');
    expect(isText(t)).toBe(true);
    expect(isText(h('div'))).toBe(false);
    expect(isText(null)).toBe(false);
  });
});
