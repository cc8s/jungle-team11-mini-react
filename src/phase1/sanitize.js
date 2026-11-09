// 사용자 HTML 정화. 허용 목록에 있는 요소와 속성만 남긴다 (계약: tests/integration/phase1.test.js 맨 위 주석).
//
// 블랙리스트는 SVG animate 로 href 주입, data: URL 의 iframe, meta refresh 같은 우회를 막지 못했다(#6 리뷰).
// 그래서 목록에 없는 것은 전부 뺀다. 라이브러리(render/domToVNode)는 그대로 두고 데모만 거른다.
//
//   sanitize(vnodes) → { vnodes, removed }
//     removed = 뺀 요소 수(하위 트리째 뺀 것은 1) + 남은 요소에서 뺀 속성 수

const HTML_ELEMENTS = new Set(
  (
    'div p span h1 h2 h3 h4 h5 h6 ul ol li dl dt dd ' +
    'table caption colgroup col thead tbody tfoot tr td th ' +
    'a b strong i em u s small mark code pre kbd blockquote q sub sup br hr img figure figcaption ' +
    'section article header footer nav main aside details summary ' +
    'label input textarea select option optgroup button fieldset legend progress meter svg'
  ).split(' '),
);

const SVG_ELEMENTS = new Set(
  'g path rect circle ellipse line polyline polygon text tspan title desc defs linearGradient radialGradient stop'.split(' '),
);

// SVG title·desc 는 HTML integration point 라 안의 요소가 HTML 로 파싱된다. 텍스트만 남긴다.
const TEXT_ONLY = new Set(['title', 'desc']);

const GLOBAL_ATTRS = new Set('class id title lang dir hidden contenteditable role tabindex'.split(' '));
const DATA_OR_ARIA = /^(?:data-[a-z0-9_.-]+|aria-[a-z]+)$/;

const ELEMENT_ATTRS = {
  a: 'href target rel',
  img: 'src alt width height',
  input: 'type value checked placeholder disabled readonly name min max step',
  textarea: 'placeholder disabled readonly name rows cols',
  select: 'disabled name multiple size',
  option: 'value selected disabled label',
  optgroup: 'label disabled',
  button: 'type disabled name value',
  label: 'for',
  fieldset: 'disabled',
  td: 'colspan rowspan',
  th: 'colspan rowspan scope',
  col: 'span',
  colgroup: 'span',
  ol: 'start reversed type',
  li: 'value',
  details: 'open',
  progress: 'value max',
  meter: 'value min max low high optimum',
};
const HTML_ATTRS = Object.fromEntries(Object.entries(ELEMENT_ATTRS).map(([tag, names]) => [tag, new Set(names.split(' '))]));

const SVG_ATTRS = new Set(
  (
    'viewBox width height x y dx dy cx cy r rx ry x1 y1 x2 y2 points d fill stroke ' +
    'stroke-width stroke-linecap stroke-linejoin fill-opacity stroke-opacity opacity transform ' +
    'offset stop-color stop-opacity gradientUnits gradientTransform text-anchor font-size font-family ' +
    'preserveAspectRatio xmlns'
  ).split(' '),
);

// 값이 URL 인 속성. 허용한 스킴이거나 스킴이 없는 상대 경로일 때만 남긴다.
const URL_ATTRS = { a: 'href', img: 'src' };
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

export function sanitize(vnodes) {
  const counter = { removed: 0 };
  return { vnodes: cleanList(vnodes, false, counter), removed: counter.removed };
}

// inSvg: 부모가 SVG 문맥인가 (svg 의 자손).
function cleanList(vnodes, inSvg, counter, textOnly = false) {
  const out = [];
  for (const vnode of vnodes) {
    if (vnode.type === '#text') {
      out.push(vnode);
    } else if (!textOnly && (inSvg ? SVG_ELEMENTS : HTML_ELEMENTS).has(vnode.type)) {
      out.push(clean(vnode, inSvg, counter));
    } else {
      counter.removed += 1;
    }
  }
  return out;
}

function clean(vnode, inSvg, counter) {
  const svg = inSvg || vnode.type === 'svg';
  const props = {};
  for (const [name, value] of Object.entries(vnode.props)) {
    if (allowed(vnode.type, svg, name, value)) props[name] = value;
    else counter.removed += 1;
  }
  const children = cleanList(vnode.children, svg, counter, svg && TEXT_ONLY.has(vnode.type));
  return { ...vnode, props, children };
}

function allowed(type, svg, name, value) {
  if (svg) return SVG_ATTRS.has(name);
  const lower = name.toLowerCase();
  if (!GLOBAL_ATTRS.has(lower) && !DATA_OR_ARIA.test(lower) && !HTML_ATTRS[type]?.has(lower)) return false;
  return URL_ATTRS[type] !== lower || isSafeUrl(String(value));
}

// 브라우저처럼 탭·줄바꿈은 어디에 있든, 앞쪽 공백·C0 제어문자는 무시하고 대소문자를 구분하지 않는다.
function isSafeUrl(value) {
  const normalized = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized);
  return !scheme || SAFE_SCHEMES.has(scheme[1]);
}
