// diff(oldVNode, newVNode) 의 API 계약 (결정 0012). 이 파일이 명세다.
//
// import { diff } from '../../src/vdom/diff.js';
//
// diff(oldVNode, newVNode) → Patch[]
//   - 인자: VNode(src/vdom/vnode.js 형태) 또는 null. 둘 다 null 이면 [].
//   - 바뀐 것이 없으면 빈 배열. 항상 새 배열을 돌려준다.
//   - 입력 VNode 를 바꾸지 않는다.
//
// Patch 형태 (type 은 문자열 상수)
//   { type: 'ADD',     path, node }          path 위치에 node(새 VNode)를 끼워 넣는다
//   { type: 'REMOVE',  path }                path 위치의 노드를 뺀다
//   { type: 'REPLACE', path, node }          path 위치의 노드를 node(새 VNode)로 통째로 바꾼다
//   { type: 'TEXT',    path, text }          path 위치의 텍스트 노드 내용을 text 로 바꾼다
//   { type: 'PROPS',   path, set, remove }   set: { 이름: 새 값 } (추가 + 값 변경),
//                                            remove: [이름...] (새 props 에 없는 이름)
//                                            set, remove 는 항상 둘 다 있다 (비어 있을 수 있음).
//                                            한 노드에 PROPS patch 는 최대 1개.
//
// path: 루트에서 대상까지 children 인덱스 배열. 루트 자신은 [].
//   예) <div><p>a</p><ul><li>x</li></ul></div> 에서 'x' 텍스트는 [1, 0, 0].
//   - 결과 배열을 **앞에서부터 순서대로** 적용하면 빈 값(null/undefined/false) prop 정규화
//     기준으로 old 가 new 가 된다. 각 path 는 그 patch 를
//     적용하는 시점의 트리 기준으로 유효하다.
//   - key 재정렬이 없는 지금은 자식을 같은 인덱스끼리 짝짓는다. 그래서 ADD 는 뒤쪽에 붙는
//     새 자식(인덱스 오름차순), REMOVE 는 뒤쪽에 남는 옛 자식(인덱스 내림차순)이고,
//     ADD 가 아닌 patch 의 path 는 old 트리에서의 인덱스와 같다.
//   - 각 patch 의 path 는 서로 다른 배열 객체다 (공유하지 않는다).
//
// 판단 순서 (결정 테이블 0012)
//   1 old 없음, new 있음            → ADD
//   2 old 있음, new 없음            → REMOVE
//   3 type 다름 (텍스트 ↔ 요소 포함) 또는 key 다름 (null ↔ 값 포함)
//                                    → REPLACE (자식으로 내려가지 않음)
//   4 둘 다 텍스트                   → text 가 다르면 TEXT, 같으면 없음
//   5 같은 type, 같은 key 요소       → 바뀐 props 만 PROPS + 자식 재귀 (동시에 나올 수 있음)
//   key 재정렬(형제 순서 바뀜)은 아직 범위 밖. 자식은 같은 인덱스끼리 짝짓는다.
//   props 는 자기 속성(own property)만 본다. 'constructor', 'toString', '__proto__' 같은 이름도
//   평범한 prop 이름이다. set 에도 자기 속성으로 들어간다.
//   props 값 비교는 Object.is (NaN 끼리 같음, 이벤트 핸들러 함수는 참조가 같아야 같은 값).
//   빈 값 정규화: 값이 null / undefined / false 인 prop 은 old·new 어느 쪽이든 "이름이 없는 것"과
//   같다 (render.js setProp 이 이 셋을 제거로 처리하는 것과 일치). true, 0, '' 는 값이 있는 것이다.
import { describe, it, expect } from 'vitest';
import { diff } from '../../src/vdom/diff.js';
import { h, createText } from '../../src/vdom/vnode.js';
import { domToVNode } from '../../src/vdom/dom-to-vnode.js';

function parse(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return domToVNode(tpl.content.firstElementChild);
}

// 테스트용 참조 적용기: 계약대로 patch 를 VNode 트리에 순서대로 적용한다.
// 계약에 어긋난 path(없는 노드, 범위 밖 인덱스, 텍스트에 PROPS 등)는 바로 throw.
function clone(v) {
  return v == null ? v : { ...v, props: { ...v.props }, children: v.children.map(clone) };
}

function applyPatches(root, patches) {
  let tree = clone(root);
  for (const p of patches) {
    expect(Array.isArray(p.path)).toBe(true);
    if (p.path.length === 0) {
      tree = applyAt(tree, p, null, -1);
      continue;
    }
    let parent = tree;
    for (const i of p.path.slice(0, -1)) {
      if (!parent || !parent.children[i]) throw new Error(`없는 경로: ${JSON.stringify(p.path)}`);
      parent = parent.children[i];
    }
    if (!parent) throw new Error(`없는 경로: ${JSON.stringify(p.path)}`);
    const idx = p.path[p.path.length - 1];
    applyAt(parent.children[idx], p, parent, idx);
  }
  return tree;
}

function applyAt(target, p, parent, idx) {
  const kids = parent?.children;
  switch (p.type) {
    case 'ADD':
      if (parent) {
        if (idx < 0 || idx > kids.length) throw new Error(`ADD 범위 밖: ${JSON.stringify(p.path)}`);
        kids.splice(idx, 0, clone(p.node));
        return;
      }
      if (target != null) throw new Error('루트가 이미 있는데 ADD');
      return clone(p.node);
    case 'REMOVE':
      if (target == null) throw new Error(`REMOVE 대상 없음: ${JSON.stringify(p.path)}`);
      if (parent) { kids.splice(idx, 1); return; }
      return null;
    case 'REPLACE':
      if (target == null) throw new Error(`REPLACE 대상 없음: ${JSON.stringify(p.path)}`);
      if (parent) { kids[idx] = clone(p.node); return; }
      return clone(p.node);
    case 'TEXT':
      if (target == null || target.type !== '#text') throw new Error(`TEXT 대상이 텍스트가 아님: ${JSON.stringify(p.path)}`);
      target.text = p.text;
      return target;
    case 'PROPS':
      if (target == null || target.type === '#text') throw new Error(`PROPS 대상이 요소가 아님: ${JSON.stringify(p.path)}`);
      // '__proto__' 도 자기 속성으로 넣기 위해 대입 대신 defineProperty.
      for (const [k, v] of Object.entries(p.set)) {
        Object.defineProperty(target.props, k, { value: v, writable: true, enumerable: true, configurable: true });
      }
      for (const k of p.remove) {
        if (!Object.hasOwn(target.props, k)) throw new Error(`없는 속성 제거: ${k}`);
        delete target.props[k];
      }
      return target;
    default:
      throw new Error(`알 수 없는 patch type: ${p.type}`);
  }
}

function deepFreeze(v) {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

const pathsOf = (patches) => patches.map((p) => JSON.stringify(p.path)).sort();

describe('diff — 결정 테이블 0012', () => {
  it('TC-DIFF-001 (1행) 이전 노드가 없으면 루트에 ADD', () => {
    const next = h('p', null, 'a');
    expect(diff(null, next)).toEqual([{ type: 'ADD', path: [], node: next }]);
  });

  it('TC-DIFF-002 (2행) 새 노드가 없으면 루트에 REMOVE', () => {
    expect(diff(h('p', null, 'a'), null)).toEqual([{ type: 'REMOVE', path: [] }]);
  });

  it('TC-DIFF-003 (3행) 태그가 다르면 REPLACE 하나만, props·자식은 비교하지 않는다', () => {
    const next = h('div', { id: 'b' }, 'y');
    expect(diff(h('p', { id: 'a' }, 'x'), next)).toEqual([{ type: 'REPLACE', path: [], node: next }]);
  });

  it('TC-DIFF-004 (3행) 텍스트 ↔ 요소 전환은 REPLACE', () => {
    const el = h('span', null, 'a');
    const txt = createText('a');
    expect(diff(txt, el)).toEqual([{ type: 'REPLACE', path: [], node: el }]);
    expect(diff(el, txt)).toEqual([{ type: 'REPLACE', path: [], node: txt }]);
  });

  it.each([
    ['a', 'b'],
    ['', 'a'],
    ['a', ''],
    ['a', 'a '],
  ])('TC-DIFF-005 (4행) 텍스트 %j → %j 는 TEXT', (before, after) => {
    expect(diff(createText(before), createText(after))).toEqual([{ type: 'TEXT', path: [], text: after }]);
  });

  it('TC-DIFF-006 (4행) 텍스트가 같으면 patch 없음', () => {
    expect(diff(createText('같음'), createText('같음'))).toEqual([]);
    expect(diff(createText(''), createText(''))).toEqual([]);
  });

  it('TC-DIFF-007 (5행) 속성 추가는 PROPS.set', () => {
    expect(diff(h('div', { a: '1' }), h('div', { a: '1', b: '2' }))).toEqual([
      { type: 'PROPS', path: [], set: { b: '2' }, remove: [] },
    ]);
  });

  it('TC-DIFF-008 (5행) 속성 값 변경은 PROPS.set 에 새 값', () => {
    expect(diff(h('div', { a: '1', b: '2' }), h('div', { a: '1', b: '3' }))).toEqual([
      { type: 'PROPS', path: [], set: { b: '3' }, remove: [] },
    ]);
  });

  it('TC-DIFF-009 (5행) 속성 삭제는 PROPS.remove 에 이름', () => {
    expect(diff(h('div', { a: '1', b: '2' }), h('div', { a: '1' }))).toEqual([
      { type: 'PROPS', path: [], set: {}, remove: ['b'] },
    ]);
  });

  it('TC-DIFF-010 (5행) 속성·자식이 모두 같으면 patch 없음 (참조가 달라도)', () => {
    const make = () => h('ul', { class: 'l', id: 'x' }, h('li', null, 'a'), h('li', { title: 't' }, h('b', null, 'b')));
    expect(diff(make(), make())).toEqual([]);
    const same = make();
    expect(diff(same, same)).toEqual([]);
  });

  it('TC-DIFF-011 (5행) 추가·변경·삭제가 섞여도 한 노드에 PROPS 하나, 바뀐 것만', () => {
    const patches = diff(h('a', { keep: 'k', chg: '1', del: 'x', del2: 'y' }), h('a', { keep: 'k', chg: '2', add: 'n' }));
    expect(patches).toHaveLength(1);
    const [p] = patches;
    expect(p.type).toBe('PROPS');
    expect(p.path).toEqual([]);
    expect(p.set).toEqual({ chg: '2', add: 'n' });
    expect([...p.remove].sort()).toEqual(['del', 'del2']);
  });

  it('TC-DIFF-012 (5행) 속성과 자식이 함께 바뀌면 PROPS 와 자식 patch 가 둘 다 나온다', () => {
    const patches = diff(h('p', { class: 'a' }, 'x'), h('p', { class: 'b' }, 'y'));
    expect(patches).toHaveLength(2);
    expect(patches).toEqual(expect.arrayContaining([
      { type: 'PROPS', path: [], set: { class: 'b' }, remove: [] },
      { type: 'TEXT', path: [0], text: 'y' },
    ]));
  });

  it('TC-DIFF-013 이벤트 핸들러: 같은 함수면 없음, 다른 함수면 PROPS.set', () => {
    const f = () => {};
    const g = () => {};
    expect(diff(h('button', { onClick: f }), h('button', { onClick: f }))).toEqual([]);
    const patches = diff(h('button', { onClick: f }), h('button', { onClick: g }));
    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('PROPS');
    expect(patches[0].set.onClick).toBe(g);
    expect(patches[0].remove).toEqual([]);
  });
});

describe('diff — 자식 재귀와 path', () => {
  it('TC-DIFF-014 (1행, 자식) 뒤에 생긴 자식은 ADD, path 는 새 인덱스', () => {
    const li = h('li', null, 'b');
    expect(diff(h('ul', null, h('li', null, 'a')), h('ul', null, h('li', null, 'a'), li))).toEqual([
      { type: 'ADD', path: [1], node: li },
    ]);
  });

  it('TC-DIFF-015 (2행, 자식) 뒤에서 사라진 자식은 REMOVE, path 는 옛 인덱스', () => {
    expect(diff(h('ul', null, h('li', null, 'a'), h('li', null, 'b')), h('ul', null, h('li', null, 'a')))).toEqual([
      { type: 'REMOVE', path: [1] },
    ]);
  });

  it('TC-DIFF-016 (BVA) 자식 0개 → 1개 / 0개 → 3개', () => {
    const one = h('li', null, 'a');
    expect(diff(h('ul'), h('ul', null, one))).toEqual([{ type: 'ADD', path: [0], node: one }]);

    const three = [h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c')];
    const old = h('ul');
    const next = h('ul', null, three);
    const patches = diff(old, next);
    expect(patches).toEqual([
      { type: 'ADD', path: [0], node: three[0] },
      { type: 'ADD', path: [1], node: three[1] },
      { type: 'ADD', path: [2], node: three[2] },
    ]);
  });

  it('TC-DIFF-017 (BVA) 자식 3개 → 0개: REMOVE 3개, 순서대로 적용하면 빈 목록', () => {
    const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'));
    const next = h('ul');
    const patches = diff(old, next);
    expect(patches.every((p) => p.type === 'REMOVE')).toBe(true);
    expect(pathsOf(patches)).toEqual(['[0]', '[1]', '[2]']);
    expect(applyPatches(old, patches)).toEqual(next);
  });

  it('TC-DIFF-018 (BVA) 자식 3개 → 1개: 뒤의 둘을 REMOVE, 순서대로 적용 가능', () => {
    const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'));
    const next = h('ul', null, h('li', null, 'a'));
    const patches = diff(old, next);
    expect(patches.every((p) => p.type === 'REMOVE')).toBe(true);
    expect(pathsOf(patches)).toEqual(['[1]', '[2]']);
    expect(applyPatches(old, patches)).toEqual(next);
  });

  it('TC-DIFF-019 (key 없음) 첫 자식 삭제는 같은 인덱스끼리 비교 → TEXT 2개 + 마지막 REMOVE', () => {
    const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'));
    const next = h('ul', null, h('li', null, 'b'), h('li', null, 'c'));
    const patches = diff(old, next);
    expect(patches).toHaveLength(3);
    expect(patches).toEqual(expect.arrayContaining([
      { type: 'TEXT', path: [0, 0], text: 'b' },
      { type: 'TEXT', path: [1, 0], text: 'c' },
      { type: 'REMOVE', path: [2] },
    ]));
    expect(applyPatches(old, patches)).toEqual(next);
  });

  it('TC-DIFF-020 깊은 위치의 텍스트 변경은 루트부터의 인덱스 path', () => {
    const old = parse('<div><p>a</p><ul><li>x</li></ul></div>');
    const next = parse('<div><p>a</p><ul><li>y</li></ul></div>');
    expect(diff(old, next)).toEqual([{ type: 'TEXT', path: [1, 0, 0], text: 'y' }]);
  });

  it('TC-DIFF-021 (3행, 자식) 자식 타입이 바뀌면 그 자식만 REPLACE, 그 아래로 내려가지 않음', () => {
    const span = h('span', { id: 'n' }, h('i', null, 'y'));
    expect(diff(h('div', null, h('p', { id: 'o' }, 'x')), h('div', null, span))).toEqual([
      { type: 'REPLACE', path: [0], node: span },
    ]);
  });

  it('TC-DIFF-022 (EG) 형제 여러 개가 바뀌면 path 가 각각 다르다 (path 배열 공유 금지)', () => {
    const old = h('div', null, h('p', null, 'a'), h('p', null, 'b'), h('p', null, 'c'));
    const next = h('div', null, h('p', null, 'A'), h('p', null, 'B'), h('p', null, 'C'));
    const patches = diff(old, next);
    expect(patches).toEqual([
      { type: 'TEXT', path: [0, 0], text: 'A' },
      { type: 'TEXT', path: [1, 0], text: 'B' },
      { type: 'TEXT', path: [2, 0], text: 'C' },
    ]);
    expect(new Set(patches.map((p) => p.path)).size).toBe(3);
  });

  it('TC-DIFF-023 (EG) 텍스트 자식 ↔ 요소 자식 전환은 자식 위치에서 REPLACE', () => {
    const b = h('b', null, 'x');
    expect(diff(h('p', null, 'x'), h('p', null, b))).toEqual([{ type: 'REPLACE', path: [0], node: b }]);
    expect(diff(h('p', null, b), h('p', null, 'x'))).toEqual([{ type: 'REPLACE', path: [0], node: createText('x') }]);
  });
});

describe('diff — 에러 추측과 경계', () => {
  it('TC-DIFF-024 (EG) 둘 다 null 이면 빈 배열', () => {
    expect(diff(null, null)).toEqual([]);
  });

  it('TC-DIFF-025 (EG) 입력 VNode 를 바꾸지 않는다 (얼린 객체로도 동작)', () => {
    const old = parse('<div class="a"><p>x</p><p>y</p><p>z</p></div>');
    const next = parse('<div class="b" id="n"><p>x</p><span>q</span></div>');
    const oldSnap = JSON.parse(JSON.stringify(old));
    const nextSnap = JSON.parse(JSON.stringify(next));
    deepFreeze(old);
    deepFreeze(next);
    const patches = diff(old, next);
    expect(patches.length).toBeGreaterThan(0);
    expect(old).toEqual(oldSnap);
    expect(next).toEqual(nextSnap);
  });

  it('TC-DIFF-026 (EG) 100단계 중첩의 맨 아래 텍스트 변경', () => {
    let old = createText('a');
    let next = createText('b');
    for (let i = 0; i < 100; i++) {
      old = h('div', null, old);
      next = h('div', null, next);
    }
    expect(diff(old, next)).toEqual([{ type: 'TEXT', path: Array(100).fill(0), text: 'b' }]);
  });

  it('TC-DIFF-027 (EG) 같은 입력에 두 번 호출해도 결과가 같고 서로 다른 배열이다', () => {
    const old = h('p', { a: '1' }, 'x');
    const next = h('p', { a: '2' }, 'y');
    const first = diff(old, next);
    const second = diff(old, next);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(diff(old, old)).not.toBe(diff(old, old));
  });
});

describe('diff — 빈 값(null / undefined / false) prop 정규화', () => {
  it.each([null, undefined, false])('TC-DIFF-030 {a:"1"} → {a:%s} 는 remove:["a"]', (empty) => {
    expect(diff(h('div', { a: '1' }), h('div', { a: empty }))).toEqual([
      { type: 'PROPS', path: [], set: {}, remove: ['a'] },
    ]);
  });

  it.each([null, undefined, false])('TC-DIFF-031 {} → {a:%s} 는 patch 없음', (empty) => {
    expect(diff(h('div', {}), h('div', { a: empty }))).toEqual([]);
  });

  it('TC-DIFF-032 {a:null} → {a:"1"} 은 set:{a:"1"}', () => {
    expect(diff(h('div', { a: null }), h('div', { a: '1' }))).toEqual([
      { type: 'PROPS', path: [], set: { a: '1' }, remove: [] },
    ]);
  });

  it('TC-DIFF-033 빈 값끼리 바뀌면 patch 없음 ({a:false} → {a:undefined} 등)', () => {
    expect(diff(h('div', { a: false }), h('div', { a: undefined }))).toEqual([]);
    expect(diff(h('div', { a: null }), h('div', { a: false }))).toEqual([]);
    expect(diff(h('div', { a: undefined }), h('div', {}))).toEqual([]);
  });

  it.each([
    ['true', true],
    ['0', 0],
    ["''", ''],
  ])('TC-DIFF-034 (대조군) {} → {a:%s} 는 값이 있는 것이므로 set', (_label, value) => {
    expect(diff(h('div', {}), h('div', { a: value }))).toEqual([
      { type: 'PROPS', path: [], set: { a: value }, remove: [] },
    ]);
  });

  it.each([
    ['true', true],
    ['0', 0],
    ["''", ''],
  ])('TC-DIFF-035 (대조군) {a:false} → {a:%s} 는 set (false 는 없음으로 본다)', (_label, value) => {
    expect(diff(h('div', { a: false }), h('div', { a: value }))).toEqual([
      { type: 'PROPS', path: [], set: { a: value }, remove: [] },
    ]);
  });
});

describe('diff — 리뷰 발견: 프로토타입 이름 prop', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'TC-DIFF-036 {%s:"x"} → {} 는 remove 에 그 이름',
    (name) => {
      expect(diff(h('div', { [name]: 'x' }), h('div', {}))).toEqual([
        { type: 'PROPS', path: [], set: {}, remove: [name] },
      ]);
    },
  );

  it('TC-DIFF-037 {} → {["__proto__"]:"x"} 는 set 에 __proto__ 가 자기 속성으로 들어간다', () => {
    const next = h('div', { ['__proto__']: 'x' });
    expect(Object.hasOwn(next.props, '__proto__')).toBe(true); // 입력이 제대로 만들어졌는지
    const patches = diff(h('div', {}), next);
    expect(patches).toHaveLength(1);
    const [p] = patches;
    expect(p.type).toBe('PROPS');
    expect(p.path).toEqual([]);
    expect(Object.keys(p.set)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(p.set, '__proto__').value).toBe('x');
    expect(p.remove).toEqual([]);
  });

  it('TC-DIFF-038 {["__proto__"]:"x"} → {} 는 remove:["__proto__"]', () => {
    const patches = diff(h('div', { ['__proto__']: 'x' }), h('div', {}));
    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('PROPS');
    expect(Object.keys(patches[0].set)).toEqual([]);
    expect(patches[0].remove).toEqual(['__proto__']);
  });

  it('TC-DIFF-039 HTML 속성 constructor 삭제도 순서대로 적용하면 new 가 된다', () => {
    const old = parse('<div constructor="x"></div>');
    const next = parse('<div></div>');
    expect(Object.hasOwn(old.props, 'constructor')).toBe(true);
    expect(applyPatches(old, diff(old, next))).toEqual(next);
  });
});

describe('diff — 리뷰 발견: key 가 다르면 REPLACE', () => {
  it('TC-DIFF-040 루트 li 의 key a → b 는 REPLACE 하나', () => {
    const next = h('li', { key: 'b' }, 'x');
    expect(diff(h('li', { key: 'a' }, 'x'), next)).toEqual([{ type: 'REPLACE', path: [], node: next }]);
  });

  it('TC-DIFF-041 ul 아래 li 의 key a → b 는 REPLACE [0], 적용하면 key 까지 new 와 같다', () => {
    const li = h('li', { key: 'b' }, 'x');
    const old = h('ul', null, h('li', { key: 'a' }, 'x'));
    const next = h('ul', null, li);
    const patches = diff(old, next);
    expect(patches).toEqual([{ type: 'REPLACE', path: [0], node: li }]);
    const applied = applyPatches(old, patches);
    expect(applied).toEqual(next);
    expect(applied.children[0].key).toBe('b');
  });

  it('TC-DIFF-042 key 가 없다가 생기거나 있다가 없어져도 REPLACE', () => {
    const keyed = h('li', { key: 'a' }, 'x');
    const plain = h('li', null, 'x');
    expect(diff(plain, keyed)).toEqual([{ type: 'REPLACE', path: [], node: keyed }]);
    expect(diff(keyed, plain)).toEqual([{ type: 'REPLACE', path: [], node: plain }]);

    const old = h('ul', null, plain);
    const next = h('ul', null, keyed);
    expect(diff(old, next)).toEqual([{ type: 'REPLACE', path: [0], node: keyed }]);
    expect(applyPatches(old, diff(old, next))).toEqual(next);
  });

  it('TC-DIFF-043 key 가 같으면 지금처럼 PROPS 와 자식을 비교한다 (회귀 방지)', () => {
    const patches = diff(h('li', { key: 'a', class: 'x' }, 'p'), h('li', { key: 'a', class: 'y' }, 'q'));
    expect(patches).toHaveLength(2);
    expect(patches).toEqual(expect.arrayContaining([
      { type: 'PROPS', path: [], set: { class: 'y' }, remove: [] },
      { type: 'TEXT', path: [0], text: 'q' },
    ]));
  });
});

describe('diff — 리뷰 발견: props 값은 Object.is 로 비교', () => {
  it('TC-DIFF-044 {a:NaN} → {a:NaN} 은 patch 없음', () => {
    expect(diff(h('div', { a: NaN }), h('div', { a: NaN }))).toEqual([]);
  });
});

describe('diff — 순서대로 적용하면 new 가 된다 (patch.js 계약)', () => {
  it.each([
    ['자식 추가 + 속성 변경', '<ul class="a"><li>1</li></ul>', '<ul class="b"><li>1</li><li>2</li><li>3</li></ul>'],
    ['여러 단계에서 동시에 삭제', '<div><ul><li>1</li><li>2</li><li>3</li></ul><p>a</p><p>b</p><p>c</p></div>', '<div><ul><li>1</li></ul><p>a</p></div>'],
    ['삭제와 추가가 다른 부모에서', '<div><ul><li>1</li><li>2</li></ul><ol></ol></div>', '<div><ul></ul><ol><li>x</li><li>y</li></ol></div>'],
    ['교체 + 텍스트 + 속성 삭제', '<section id="s" title="t"><h1>a</h1><p>b</p><em>c</em></section>', '<section id="s"><h2>a</h2><p>B</p>c</section>'],
    ['앞쪽 삭제 (위치 비교)', '<ol><li class="x">a</li><li>b</li><li>c</li><li>d</li></ol>', '<ol><li>c</li><li class="y">d</li></ol>'],
    ['깊은 곳 추가와 얕은 곳 삭제', '<div><div><div><span>a</span></div></div><b>1</b><b>2</b></div>', '<div><div><div><span>a</span><span>b</span></div></div></div>'],
  ])('TC-DIFF-028 %s', (_name, before, after) => {
    const old = parse(before);
    const next = parse(after);
    expect(applyPatches(old, diff(old, next))).toEqual(next);
  });

  it('TC-DIFF-029 루트 교체·추가·삭제도 순서대로 적용하면 new 가 된다', () => {
    const a = parse('<p>a</p>');
    const b = parse('<div><p>a</p></div>');
    expect(applyPatches(a, diff(a, b))).toEqual(b);
    expect(applyPatches(null, diff(null, b))).toEqual(b);
    expect(applyPatches(a, diff(a, null))).toBe(null);
  });
});
