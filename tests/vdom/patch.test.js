import { describe, it, expect } from 'vitest';
import { diff } from '../../src/vdom/diff.js';
import { patch } from '../../src/vdom/patch.js';
import { domToVNode, vnodeToDom } from '../../src/vdom/vnode.js';

const parse = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstChild; };

// 이전 HTML → 새 HTML 로 패치한 결과가 새 HTML 을 직접 만든 것과 같아야 한다.
function roundtrip(before, after) {
  const root = vnodeToDom(domToVNode(parse(before)));
  const oldV = domToVNode(root);
  const newV = domToVNode(parse(after));
  patch(root, diff(oldV, newV));
  return { root, newV };
}

describe('patch', () => {
  const cases = {
    '텍스트 변경': ['<p>a</p>', '<p>b</p>'],
    '속성 추가/변경/삭제': ['<p a="1" b="2"></p>', '<p a="9" c="3"></p>'],
    '자식 추가': ['<ul><li>1</li></ul>', '<ul><li>1</li><li>2</li></ul>'],
    '자식 여러 개 삭제': ['<ul><li>1</li><li>2</li><li>3</li></ul>', '<ul><li>1</li></ul>'],
    '태그 교체': ['<div><p>x</p></div>', '<div><h1>x</h1></div>'],
    '중첩 변경': ['<div><section><span>a</span></section></div>', '<div><section><span>b</span><i></i></section></div>'],
  };
  for (const [name, [a, b]] of Object.entries(cases)) {
    it(name, () => {
      const { root, newV } = roundtrip(a, b);
      expect(domToVNode(root)).toEqual(newV);
    });
  }

  it('변경되지 않은 노드는 같은 DOM 인스턴스로 유지된다', () => {
    const root = vnodeToDom(domToVNode(parse('<div><p>a</p><span>b</span></div>')));
    const p = root.firstChild;
    patch(root, diff(domToVNode(root), domToVNode(parse('<div><p>a</p><span>c</span></div>'))));
    expect(root.firstChild).toBe(p);
  });
});
