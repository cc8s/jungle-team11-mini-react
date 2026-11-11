# function_component

`src/function_component.js` — `phase2.md`의 `FunctionComponent` 클래스와 Hook(`use_state`, `use_effect`, `use_memo`), 자식 컴포넌트 호출 도우미 `render_child_component`.

```js
import { FunctionComponent, use_state, render_child_component } from './function_component.js';
import { create_view_element } from './view_builder.js';

// 자식: State 없이 props만 받는 순수 함수
function count_label(props) {
  return create_view_element('span', null, [`count: ${props.count}`]);
}

// 루트: State를 가지고 자식에게 props로 내려 준다 (Lifting State Up)
function counter_root() {
  const [count, set_count] = use_state(0);
  return create_view_element('div', null, [
    render_child_component(count_label, { count }),
    create_view_element('button', { event_handlers: { click: () => set_count(count + 1) } }, ['+1']),
  ]);
}

new FunctionComponent(counter_root, document.querySelector('#counter')).mount();
```

## 구조

| 멤버 | 역할 |
| --- | --- |
| `hooks` | 상태 저장용 배열. 렌더링마다 0번부터 호출 순서대로 `{ hook_kind, ... }` 칸을 꺼낸다 |
| `mount()` | 처음 렌더링: 렌더 함수 실행 → `mount_tree` → 위임 리스너 연결 → effect 실행 |
| `update()` | 다시 렌더링: hook 위치 0 → 렌더 함수 → `diff_trees` → `apply_operations`(북마크 갱신 포함) → 위임 리스너 정리 → effect 실행. 적용한 연산 목록을 돌려준다 |
| `unmount()` | effect 정리 함수, 위임 리스너, DOM과 북마크 정리 |
| `component_options.on_rendered` | mount와 update가 patch를 마친 직후(effect 전)에 `{ render_count, operations, changed_records }`를 알려 준다 |

- **on_rendered가 필요한 이유:** State 변경으로 생기는 update는 microtask에서 실행되어 돌려받을 호출자가 없다. 그래서 화면 쪽(Phase 2 페이지의 하이라이트와 변경 기록)은 무엇이 바뀌었는지 이 콜백으로 받는다. `changed_records`는 `apply_operations`가 연산마다 실제로 바꾼 DOM 노드다.

- **이름:** CLAUDE.md의 `snake_case` 규칙에 따라 Hook 이름은 `use_state`, `use_effect`, `use_memo`다. 클래스 이름 `FunctionComponent`만 `phase2.md` 지정 예외다.
- **State 변경 → 자동 갱신:** `set_state`는 값을 바로 바꾸고 `queueMicrotask`로 `update()`를 한 번 예약한다. 같은 작업(이벤트 핸들러 하나 등)의 여러 변경은 한 번의 update로 묶인다. `Object.is`로 같은 값이면 예약하지 않는다. 사용자 코드가 `update()`를 부를 필요가 없다.
- **루트에서만 Hook:** Hook은 렌더링 중인 루트 컴포넌트에서만 쓸 수 있다. 자식은 `render_child_component`로 부르며, 그 안의 Hook 호출은 오류다. props는 얕게 복사해 동결한다.
- **이벤트 위임:** 핸들러는 노드 밖 `WeakMap`에 있다(`view_builder.md`). 컨테이너에 이벤트 이름마다 리스너 하나를 붙이고, 대상 DOM부터 컨테이너 직전까지 `__virtual_node` → 핸들러를 찾아 버블링 순서로 부른다. patch의 `BIND`가 북마크를 새 노드로 옮기므로 항상 마지막 렌더링의 핸들러(최신 State를 본 클로저)가 불린다. DOM 요소마다 리스너를 붙였다 떼는 일이 없어 patch는 바뀌지 않는다.
- **버블링하지 않는 이벤트**(`focus`, `blur`, `mouseenter` 등)는 DOM 표준상 조상에서 bubble 단계로 받을 수 없으므로 컨테이너의 capture 단계에서 받고, 대상의 핸들러만 부른다.
- **effect 순서:** 실행할 effect의 이전 정리 함수를 모두 먼저 부르고, 그다음 effect를 hook 순서대로 부른다. 의존성은 effect가 실제로 실행될 때 저장하므로 렌더링이 실패하면 다음 렌더링에서 다시 실행 대상이 된다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | 렌더 함수가 함수가 아님, 컨테이너가 `null`·일반 객체·텍스트 노드·`document`, props가 `null`·문자열·배열 | `TypeError` | EC-001 렌더 함수, 컨테이너, props가 잘못되면 TypeError | 통과 |
| EC-002 | `document`가 없는 환경 | mount가 `TypeError` | EC-002 document가 없는 환경이면 mount가 TypeError | 통과 |
| EC-003 | 첫 렌더링, 컨테이너에 기존 내용 있음 | 기존 내용을 비우고 그림, `hooks`에 State 저장, 북마크 연결 | EC-003 mount()는 첫 화면을 그리고 hooks 배열에 State를 저장하며 북마크를 연결한다 | 통과 |
| EC-004 | `mount()` 반복 호출, unmount 뒤 mount | 오류 | EC-004 mount() 반복 호출과 unmount 뒤 mount는 오류 | 통과 |
| EC-005 | 이벤트로 State 변경 | microtask 뒤 자동 갱신, DOM 노드 재사용 | EC-005 State가 바뀌면 update()를 직접 부르지 않아도 화면이 다시 그려지고 DOM 노드는 재사용된다 | 통과 |
| EC-006 | 한 작업에서 State 변경 세 번 (갱신 함수) | update 한 번, 값은 누적 | EC-006 한 작업 안의 여러 State 변경은 update 한 번으로 묶이고, 갱신 함수는 순서대로 누적된다 | 통과 |
| EC-007 | 같은 값, `NaN` → `NaN` | 다시 그리지 않음, `set_state`가 `false` | EC-007 같은 값(Object.is, NaN 포함)으로 State를 바꾸면 다시 그리지 않는다 | 통과 |
| EC-008 | 자식 컴포넌트에서 Hook, 렌더링 밖에서 Hook | 오류, DOM은 그대로 | EC-008 자식 컴포넌트 안의 Hook과 렌더링 밖의 Hook 호출은 오류 | 통과 |
| EC-009 | 같은 props로 자식 두 번 호출, 자식이 props 수정, props가 `null`, 자식이 `undefined` 반환 | 같은 트리, 수정은 `TypeError`, 나머지 `TypeError` | EC-009 자식 컴포넌트는 같은 props에 같은 결과를 돌려주고 props를 고칠 수 없다 | 통과 |
| EC-010 | 조건문으로 Hook 개수가 늘거나 줄거나 종류가 바뀜 | update 오류, 이전 화면 유지, 고친 뒤 정상 | EC-010 조건문으로 Hook 개수나 종류가 바뀌면 update가 오류이고 이전 화면은 유지된다 | 통과 |
| EC-011 | 렌더링 중 State 변경·`update()`·`unmount()`, Hook 콜백(`use_memo`, `use_state` 초기화 함수) 안의 Hook (재진입) | 오류 | EC-011 렌더링 중 State 변경과 update(), 다른 Hook 콜백 안의 Hook은 오류 | 통과 |
| EC-012 | effect 실행 시점, `[]`, 의존성 변경, 의존성 생략 | patch 뒤 실행(DOM 반영 확인), 정리 → 재실행 순서 | EC-012 use_effect는 patch 뒤에 실행되고, 의존성이 바뀔 때만 이전 정리 함수 다음에 다시 실행된다 | 통과 |
| EC-013 | unmount: 정리 함수, 리스너 잔존, 중복 해제, 이후 State 변경, mount 전 unmount | 정리 함수 1회, 리스너 없음, 반복은 `false`, State 변경 무시 | EC-013 unmount는 정리 함수를 실행하고 리스너와 DOM을 지우며, 반복 호출과 이후 State 변경은 무시된다 | 통과 |
| EC-014 | effect가 Promise 반환(async), Hook 인자가 잘못된 타입 | `TypeError` | EC-014 effect가 함수가 아닌 값을 돌려주거나 Hook 인자가 잘못되면 TypeError | 통과 |
| EC-015 | effect 안에서 State 변경 | 다음 update 예약, `[]` 의존성이라 반복 멈춤 | EC-015 effect 안의 State 변경은 다음 update를 예약하고 의존성으로 반복이 멈춘다 | 통과 |
| EC-016 | `use_memo` 의존성 변경·무관한 State 변경·`NaN` 의존성 | 의존성이 바뀔 때만 계산 | EC-016 use_memo는 의존성이 바뀔 때만 다시 계산한다 (NaN 의존성 포함) | 통과 |
| EC-017 | 버튼 안 `span` 클릭, update 뒤 클릭 | 버튼 핸들러 호출, 최신 State를 본 핸들러 | EC-017 이벤트 위임: 자식 노드 클릭도 핸들러에 닿고, update 뒤에는 최신 핸들러가 불린다 | 통과 |
| EC-018 | 안쪽 핸들러가 `stopPropagation()` (전파 중단) | 바깥 핸들러 호출 안 됨 | EC-018 stopPropagation()을 부르면 바깥 핸들러는 불리지 않는다 | 통과 |
| EC-019 | 버블링하지 않는 `focus` | capture로 받아 대상 핸들러만 | EC-019 버블링하지 않는 이벤트(focus)는 capture 단계로 받아 대상의 핸들러만 부른다 | 통과 |
| EC-020 | 입력 중인 `input` (attribute와 property 차이) | update 뒤 같은 DOM, `value` property 유지 | EC-020 update 뒤에도 입력 중인 input DOM과 property 값이 유지된다 | 통과 |
| EC-021 | update 중 렌더 함수 예외 | 이전 화면 유지, 그 렌더링의 effect 미실행, 다음 update 정상 | EC-021 update 중 렌더 함수가 실패하면 이전 화면과 effect가 그대로이고 다음 update는 정상이다 | 통과 |
| EC-022 | effect 안에서 unmount (콜백 재진입) | 그 effect의 정리 함수는 즉시 실행, 남은 effect 미실행 | EC-022 effect 안에서 unmount하면 그 effect의 정리 함수는 바로 실행되고 남은 effect는 실행되지 않는다 | 통과 |
| EC-023 | 정리 함수 하나가 예외 | 나머지 정리와 DOM 정리 후 첫 오류를 던짐 | EC-023 정리 함수 하나가 실패해도 나머지 정리와 DOM 정리를 끝낸 뒤 오류를 던진다 | 통과 |
| EC-024 | 렌더 함수가 `undefined`·`null` 반환, 같은 노드를 두 곳에 | `undefined`와 중복은 `TypeError`, `null`은 빈 화면 | EC-024 렌더 함수가 undefined를 돌려주거나 같은 노드를 두 곳에 넣으면 TypeError | 통과 |
| EC-025 | `use_memo`로 같은 하위 트리 재사용, 바뀌지 않은 화면 update | 같은 참조는 diff 생략, DOM 변경 연산 없음(`BIND`만) | EC-025 use_memo로 다시 쓴 같은 하위 트리는 diff가 건너뛰고, 바뀌지 않은 화면은 DOM 변경 연산이 없다 | 통과 |
| EC-026 | mount 전 `update()`, 예약 후 직접 `update()` | 오류, 예약된 update는 중복 실행 안 됨 | EC-026 mount 전 update()는 오류이고, 직접 부른 update()는 예약된 update를 대신한다 | 통과 |
| EC-027 | 렌더링마다 핸들러 이벤트 종류가 바뀜 | 안 쓰는 위임 리스너는 떼고 새 것은 붙임 | EC-027 핸들러가 사라지면 위임 리스너를 떼고, 새 이벤트가 생기면 붙인다 | 통과 |
| EC-028 | SVG 자식 컴포넌트 | 네임스페이스와 `viewBox` 유지 | EC-028 SVG 자식 컴포넌트도 네임스페이스를 유지해 그린다 | 통과 |
| EC-029 | key 있는 1000개 목록 뒤집기 (대량 노드) | DOM 노드 재사용 | EC-029 key(id)가 있는 1000개 목록을 뒤집어도 DOM 노드를 재사용한다 | 통과 |
| EC-030 | 대역의 이벤트 전파 순서, 전파 중 리스너 제거 | capture → target → bubble, 제거된 리스너 미호출 | EC-030 대역 확인: dispatchEvent는 capture → target → bubble 순서이고 전파 중 제거된 리스너는 불리지 않는다 | 통과 |
| EC-031 | effect 하나가 예외 | 오류를 던지고 그 뒤 effect는 이번에 실행되지 않으며 다음 update에서 실행됨. 예외 난 effect는 의존성이 이미 저장되어 다시 실행되지 않음 | EC-031 effect 하나가 실패하면 뒤의 effect는 이번에 실행되지 않고 다음 update에서 실행된다 | 통과 |
| EC-032 | microtask로 예약된 update에서 렌더 함수 예외 | 호출한 코드가 없으므로 전역 오류(브라우저 `error` 이벤트, Node `uncaughtException`)로 보고됨 | 없음 (2026-11-11 앱 내장 브라우저(Chrome 156): `set_state`를 부른 코드에는 예외가 오지 않고, 전역 `error` 이벤트로 `Uncaught Error: 렌더 실패 시험`이 보고됨. DOM은 이전 결과 그대로) | 통과 |
| EC-033 | 자식에 넘긴 props 안의 객체 수정 | 얕은 동결이라 막지 못함. 자식은 props를 읽기만 해야 함 | 없음 (알려진 한계, 2026-11-11 앱 내장 브라우저(Chrome 156): 자식이 `props.settings.theme`을 바꾸자 부모 쪽 객체도 바뀜) | 통과 |
| EC-034 | 자식 컴포넌트를 `render_child_component` 없이 직접 호출 | 자식 안의 Hook이 루트의 칸을 차지해 오류로 막지 못함 | 없음 (알려진 한계, 2026-11-11 앱 내장 브라우저(Chrome 156): 자식을 직접 부르면 오류 없이 그려지고 루트 hooks가 2칸이 됨) | 통과 |
| EC-035 | 핸들러가 capture로 받는 이벤트(`focus` 등)에서 `stopPropagation()` | 컨테이너 capture 단계에서 멈추므로 대상 요소에 직접 붙인 다른 리스너도 불리지 않음 | 없음 (알려진 한계, 2026-11-11 앱 내장 브라우저(Chrome 156): `focus`는 컨테이너 capture로 등록되고, 핸들러가 `stopPropagation()`하면 input에 직접 붙인 리스너는 불리지 않음) | 통과 |
| EC-036 | `on_rendered` 호출 시점과 내용, 함수가 아닌 `on_rendered`, `null` 옵션 | mount·update마다 patch 직후 effect보다 먼저, 연산과 바뀐 DOM 전달. 잘못된 옵션은 `TypeError` | EC-036 on_rendered는 mount와 update의 patch 직후 연산과 바뀐 DOM을 알려 주고, 잘못된 옵션은 TypeError | 통과 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 렌더 함수, 컨테이너, props가 잘못되면 TypeError | 입력 검증 | EC-001 |
| EC-002 document가 없는 환경이면 mount가 TypeError | document 없는 환경 | EC-002 |
| EC-003 mount()는 첫 화면을 그리고 hooks 배열에 State를 저장하며 북마크를 연결한다 | mount, hooks 배열 | EC-003 |
| EC-004 mount() 반복 호출과 unmount 뒤 mount는 오류 | 반복 호출 | EC-004 |
| EC-005 State가 바뀌면 update()를 직접 부르지 않아도 화면이 다시 그려지고 DOM 노드는 재사용된다 | 자동 갱신, 최소 DOM 변경 | EC-005 |
| EC-006 한 작업 안의 여러 State 변경은 update 한 번으로 묶이고, 갱신 함수는 순서대로 누적된다 | batching | EC-006 |
| EC-007 같은 값(Object.is, NaN 포함)으로 State를 바꾸면 다시 그리지 않는다 | 불필요한 렌더링 방지 | EC-007 |
| EC-008 자식 컴포넌트 안의 Hook과 렌더링 밖의 Hook 호출은 오류 | 루트에서만 Hook | EC-008 |
| EC-009 자식 컴포넌트는 같은 props에 같은 결과를 돌려주고 props를 고칠 수 없다 | 순수 함수 자식 | EC-009 |
| EC-010 조건문으로 Hook 개수나 종류가 바뀌면 update가 오류이고 이전 화면은 유지된다 | Hook 순서 | EC-010 |
| EC-011 렌더링 중 State 변경과 update(), 다른 Hook 콜백 안의 Hook은 오류 | 재진입 | EC-011 |
| EC-012 use_effect는 patch 뒤에 실행되고, 의존성이 바뀔 때만 이전 정리 함수 다음에 다시 실행된다 | use_effect | EC-012 |
| EC-013 unmount는 정리 함수를 실행하고 리스너와 DOM을 지우며, 반복 호출과 이후 State 변경은 무시된다 | 정리, 리스너 잔존, 중복 해제 | EC-013 |
| EC-014 effect가 함수가 아닌 값을 돌려주거나 Hook 인자가 잘못되면 TypeError | 잘못된 타입 | EC-014 |
| EC-015 effect 안의 State 변경은 다음 update를 예약하고 의존성으로 반복이 멈춘다 | effect와 State | EC-015 |
| EC-016 use_memo는 의존성이 바뀔 때만 다시 계산한다 (NaN 의존성 포함) | use_memo | EC-016 |
| EC-017 이벤트 위임: 자식 노드 클릭도 핸들러에 닿고, update 뒤에는 최신 핸들러가 불린다 | 이벤트 위임, 최신 핸들러 | EC-017 |
| EC-018 stopPropagation()을 부르면 바깥 핸들러는 불리지 않는다 | 전파 중단 | EC-018 |
| EC-019 버블링하지 않는 이벤트(focus)는 capture 단계로 받아 대상의 핸들러만 부른다 | 버블링하지 않는 이벤트 | EC-019 |
| EC-020 update 뒤에도 입력 중인 input DOM과 property 값이 유지된다 | attribute와 property 차이 | EC-020 |
| EC-021 update 중 렌더 함수가 실패하면 이전 화면과 effect가 그대로이고 다음 update는 정상이다 | 렌더링 실패 복구 | EC-021 |
| EC-022 effect 안에서 unmount하면 그 effect의 정리 함수는 바로 실행되고 남은 effect는 실행되지 않는다 | 콜백 재진입 | EC-022 |
| EC-023 정리 함수 하나가 실패해도 나머지 정리와 DOM 정리를 끝낸 뒤 오류를 던진다 | 정리 실패 | EC-023 |
| EC-024 렌더 함수가 undefined를 돌려주거나 같은 노드를 두 곳에 넣으면 TypeError | 렌더 결과 검증 | EC-024 |
| EC-025 use_memo로 다시 쓴 같은 하위 트리는 diff가 건너뛰고, 바뀌지 않은 화면은 DOM 변경 연산이 없다 | 노드 공유와 diff 생략 | EC-025 |
| EC-026 mount 전 update()는 오류이고, 직접 부른 update()는 예약된 update를 대신한다 | update 호출 시점 | EC-026 |
| EC-027 핸들러가 사라지면 위임 리스너를 떼고, 새 이벤트가 생기면 붙인다 | 리스너 동기화 | EC-027 |
| EC-028 SVG 자식 컴포넌트도 네임스페이스를 유지해 그린다 | SVG 네임스페이스 | EC-028 |
| EC-029 key(id)가 있는 1000개 목록을 뒤집어도 DOM 노드를 재사용한다 | 대량 노드 | EC-029 |
| EC-030 대역 확인: dispatchEvent는 capture → target → bubble 순서이고 전파 중 제거된 리스너는 불리지 않는다 | 대역이 DOM 표준대로 동작 | EC-030 |
| EC-031 effect 하나가 실패하면 뒤의 effect는 이번에 실행되지 않고 다음 update에서 실행된다 | effect 실패 | EC-031 |
| EC-036 on_rendered는 mount와 update의 patch 직후 연산과 바뀐 DOM을 알려 주고, 잘못된 옵션은 TypeError | 렌더링 결과 알림 | EC-036 |

## 미검증 항목

| 항목 | 이유 | 검증 방법과 결과 |
| --- | --- | --- |
| 포커스와 선택 영역 보존 | 대역에 포커스와 선택 영역 개념이 없음 | 2026-11-11 앱 내장 브라우저(Chrome 156)에서 실제 키 입력으로 확인: 입력할 때마다 State가 바뀌어 다시 그려져도 같은 input DOM, 포커스 유지, `shift+←` 선택 [1, 2] 뒤 X 입력 → `aXcd`, 커서 2 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: Playwright 키보드로 `abcd`에서 `shift+←`로 [1, 2] 선택 뒤 X 입력 → 같은 input DOM, 포커스 유지, `aXcd`, 커서 [2, 2]. 이어서 `yz` 입력도 `aXyzcd`로 반영 |
| 실제 이벤트 전파 (`click`, `input`, `focus`, `submit`의 기본 동작) | 대역은 사용자 입력과 기본 동작을 흉내 내지 않음 | 2026-11-11 앱 내장 브라우저(Chrome 156)에서 확인: 실제 클릭 2번 → `클릭 2`, input에서 Enter → submit 핸들러 1번, `preventDefault`로 페이지 이동 없음, 실제 타이핑 → input 핸들러로 State 반영 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 실제 클릭 2번 → `클릭 2`, input에서 Enter → submit 핸들러 1번, URL 그대로, 타이핑 → input 핸들러로 State 반영 |
| Shadow DOM 안의 컨테이너 | Shadow 경계를 넘으면 `event.target`이 host로 바뀜(retargeting). 대역에 없음 | 2026-11-11 앱 내장 브라우저(Chrome 156)에서 확인: shadow root 안의 컨테이너에서 버튼 안 `b`를 클릭하면 핸들러가 받는 target은 shadow 안의 실제 `b`, 처리 노드는 버튼, 문서 수준 리스너에는 host로 보임. State 갱신 정상 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: shadow 안 버튼의 `b` 클릭 → 핸들러 target `b`, 처리 노드 `button`, 문서 리스너에는 host, State 갱신(`shadow 1`) |
| `iframe` 안의 컨테이너 | 다른 `document`의 노드를 만들어야 함 | 2026-11-11 앱 내장 브라우저(Chrome 156)에서 확인: iframe 문서의 요소에 mount하면 노드가 iframe 문서와 그 realm의 `HTMLElement`로 만들어지고, 클릭으로 State 갱신 정상 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: iframe 문서 요소에 mount → 노드 `ownerDocument`가 iframe 문서, iframe realm `HTMLElement`의 인스턴스(바깥 realm은 아님), 클릭으로 `frame 1` |
| `MutationObserver` 콜백 시점 | 대역에 없음 | 2026-11-11 앱 내장 브라우저(Chrome 156)에서 확인: 클릭 직후 동기 코드에서는 DOM이 그대로(`count 0`), 클릭 뒤 예약한 microtask에서는 이미 갱신(`count 1`, update microtask가 먼저 예약됨), observer는 그 뒤 기록 1개로 한 번 불림 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 스크립트 `click()`은 기존 결과와 같음: 직후 동기 코드 `count 1`(그대로), 예약한 microtask에서 `count 2`, observer는 기록 1개로 한 번. 실제 마우스 클릭(Playwright)은 리스너마다 microtask checkpoint가 돌아서, 컨테이너 위임 리스너 다음에 불리는 문서 리스너에서 이미 갱신된 DOM(`count 1`)이 보이고 observer도 그 전에 한 번 불림. 사용자 입력과 스크립트 dispatch의 차이이며 DOM 표준 동작 |
| 렌더링 결과 레이아웃 | 대역은 렌더링하지 않음 | 브라우저 화면 확인 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: form·input·p·button, shadow 안 버튼, iframe 안 버튼을 한 화면에 mount해 스크린샷으로 확인. 모두 그려지고 상태 갱신 뒤 글자(`aXyzcd`, `클릭 2`, `shadow 1`, `frame 1`, `count 1`)가 화면에 반영 |
