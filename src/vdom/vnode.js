// VNode: 실제 DOM 을 흉내 내는 평범한 객체.
//
//   요소   { type: 'div',   props: { id: 'a' }, key: null, children: [VNode...] }
//   텍스트 { type: '#text', props: {},          key: null, children: [], text: 'hi' }
//
// 요소와 텍스트가 같은 모양이라 diff 가 "type 이 같은가 → text 가 같은가 → props 가 같은가"
// 순서로 분기 없이 비교할 수 있다. type 에는 Phase 2 의 함수 컴포넌트도 올 수 있다.

export const TEXT = '#text';

export function createText(text) {
  return { type: TEXT, props: {}, key: null, children: [], text: String(text) };
}

export const isText = (vnode) => vnode != null && vnode.type === TEXT;

// h('ul', { class: 'list' }, h('li', null, 'a'), items.map(...))
export function h(type, props, ...children) {
  const { key = null, ...rest } = props ?? {};
  return { type, props: rest, key, children: normalizeChildren(children) };
}

// 중첩 배열을 펼치고, 문자열·숫자는 텍스트 VNode 로 바꾼다.
// null / undefined / true / false 는 버린다: `{ok && h(...)}` 같은 조건부 렌더링용.
// 0 과 '' 는 화면에 보이는 값이므로 버리지 않는다.
function normalizeChildren(children, out = []) {
  for (const child of children) {
    if (Array.isArray(child)) normalizeChildren(child, out);
    else if (child == null || typeof child === 'boolean') continue;
    else if (typeof child === 'string' || typeof child === 'number') out.push(createText(child));
    else out.push(child);
  }
  return out;
}
