import { describe, it, expect } from 'vitest';
import { domToVNode, childrenToVNodes } from '../../src/vdom/dom-to-vnode.js';
import { h, createText } from '../../src/vdom/vnode.js';

// Phase 1 과 같은 방식으로 <template> 에 넣어 파싱한다.
function fragment(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}
const parse = (html) => domToVNode(fragment(html).firstElementChild);

describe('domToVNode', () => {
  it('TC-V2N-001 태그, 속성, 텍스트 자식을 옮긴다', () => {
    expect(parse('<p class="x" id="y">hi</p>')).toEqual(h('p', { class: 'x', id: 'y' }, 'hi'));
  });

  it('TC-V2N-002 중첩 요소를 같은 깊이의 트리로 만든다', () => {
    const v = parse('<div><section><span>deep</span></section></div>');
    expect(v.children[0].type).toBe('section');
    expect(v.children[0].children[0].type).toBe('span');
    expect(v.children[0].children[0].children[0].text).toBe('deep');
  });

  it('TC-V2N-003 들여쓰기만 다른 두 HTML 은 같은 VNode 가 된다', () => {
    const flat = parse('<ul><li>a</li><li>b</li></ul>');
    const indented = parse('<ul>\n  <li>a</li>\n\n\t<li>b</li>\r\n</ul>');
    expect(indented).toEqual(flat);
    expect(indented.children).toHaveLength(2);
  });

  it('TC-V2N-004 내용이 있는 텍스트는 앞뒤 공백까지 유지한다', () => {
    expect(parse('<p> a </p>').children).toEqual([createText(' a ')]);
  });

  it('TC-V2N-005 주석 노드는 버린다', () => {
    const v = parse('<div><!-- c1 --><b>x</b><!-- c2 --></div>');
    expect(v.children).toEqual([h('b', null, 'x')]);
  });

  it('TC-V2N-006 <pre> 와 그 자손 안의 공백 전용 텍스트는 유지한다', () => {
    const v = parse('<div>  <pre>  <b>x</b>  <code>   </code></pre>  </div>');
    expect(v.children).toHaveLength(1); // pre 바깥 공백은 버림
    const pre = v.children[0];
    expect(pre.children.map((c) => c.type)).toEqual(['#text', 'b', '#text', 'code']);
    expect(pre.children[0].text).toBe('  ');
    expect(pre.children[3].children).toEqual([createText('   ')]);
  });

  it('TC-V2N-007 <textarea> 안의 공백 전용 텍스트는 유지한다', () => {
    expect(parse('<textarea>   </textarea>').children).toEqual([createText('   ')]);
  });

  it('TC-V2N-008 &nbsp; 만 있는 텍스트는 공백으로 보지 않고 유지한다', () => {
    expect(parse('<p>&nbsp;</p>').children).toEqual([createText(' ')]);
  });

  it('TC-V2N-009 한글, 이모지, 결합 문자를 그대로 옮긴다', () => {
    const text = '안녕 👋🏽 é';
    expect(parse(`<p>${text}</p>`).children[0].text).toBe(text);
  });

  it('TC-V2N-010 값 없는 불리언 속성은 빈 문자열이 된다', () => {
    expect(parse('<input disabled>').props).toEqual({ disabled: '' });
  });

  it('TC-V2N-011 HTML 태그는 소문자, SVG 태그와 속성은 대소문자를 지킨다', () => {
    expect(parse('<DIV></DIV>').type).toBe('div');
    const svg = parse('<svg viewBox="0 0 1 1"><defs><linearGradient id="g"></linearGradient></defs></svg>');
    expect(svg.props).toEqual({ viewBox: '0 0 1 1' });
    expect(svg.children[0].children[0].type).toBe('linearGradient');
  });

  it('TC-V2N-012 텍스트 노드는 텍스트 VNode, 주석과 공백 전용 텍스트는 null', () => {
    expect(domToVNode(document.createTextNode('hi'))).toEqual(createText('hi'));
    expect(domToVNode(document.createComment('x'))).toBeNull();
    expect(domToVNode(document.createTextNode(' \n '))).toBeNull();
    expect(domToVNode(document.createTextNode(''))).toBeNull();
  });

  it('TC-V2N-013 key 속성은 key 필드로 옮긴다', () => {
    const v = parse('<li key="a" class="x">a</li>');
    expect(v.key).toBe('a');
    expect(v.props).toEqual({ class: 'x' });
  });
});

describe('childrenToVNodes', () => {
  it('TC-V2N-014 <template> 의 여러 최상위 노드를 배열로 바꾼다', () => {
    const list = childrenToVNodes(fragment('\n<li>a</li>\n<!-- x -->\n<li>b</li>\n'));
    expect(list).toEqual([h('li', null, 'a'), h('li', null, 'b')]);
  });
});

it('TC-V2N-015 같은 구조를 DOM 과 h() 로 만들면 VNode 가 같다', () => {
  const fromDom = parse(`
    <ul class="l">
      <li key="1">a</li>
      <li>b <b>c</b></li>
    </ul>`);
  const fromH = h('ul', { class: 'l' },
    h('li', { key: '1' }, 'a'),
    h('li', null, 'b ', h('b', null, 'c')));
  expect(fromDom).toEqual(fromH);
});
