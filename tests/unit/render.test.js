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

// 리뷰 발견(#5). 기준: setProp / removeProp 뒤의 요소는 그 결과 props 로 render 한 요소와
// 속성·화면 상태(.value / .checked / .selectedIndex)·이벤트 동작이 같다.
// on* 이름은 대소문자를 무시하고 같은 이벤트 자리 하나로 본다 (HTML 속성 이름과 같은 원칙).
describe('render — 리뷰 발견: setProp / removeProp', () => {
  it('TC-RND-012 removeProp("value") 는 요소의 기본 상태로 돌린다 (value="" 를 남기지 않는다)', () => {
    const option = render(h('option', { value: 'x' }, 'X'));
    removeProp(option, 'value');
    expect(option.hasAttribute('value')).toBe(false);
    expect(option.value).toBe('X');

    const button = render(h('button', { value: 'v' }, 'b'));
    removeProp(button, 'value');
    expect(button.hasAttribute('value')).toBe(false);

    const box = render(h('input', { type: 'checkbox', value: 'yes' }));
    removeProp(box, 'value');
    expect(box.hasAttribute('value')).toBe(false);
    expect(box.value).toBe('on');

    const li = render(h('li', { value: '3' }, 'a'));
    removeProp(li, 'value');
    expect(li.hasAttribute('value')).toBe(false);

    const select = render(h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')));
    removeProp(select, 'value');
    expect(select.hasAttribute('value')).toBe(false);
    expect(select.value).toBe('a');
    expect(select.selectedIndex).toBe(0);
  });

  it('TC-RND-013 대소문자만 다른 LIVE prop 이름도 프로퍼티까지 바꾼다 (Checked, Value)', () => {
    const box = render(h('input', { type: 'checkbox' }));
    box.checked = false; // 사용자가 건드린 상태
    setProp(box, 'Checked', true);
    expect(box.checked).toBe(true);
    removeProp(box, 'Checked');
    expect(box.checked).toBe(false);

    const input = render(h('input', { value: 'a' }));
    input.value = '사용자가 입력함';
    setProp(input, 'Value', 'b');
    expect(input.value).toBe('b');
  });

  it('TC-RND-014 onclick 문자열 속성을 함수로 바꾸면 속성이 사라지고 함수만 호출된다', () => {
    const f = vi.fn();
    const el = render(h('button', { onclick: 'void 0' }, 'go'));
    expect(el.getAttribute('onclick')).toBe('void 0');
    setProp(el, 'onclick', f);
    expect(el.hasAttribute('onclick')).toBe(false);
    el.click();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('TC-RND-015 onClick 과 onclick 은 같은 이벤트 자리다 (나중 것이 이기고, 어느 이름으로든 지운다)', () => {
    const f = vi.fn();
    const g = vi.fn();
    const el = render(h('button'));
    setProp(el, 'onClick', f);
    setProp(el, 'onclick', g);
    el.click();
    expect(f).not.toHaveBeenCalled();
    expect(g).toHaveBeenCalledTimes(1);

    removeProp(el, 'ONCLICK');
    el.click();
    expect(g).toHaveBeenCalledTimes(1);

    const same = vi.fn();
    const el2 = render(h('button', { onClick: same, onclick: same }));
    el2.click();
    expect(same).toHaveBeenCalledTimes(1);
  });
});

// 리뷰 발견(#8). 원칙: VNode 에 value 가 있는 요소의 화면 값은 그 value 다. select 의 value 는
// option 이 있어야 고를 수 있으므로, 자식을 만든 뒤에 적용된 것과 같은 결과여야 한다.
describe('render — 리뷰 발견(#8): 제어 select', () => {
  it('TC-RND-016 render(select{value:"b"}, a, b) → .value "b", selectedIndex 1 (option 보다 value 가 먼저 와도)', () => {
    const select = render(h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')));
    expect(select.value).toBe('b');
    expect(select.selectedIndex).toBe(1);

    // 문서에 붙인 뒤에도 같다
    document.body.appendChild(select);
    expect(select.value).toBe('b');
    select.remove();

    // 마지막 option 을 고르는 경우와 텍스트만 있는 option
    const last = render(h('select', { value: 'z' }, h('option', null, 'x'), h('option', null, 'y'), h('option', null, 'z')));
    expect(last.value).toBe('z');
    expect(last.selectedIndex).toBe(2);
  });
});
