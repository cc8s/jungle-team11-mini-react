// 실제 DOM → VNode. 규칙은 결정 0009.
//
//   공백만 있는 텍스트 노드  → 버림 (들여쓰기만 바꿔도 diff 결과가 달라지지 않게)
//   내용이 있는 텍스트 노드  → 앞뒤 공백까지 그대로
//   주석 노드               → 버림
//   <pre>, <textarea> 안    → 공백이 의미를 가지므로 공백 전용 텍스트도 유지 (자손 포함)
import { h, createText } from './vnode.js';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const PRESERVE_WHITESPACE = new Set(['pre', 'textarea']);

// HTML 이 정의한 공백(스페이스, \t, \n, \f, \r)만 본다.
// 정규식 \s 를 쓰면 &nbsp;(U+00A0) 도 공백으로 보고 버려 버린다.
const HTML_WHITESPACE_ONLY = /^[ \t\n\f\r]*$/;

// Element 또는 Text 노드를 받는다. 버려야 하는 노드(주석, 공백 전용 텍스트 등)는 null.
// 여러 최상위 노드(<template>.content 같은 DocumentFragment)는 childrenToVNodes 를 쓴다.
export function domToVNode(node) {
  return convert(node, false);
}

// parent 의 자식 노드들을 VNode 배열로 바꾼다. 버린 노드는 빠진다.
export function childrenToVNodes(parent) {
  return convertChildren(parent, false);
}

function convert(node, preserve) {
  if (node.nodeType === TEXT_NODE) {
    if (!preserve && HTML_WHITESPACE_ONLY.test(node.data)) return null;
    return createText(node.data);
  }
  if (node.nodeType !== ELEMENT_NODE) return null;

  // tagName 은 HTML 에서 대문자('DIV')다. localName 은 HTML 은 소문자,
  // SVG 는 원래 대소문자('linearGradient')를 지킨다.
  const type = node.localName;
  const props = {};
  for (const { name, value } of node.attributes) props[name] = value;

  const keep = preserve || PRESERVE_WHITESPACE.has(type);
  return h(type, props, convertChildren(node, keep));
}

function convertChildren(parent, preserve) {
  const out = [];
  for (const child of parent.childNodes) {
    const vnode = convert(child, preserve);
    if (vnode) out.push(vnode);
  }
  return out;
}
