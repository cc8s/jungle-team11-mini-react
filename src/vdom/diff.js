// 두 VNode 를 비교해 패치 목록을 만든다. path 는 부모에서의 자식 인덱스 배열.
// 케이스: CREATE / REMOVE / REPLACE / TEXT / PROPS
export function diff(oldV, newV, path = [], patches = []) {
  if (!oldV && !newV) return patches;
  if (!oldV) { patches.push({ kind: 'CREATE', path, vnode: newV }); return patches; }
  if (!newV) { patches.push({ kind: 'REMOVE', path }); return patches; }
  if (oldV.type !== newV.type) { patches.push({ kind: 'REPLACE', path, vnode: newV }); return patches; }
  if (oldV.type === '#text') {
    if (oldV.text !== newV.text) patches.push({ kind: 'TEXT', path, text: newV.text });
    return patches;
  }
  const set = {}; const remove = [];
  for (const [k, v] of Object.entries(newV.props)) if (oldV.props[k] !== v) set[k] = v;
  for (const k of Object.keys(oldV.props)) if (!(k in newV.props)) remove.push(k);
  if (Object.keys(set).length || remove.length) patches.push({ kind: 'PROPS', path, set, remove });
  const max = Math.max(oldV.children.length, newV.children.length);
  // 제거는 뒤에서부터 해야 인덱스가 밀리지 않는다.
  for (let i = 0; i < max; i++) {
    if (i < newV.children.length) diff(oldV.children[i], newV.children[i], [...path, i], patches);
  }
  for (let i = oldV.children.length - 1; i >= newV.children.length; i--) {
    patches.push({ kind: 'REMOVE', path: [...path, i] });
  }
  return patches;
}
