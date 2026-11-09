// 통합: render(old) 로 만든 DOM 에 patch(dom, diff(old, new)) 를 적용하면 render(new) 와 같아진다
// (왕복 성질). patch 의 계약은 tests/unit/patch.test.js 맨 위 주석을 따른다. 요약:
//
//   patch(dom, patches) → patch 후의 루트 (루트가 그대로면 같은 dom 객체,
//                         루트 REPLACE/ADD 면 새 노드, 루트 REMOVE 면 null).
//   dom 에 부모가 있으면 루트 교체·삭제가 부모에도 반영된다.
//
// "같다" 의 기준
//   - isEqualNode: 노드 종류, 태그, 네임스페이스, 속성(순서 무관), 텍스트, 자식 구조까지 같음.
//   - outerHTML: 사람이 읽는 HTML 까지 같음. 지웠다 다시 붙인 속성은 맨 뒤로 가므로,
//     속성 순서가 결과에 영향을 주지 않는 쌍에서만 outerHTML 을 비교한다.
import { describe, it, expect, afterEach } from 'vitest';
import { patch } from '../../src/vdom/patch.js';
import { diff } from '../../src/vdom/diff.js';
import { render } from '../../src/vdom/render.js';
import { h, createText } from '../../src/vdom/vnode.js';
import { domToVNode } from '../../src/vdom/dom-to-vnode.js';

function parse(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return domToVNode(tpl.content.firstElementChild);
}

// render(old) 를 문서의 컨테이너에 붙이고 diff → patch 를 적용한다.
function roundTrip(old, next) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const dom = old == null ? null : render(old);
  if (dom) container.appendChild(dom);
  const result = patch(dom, diff(old, next));
  return { container, dom, result };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('diff → patch 왕복: render(old) + patch = render(new)', () => {
  it.each([
    ['텍스트만 변경', '<p>a</p>', '<p>b</p>'],
    ['속성 추가·변경·삭제', '<div id="a" title="t" class="c">x</div>', '<div id="b" class="c" data-n="1">x</div>'],
    ['자식 추가 + 속성 변경', '<ul class="a"><li>1</li></ul>', '<ul class="b"><li>1</li><li>2</li><li>3</li></ul>'],
    ['여러 단계에서 동시에 삭제', '<div><ul><li>1</li><li>2</li><li>3</li></ul><p>a</p><p>b</p><p>c</p></div>', '<div><ul><li>1</li></ul><p>a</p></div>'],
    ['삭제와 추가가 다른 부모에서', '<div><ul><li>1</li><li>2</li></ul><ol></ol></div>', '<div><ul></ul><ol><li>x</li><li>y</li></ol></div>'],
    ['교체 + 텍스트 + 속성 삭제', '<section id="s" title="t"><h1>a</h1><p>b</p><em>c</em></section>', '<section id="s"><h2>a</h2><p>B</p>c</section>'],
    ['앞쪽 삭제 (위치 비교)', '<ol><li class="x">a</li><li>b</li><li>c</li><li>d</li></ol>', '<ol><li>c</li><li class="y">d</li></ol>'],
    ['깊은 곳 추가와 얕은 곳 삭제', '<div><div><div><span>a</span></div></div><b>1</b><b>2</b></div>', '<div><div><div><span>a</span><span>b</span></div></div></div>'],
    ['텍스트와 요소가 섞인 자식', '<p>a<b>x</b>c</p>', '<p><i>a</i>x<b>c</b></p>'],
    ['pre 안의 공백', '<pre>  a\n b</pre>', '<pre> a\n\n b </pre>'],
    ['같은 위치 key 변경', '<ul><li key="a">x</li><li>y</li></ul>', '<ul><li key="b">x</li><li>y</li></ul>'],
    ['input value / checked', '<form><input type="text" value="a"><input type="checkbox" checked=""></form>', '<form><input type="text" value="b"><input type="checkbox"></form>'],
    ['자식 전부 삭제', '<ul><li>1</li><li>2</li><li>3</li></ul>', '<ul></ul>'],
    ['빈 부모에 자식 여러 개', '<ul></ul>', '<ul><li>1</li><li>2</li><li>3</li></ul>'],
  ])('TC-PATCH-040 %s', (_name, before, after) => {
    const old = parse(before);
    const next = parse(after);
    const { container, dom, result } = roundTrip(old, next);
    const expected = render(next);
    expect(result).toBe(dom); // 루트 태그·key 가 같으면 루트는 교체되지 않는다
    expect(container.firstChild).toBe(result);
    expect(result.outerHTML).toBe(expected.outerHTML);
    expect(result.isEqualNode(expected)).toBe(true);
    // key 는 DOM 에 남지 않으므로 next 가 아니라 render(next) 를 다시 읽은 것과 비교한다.
    expect(domToVNode(result)).toEqual(domToVNode(expected));
  });

  it('TC-PATCH-041 SVG 안에서 교체·추가된 노드도 SVG 네임스페이스 (isEqualNode 로 확인)', () => {
    const old = parse('<div><svg viewBox="0 0 1 1"><rect width="1"></rect></svg></div>');
    const next = parse('<div><svg viewBox="0 0 2 2"><circle r="1"></circle><rect width="2"></rect><foreignObject><p>h</p></foreignObject></svg></div>');
    const { result } = roundTrip(old, next);
    const expected = render(next);
    expect(result.outerHTML).toBe(expected.outerHTML);
    expect(result.isEqualNode(expected)).toBe(true);
  });

  it('TC-PATCH-042 대소문자만 다른 prop (remove 를 set 보다 먼저)', () => {
    const pairs = [
      [h('div', { class: 'k', datax: '1' }, 'a'), h('div', { class: 'k', dataX: '2' }, 'a')],
      [h('div', { class: 'k', dataX: '1' }, 'a'), h('div', { class: 'k', datax: '2' }, 'a')],
      [h('ul', null, h('li', { Title: 'a' }, 'x')), h('ul', null, h('li', { title: 'b' }, 'x'))],
    ];
    for (const [old, next] of pairs) {
      const { result } = roundTrip(old, next);
      const expected = render(next);
      expect(result.outerHTML).toBe(expected.outerHTML);
      expect(result.isEqualNode(expected)).toBe(true);
    }
  });
});

describe('diff → patch 왕복: 루트가 바뀌는 경우의 반환값', () => {
  it('TC-PATCH-043 루트 태그가 바뀌면 새 루트를 돌려주고 컨테이너 안에서도 바뀐다', () => {
    const old = parse('<p>a</p>');
    const next = parse('<div><p>a</p></div>');
    const { container, dom, result } = roundTrip(old, next);
    expect(result).not.toBe(dom);
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(result);
    expect(result.outerHTML).toBe('<div><p>a</p></div>');
  });

  it('TC-PATCH-044 old 가 null 이면 새 루트를, new 가 null 이면 null 을 돌려준다', () => {
    const next = parse('<ul id="l"><li>1</li></ul>');
    const { result: added } = roundTrip(null, next);
    expect(added.outerHTML).toBe(render(next).outerHTML);

    const { container, result: removed } = roundTrip(next, null);
    expect(removed).toBe(null);
    expect(container.childNodes).toHaveLength(0);
  });

  it('TC-PATCH-045 루트가 텍스트: 텍스트 변경은 같은 노드, 텍스트 ↔ 요소는 새 노드', () => {
    const t = roundTrip(createText('a'), createText('b'));
    expect(t.result).toBe(t.dom);
    expect(t.container.textContent).toBe('b');

    const el = h('span', null, 'a');
    const toEl = roundTrip(createText('a'), el);
    expect(toEl.result).not.toBe(toEl.dom);
    expect(toEl.container.innerHTML).toBe('<span>a</span>');

    const toText = roundTrip(el, createText('z'));
    expect(toText.result.nodeType).toBe(Node.TEXT_NODE);
    expect(toText.container.firstChild).toBe(toText.result);
    expect(toText.container.innerHTML).toBe('z');
  });

  it('TC-PATCH-046 루트 key 가 바뀌면 새 루트', () => {
    const { container, dom, result } = roundTrip(h('li', { key: 'a' }, 'x'), h('li', { key: 'b' }, 'x'));
    expect(result).not.toBe(dom);
    expect(container.firstChild).toBe(result);
    expect(result.outerHTML).toBe('<li>x</li>');
  });
});

describe('diff → patch 연속 적용', () => {
  it('TC-PATCH-047 v1 → v2 → v3 → v1 을 한 DOM 에 차례로 적용해도 매번 render 결과와 같다', () => {
    const versions = [
      '<div class="app"><h1>할 일</h1><ul><li>a</li></ul></div>',
      '<div class="app dark"><h1>할 일 (2)</h1><ul><li>a</li><li class="done">b</li></ul><p>끝</p></div>',
      '<div class="app"><h2>할 일</h2><ul></ul></div>',
      '<div class="app"><h1>할 일</h1><ul><li>a</li></ul></div>',
    ].map(parse);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = render(versions[0]);
    container.appendChild(root);

    let dom = root;
    for (let i = 1; i < versions.length; i++) {
      dom = patch(dom, diff(versions[i - 1], versions[i]));
      expect(dom).toBe(root);
      const expected = render(versions[i]);
      expect(dom.outerHTML).toBe(expected.outerHTML);
      expect(dom.isEqualNode(expected)).toBe(true);
    }
  });
});

// 시드를 고정한 무작위 트리 쌍. 실패하면 메시지의 seed 로 재현한다.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAGS = ['div', 'p', 'span', 'ul', 'li', 'b'];
const TEXTS = ['a', 'b', '', ' c ', '<i>&'];
const ATTRS = { class: ['x', 'y'], id: ['i1', 'i2'], title: ['t'], 'data-k': ['1', '2'] };

function randomTree(rand, depth) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  if (depth > 0 && rand() < 0.3) return createText(pick(TEXTS));
  const props = {};
  for (const [name, values] of Object.entries(ATTRS)) {
    if (rand() < 0.35) props[name] = pick(values);
  }
  if (rand() < 0.15) props.key = pick(['k1', 'k2']);
  const children = [];
  if (depth < 3) {
    const count = Math.floor(rand() * 5);
    for (let i = 0; i < count; i++) children.push(randomTree(rand, depth + 1));
  }
  return h(pick(TAGS), props, children);
}

describe('diff → patch 왕복: 무작위 트리', () => {
  it('TC-PATCH-048 시드 고정 무작위 트리 300쌍에서 isEqualNode 로 render(new) 와 같다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      const old = randomTree(rand, 0);
      const next = randomTree(rand, 0);
      const { container, result } = roundTrip(old, next);
      const expected = render(next);
      expect(container.firstChild, `seed ${seed}`).toBe(result);
      expect(result.isEqualNode(expected), `seed ${seed}\n${result.outerHTML}\n${expected.outerHTML}`).toBe(true);
      container.remove();
    }
  });
});
