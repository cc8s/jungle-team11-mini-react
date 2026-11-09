// 지금 실제 영역을 읽어 VNode 로 만든다. Patch·뒤로·앞으로의 diff old 로 쓴다 (사용자 결정 C).
//
// 사용자는 실제 영역을 직접 바꿀 수 있다(체크박스, 입력, select, details, contenteditable, 개발자 도구).
// 저장된 VNode 와 diff 하면 그 변경을 모르고 지나치므로, 지금 DOM 을 old 로 삼는다.
//
//   - domToVNode 와 달리 공백 텍스트를 버리지 않는다. 버리면 path 의 childNodes 인덱스가 어긋난다.
//     요소·텍스트가 아닌 노드(주석 등)는 VNode 로 나타낼 수 없으므로 normalizeReal 이 먼저 지운다.
//   - 속성에 드러나지 않는 화면 상태(.value / .checked / .selected)가 같은 속성으로 새로 render 한
//     요소와 다르면 그 prop 을 DIRTY 로 표시한다. DIRTY 는 어떤 값과도 같지 않으므로 diff 가 반드시
//     set(목표에 있으면) 또는 remove(없으면)를 내고, setProp / removeProp 가 화면 상태를 맞춘다.
//   - 실제 DOM 에는 key 가 없으므로, 같은 자리·같은 type 인 guide(저장된 VNode)의 key 를 빌린다.
import { createText } from '../vdom/vnode.js';
import { render } from '../vdom/render.js';

const DIRTY = Symbol('dirty');

// 요소·텍스트가 아닌 자식을 지운다. 호출자는 그 MutationObserver 기록을 사용자 조작과 함께 버린다.
export function normalizeReal(root) {
  for (const child of [...root.childNodes]) {
    if (child.nodeType === Node.ELEMENT_NODE) normalizeReal(child);
    else if (child.nodeType !== Node.TEXT_NODE) root.removeChild(child);
  }
}

export function readChildren(parent, guides = []) {
  return [...parent.childNodes].map((node, i) => read(node, guides[i]));
}

function read(node, guide) {
  if (node.nodeType === Node.TEXT_NODE) return createText(node.data);
  const type = node.localName;
  const same = guide && guide.type === type ? guide : null;
  const props = {};
  for (const { name, value } of node.attributes) props[name] = value;
  const vnode = { type, props, key: same?.key ?? null, children: readChildren(node, same?.children) };
  if (type === 'input' || type === 'textarea') markInput(node, vnode);
  else if (type === 'select') markOptions(node, vnode);
  return vnode;
}

// 같은 속성으로 새로 render 한 요소와 화면 상태를 비교한다.
function markInput(el, vnode) {
  const fresh = render(vnode);
  if (el.value !== fresh.value) vnode.props.value = DIRTY;
  if (el.localName === 'input' && el.checked !== fresh.checked) vnode.props.checked = DIRTY;
}

function markOptions(select, vnode) {
  const fresh = render(vnode);
  const options = optionVNodes(vnode);
  [...select.options].forEach((option, i) => {
    if (options[i] && option.selected !== fresh.options[i]?.selected) options[i].props.selected = DIRTY;
  });
}

// select.options 와 같은 순서: select 의 option 자식, 그리고 optgroup 자식의 option.
function optionVNodes(select) {
  const out = [];
  for (const child of select.children) {
    if (child.type === 'option') out.push(child);
    else if (child.type === 'optgroup') out.push(...child.children.filter((c) => c.type === 'option'));
  }
  return out;
}
