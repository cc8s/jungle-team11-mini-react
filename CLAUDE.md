# CLAUDE.md

DOM을 직접 다루는 라이브러리 프로젝트다. 아래 규칙은 모든 코드, 테스트, 문서에 적용하며, 예외가 필요하면 먼저 사용자 승인을 받는다.

**필수:** 커밋, PR, 배포 시 Claude를 작성자로 표기하지 않는다. `Co-Authored-By: Claude ...` 줄과 "Generated with Claude Code" 문구를 넣지 않는다.

## 의존성

- UI 프레임워크와 라이브러리(React, Vue, Preact, Svelte, Solid, Lit, jQuery 등) 및 그 호환 계층을 사용하지 않는다.
- 외부 패키지를 추가하지 않는다. `package.json`의 모든 의존성 항목은 비워 두고, 표준 Web API와 `node:*` 모듈만 사용한다.

## 설계

- 널리 알려진 UI 라이브러리의 구조를 그대로 따르지 않는다. 가상 DOM diff, 컴포넌트와 props/state 모델, hooks, 템플릿 컴파일러, JSX 런타임, signal/reactive API, 기존 라이프사이클 체계를 이름만 바꿔 재현하는 것도 금지한다. 단, `phase2.md`가 지정한 `FunctionComponent`, `Hook`, `State`, `props` 구조는 예외다.
- 새 공개 API나 핵심 구조를 제안할 때는 해결할 문제와 근거가 되는 DOM 동작을 함께 적는다. "다른 라이브러리가 그렇게 한다"는 근거가 될 수 없다.

## 이름 (필수)

- 프로젝트가 정의하는 **모든 이름은 소문자 `snake_case` 한 가지로만** 작성한다. 변수, 상수, 매개변수, 속성, 함수, 메서드, 클래스, 파일 이름에 모두 적용한다.
- camelCase, PascalCase, UPPER_CASE, 구분자 없는 이어 쓰기는 금지하며, 위반한 코드는 완료된 것으로 보지 않는다.
- 예외는 외부 표준이 형식을 정한 이름(`textContent`, `addEventListener`, 하이픈이 필수인 custom element 태그)과 `phase2.md`가 지정한 `FunctionComponent` 클래스뿐이다.
- 이름만 읽고 의미를 알 수 있어야 한다. 축약어와 한 글자 이름은 쓰지 않는다. (`el` → `target_element`, `cb` → `on_click_callback`, `i` → `index`)
- `data`, `info`, `value`, `temp`, `result`처럼 의미가 넓은 단어는 단독으로 쓰지 않는다.
- 불리언은 `is_`, `has_`, `can_`, `should_`로 시작하고, 컬렉션은 복수형으로 쓰며, 단위는 이름에 포함한다. (`delay_ms`)
- 이름 변경은 동작 변경과 별도 커밋으로 하고, 정의, 호출부, 테스트, 문서를 함께 고친다. 공개 API 이름 변경은 사용자에게 먼저 확인한다.

## 테스트

- 1차 검증(유닛 테스트)은 `node:test`와 `node:assert/strict`만 사용하고 `node --test`로 실행한다. Jest, Vitest, jsdom, happy-dom, Playwright 등을 테스트 코드에 쓰는 것은 금지한다.
- 2차 검증(대역으로 확인할 수 없는 미검증 항목의 실제 브라우저 확인)은 Playwright MCP로 한다. `package.json`에 추가하거나 `test/`에서 불러오지 않으며, 결과는 해당 `docs/testing/<module_name>.md`의 미검증 항목 표에 날짜, 브라우저, 확인 내용과 함께 적는다.
- DOM과 무관한 로직은 순수 함수로 분리해 테스트한다.
- DOM 코드는 `test/` 아래에 직접 작성한 대역으로 검증하며, 대역은 DOM 표준과 동일하게 동작해야 한다.
- 새 기능과 버그 수정에는 유닛 테스트를 함께 작성하고, 버그는 실패하는 테스트로 먼저 재현한다.
- 완료 보고 전에 `node --test`를 실행하고 실제 결과를 보고한다.

## 엣지 케이스와 유닛 테스트 문서화

- 모듈마다 `docs/testing/<module_name>.md`를 두고 코드와 같은 커밋에서 갱신한다. 문서화되지 않은 기능은 완료된 것으로 보지 않는다.
- 문서는 세 개의 표로 구성한다.
  - 엣지 케이스: `ID`(`EC-001`), 상황, 기대 동작, 테스트, 상태(`통과`, `실패`, `미검증`)
  - 유닛 테스트: 테스트 이름, 검증 내용, 관련 ID
  - 미검증 항목: 레이아웃, 포커스, 렌더링처럼 대역으로 확인할 수 없는 항목, 필요한 검증 방법, Playwright MCP 2차 검증 결과
- 테스트 이름에 엣지 케이스 ID를 포함해 문서와 연결한다.

기능마다 다음 엣지 케이스를 검토한다.

- 입력: `null`, `undefined`, 빈 문자열, 잘못된 타입, 요소가 아닌 노드, 반복 호출
- 환경: 분리되거나 처리 중 제거된 노드, `iframe`, Shadow DOM, SVG 네임스페이스, `document`가 없는 환경
- 변경: 순회 중 바뀌는 live 컬렉션, 콜백 재진입, `MutationObserver` 비동기 시점
- 이벤트와 정리: 처리 중 리스너 변경, 전파 중단, 리스너와 타이머 잔존, 중복 해제
- 상태와 보안: 포커스와 선택 영역 보존, attribute와 property 차이, `innerHTML` XSS, 대량 노드와 깊은 중첩
