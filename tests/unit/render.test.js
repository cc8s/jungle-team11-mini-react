import { describe, it, expect, vi } from 'vitest';
import { render, setProp, removeProp } from '../../src/vdom/render.js';
import { h, createText } from '../../src/vdom/vnode.js';
import { domToVNode } from '../../src/vdom/dom-to-vnode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

function parse(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return domToVNode(tpl.content.firstElementChild);
}

describe('render', () => {
  it('TC-RND-001 텍스트 VNode 는 Text 노드가 된다', () => {
    const node = render(createText('hi'));
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.data).toBe('hi');
  });

  it('TC-RND-002 속성과 중첩 자식을 가진 요소를 만든다', () => {
    const el = render(h('ul', { class: 'l', id: 'x' }, h('li', null, 'a'), h('li', null, h('b', null, 'b'))));
    expect(el.outerHTML).toBe('<ul class="l" id="x"><li>a</li><li><b>b</b></li></ul>');
  });

  it('TC-RND-003 DOM → VNode → DOM → VNode 왕복 결과가 처음과 같다', () => {
    const v = parse(`
      <div class="card" data-id="7">
        <h2>제목 &amp; 부제</h2>
        <pre>  들여쓰기
    유지</pre>
        <input type="checkbox" checked>
        <textarea>  a  </textarea>
      </div>`);
    expect(domToVNode(render(v))).toEqual(v);
  });

  it('TC-RND-004 on* 함수 prop 은 이벤트 핸들러로 붙고 속성으로는 안 남는다', () => {
    const onClick = vi.fn();
    const el = render(h('button', { onClick }, 'go'));
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('onClick')).toBe(false);
    expect(el.attributes).toHaveLength(0);
  });

  it('TC-RND-005 setProp 으로 핸들러를 교체하고 removeProp 으로 제거한다', () => {
    const first = vi.fn();
    const second = vi.fn();
    const el = render(h('button', { onClick: first }));

    setProp(el, 'onClick', second);
    el.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    removeProp(el, 'onClick');
    el.click();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('TC-RND-006 null, undefined, false 는 속성을 안 붙이고 true 는 빈 문자열로 붙인다', () => {
    const el = render(h('input', { a: null, b: undefined, disabled: false, readonly: true }));
    expect(el.hasAttribute('a')).toBe(false);
    expect(el.hasAttribute('b')).toBe(false);
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.getAttribute('readonly')).toBe('');

    setProp(el, 'readonly', false);
    expect(el.hasAttribute('readonly')).toBe(false);
  });

  it('TC-RND-007 key 는 DOM 속성으로 붙지 않는다', () => {
    const el = render(h('li', { key: 'k1', class: 'x' }));
    expect(el.hasAttribute('key')).toBe(false);
    expect(el.getAttribute('class')).toBe('x');
  });

  it('TC-RND-008 svg 와 자손은 SVG 네임스페이스, foreignObject 안은 다시 HTML', () => {
    const svg = render(h('svg', { viewBox: '0 0 10 10' },
      h('linearGradient', { id: 'g' }),
      h('foreignObject', null, h('div', null, 'html'))));
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute('viewBox')).toBe('0 0 10 10');
    expect(svg.firstChild.namespaceURI).toBe(SVG_NS);
    expect(svg.firstChild.localName).toBe('linearGradient');
    const fo = svg.lastChild;
    expect(fo.namespaceURI).toBe(SVG_NS);
    expect(fo.firstChild.namespaceURI).toBe(HTML_NS);
  });

  it('TC-RND-009 value, checked 는 프로퍼티까지 바꾼다', () => {
    const input = render(h('input', { value: 'a' }));
    expect(input.value).toBe('a');
    input.value = '사용자가 입력함'; // 이후에는 value 속성이 화면 값을 정하지 않는다
    setProp(input, 'value', 'b');
    expect(input.value).toBe('b');
    removeProp(input, 'value');
    expect(input.value).toBe('');

    const box = render(h('input', { type: 'checkbox', checked: '' }));
    expect(box.checked).toBe(true);
    box.checked = false;
    setProp(box, 'checked', true);
    expect(box.checked).toBe(true);
    removeProp(box, 'checked');
    expect(box.checked).toBe(false);
  });

  it('TC-RND-010 텍스트 안의 마크업 문자는 HTML 로 해석하지 않는다', () => {
    const el = render(h('p', null, '<b>x</b> & y'));
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe('<b>x</b> & y');
  });

  it('TC-RND-011 type 이 함수면 TypeError', () => {
    const Comp = () => h('div');
    expect(() => render(h(Comp, null))).toThrow(TypeError);
  });
});
