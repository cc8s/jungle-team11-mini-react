// VNode → HTML 문자열. 계약은 tests/unit/to-html.test.js 맨 위 주석.
//
// 뒤로/앞으로 때 History 의 VNode 를 테스트 영역 textarea 에 되돌리는 용도다 (결정 0008).
// 출력을 다시 <template> 으로 파싱해 childrenToVNodes 를 거치면 같은 VNode 가 나와야 한다.
import { isText } from './vnode.js';

// 닫는 태그가 없는 요소. 자식은 출력하지 않는다.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// 파서가 안의 엔티티를 해석하지 않는 요소. 이스케이프하면 왕복이 깨진다.
// SVG 안의 style / script 는 평범한 요소로 파싱되므로 여기에 해당하지 않는다.
const RAW_TEXT = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);

// 파서는 <plaintext> 뒤 전부를 텍스트로 읽으므로 닫는 태그를 쓰면 그것까지 텍스트가 된다.
const NO_END_TAG = 'plaintext';

// 파서가 여는 태그 바로 뒤의 줄바꿈 하나를 버리는 요소.
const LEADING_NEWLINE = new Set(['pre', 'textarea', 'listing']);

export function toHTML(input) {
  if (input == null) return '';
  const list = Array.isArray(input) ? input : [input];
  return list.map((vnode) => serialize(vnode, false, false)).join('');
}

// inSvg: SVG 네임스페이스 안인가. raw: 부모가 raw text 요소인가.
function serialize(vnode, inSvg, raw) {
  if (isText(vnode)) return raw ? vnode.text : escapeText(vnode.text);
  if (typeof vnode.type !== 'string') {
    throw new TypeError(`toHTML: 요소 type 은 문자열이어야 합니다 (받은 값: ${typeof vnode.type}).`);
  }

  const { type, props, key, children } = vnode;
  let open = `<${type}${attributes(props, key)}>`;
  if (!inSvg && VOID.has(type)) return open;

  const svg = (inSvg || type === 'svg') && type !== 'foreignObject';
  const childRaw = !inSvg && RAW_TEXT.has(type);
  const first = children[0];
  if (!inSvg && LEADING_NEWLINE.has(type) && isText(first) && first.text.startsWith('\n')) open += '\n';

  const inner = children.map((child) => serialize(child, svg, childRaw)).join('');
  if (!inSvg && type === NO_END_TAG) return `${open}${inner}`;
  return `${open}${inner}</${type}>`;
}

// render.js setProp 과 같은 값 규칙: null / undefined / false / 함수는 출력하지 않고, true 는 빈 값.
function attributes(props, key) {
  let out = '';
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false || typeof value === 'function') continue;
    out += ` ${name}="${value === true ? '' : escapeAttr(String(value))}"`;
  }
  // domToVNode 가 key 속성을 key 필드로 옮기므로, 속성으로 되돌려야 왕복에서 살아남는다.
  if (key != null) out += ` key="${escapeAttr(String(key))}"`;
  return out;
}

// 파서는 날 CR 을 LF 로 바꾸므로 \r 은 문자 참조로 써야 왕복된다.
const escapeText = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;');
