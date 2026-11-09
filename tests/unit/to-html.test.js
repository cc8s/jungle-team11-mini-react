// toHTML(vnode) 의 API 계약 (이슈 #6). 이 파일이 명세다.
//
// import { toHTML } from '../../src/vdom/to-html.js';
//
// toHTML(input) → string
//   - input: VNode 하나 / VNode 배열(최상위 노드 여러 개, 앞에서부터 이어 붙임) / null·undefined → ''.
//     VNode 형태는 src/vdom/vnode.js. 입력을 바꾸지 않는다.
//   - 용도: 뒤로/앞으로 때 History 의 VNode 를 테스트 영역 textarea 에 HTML 소스로 되돌린다 (결정 0008).
//   - 핵심 성질 (왕복): 사용자 HTML 을 <template> 으로 파싱 → childrenToVNodes → V1,
//       toHTML(V1) 을 다시 파싱 → V2 이면 V2 는 V1 과 같다 (toEqual). key 포함.
//   - 출력 형식
//       요소     `<tag 속성...>자식</tag>`. 줄바꿈·들여쓰기를 넣지 않는다.
//                태그 이름은 vnode.type 그대로 (SVG 의 linearGradient 같은 대소문자 유지).
//       속성     props 의 순서대로 ` name="value"` (큰따옴표). 값의 `&` → `&amp;`, `"` → `&quot;`.
//                (`<`, `>` 는 이스케이프해도 되고 안 해도 된다.)
//                값 규칙은 render.js setProp 과 같다:
//                  null / undefined / false → 출력하지 않음
//                  true                     → `name` 또는 `name=""` (둘 다 허용)
//                  함수                      → 출력하지 않음 (on* 이벤트 핸들러)
//                  그 외                     → String(value). 문자열 onclick="..." 은 그대로 출력한다.
//       key      vnode.key 가 null 이 아니면 `key="..."` 속성으로 출력한다 (위치는 자유).
//                domToVNode 가 key 속성을 key 필드로 옮기므로, 이래야 왕복에서 key 가 살아남는다.
//       텍스트   `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. 따옴표는 바꾸지 않는다.
//                단 raw text 요소(style, script 등) 안의 텍스트는 이스케이프하지 않는다
//                (파서가 그 안의 엔티티를 해석하지 않으므로 이스케이프하면 왕복이 깨진다).
//       void 요소 area, base, br, col, embed, hr, img, input, link, meta, source, track, wbr:
//                닫는 태그 없이 `<br>` (`<br/>` 아님). 자식은 출력하지 않는다.
//       pre / textarea / listing: 첫 자식이 '\n' 으로 시작하는 텍스트면 여는 태그 뒤에 '\n' 을 하나 더
//                붙인다 (파서가 여는 태그 바로 뒤의 줄바꿈 하나를 버리기 때문). 그 밖의 공백은 그대로.
//   - type 이 문자열이 아닌 VNode(함수 컴포넌트) → TypeError (render 와 같다).
//   - 알려진 한계(사용자 결정, 테스트하지 않음): 이웃한 두 텍스트 VNode('a','b')는 'ab' 로 이어져 다시
//     파싱하면 하나가 된다. 사용자 HTML `a<!--x-->b` 는 주석이 버려져 이 모양이 된다. 빈 텍스트 VNode 는
//     사라진다. Phase 1 데모는 History 에 source 문자열을 저장하므로 toHTML 은 대비용이다.
//   - script 도 raw text 요소다 (TC-HTML-028). 실행 여부는 라이브러리가 아니라 데모(app)가 막는다.
//   - `\r` (U+000D) 는 텍스트·속성값 모두 `&#13;` 으로 쓴다. 파서가 날 CR 을 LF 로 바꾸기 때문 (TC-HTML-029).
//   - plaintext: 안의 텍스트를 이스케이프하지 않고 **닫는 태그를 쓰지 않는다**. 파서는 <plaintext> 뒤 전부를
//     텍스트로 읽으므로 닫는 태그를 쓰면 그것이 텍스트가 된다 (TC-HTML-029~030). 그 뒤 형제는 왕복되지 않는다.
//   - 알려진 한계 (사용자 결정, 테스트하지 않음. 데모는 허용 목록으로 이런 요소를 걸러 낸다):
//       MathML 안의 input/style 등 네임스페이스가 섞이는 구조, SVG desc/title(HTML integration point) 안의
//       HTML 요소, 중첩 form 같은 mXSS 패턴은 직렬화 → 재파싱 결과가 달라질 수 있다.
import { describe, it, expect } from 'vitest';
import { toHTML } from '../../src/vdom/to-html.js';
import { h, createText } from '../../src/vdom/vnode.js';
import { childrenToVNodes } from '../../src/vdom/dom-to-vnode.js';

function parseList(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return childrenToVNodes(tpl.content);
}

// 사용자 HTML → V1 → toHTML → V2. V2 가 V1 과 같아야 한다.
function expectRoundTrip(html) {
  const v1 = parseList(html);
  const out = toHTML(v1);
  expect(parseList(out), `입력: ${html}\n출력: ${out}`).toEqual(v1);
  return { v1, out };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe('toHTML: 기본 출력', () => {
  it('TC-HTML-001 속성 2개와 텍스트가 있는 요소', () => {
    expect(toHTML(h('p', { class: 'x', id: 'y' }, 'hi'))).toBe('<p class="x" id="y">hi</p>');
  });

  it('TC-HTML-002 중첩 요소와 텍스트가 섞인 자식은 줄바꿈 없이 이어진다', () => {
    expect(toHTML(h('div', null, h('p', null, 'a', h('b', null, 'x'), 'c'), h('ul', null, h('li', null, '1'))))).toBe(
      '<div><p>a<b>x</b>c</p><ul><li>1</li></ul></div>',
    );
  });

  it('TC-HTML-003 텍스트 VNode 하나', () => {
    expect(toHTML(createText('hello'))).toBe('hello');
  });

  it('TC-HTML-004 배열은 앞에서부터 이어 붙이고, 빈 배열·null·undefined 는 빈 문자열', () => {
    expect(toHTML([h('h1', null, 't'), createText('mid'), h('p', null, 'b')])).toBe('<h1>t</h1>mid<p>b</p>');
    expect(toHTML([])).toBe('');
    expect(toHTML(null)).toBe('');
    expect(toHTML(undefined)).toBe('');
  });

  it('TC-HTML-005 자식이 없는 요소는 여는 태그와 닫는 태그', () => {
    expect(toHTML(h('ul', null))).toBe('<ul></ul>');
  });
});

describe('toHTML: 이스케이프', () => {
  it('TC-HTML-006 텍스트의 & < > 는 엔티티로, 따옴표는 그대로', () => {
    expect(toHTML(h('p', null, 'a & b <c> "d" \'e\''))).toBe('<p>a &amp; b &lt;c&gt; "d" \'e\'</p>');
  });

  it('TC-HTML-007 텍스트에 태그처럼 보이는 글자가 있어도 다시 파싱하면 요소가 생기지 않는다', () => {
    const out = toHTML(h('div', null, '<script>alert(1)</script>'));
    const back = parseList(out);
    expect(back).toHaveLength(1);
    expect(back[0].children).toEqual([createText('<script>alert(1)</script>')]);
  });

  it('TC-HTML-008 속성값의 & 와 " 는 엔티티로', () => {
    expect(toHTML(h('div', { title: 'a"b&c' }))).toBe('<div title="a&quot;b&amp;c"></div>');
  });

  it("TC-HTML-009 속성값에 ' < > = 공백이 있어도 왕복된다", () => {
    const v = [h('div', { title: "it's <x> = y z", 'data-k': '&amp;' }, 'a')];
    expect(parseList(toHTML(v))).toEqual(v);
  });
});

describe('toHTML: 속성 값 규칙 (setProp 과 같음)', () => {
  it('TC-HTML-010 null / undefined / false 는 출력하지 않는다', () => {
    expect(toHTML(h('input', { a: null, b: undefined, disabled: false, type: 'text' }))).toBe('<input type="text">');
  });

  it('TC-HTML-011 true 는 이름만 또는 빈 값', () => {
    expect(['<input disabled>', '<input disabled="">']).toContain(toHTML(h('input', { disabled: true })));
    expect(parseList(toHTML(h('input', { disabled: true })))[0].props).toEqual({ disabled: '' });
  });

  it("TC-HTML-012 0 과 '' 은 버리지 않는다", () => {
    expect(toHTML(h('div', { tabindex: 0, title: '' }))).toBe('<div tabindex="0" title=""></div>');
  });

  it('TC-HTML-013 함수 prop 은 출력하지 않고, 문자열 onclick 은 그대로 출력한다', () => {
    expect(toHTML(h('button', { onClick: () => {}, type: 'button' }, 'go'))).toBe('<button type="button">go</button>');
    expect(toHTML(h('button', { onclick: 'f()' }, 'go'))).toBe('<button onclick="f()">go</button>');
  });

  it('TC-HTML-014 key 는 key 속성으로 출력되어 왕복에서 살아남는다', () => {
    const out = toHTML(h('li', { key: 'a', class: 'x' }, 'v'));
    expect(out).toContain('key="a"');
    expect(out).toContain('class="x"');
    expect(parseList(out)).toEqual([h('li', { key: 'a', class: 'x' }, 'v')]);
    expect(toHTML(h('li', null, 'v'))).toBe('<li>v</li>');
  });
});

describe('toHTML: void 요소', () => {
  it.each(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])(
    'TC-HTML-015 %s 는 닫는 태그가 없다',
    (tag) => {
      expect(toHTML(h(tag, null))).toBe(`<${tag}>`);
    },
  );

  it('TC-HTML-016 속성이 있는 void 요소와 그 뒤 형제', () => {
    expect(toHTML(h('p', null, 'a', h('br', null), h('img', { src: 'a.png', alt: '' }), 'b'))).toBe(
      '<p>a<br><img src="a.png" alt="">b</p>',
    );
  });
});

describe('toHTML: 공백과 특수 요소 (에러 추측)', () => {
  it('TC-HTML-017 pre 안의 공백·줄바꿈은 그대로', () => {
    expect(toHTML(h('pre', null, '  a\n b '))).toBe('<pre>  a\n b </pre>');
    expectRoundTrip('<pre>  a\n\n b </pre>');
  });

  it('TC-HTML-018 pre / textarea 의 첫 줄바꿈은 파서가 버리므로 하나 더 붙여 왕복을 지킨다', () => {
    for (const tag of ['pre', 'textarea']) {
      const v = [h(tag, null, '\nx')];
      expect(parseList(toHTML(v)), tag).toEqual(v);
      const nl = [h(tag, null, '\n')];
      expect(parseList(toHTML(nl)), `${tag} 줄바꿈만`).toEqual(nl);
    }
    // 첫 자식이 요소면 붙이지 않는다
    expect(toHTML(h('pre', null, h('code', null, '\nx')))).toBe('<pre><code>\nx</code></pre>');
  });

  it('TC-HTML-019 textarea 안의 </textarea> 글자도 왕복된다', () => {
    const v = [h('textarea', null, 'a </textarea> <b>&')];
    expect(parseList(toHTML(v))).toEqual(v);
  });

  it('TC-HTML-020 style 안의 텍스트는 이스케이프하지 않는다 (raw text)', () => {
    expect(toHTML(h('style', null, 'a > b { content: "&"; }'))).toBe('<style>a > b { content: "&"; }</style>');
    expectRoundTrip('<style>p > b::after { content: "<&>"; }</style><p>x</p>');
  });

  it('TC-HTML-028 script 안의 텍스트도 이스케이프하지 않는다 (raw text), 왕복', () => {
    expect(toHTML(h('script', null, 'if (a < b && c > d) x("&");'))).toBe('<script>if (a < b && c > d) x("&");</script>');
    expectRoundTrip('<script>if (a<b && "&amp;") { y = \'<p>\'; }</script><p>z</p>');
  });

  it('TC-HTML-029 \\r 은 텍스트·속성 모두 &#13; 으로 써서 왕복된다', () => {
    expect(toHTML(h('p', { title: 'a\rb' }, 'c\rd'))).toBe('<p title="a&#13;b">c&#13;d</p>');
    const { out } = expectRoundTrip('<p title="a&#13;b">c&#13;d</p>');
    expect(out).toBe('<p title="a&#13;b">c&#13;d</p>');
  });

  it('TC-HTML-030 plaintext 는 raw 이고 닫는 태그를 쓰지 않는다', () => {
    const html = '<plaintext>&lt;x</plaintext>';
    const v1 = parseList(html);
    expect(v1[0].children).toEqual([createText('&lt;x</plaintext>')]);
    const { out } = expectRoundTrip(html);
    expect(out).toBe(html);
  });

  it('TC-HTML-021 SVG 태그·속성의 대소문자 유지', () => {
    const { out } = expectRoundTrip('<svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient><circle r="1"></circle></svg>');
    expect(out).toContain('<linearGradient');
    expect(out).toContain('viewBox="0 0 10 10"');
  });

  it('TC-HTML-022 한글·이모지·결합 문자·&nbsp; 왕복', () => {
    expectRoundTrip('<p>한글 😀 é a&nbsp;b</p><p>&nbsp;</p>');
  });

  it('TC-HTML-023 입력 VNode 를 바꾸지 않는다 (deep freeze)', () => {
    const v = deepFreeze([h('div', { id: 'a', key: 'k' }, h('p', null, 'x & y'), h('br', null))]);
    expect(() => toHTML(v)).not.toThrow();
  });

  it('TC-HTML-024 type 이 함수인 VNode 는 TypeError', () => {
    const Comp = () => h('p', null, 'x');
    expect(() => toHTML(h(Comp, null))).toThrow(TypeError);
  });
});

describe('toHTML: 왕복 성질 (사용자 HTML → VNode → toHTML → VNode)', () => {
  it.each([
    ['기본 샘플', '<h1>제목</h1><p id="p" class="a b">본문 <b>굵게</b> 끝</p><ul><li>1</li><li>2</li></ul>'],
    ['들여쓰기가 있는 HTML', '\n<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>\n'],
    ['주석이 섞인 HTML (주석은 요소 사이)', '<div><!-- c --><p>a</p><!-- d --></div>'],
    ['최상위 텍스트와 요소', 'hello <b>w</b> !'],
    ['불리언·빈 속성', '<input type="checkbox" checked disabled><input value="">'],
    ['form 요소들', '<form><label>x <input name="n" value="a&b"></label><select><option value="1" selected>1</option></select><textarea>  t\n</textarea></form>'],
    ['key 속성', '<ul><li key="a">x</li><li key="b">y</li></ul>'],
    ['닫지 않은 태그 (파서 복구)', '<p>a<p>b<ul><li>c'],
    ['표', '<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'],
    ['문자열 on* 속성', '<button onclick="go()">b</button>'],
    ['엔티티', '<p title="&quot;q&quot; &lt;t&gt;">&amp;&lt;&gt;&#39;</p>'],
  ])('TC-HTML-025 %s', (_name, html) => {
    expectRoundTrip(html);
  });

  it('TC-HTML-026 V1 에서 시작하면 출력 문자열도 고정점이다 (toHTML(V2) === toHTML(V1))', () => {
    const v1 = parseList('<div class="a">x &amp; y<br><pre>\n\nz</pre></div>');
    const once = toHTML(v1);
    expect(toHTML(parseList(once))).toBe(once);
  });
});

// 시드 고정 무작위 트리. 실패하면 메시지의 seed 로 재현한다.
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

// 서식 요소(b, i, em 등)는 파서의 active formatting 재구성 때문에 뺀다. 나머지 흔한 요소만 쓴다.
const TAGS = ['div', 'span', 'p', 'ul', 'li', 'section', 'pre', 'textarea', 'style', 'br', 'img', 'input', 'label'];
const TEXTS = ['a', ' c ', '<i>&', '"q"', '\nx', '\n', '  ', ' ', '한글', 'x > y'];
const ATTRS = { class: ['x', 'y z'], id: ['i1'], title: ['a"b', "it's", '<&>', ''], 'data-k': ['1', '&amp;'], hidden: [true] };

function randomTree(rand, depth) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  if (depth > 0 && rand() < 0.35) return createText(pick(TEXTS));
  const props = {};
  for (const [name, values] of Object.entries(ATTRS)) {
    if (rand() < 0.3) props[name] = pick(values);
  }
  if (rand() < 0.15) props.key = pick(['k1', 'k"2']);
  const children = [];
  if (depth < 3) {
    const count = Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) children.push(randomTree(rand, depth + 1));
  }
  return h(pick(TAGS), props, children);
}

describe('toHTML: 무작위 트리 왕복', () => {
  it('TC-HTML-027 시드 고정 300개: 무작위 트리를 한 번 파싱한 V1 이 toHTML → 파싱 후에도 같다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(seed);
      const count = 1 + Math.floor(rand() * 3);
      const trees = Array.from({ length: count }, () => randomTree(rand, 0));
      const v1 = parseList(toHTML(trees));
      const out = toHTML(v1);
      expect(parseList(out), `seed ${seed}\n${out}`).toEqual(v1);
    }
  });
});
