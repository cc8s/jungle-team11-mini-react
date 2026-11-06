// DOM <-> VNode 변환. 주석 노드와 공백뿐인 텍스트 노드는 무시한다.
export function domToVNode(node) {
  if (node.nodeType === 3) {
    return node.textContent.trim() === '' ? null : { type: '#text', text: node.textContent };
  }
  if (node.nodeType !== 1) return null;
  const props = {};
  for (const { name, value } of node.attributes) props[name] = value;
  const children = [...node.childNodes].map(domToVNode).filter(Boolean);
  return { type: node.tagName.toLowerCase(), props, children };
}

export function vnodeToDom(vnode) {
  if (vnode.type === '#text') return document.createTextNode(vnode.text);
  const el = document.createElement(vnode.type);
  for (const [k, v] of Object.entries(vnode.props)) el.setAttribute(k, v);
  vnode.children.forEach((c) => el.appendChild(vnodeToDom(c)));
  return el;
}

export function h(type, props = {}, ...children) {
  return {
    type,
    props: props || {},
    children: children.flat().filter((c) => c != null && c !== false)
      .map((c) => (typeof c === 'object' ? c : { type: '#text', text: String(c) })),
  };
}
