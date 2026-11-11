# Phase 2: Component 구현

이 문서의 모든 항목은 필수이며, 구현 시 무조건 따른다.

## 기술 스택 / 제한

- `HTML`, `CSS`, `JavaScript` (또는 `TypeScript`) — Vanilla
- 외부 프레임워크(`React`, `Vue` 등) 사용 금지

## FunctionComponent 클래스

함수형 컴포넌트를 감싸는 `FunctionComponent` 클래스를 직접 구현한다. 이 클래스는 다음을 반드시 가진다.

| 멤버         | 역할                     |
| ------------ | ------------------------ |
| `hooks` 배열 | 상태 저장용              |
| `mount()`    | 처음 렌더링              |
| `update()`   | 상태 변경 후 다시 렌더링 |

## 제약조건

- `Hook`은 최상위 컴포넌트에서만 사용할 수 있다.
- `State`(상태)는 최상위 컴포넌트(루트 컴포넌트)에서만 관리한다.
- 자식 컴포넌트는 `state`를 가지지 않고, 부모로부터 전달받은 `props`만 사용한다. (`Lifting State Up` 패턴)
  - 즉, 자식 컴포넌트는 상태 없이(`Stateless`) `props`만 받아서 사용하는 순수 함수로 구현한다.
- `State`가 바뀌면 화면이 자동으로 다시 그려져야 한다.
  - 상태 변경 후 사용자 코드가 `update()`를 직접 호출하지 않아도 된다.

## 완료 기준

- [ ] `FunctionComponent`가 함수형 컴포넌트를 감싸고 `hooks`, `mount()`, `update()`를 제공한다.
- [ ] `mount()`로 첫 화면이 렌더링된다.
- [ ] 루트 컴포넌트의 `State`가 바뀌면 `update()`를 통해 화면이 자동으로 갱신된다.
- [ ] 자식 컴포넌트에 `Hook`과 `State` 사용이 없다.
- [ ] 자식 컴포넌트는 같은 `props`에 대해 항상 같은 결과를 반환한다.

## CLAUDE.md와의 관계

- 이 문서에서 지정한 `FunctionComponent`, `Hook`, `State`, `props` 구조는 사용자가 지정한 요구사항이므로 `CLAUDE.md`의 이름·설계 규칙보다 우선한다.
- 그 외 이름, 의존성, 테스트, 엣지 케이스 문서화는 `CLAUDE.md`를 따른다.
