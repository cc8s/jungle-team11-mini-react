import { describe, it, expect } from 'vitest';
import { domToVNode, vnodeToDom, h } from '../../src/vdom/vnode.js';

const parse = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstChild; };

describe('domToVNode', () => {
  it('태그·속성·자식을 변환한다', () => {
    expect(domToVNode(parse('<a href="/x" class="k">hi</a>'))).toEqual({
      type: 'a', props: { href: '/x', class: 'k' }, children: [{ type: '#text', text: 'hi' }],
    });
  });
  it('주석과 공백 텍스트 노드를 무시한다', () => {
    const v = domToVNode(parse('<ul>\n  <!-- c -->\n  <li>a</li>\n</ul>'));
    expect(v.children).toHaveLength(1);
    expect(v.children[0].type).toBe('li');
  });
  it('빈 요소는 자식이 빈 배열이다', () => {
    expect(domToVNode(parse('<div></div>')).children).toEqual([]);
  });
  it('주석 노드 자체는 null', () => {
    expect(domToVNode(document.createComment('x'))).toBeNull();
  });
});

describe('vnodeToDom', () => {
  it('왕복 변환해도 동일한 VNode 가 나온다', () => {
    const v = domToVNode(parse('<div id="a"><p>x<b>y</b></p><img src="s"></div>'));
    expect(domToVNode(vnodeToDom(v))).toEqual(v);
  });
});

describe('h', () => {
  it('문자열/숫자 자식을 텍스트 노드로, null/false 는 제거한다', () => {
    const v = h('p', null, 'a', 1, null, false, [h('b')]);
    expect(v.children.map((c) => c.type)).toEqual(['#text', '#text', 'b']);
  });
});
