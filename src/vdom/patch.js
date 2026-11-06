import { vnodeToDom } from './vnode.js';

const resolve = (root, path) => path.reduce((n, i) => n.childNodes[i], root);

// root 는 VNode 트리의 루트에 대응하는 실제 DOM 노드.
export function patch(root, patches) {
  for (const p of patches) {
    if (p.path.length === 0) {
      if (p.kind === 'REPLACE') root.replaceWith(vnodeToDom(p.vnode)); // 호출자가 새 root 를 다시 잡아야 한다
      else apply(root, p);
      continue;
    }
    const parent = resolve(root, p.path.slice(0, -1));
    const idx = p.path[p.path.length - 1];
    const target = parent.childNodes[idx];
    if (p.kind === 'CREATE') parent.appendChild(vnodeToDom(p.vnode));
    else if (p.kind === 'REMOVE') parent.removeChild(target);
    else if (p.kind === 'REPLACE') parent.replaceChild(vnodeToDom(p.vnode), target);
    else apply(target, p);
  }
}

function apply(node, p) {
  if (p.kind === 'TEXT') node.textContent = p.text;
  if (p.kind === 'PROPS') {
    for (const [k, v] of Object.entries(p.set)) node.setAttribute(k, v);
    p.remove.forEach((k) => node.removeAttribute(k));
  }
}
