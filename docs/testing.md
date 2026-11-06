# 테스트 가이드

## 실행 방법

```bash
npm test               # 전체 테스트 1회 실행
npm run test:watch     # 파일 변경 시 자동 재실행
npm run test:coverage  # 테스트 + 커버리지 리포트 (CI 에서 사용)
```

- 러너: [Vitest](https://vitest.dev/) + jsdom (브라우저 없이 DOM API 사용)
- 위치: `tests/**/*.test.js`
- CI: `.github/workflows/ci.yml` — PR / main push 시 `npm ci` → `npm run test:coverage` → `npm run build`

## 검증 항목

### 환경 — `tests/setup.test.js`

| 검증 | 내용 |
|---|---|
| jsdom DOM API | 테스트 환경에서 `document.createElement`, `innerHTML` 이 동작한다 |

### Virtual DOM 변환 — `tests/vdom/vnode.test.js`

| 검증 | 내용 |
|---|---|
| 기본 변환 | 태그, 속성, 자식(텍스트 포함)이 VNode 구조로 바뀐다 |
| 주석·공백 처리 | 주석 노드와 공백뿐인 텍스트 노드는 VNode 에서 제외된다 |
| 빈 요소 | 자식이 없으면 `children` 이 빈 배열이다 |
| 주석 노드 단독 | `domToVNode(주석)` 은 `null` 을 반환한다 |
| 왕복 변환 | DOM → VNode → DOM → VNode 결과가 처음 VNode 와 같다 |
| `h()` 헬퍼 | 문자열·숫자는 텍스트 노드로, `null`/`false` 는 제거, 배열 자식은 펼친다 |

### Diff — `tests/vdom/diff.test.js`

과제의 5가지 핵심 케이스 + 엣지 케이스.

| 검증 | 내용 |
|---|---|
| 변경 없음 | 같은 트리면 패치가 없다 |
| CREATE | 새 자식이 생기면 `CREATE` 패치 |
| REMOVE | 자식이 사라지면 `REMOVE` 패치, **뒤 인덱스부터** 제거(인덱스 밀림 방지) |
| REPLACE | 태그가 다르면 `REPLACE` |
| TEXT | 텍스트가 다르면 `TEXT` |
| PROPS | 속성 추가·변경·삭제를 `set` / `remove` 로 구분 |
| 둘 다 null | 빈 패치 |
| 텍스트 ↔ 요소 | 타입이 달라 `REPLACE` |
| 깊은 path | 중첩된 노드의 변경 위치(`path`)가 정확하다 |

### Patch — `tests/vdom/patch.test.js`

| 검증 | 내용 |
|---|---|
| 결과 일치 | `이전 DOM + diff 패치` 결과가 새 HTML 을 직접 만든 것과 같다 (텍스트 변경, 속성 추가/변경/삭제, 자식 추가, 자식 여러 개 삭제, 태그 교체, 중첩 변경) |
| 최소 변경 | 바뀌지 않은 노드는 같은 DOM 인스턴스로 유지된다 (전체 재렌더가 아님) |

### Component · Hooks — `tests/core/hooks.test.js`

**useState**

| 검증 | 내용 |
|---|---|
| 상태 유지·부분 업데이트 | 함수가 매번 다시 실행되어도 상태가 유지되고, 화면은 바뀐 부분만 갱신된다 |
| 함수형 업데이트 + batching | 한 틱에 `setState` 3번 → 렌더 1번 추가, 결과 값이 올바르다 |
| 동일 값 | `Object.is` 로 같으면 리렌더하지 않는다 |
| 다중 state | 여러 `useState` 가 서로 독립적으로 유지된다 |
| 규칙 위반 | 컴포넌트 밖에서 호출하면 에러 |

**useEffect**

| 검증 | 내용 |
|---|---|
| deps 비교 | deps 가 같으면 재실행하지 않고, 바뀌면 실행한다 |
| cleanup | 재실행 전에 이전 cleanup 이 호출된다 |
| deps 없음 | 매 렌더마다 실행된다 |
| 빈 deps | 마운트 시 한 번만 실행된다 |

**useMemo**

| 검증 | 내용 |
|---|---|
| 캐싱 | deps 가 같으면 factory 를 다시 실행하지 않고, 바뀌면 재계산한다 |

## 아직 검증하지 않는 것

- Phase 1 페이지의 State History (뒤로가기 / 앞으로가기)
- 브라우저 화면 기능 테스트 (Patch 버튼, 테스트 영역 편집 등)
- 자식 컴포넌트의 Stateless 제약 (자식에서 Hook 사용 금지)

해당 기능이 구현되면 이 문서에 항목을 추가한다.
