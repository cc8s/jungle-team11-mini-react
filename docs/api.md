# 모듈 API 약속

팀원이 각자 모듈을 구현해도 서로 맞물리도록 **함수 이름과 입출력 모양**을 정해 둔 문서다.
`tests/` 의 테스트가 이 약속을 그대로 검증한다. 약속을 바꿀 때는 이 문서와 테스트를 **같은 PR 에서** 함께 고친다.

```
DOM ──domToVNode──▶ VNode ──diff(old,new)──▶ 패치 배열 ──patch──▶ 실제 DOM
                      ▲                                            
 setState → update() ─┘ (새 VNode 를 만들어 위 흐름을 반복)
```

## VNode

| 종류 | 모양 |
|---|---|
| 요소 | `{ type: 'div', props: { id: 'a' }, children: [VNode, ...] }` |
| 텍스트 | `{ type: '#text', text: '내용' }` |

- `type` 은 소문자 태그 이름이다.
- `props` 는 **속성 이름 → 문자열 값** 객체다. 속성이 없으면 `{}`.
- `children` 은 항상 배열이다. 자식이 없으면 `[]`.
- 주석 노드와 **공백뿐인 텍스트 노드는 VNode 에 넣지 않는다.**

## `src/vdom/vnode.js`

| 함수 | 입력 → 출력 | 비고 |
|---|---|---|
| `domToVNode(node)` | 실제 DOM 노드 → VNode | 주석 노드, 공백 텍스트는 `null` 반환. 자식에서는 `null` 을 걸러낸다 |
| `vnodeToDom(vnode)` | VNode → 실제 DOM 노드 | 속성은 `setAttribute` 로 반영 |
| `h(type, props, ...children)` | VNode 생성 헬퍼 | 문자열·숫자 자식은 텍스트 노드로, `null`/`false` 는 제거, 배열 자식은 펼친다. `props` 가 `null` 이면 `{}` |

`domToVNode(vnodeToDom(v))` 는 `v` 와 같아야 한다 (왕복 변환).

## `src/vdom/diff.js`

`diff(oldV, newV, path = [], patches = [])` → **패치 배열**

패치는 아래 5가지 `kind` 중 하나이며, `path` 는 루트에서 대상까지 자식 인덱스 배열이다 (루트 자체는 `[]`).

| kind | 모양 | 발생 조건 |
|---|---|---|
| `CREATE` | `{ kind, path, vnode }` | 이전에 없던 자식이 생김 |
| `REMOVE` | `{ kind, path }` | 이전 자식이 사라짐 |
| `REPLACE` | `{ kind, path, vnode }` | `type` 이 다름 (텍스트 ↔ 요소 포함) |
| `TEXT` | `{ kind, path, text }` | 텍스트 내용이 다름 |
| `PROPS` | `{ kind, path, set, remove }` | 속성 변경. `set` 은 추가·변경된 `{이름: 값}`, `remove` 는 삭제할 이름 배열 |

규칙
- 변경이 없으면 빈 배열 `[]`.
- 둘 다 `null` 이면 `[]`, 이전만 `null` 이면 `CREATE`, 새것만 `null` 이면 `REMOVE`.
- 같은 부모의 자식 `REMOVE` 는 **뒤 인덱스부터** 나온다 (앞에서 지우면 인덱스가 밀리기 때문).
- 자식은 **인덱스 순서**로 비교한다 (key 기반 비교는 하지 않는다).

## `src/vdom/patch.js`

`patch(root, patches)` — `root` 는 VNode 트리의 루트에 대응하는 **실제 DOM 노드**.

- 패치 배열을 순서대로 실제 DOM 에 반영한다. 바뀌지 않은 노드는 그대로 유지한다.
- `path` 가 `[]` 인 `REPLACE` 는 `root.replaceWith(...)` 로 처리하므로, 호출한 쪽이 **새 루트를 다시 잡아야** 한다.

## `src/core/function-component.js`

### `FunctionComponent`

```js
const app = new FunctionComponent(App, container, props);
app.mount();   // 처음 렌더링: App(props) 실행 → VNode → container 에 DOM 생성 → effect 실행
app.update();  // 다시 렌더링: 새 VNode 와 diff → patch → effect 실행
```

| 항목 | 설명 |
|---|---|
| `new FunctionComponent(fn, container, props = {})` | `fn(props)` 는 VNode 를 반환하는 함수형 컴포넌트 |
| `hooks` | 상태·effect·memo 를 호출 순서대로 저장하는 배열 |
| `mount()` / `update()` | 위 설명 참고 |

### Hooks

| Hook | 사용법 | 동작 |
|---|---|---|
| `useState(initial)` | `const [v, setV] = useState(0)` | `initial` 이 함수면 한 번 실행해 초기값으로 사용. `setV(값)` 또는 `setV(prev => 다음값)` |
| `useEffect(effect, deps)` | `useEffect(() => { ...; return cleanup }, [a])` | 렌더 **후** 실행. deps 가 없으면 매 렌더, `[]` 이면 마운트 때 한 번, 값이 바뀔 때만 재실행. 재실행 전에 이전 cleanup 호출 |
| `useMemo(factory, deps)` | `const v = useMemo(() => 계산(a), [a])` | deps 가 같으면 이전 결과를 재사용 |

규칙
- Hook 은 **컴포넌트 렌더링 중에만** 호출할 수 있다. 밖에서 호출하면 에러를 던진다.
- Hook 은 **최상위(루트) 컴포넌트에서만** 사용한다. 자식 컴포넌트는 props 만 받는 순수 함수다 (Lifting State Up).
- deps 비교는 `Object.is` 로 한다.
- `setState` 로 받은 값이 현재 값과 `Object.is` 로 같으면 **다시 렌더하지 않는다.**
- **Batching**: 같은 틱(마이크로태스크 전)의 여러 `setState` 는 한 번의 `update()` 로 묶인다. 따라서 상태 변경 직후의 화면은 `await Promise.resolve()` 뒤에 확인한다.

## 약속을 바꾸고 싶을 때

1. 팀에 먼저 알린다.
2. 이 문서, 구현, `tests/` 를 **한 PR** 에서 같이 수정한다.
3. 다른 팀원이 쓰던 호출 코드가 깨지는지 확인한다 (CI 가 `develop` 대상 PR 에서 실행된다).
