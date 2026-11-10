// patch(dom, patches) 의 API 계약 (이슈 #5). 이 파일이 명세다.
//
// import { patch } from '../../src/vdom/patch.js';
//
// patch(dom, patches) → Node | null   (patch 후의 루트)
//   - dom: render(old) 로 만든 루트 DOM 노드(Element 또는 Text). old 가 null 이면 null.
//     dom 은 반드시 render(vnode) 결과여야 한다. 사용자 HTML 로 만든 DOM(공백 텍스트·주석 포함)에
//     바로 적용하면 안 된다: domToVNode 가 버린 노드 때문에 childNodes 인덱스가 어긋난다
//     (#6 은 실제 영역을 render 결과로 채운 뒤 patch 한다. specs/react.md).
//   - patch(null, []) → null.
//   - patches: diff(old, new) 결과(Patch[], 형태는 tests/unit/diff.test.js 참고).
//     patches 배열, 각 patch 객체, patch.node(VNode) 를 바꾸지 않는다.
//   - 반환값
//       루트가 그대로면 → 받은 dom 과 **같은 객체** (빈 목록, 루트 TEXT/PROPS, 자식 patch 만 있을 때)
//       REPLACE []     → render(node) 로 만든 새 노드. dom 에 부모가 있으면 그 자리에서 바꿔 끼운다.
//       REMOVE []      → null. dom 에 부모가 있으면 부모에서 뺀다.
//       ADD [] (dom 이 null) → render(node) 로 만든 새 노드 (부모가 없으니 붙이는 것은 호출자 몫).
//         [결정됨] 루트 ADD 의 새 노드를 컨테이너에 붙이는 것은 호출자가 한다. 시그니처는 patch(dom, …) 유지.
//   - 잘못된 입력은 예외를 낸다 (TypeError 권장, 테스트는 toThrow() 만 확인).
//       없는 path / 범위 밖 인덱스 (REMOVE·REPLACE·TEXT·PROPS 대상이 없음, 음수 인덱스,
//         중간 경로가 없음), ADD 의 i > 자식 수
//       텍스트 노드에 PROPS, 요소에 TEXT
//       알 수 없는 patch type
//       dom 이 null 이 아닌데 ADD [] / dom 이 null 인데 ADD [] 가 아닌 patch
//       patch 형태가 잘못됨 (TypeError 로 고정): PROPS 의 remove 가 배열이 아님, set 이 일반 객체가
//         아님(배열 등), TEXT 의 text 가 문자열이 아님, ADD 의 부모가 텍스트 노드 (DOMException 아님)
//       노드 종류 불일치·알 수 없는 type 도 TypeError (TC-PATCH-038, 039)
//     원자성은 요구하지 않는다: 예외가 나기 전에 앞선 patch 는 이미 적용되어 있을 수 있다.
//   - 왕복 성질: render(old) 에 patch(dom, diff(old, new)) 를 적용한 결과는 render(new) 와
//     outerHTML·isEqualNode 뿐 아니라 화면 상태 프로퍼티(.value / .checked / .selectedIndex)와
//     이벤트 핸들러 동작까지 같다. 사용자가 입력해 값이 "dirty" 해진 뒤에도 그렇다 (TC-PATCH-102~107).
//     textarea 의 자식 텍스트가 ADD / REMOVE 로 생기거나 없어져도 .value 가 render(new) 와 같다 (TC-PATCH-110~112).
//     on* 이름은 대소문자를 무시하고 같은 이벤트 자리 하나로 본다(HTML 속성 이름과 같은 원칙,
//     TC-RND-015). 같은 props 에 대소문자만 다른 이름이 둘 있으면 나중 것이 이긴다(render 와 같다).
//   - 적용 순서: **받은 순서 그대로** 앞에서부터 하나씩 적용한다(정렬·재배치하지 않는다).
//     각 path 는 그 patch 를 적용하는 시점의 DOM 기준이다. diff 는 여러 REMOVE 를 인덱스
//     내림차순으로 내므로 그대로 적용하면 앞쪽 인덱스가 밀리지 않는다.
//   - path [i, j, ...] 는 루트에서 **childNodes** 를 따라 내려간다(Element.children 이 아니다.
//     텍스트 노드도 자식 하나로 센다). render 는 VNode 자식 하나당 DOM 자식 하나를 만든다.
//   - 타입별 동작
//       ADD [..., i]     부모의 i 번째 자리에 render(node) 를 끼운다. i == 자식 수면 맨 뒤.
//       REMOVE [..., i]  부모에서 i 번째 자식을 뺀다.
//       REPLACE [..., i] i 번째 자식을 render(node) 로 바꾼다.
//       ADD/REPLACE 의 새 노드는 부모의 네임스페이스를 따른다: 부모가 SVG 요소면 SVG,
//         foreignObject 안은 HTML (render(vnode, ns) 의 규칙과 같다).
//       TEXT             텍스트 노드를 **교체하지 않고** 내용(data)만 바꾼다.
//       PROPS            요소를 **교체하지 않는다**. **remove 를 먼저**(render.js removeProp),
//                        **그다음 set**(render.js setProp) 을 적용한다. 값 규칙은 setProp 과 같다
//                        (on* 함수 = 이벤트, true = '', value/checked 는 프로퍼티까지).
//                        HTML 속성 이름은 대소문자를 무시하므로 set 다음 remove 를 하면
//                        'dataX' 를 설정한 뒤 'datax' 를 지우면서 방금 설정한 값이 사라진다.
//   - 바뀐 노드만 건드린다: patch 대상이 아닌 노드는 patch 후에도 같은 DOM 객체로 같은 자리에
//     남고, MutationObserver 기록에도 나타나지 않는다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { patch } from '../../src/vdom/patch.js';
import { diff } from '../../src/vdom/diff.js';
import { render } from '../../src/vdom/render.js';
import { h, createText } from '../../src/vdom/vnode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

// render(vnode) 를 문서에 붙은 컨테이너 안에 넣는다.
function mount(vnode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dom = render(vnode);
  container.appendChild(dom);
  return { container, dom };
}

function observe(target) {
  const mo = new MutationObserver(() => {});
  mo.observe(target, { childList: true, attributes: true, characterData: true, subtree: true });
  return mo;
}

// 루트와 모든 자손을 문서 순서대로 모은다 (텍스트 노드 포함).
function allNodes(root) {
  const out = [root];
  for (const child of root.childNodes) out.push(...allNodes(child));
  return out;
}

function deepFreeze(v) {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('patch — 타입별 동작', () => {
  it('TC-PATCH-001 ADD: 자식을 맨 뒤에 붙이고 기존 자식은 그대로', () => {
    const { dom } = mount(h('ul', null, h('li', null, 'a')));
    const first = dom.childNodes[0];
    const result = patch(dom, [{ type: 'ADD', path: [1], node: h('li', { class: 'n' }, 'b') }]);
    expect(result).toBe(dom);
    expect(dom.outerHTML).toBe('<ul><li>a</li><li class="n">b</li></ul>');
    expect(dom.childNodes[0]).toBe(first);
  });

  it('TC-PATCH-002 REMOVE: 그 자식만 빠지고 빠진 노드는 문서에서 떨어진다', () => {
    const { dom } = mount(h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
    const [first, second] = dom.childNodes;
    const result = patch(dom, [{ type: 'REMOVE', path: [1] }]);
    expect(result).toBe(dom);
    expect(dom.outerHTML).toBe('<ul><li>a</li></ul>');
    expect(dom.childNodes[0]).toBe(first);
    expect(second.parentNode).toBe(null);
  });

  it('TC-PATCH-003 REPLACE: 자식을 새 노드로 바꾸고 부모는 그대로', () => {
    const { dom } = mount(h('div', { id: 'r' }, h('p', { id: 'o' }, 'x')));
    const old = dom.childNodes[0];
    const result = patch(dom, [{ type: 'REPLACE', path: [0], node: h('span', { id: 'n' }, h('i', null, 'y')) }]);
    expect(result).toBe(dom);
    expect(dom.outerHTML).toBe('<div id="r"><span id="n"><i>y</i></span></div>');
    expect(old.parentNode).toBe(null);
  });

  it('TC-PATCH-004 TEXT: 텍스트 노드를 교체하지 않고 내용만 바꾼다', () => {
    const { dom } = mount(h('p', null, 'x'));
    const text = dom.childNodes[0];
    patch(dom, [{ type: 'TEXT', path: [0], text: 'y' }]);
    expect(dom.childNodes[0]).toBe(text);
    expect(text.data).toBe('y');
    expect(dom.outerHTML).toBe('<p>y</p>');
  });

  it('TC-PATCH-005 PROPS: 추가·변경·삭제를 반영하고 요소는 교체하지 않는다', () => {
    const { container, dom } = mount(h('div', { a: '1', b: '2', keep: 'k' }, 'x'));
    const text = dom.childNodes[0];
    const result = patch(dom, [{ type: 'PROPS', path: [], set: { b: '3', c: '4' }, remove: ['a'] }]);
    expect(result).toBe(dom);
    expect(container.firstChild).toBe(dom);
    expect(dom.hasAttribute('a')).toBe(false);
    expect(dom.getAttribute('b')).toBe('3');
    expect(dom.getAttribute('c')).toBe('4');
    expect(dom.getAttribute('keep')).toBe('k');
    expect(dom.childNodes[0]).toBe(text);
  });

  it('TC-PATCH-006 PROPS: 이벤트 핸들러 교체·제거는 render 가 붙인 핸들러에도 적용된다', () => {
    const f = vi.fn();
    const g = vi.fn();
    const { dom } = mount(h('button', { onClick: f }, 'go'));

    patch(dom, [{ type: 'PROPS', path: [], set: { onClick: g }, remove: [] }]);
    dom.click();
    expect(f).not.toHaveBeenCalled();
    expect(g).toHaveBeenCalledTimes(1);

    patch(dom, [{ type: 'PROPS', path: [], set: {}, remove: ['onClick'] }]);
    dom.click();
    expect(g).toHaveBeenCalledTimes(1);
    expect(dom.attributes).toHaveLength(0);
  });

  it('TC-PATCH-007 PROPS: setProp 규칙을 따른다 (value·checked 프로퍼티, true → 빈 문자열)', () => {
    const { dom: input } = mount(h('input', { value: 'a' }));
    input.value = '사용자가 입력함';
    patch(input, [{ type: 'PROPS', path: [], set: { value: 'b', disabled: true }, remove: [] }]);
    expect(input.value).toBe('b');
    expect(input.getAttribute('value')).toBe('b');
    expect(input.getAttribute('disabled')).toBe('');
    patch(input, [{ type: 'PROPS', path: [], set: {}, remove: ['value', 'disabled'] }]);
    expect(input.value).toBe('');
    expect(input.hasAttribute('value')).toBe(false);
    expect(input.hasAttribute('disabled')).toBe(false);

    const { dom: box } = mount(h('input', { type: 'checkbox' }));
    patch(box, [{ type: 'PROPS', path: [], set: { checked: true }, remove: [] }]);
    expect(box.checked).toBe(true);
    patch(box, [{ type: 'PROPS', path: [], set: {}, remove: ['checked'] }]);
    expect(box.checked).toBe(false);
  });
});

describe('patch — 루트(path [])와 빈 목록', () => {
  it('TC-PATCH-008 빈 patch 목록이면 같은 dom 을 돌려주고 아무것도 바꾸지 않는다', () => {
    const { container, dom } = mount(h('div', { class: 'a' }, h('p', null, 'x'), 'y'));
    const before = allNodes(dom);
    const html = dom.outerHTML;
    const mo = observe(container);
    expect(patch(dom, [])).toBe(dom);
    expect(mo.takeRecords()).toHaveLength(0);
    mo.disconnect();
    expect(dom.outerHTML).toBe(html);
    expect(allNodes(dom)).toHaveLength(before.length);
    allNodes(dom).forEach((n, i) => expect(n).toBe(before[i]));
  });

  it('TC-PATCH-009 루트 REPLACE (부모 없음): 새 루트를 돌려준다', () => {
    const dom = render(h('p', null, 'a'));
    const result = patch(dom, [{ type: 'REPLACE', path: [], node: h('div', { id: 'n' }, h('p', null, 'a')) }]);
    expect(result).not.toBe(dom);
    expect(result.outerHTML).toBe('<div id="n"><p>a</p></div>');
  });

  it('TC-PATCH-010 루트 REPLACE (부모 있음): 부모 안의 같은 자리에서 바뀐다', () => {
    const { container, dom } = mount(h('p', null, 'a'));
    const before = document.createElement('i');
    const after = document.createElement('b');
    container.insertBefore(before, dom);
    container.appendChild(after);

    const result = patch(dom, [{ type: 'REPLACE', path: [], node: h('section', null, 'z') }]);
    expect(result.outerHTML).toBe('<section>z</section>');
    expect(container.childNodes).toHaveLength(3);
    expect(container.childNodes[0]).toBe(before);
    expect(container.childNodes[1]).toBe(result);
    expect(container.childNodes[2]).toBe(after);
    expect(dom.parentNode).toBe(null);
  });

  it('TC-PATCH-011 루트 TEXT: 같은 텍스트 노드를 돌려주고 내용만 바뀐다', () => {
    const { container, dom } = mount(createText('a'));
    const result = patch(dom, [{ type: 'TEXT', path: [], text: 'b' }]);
    expect(result).toBe(dom);
    expect(dom.data).toBe('b');
    expect(container.firstChild).toBe(dom);
  });

  it('TC-PATCH-012 루트 PROPS: 같은 요소를 돌려준다', () => {
    const { container, dom } = mount(h('div', { class: 'a' }));
    const result = patch(dom, [{ type: 'PROPS', path: [], set: { class: 'b' }, remove: [] }]);
    expect(result).toBe(dom);
    expect(container.innerHTML).toBe('<div class="b"></div>');
  });

  it('TC-PATCH-013 루트 REMOVE: null 을 돌려주고 부모에서 뺀다', () => {
    const { container, dom } = mount(h('p', null, 'a'));
    expect(patch(dom, [{ type: 'REMOVE', path: [] }])).toBe(null);
    expect(container.childNodes).toHaveLength(0);
    expect(dom.parentNode).toBe(null);

    const lone = render(h('p', null, 'a'));
    expect(patch(lone, [{ type: 'REMOVE', path: [] }])).toBe(null);
  });

  it('TC-PATCH-014 루트 ADD (dom 이 null): 새로 만든 루트를 돌려준다', () => {
    const result = patch(null, [{ type: 'ADD', path: [], node: h('ul', { id: 'l' }, h('li', null, 'a')) }]);
    expect(result).not.toBe(null);
    expect(result.outerHTML).toBe('<ul id="l"><li>a</li></ul>');
    expect(result.parentNode).toBe(null);
  });
});

describe('patch — 자식 여러 개의 추가·삭제 (인덱스 이동)', () => {
  it('TC-PATCH-015 diff 가 낸 REMOVE 순서(내림차순)를 그대로 적용하면 뒤의 자식들이 빠진다', () => {
    const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'), h('li', null, 'd'));
    const next = h('ul', null, h('li', null, 'a'));
    const patches = diff(old, next);
    // diff 계약: 남는 옛 자식은 인덱스 내림차순 REMOVE
    expect(patches).toEqual([
      { type: 'REMOVE', path: [3] },
      { type: 'REMOVE', path: [2] },
      { type: 'REMOVE', path: [1] },
    ]);
    const { dom } = mount(old);
    const [a, b, c, d] = dom.childNodes;
    expect(patch(dom, patches)).toBe(dom);
    expect(dom.outerHTML).toBe('<ul><li>a</li></ul>');
    expect(dom.childNodes[0]).toBe(a);
    [b, c, d].forEach((n) => expect(n.parentNode).toBe(null));
  });

  it('TC-PATCH-016 (BVA) 자식 3개 → 0개', () => {
    const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'));
    const { dom } = mount(old);
    patch(dom, diff(old, h('ul')));
    expect(dom.outerHTML).toBe('<ul></ul>');
  });

  it('TC-PATCH-017 받은 순서 그대로 적용한다 (오름차순 REMOVE [1] → [2] 는 b 다음 d 를 뺀다)', () => {
    const { dom } = mount(h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'), h('li', null, 'd')));
    // [a,b,c,d] → [1] 제거 → [a,c,d] → [2] 제거 → [a,c]
    patch(dom, [{ type: 'REMOVE', path: [1] }, { type: 'REMOVE', path: [2] }]);
    expect(dom.outerHTML).toBe('<ul><li>a</li><li>c</li></ul>');
  });

  it('TC-PATCH-018 중간 ADD: 그 자리에 끼우고 양옆 자식은 같은 객체', () => {
    const { dom } = mount(h('ul', null, h('li', null, 'a'), h('li', null, 'c')));
    const [a, c] = dom.childNodes;
    patch(dom, [{ type: 'ADD', path: [1], node: h('li', null, 'b') }]);
    expect(dom.outerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
    expect(dom.childNodes[0]).toBe(a);
    expect(dom.childNodes[2]).toBe(c);
  });

  it('TC-PATCH-019 (BVA) 맨 앞 ADD, 빈 부모에 ADD, 오름차순 ADD 여러 개', () => {
    const { dom: front } = mount(h('ul', null, h('li', null, 'b')));
    patch(front, [{ type: 'ADD', path: [0], node: h('li', null, 'a') }]);
    expect(front.outerHTML).toBe('<ul><li>a</li><li>b</li></ul>');

    const { dom: empty } = mount(h('ul'));
    patch(empty, [
      { type: 'ADD', path: [0], node: h('li', null, '1') },
      { type: 'ADD', path: [1], node: h('li', null, '2') },
      { type: 'ADD', path: [2], node: h('li', null, '3') },
    ]);
    expect(empty.outerHTML).toBe('<ul><li>1</li><li>2</li><li>3</li></ul>');
  });
});

describe('patch — PROPS 는 remove 를 set 보다 먼저 적용한다', () => {
  it('TC-PATCH-020 이전 datax, 새 dataX: 결과에 datax="2" 가 남는다', () => {
    const { dom } = mount(h('div', { datax: '1' }));
    patch(dom, [{ type: 'PROPS', path: [], set: { dataX: '2' }, remove: ['datax'] }]);
    expect(dom.getAttribute('datax')).toBe('2');
    expect(dom.outerHTML).toBe('<div datax="2"></div>');
  });

  it('TC-PATCH-021 이전 dataX, 새 datax (반대 방향)도 값이 남는다', () => {
    const { dom } = mount(h('div', { dataX: '1' }));
    patch(dom, [{ type: 'PROPS', path: [], set: { datax: '2' }, remove: ['dataX'] }]);
    expect(dom.getAttribute('datax')).toBe('2');
    expect(dom.outerHTML).toBe('<div datax="2"></div>');
  });

  it('TC-PATCH-022 diff 가 만든 대소문자 차이 PROPS 를 적용하면 render(new) 와 같다', () => {
    // class 를 앞에 둔다: 지웠다 다시 붙인 속성은 뒤로 가므로 outerHTML 의 속성 순서를 맞추기 위해.
    const old = h('p', { class: 'x', Title: 'a' }, 't');
    const next = h('p', { class: 'x', title: 'b' }, 't');
    const { dom } = mount(old);
    patch(dom, diff(old, next));
    expect(dom.outerHTML).toBe(render(next).outerHTML);
    expect(dom.getAttribute('title')).toBe('b');
  });
});

describe('patch — 바뀐 노드만 건드린다', () => {
  const tree = (t) =>
    h('div', { id: 'root' },
      h('header', null, h('h1', null, 'title')),
      h('ul', { class: 'l' }, h('li', null, 'a'), h('li', null, h('b', null, t)), h('li', null, 'c')),
      h('p', null, 'tail'));

  it('TC-PATCH-023 깊은 TEXT 변경 후에도 모든 노드가 같은 객체로 같은 자리에 있다', () => {
    const { dom } = mount(tree('x'));
    const before = allNodes(dom);
    patch(dom, diff(tree('x'), tree('y')));
    const after = allNodes(dom);
    expect(after).toHaveLength(before.length);
    after.forEach((n, i) => expect(n).toBe(before[i]));
    expect(dom.outerHTML).toBe(render(tree('y')).outerHTML);
  });

  it('TC-PATCH-024 TEXT: MutationObserver 기록은 그 텍스트 노드의 characterData 뿐', () => {
    const { container, dom } = mount(tree('x'));
    const target = dom.childNodes[1].childNodes[1].childNodes[0].childNodes[0];
    expect(target.data).toBe('x');
    const mo = observe(container);
    patch(dom, [{ type: 'TEXT', path: [1, 1, 0, 0], text: 'y' }]);
    const records = mo.takeRecords();
    mo.disconnect();
    expect(records.length).toBeGreaterThan(0);
    records.forEach((r) => {
      expect(r.type).toBe('characterData');
      expect(r.target).toBe(target);
    });
  });

  it('TC-PATCH-025 PROPS: 기록은 그 요소의 attributes 뿐 (childList 없음)', () => {
    const { container, dom } = mount(tree('x'));
    const ul = dom.childNodes[1];
    const mo = observe(container);
    patch(dom, [{ type: 'PROPS', path: [1], set: { class: 'm', title: 't' }, remove: [] }]);
    const records = mo.takeRecords();
    mo.disconnect();
    expect(records.length).toBeGreaterThan(0);
    records.forEach((r) => {
      expect(r.type).toBe('attributes');
      expect(r.target).toBe(ul);
    });
    expect(ul.getAttribute('class')).toBe('m');
    expect(ul.getAttribute('title')).toBe('t');
  });

  it('TC-PATCH-026 가운데 자식 REPLACE: 형제는 같은 객체, childList 기록은 부모에서 옛 노드 → 새 노드뿐', () => {
    const { container, dom } = mount(tree('x'));
    const ul = dom.childNodes[1];
    const [li0, li1, li2] = ul.childNodes;
    const mo = observe(container);
    patch(dom, [{ type: 'REPLACE', path: [1, 1], node: h('li', { class: 'new' }, 'B') }]);
    const records = mo.takeRecords();
    mo.disconnect();

    expect(ul.childNodes[0]).toBe(li0);
    expect(ul.childNodes[2]).toBe(li2);
    const fresh = ul.childNodes[1];
    expect(fresh).not.toBe(li1);
    expect(fresh.outerHTML).toBe('<li class="new">B</li>');

    const removed = records.flatMap((r) => [...r.removedNodes]);
    const added = records.flatMap((r) => [...r.addedNodes]);
    records.forEach((r) => {
      expect(r.type).toBe('childList');
      expect(r.target).toBe(ul);
    });
    expect(removed).toEqual([li1]);
    expect(added).toEqual([fresh]);
  });

  it('TC-PATCH-027 손대지 않은 형제의 이벤트 핸들러는 patch 후에도 동작한다', () => {
    const onClick = vi.fn();
    const old = h('div', null, h('button', { onClick }, 'go'), h('p', null, 'a'));
    const next = h('div', null, h('button', { onClick }, 'go'), h('p', null, 'b'));
    const { dom } = mount(old);
    const button = dom.childNodes[0];
    patch(dom, diff(old, next));
    expect(dom.childNodes[0]).toBe(button);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('patch — path 해석과 네임스페이스', () => {
  it('TC-PATCH-028 path 는 텍스트 노드를 포함한 childNodes 기준이다', () => {
    const { dom } = mount(h('p', null, 'a', h('b', null, 'x'), 'c'));
    patch(dom, [
      { type: 'TEXT', path: [2], text: 'C' },
      { type: 'TEXT', path: [1, 0], text: 'X' },
    ]);
    expect(dom.outerHTML).toBe('<p>a<b>X</b>C</p>');
  });

  it('TC-PATCH-029 이웃한 텍스트 노드 둘 중 하나만 바꾼다', () => {
    const { dom } = mount(h('p', null, 'a', 'b'));
    const [ta, tb] = dom.childNodes;
    patch(dom, [{ type: 'TEXT', path: [1], text: 'B' }]);
    expect(dom.childNodes).toHaveLength(2);
    expect(dom.childNodes[0]).toBe(ta);
    expect(dom.childNodes[1]).toBe(tb);
    expect(ta.data).toBe('a');
    expect(tb.data).toBe('B');
  });

  it('TC-PATCH-030 SVG 안의 ADD/REPLACE 는 SVG 네임스페이스, foreignObject 안은 HTML', () => {
    const { dom: svg } = mount(h('svg', null, h('rect'), h('foreignObject', null, h('div', null, 'h'))));
    patch(svg, [
      { type: 'REPLACE', path: [0], node: h('circle', { r: '1' }) },
      { type: 'ADD', path: [2], node: h('g', null, h('path')) },
      { type: 'ADD', path: [1, 1], node: h('p', null, 'x') },
    ]);
    const [circle, fo, g] = svg.childNodes;
    expect(circle.localName).toBe('circle');
    expect(circle.namespaceURI).toBe(SVG_NS);
    expect(g.namespaceURI).toBe(SVG_NS);
    expect(g.firstChild.namespaceURI).toBe(SVG_NS);
    expect(fo.childNodes[1].localName).toBe('p');
    expect(fo.childNodes[1].namespaceURI).toBe(HTML_NS);
  });
});

describe('patch — 에러 추측과 경계', () => {
  it('TC-PATCH-031 (EG) TEXT 의 마크업 문자는 HTML 로 해석하지 않는다', () => {
    const { dom } = mount(h('p', null, 'x'));
    patch(dom, [{ type: 'TEXT', path: [0], text: '<b>y</b> & z' }]);
    expect(dom.children).toHaveLength(0);
    expect(dom.textContent).toBe('<b>y</b> & z');
  });

  it("TC-PATCH-032 (BVA) TEXT 'a' → '' → 'b': 빈 문자열이어도 텍스트 노드가 남는다", () => {
    const { dom } = mount(h('p', null, 'a', h('i', null, 'k')));
    const text = dom.childNodes[0];
    patch(dom, [{ type: 'TEXT', path: [0], text: '' }]);
    expect(dom.childNodes).toHaveLength(2);
    expect(dom.childNodes[0]).toBe(text);
    expect(text.data).toBe('');
    patch(dom, [{ type: 'TEXT', path: [0], text: 'b' }]);
    expect(dom.outerHTML).toBe('<p>b<i>k</i></p>');
  });

  it('TC-PATCH-033 (EG) patch 목록과 VNode 를 바꾸지 않는다 (얼린 입력으로도 동작)', () => {
    const old = h('div', { class: 'a', title: 't' }, h('p', null, 'x'), h('p', null, 'y'), h('p', null, 'z'));
    const next = h('div', { class: 'b', id: 'n' }, h('p', null, 'X'), h('span', null, 'q'));
    const patches = diff(old, next);
    const snap = JSON.parse(JSON.stringify(patches));
    deepFreeze(patches);
    const { dom } = mount(old);
    patch(dom, patches);
    expect(JSON.parse(JSON.stringify(patches))).toEqual(snap);
    expect(dom.outerHTML).toBe(render(next).outerHTML);
  });

  it('TC-PATCH-034 (EG) 같은 VNode 로 ADD 를 두 번 하면 서로 다른 DOM 노드가 생긴다', () => {
    const li = h('li', null, 's');
    const { dom } = mount(h('ul'));
    patch(dom, [{ type: 'ADD', path: [0], node: li }, { type: 'ADD', path: [1], node: li }]);
    expect(dom.outerHTML).toBe('<ul><li>s</li><li>s</li></ul>');
    expect(dom.childNodes[0]).not.toBe(dom.childNodes[1]);
  });

  it('TC-PATCH-035 (EG) 100단계 중첩 맨 아래 TEXT', () => {
    let old = createText('a');
    let next = createText('b');
    for (let i = 0; i < 100; i++) {
      old = h('div', null, old);
      next = h('div', null, next);
    }
    const { dom } = mount(old);
    let leaf = dom;
    while (leaf.firstChild) leaf = leaf.firstChild;
    expect(patch(dom, diff(old, next))).toBe(dom);
    expect(leaf.data).toBe('b');
    expect(dom.outerHTML).toBe(render(next).outerHTML);
  });

  it.each([
    ['REMOVE 범위 밖', { type: 'REMOVE', path: [2] }],
    ['REMOVE 음수 인덱스', { type: 'REMOVE', path: [-1] }],
    ['REPLACE 범위 밖', { type: 'REPLACE', path: [5], node: h('li', null, 'z') }],
    ['TEXT 대상 없음', { type: 'TEXT', path: [0, 3], text: 'z' }],
    ['PROPS 대상 없음', { type: 'PROPS', path: [9], set: { a: '1' }, remove: [] }],
    ['중간 경로 없음', { type: 'REMOVE', path: [0, 0, 0] }],
    ['ADD i > 자식 수', { type: 'ADD', path: [3], node: h('li', null, 'z') }],
    ['ADD 부모 없음', { type: 'ADD', path: [7, 0], node: h('li', null, 'z') }],
  ])('TC-PATCH-037 (EG) 없는 path 는 예외: %s', (_name, p) => {
    // <ul><li>a</li><li>b</li></ul> : 자식 2개, [0,0] 은 텍스트 'a' (자식 없음)
    const { dom } = mount(h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
    expect(() => patch(dom, [p])).toThrow();
  });

  it('TC-PATCH-038 (EG) 노드 종류가 맞지 않으면 예외: 텍스트에 PROPS, 요소에 TEXT', () => {
    const { dom: p } = mount(h('p', null, 'x'));
    expect(() => patch(p, [{ type: 'PROPS', path: [0], set: { a: '1' }, remove: [] }])).toThrow(TypeError);
    // set/remove 가 비어 있어도 대상 종류 검사로 예외 (다른 이유로는 예외가 나지 않는 입력)
    expect(() => patch(p, [{ type: 'PROPS', path: [0], set: {}, remove: [] }])).toThrow(TypeError);

    const { dom: div } = mount(h('div', null, h('p', null, 'x')));
    expect(() => patch(div, [{ type: 'TEXT', path: [0], text: 'y' }])).toThrow(TypeError);
    expect(() => patch(div, [{ type: 'TEXT', path: [], text: 'y' }])).toThrow(TypeError);

    const { dom: text } = mount(createText('t'));
    expect(() => patch(text, [{ type: 'PROPS', path: [], set: { a: '1' }, remove: [] }])).toThrow(TypeError);
    expect(() => patch(text, [{ type: 'PROPS', path: [], set: {}, remove: [] }])).toThrow(TypeError);
  });

  it.each([
    ['MOVE', { type: 'MOVE', path: [0] }],
    // node 가 있고 path 도 유효해서 type 검사가 없으면 다른 이유로는 예외가 나지 않는 입력
    ['MOVE + node', { type: 'MOVE', path: [0], node: h('li') }],
    ['소문자 add', { type: 'add', path: [1], node: h('li', null, 'z') }],
    ['type 없음', { path: [0] }],
  ])('TC-PATCH-039 (EG) 알 수 없는 patch type 은 예외: %s', (_name, p) => {
    const { dom } = mount(h('ul', null, h('li', null, 'a')));
    const html = dom.outerHTML;
    expect(() => patch(dom, [p])).toThrow(TypeError);
    expect(dom.outerHTML).toBe(html);
  });

  it('TC-PATCH-101 (EG) 루트 존재와 맞지 않는 patch 는 예외: dom 이 있는데 ADD [], dom 이 null 인데 다른 patch', () => {
    const { dom } = mount(h('p', null, 'a'));
    expect(() => patch(dom, [{ type: 'ADD', path: [], node: h('div') }])).toThrow();

    expect(() => patch(null, [{ type: 'REMOVE', path: [] }])).toThrow();
    expect(() => patch(null, [{ type: 'TEXT', path: [], text: 'x' }])).toThrow();
    expect(() => patch(null, [{ type: 'REPLACE', path: [], node: h('div') }])).toThrow();
    expect(() => patch(null, [{ type: 'PROPS', path: [], set: { a: '1' }, remove: [] }])).toThrow();
    expect(() => patch(null, [{ type: 'ADD', path: [0], node: h('li') }])).toThrow();
  });

  it('TC-PATCH-036 (EG) 한 노드에 PROPS 와 자식 patch 가 함께 와도 요소는 그대로', () => {
    const old = h('ul', { class: 'a' }, h('li', null, '1'));
    const next = h('ul', { class: 'b' }, h('li', null, '2'), h('li', null, '3'));
    const { dom } = mount(old);
    const li = dom.childNodes[0];
    expect(patch(dom, diff(old, next))).toBe(dom);
    expect(dom.childNodes[0]).toBe(li);
    expect(dom.outerHTML).toBe('<ul class="b"><li>2</li><li>3</li></ul>');
  });
});

// 왕복: render(old) 에 diff 결과를 patch 한 것과 render(new) 를 비교한다.
// probe 로 outerHTML 에 드러나지 않는 화면 상태(.value 등)까지 본다. before 는 patch 전 사용자 조작.
function tripCompare(old, next, probe = () => null, before) {
  const { dom } = mount(old);
  before?.(dom);
  const out = patch(dom, diff(old, next));
  const { dom: ref } = mount(next);
  expect(out.outerHTML).toBe(ref.outerHTML);
  expect(out.isEqualNode(ref)).toBe(true);
  expect(probe(out)).toEqual(probe(ref));
  return out;
}

const optA = () => h('option', { value: 'a' }, 'A');
const optB = () => h('option', { value: 'b' }, 'B');

describe('patch — 리뷰 발견: 왕복 결과가 render(new) 와 같아야 한다', () => {
  it.each([
    ['option (값이 텍스트로 돌아감)',
      h('select', null, h('option', { value: 'x' }, 'X')), h('select', null, h('option', null, 'X')),
      (d) => [d.firstChild.hasAttribute('value'), d.firstChild.value], [false, 'X']],
    ['button', h('button', { value: 'v' }, 'b'), h('button', null, 'b'),
      (d) => [d.hasAttribute('value'), d.value], [false, '']],
    ['checkbox (기본값 on)', h('input', { type: 'checkbox', value: 'yes' }), h('input', { type: 'checkbox' }),
      (d) => [d.hasAttribute('value'), d.value], [false, 'on']],
    ['li', h('ol', null, h('li', { value: '3' }, 'a')), h('ol', null, h('li', null, 'a')),
      (d) => [d.firstChild.hasAttribute('value')], [false]],
    ['select (첫 option 선택)', h('select', { value: 'b' }, optA(), optB()), h('select', null, optA(), optB()),
      (d) => [d.value, d.selectedIndex], ['a', 0]],
    ['text input (회귀 방지)', h('input', { value: 'a' }), h('input', null),
      (d) => [d.hasAttribute('value'), d.value], [false, '']],
  ])('TC-PATCH-102 value prop 제거: %s', (_name, old, next, probe, expected) => {
    const out = tripCompare(old, next, probe);
    expect(probe(out)).toEqual(expected);
  });

  it('TC-PATCH-103 대소문자만 다른 LIVE prop: checked → Checked, value → Value', () => {
    const box = tripCompare(
      h('input', { type: 'checkbox', checked: true }), h('input', { type: 'checkbox', Checked: true }),
      (d) => d.checked);
    expect(box.checked).toBe(true);

    const input = tripCompare(h('input', { value: 'a' }), h('input', { Value: 'b' }), (d) => d.value);
    expect(input.value).toBe('b');
  });

  it('TC-PATCH-104 사용자가 입력한 textarea 에 TEXT patch 가 오면 화면 값도 바뀐다', () => {
    const out = tripCompare(h('textarea', null, 'a'), h('textarea', null, 'b'), (d) => d.value,
      (d) => { d.value = '사용자'; });
    expect(out.value).toBe('b');
  });

  it('TC-PATCH-105 onclick 문자열 → 함수: 속성이 사라지고 클릭하면 함수가 한 번 호출된다', () => {
    const f = vi.fn();
    const out = tripCompare(h('button', { onclick: 'void 0' }, 'go'), h('button', { onclick: f }, 'go'));
    expect(out.hasAttribute('onclick')).toBe(false);
    out.click();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('TC-PATCH-106 {onClick:f, onclick:f} → {onclick:f}: 클릭하면 f 가 한 번 호출된다', () => {
    const f = vi.fn();
    const out = tripCompare(h('button', { onClick: f, onclick: f }), h('button', { onclick: f }));
    out.click();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('TC-PATCH-107 {title:"a", Title:"b"} → {title:"a"}: 결과는 title="a"', () => {
    const out = tripCompare(h('div', { title: 'a', Title: 'b' }), h('div', { title: 'a' }));
    expect(out.getAttribute('title')).toBe('a');
  });
});

describe('patch — 리뷰 발견: 잘못된 patch 형태는 TypeError', () => {
  it.each([
    ['PROPS remove 가 문자열', () => render(h('div', { a: '1', b: '2', c: '3' })),
      { type: 'PROPS', path: [], set: {}, remove: 'abc' }],
    ['PROPS set 이 배열', () => render(h('div')),
      { type: 'PROPS', path: [], set: ['x'], remove: [] }],
    ['TEXT text 가 undefined', () => render(h('p', null, 'x')),
      { type: 'TEXT', path: [0], text: undefined }],
    ['ADD 부모가 텍스트 노드', () => render(h('p', null, 'x')),
      { type: 'ADD', path: [0, 0], node: h('i') }],
  ])('TC-PATCH-108 %s', (_name, make, p) => {
    const dom = make();
    expect(() => patch(dom, [p])).toThrow(TypeError);
  });

  it('TC-PATCH-109 (BVA) patch(null, []) 은 null', () => {
    expect(patch(null, [])).toBe(null);
  });
});

// textarea 의 화면 값(.value)은 사용자가 입력하면 자식 텍스트(기본값)와 갈라진다. TEXT 뿐 아니라
// 자식 텍스트가 생기거나(ADD) 없어지거나(REMOVE) 바뀌는(REPLACE) patch 뒤에도 .value 는 render(new) 와 같아야 한다.
describe('patch — 리뷰 발견: 사용자가 입력한 textarea 의 자식 텍스트 추가·삭제', () => {
  const typed = (d) => { d.value = '사용자 입력'; };

  it('TC-PATCH-110 (BVA) 텍스트 1 → 0 (REMOVE): .value 는 빈 문자열', () => {
    const out = tripCompare(h('textarea', null, 'a'), h('textarea', null), (d) => d.value, typed);
    expect(out.value).toBe('');
  });

  it('TC-PATCH-111 (BVA) 텍스트 0 → 1 (ADD): .value 는 새 텍스트', () => {
    const out = tripCompare(h('textarea', null), h('textarea', null, 'b'), (d) => d.value, typed);
    expect(out.value).toBe('b');
  });

  it('TC-PATCH-112 (EG) 부모 아래 textarea 의 텍스트 삭제·추가 (path 가 깊은 경우)', () => {
    const out = tripCompare(
      h('div', null, h('textarea', null, 'a'), h('textarea', null)),
      h('div', null, h('textarea', null), h('textarea', null, 'b')),
      (d) => [d.childNodes[0].value, d.childNodes[1].value],
      (d) => { d.childNodes[0].value = 'x'; d.childNodes[1].value = 'y'; },
    );
    expect([out.childNodes[0].value, out.childNodes[1].value]).toEqual(['', 'b']);
  });
});

// 리뷰 발견(#8). 원칙: VNode 에 value 가 있는 요소의 화면 값은 마지막 VNode 의 value 다.
// patch 결과는 render(new) 와 같아야 하고, 그 값은 value prop 이다 (render(new) 도 틀릴 수 있으므로 값도 직접 본다).
describe('patch — 리뷰 발견(#8): 제어 textarea · select', () => {
  it('TC-PATCH-113 (EG) value prop 이 있는 textarea 의 자식 TEXT 가 바뀌어도 .value 는 value prop', () => {
    const out = tripCompare(h('textarea', { value: 'a' }, 'x'), h('textarea', { value: 'a' }, 'y'), (d) => d.value);
    expect(out.value).toBe('a');

    // value prop 도 같이 바뀌면 새 value prop
    const both = tripCompare(h('textarea', { value: 'a' }, 'x'), h('textarea', { value: 'b' }, 'y'), (d) => d.value);
    expect(both.value).toBe('b');

    // 자식 텍스트가 생기거나 없어져도 같다
    const added = tripCompare(h('textarea', { value: 'a' }), h('textarea', { value: 'a' }, 'y'), (d) => d.value);
    expect(added.value).toBe('a');
    const removed = tripCompare(h('textarea', { value: 'a' }, 'x'), h('textarea', { value: 'a' }), (d) => d.value);
    expect(removed.value).toBe('a');
  });

  it('TC-PATCH-114 (EG) select 의 value 와 새 option 이 같은 patch 에 오면 새 option 이 선택된다', () => {
    const opts = (...vs) => vs.map((v) => h('option', { value: v }, v.toUpperCase()));
    const out = tripCompare(
      h('select', { value: 'a' }, opts('a', 'b')),
      h('select', { value: 'c' }, opts('a', 'b', 'c')),
      (d) => [d.value, d.selectedIndex],
    );
    expect(out.value).toBe('c');
    expect(out.selectedIndex).toBe(2);

    // 고른 option 이 REPLACE 로 바뀌는 경우 (value 가 같은 이름의 새 option)
    const replaced = tripCompare(
      h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
      h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('optgroup', { label: 'g' }, h('option', { value: 'b' }, 'B'))),
      (d) => [d.value, d.selectedIndex],
    );
    expect(replaced.value).toBe('b');
  });
});
