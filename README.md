<div align="center">

<img src="docs/images/title.png" alt="Mini React — Krafton Jungle WEEK11-12 Team 11 @cc8s · @bloro-sh" width="100%" />

</div>

[**핵심 차별점**](#핵심-차별점-양방향-북마크-bidirectional-bookmark) · [**아키텍처**](#아키텍처) · [**Phase 1**](#phase-1--virtual-dom--diff--patch) · [**Phase 2**](#phase-2--component--state--hooks) · [**사용법**](#사용법) · [**React와 비교**](#react와-비교) · [**AI 활용**](#ai-활용-방식)

**외부 의존성 없는 경량 Virtual DOM 라이브러리입니다.**
불변 Virtual DOM 노드와 실제 DOM이 서로를 직접 참조하는 '양방향 북마크'로, 수정할 DOM과 이벤트 대상 노드를 트리 순회 없이 찾습니다.
곡 500개 기준 이벤트 핸들러 탐색은 위치 기반 방식보다 12배 빠르고(9.6ms → 0.8ms), 작은 변경은 React 18과 같이 다음 프레임 안에 반영됩니다.

## 핵심 차별점: 양방향 북마크 (Bidirectional Bookmark)

### 설계 배경: 인덱스 북마크를 붙이는 습관에서 착안했습니다

평소 책을 읽을 때, 나중에 다시 빠르게 찾아보기 위해 인덱스 북마크를 붙이곤 합니다.
실제 DOM에 변경을 반영할 때도 비슷한 과정이 필요합니다.
Diff는 무엇이 바뀌었는지 알려 주지만, 그 노드가 실제 DOM의 어디에 있는지는 알려 주지 않습니다.
이벤트가 발생하면 반대로 대상 DOM이 어느 Virtual DOM 노드인지 찾아야 합니다.
위치(index) 기반 방식은 두 경우 모두 트리를 따라 대상을 찾습니다.

> "책에 북마크를 붙이듯, 대상 DOM을 찾는 과정도 단번에 펴볼 수 있게 만들 수 없을까?"

평소의 이 독서 습관에서 영감을 얻어, 탐색 과정 없이 객체를 즉시 찾아가는 '양방향 북마크'를 기획했습니다.
북마크는 Diff 결과를 실제 DOM에 반영하는 Patch 단계에서 관리합니다.

### 구조

> 바뀐 부분만 고치는 건 모든 Virtual DOM이 같습니다. 저희는 고칠 노드를 **위치가 아니라 객체로** 찾습니다.
> 그래서 양방향 조회가 한 번에 끝납니다.

<p align="center">
  <img src="docs/images/bookmark.png" width="100%" alt="Virtual DOM 노드에서 실제 DOM 노드로는 WeakMap이, 실제 DOM 노드에서 Virtual DOM 노드로는 __virtual_node가 서로를 가리키는 양방향 북마크 구조" />
</p>

|                                 | 위치 기반 방식 (비교용)                                                                                    | 양방향 북마크                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| diff가 넘기는 대상              | 경로 `[0, 2, 1]`                                                                                           | 이전 트리의 노드 객체                               |
| **patch** (Virtual DOM → DOM)   | 루트부터 `childNodes[index]`를 따라 깊이만큼 내려감                                                        | `WeakMap.get(노드)` 한 번                           |
| **이벤트** (DOM → Virtual DOM)  | `parentNode`를 타고 루트까지 올라가며 층마다 몇 번째 형제인지 센 뒤, 그 경로로 Virtual DOM을 다시 내려감 | `dom.__virtual_node` 한 번                          |
| 외부 노드가 끼어들면            | 인덱스가 밀려 다른 노드를 고침                                                                             | 영향 없음 ([검증](#외부-dom-조작에-대한-안정성))    |

Virtual DOM 노드는 불변 데이터로 두고, DOM 참조는 노드 밖(`WeakMap`, `__virtual_node`)에 저장합니다.
DOM 참조를 노드 안에 쓰면 mount·patch 때마다 노드를 수정해야 하고, 이력에 남은 노드도 이미 지워진 DOM을 계속 붙잡게 됩니다.
참조를 노드 밖에 두었기 때문에 노드는 순수 데이터로 남고, [State History](#phase-1--virtual-dom--diff--patch)의 여러 시점이 바뀌지 않은 노드를 그대로 공유할 수 있습니다.

```
  diff 결과:  { kind: 'TEXT', old_node: ●, text: '운동하기' }
                                        │
                                        ▼  WeakMap.get(●)
  patch:      '장보기' 텍스트 DOM  →  .data = '운동하기'
```

<details>
<summary><b>북마크가 바뀌는 시점</b> — <a href="src/patch.js"><code>patch.js</code></a>에서만 바뀝니다</summary>

| 시점                    | 연산                             | 북마크 처리                                  |
| ----------------------- | -------------------------------- | -------------------------------------------- |
| 초기 렌더링             | `mount_tree` → `create_dom_tree` | 생성한 DOM마다 양방향 바인딩                 |
| 재사용된 노드           | (연산 없음)                      | 유지                                         |
| 짝지어진 새 노드 객체   | `BIND`                           | DOM 유지, 바인딩만 새 노드로 이전 (내용 변경 여부와 무관) |
| 내용이 변경된 노드      | `BIND` 뒤 `TEXT` `ATTRIBUTES` `MOVE` | 이전 노드로 DOM을 조회해 수정            |
| 새 노드                 | `ADD` `REPLACE`                  | DOM 생성과 동시에 바인딩                     |
| 제거된 노드             | `REMOVE` `REPLACE`               | 하위 트리 전체 언바인딩 (`unbind_subtree`)   |
| 정리                    | `unmount_tree`                   | 컨테이너까지 전체 언바인딩                   |

- 변경 없는 노드의 DOM은 수정하지 않습니다. 따라서 입력 중인 값과 포커스가 보존됩니다.
- 같은 노드 객체를 트리 두 곳에 배치하면 렌더링 단계에서 오류를 냅니다. 북마크가 DOM 하나만 가리킬 수 있기 때문입니다.

</details>

### 외부 DOM 조작에 대한 안정성

브라우저 확장 프로그램 등 외부 스크립트가 노드를 삽입하면, 위치 기반 탐색은 인덱스가 어긋나 의도하지 않은 노드를 수정합니다.
Phase 2 곡 목록 맨 앞에 외부 노드 1개를 삽입한 상태에서 검증한 결과입니다.

| 동작              | 북마크                        | 위치 기반 탐색 (비교용)                         |
| ----------------- | ----------------------------- | ----------------------------------------------- |
| song_2 즐겨찾기   | song_2만 변경 (정상)          | song_3의 핸들러가 호출되고 다른 곡의 DOM을 수정 |
| song_2 아래로 이동 | song_1, song_3, song_2 (정상) | 다른 곡의 핸들러가 호출되어 순서가 바뀌지 않음  |

**한계:** 단, 외부 스크립트(Extension 등)가 관리 대상 DOM을 직접 조작(삭제·이동)하는 예외 상황까지는 방어하지 않습니다.

### 노드 재사용: 북마크 효과를 위한 전제

**문제:** 초기 구현은 즐겨찾기 토글 같은 작은 변경 하나가 화면에 반영되기까지 약 6프레임(103ms)이 걸렸습니다.

**원인:** 북마크는 노드 객체에 바인딩됩니다.
그런데 렌더링마다 모든 노드를 새 객체로 생성했습니다.
새 객체에는 북마크가 없으므로, diff가 변경 없는 노드마다 `BIND` 연산을 생성했습니다.
곡 500개에서 즐겨찾기 토글 1회에 연산 14,836개 중 14,834개가 `BIND`였습니다.

**해결:** 변경 없는 하위 트리의 노드 객체를 다음 렌더링에서 재사용합니다.
노드는 불변 객체이므로, 같은 객체라면 내용과 북마크가 모두 유효합니다.

- diff는 `old === new` 참조 비교 한 번으로 하위 트리 전체를 건너뜁니다.
- 재사용된 행에는 `BIND` 연산이 생성되지 않습니다. 남는 `BIND`는 바뀐 행과 그 조상 노드의 것입니다.
- 노드에 바인딩된 이벤트 핸들러가 유지됩니다.

| 곡 500개, 즐겨찾기 토글 | 재사용 전          | 재사용 후             |
| ----------------------- | ------------------ | --------------------- |
| 연산 수                 | 14,836             | 88                    |
| `BIND`                  | 14,834             | 86                    |
| 실제 DOM 변경           | 동일               | 동일                  |
| 화면 반영 시간          | 약 103ms (6프레임) | 약 16ms (다음 프레임) |

**구현:** [`song_board.js`](src/song_board.js)의 `render_cached_song_row`는 곡 객체와 행 조건이 같으면 이전 행 노드를 반환합니다.
재사용된 행은 최초 생성 시점의 핸들러를 유지합니다.
따라서 핸들러는 클로저에 캡처된 State 대신 updater 함수(`set_songs((current_songs) => ...)`)로 최신 State를 계산합니다.

### 성능 검증: 북마크 적용 전후

두 버전 모두 노드 재사용을 적용했습니다.
비교 버전은 [구조](#구조) 표의 위치 기반 방식입니다.

| 곡 500개                         | 북마크 적용    | 위치 기반 | 판정                                 |
| -------------------------------- | -------------- | --------- | ------------------------------------ |
| 이벤트 200회 핸들러 탐색         | 0.8ms          | 9.6ms     | **북마크 12배 빠름** (곡 200개는 6배) |
| 작은 변경 patch (토글, 이동 등)  | 0.1~0.5ms      | 0.1~0.3ms | 비슷함                               |
| 즐겨찾기 토글 연산 수            | 88개 (BIND 86) | 2개       | 연산 수 차이 대비 시간 차이는 작음   |
| 즐겨찾기 필터 전환 patch         | 151.6ms        | 9.6ms     | 북마크가 느림                        |
| 전체 필터 전환 patch             | 249.4ms        | 198.1ms   | 북마크가 느림                        |
| 초기 렌더링 (mount)              | 약 660ms       | 약 499ms  | 북마크가 느림                        |

- **이벤트 탐색:** 북마크가 12배 빠릅니다. 목록이 길수록 격차가 커집니다.
- **작은 변경:** 두 방식이 비슷합니다. 노드 재사용으로 변경 대상이 소수이기 때문입니다.
- **대량 변경:** 북마크가 느립니다. 수백 개 행을 삭제·생성할 때 바인딩·언바인딩 비용이 노드 수에 비례합니다. 개선 과제입니다.

## 아키텍처

<p align="center">
  <img src="docs/images/architecture.png" width="100%" alt="Phase 1의 테스트 영역 HTML과 Phase 2의 set_state가 새 Virtual DOM으로 모이고, 이전 Virtual DOM과 diff_trees로 비교한 연산 목록을 apply_operations가 실제 DOM에 반영하며 양방향 북마크를 갱신하는 구조" />
</p>

| 모듈                                                 | 역할                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| [`virtual_node.js`](src/virtual_node.js)             | 노드 정의, 실제 DOM → Virtual DOM 변환, 위험 요소·attribute 제거         |
| [`parse_html.js`](src/parse_html.js)                 | HTML 문자열 → Virtual DOM 변환 (`<template>` 사용, 스크립트 실행 없음)   |
| [`diff.js`](src/diff.js)                             | 두 트리를 비교해 연산 목록 생성, 변경 없는 노드 공유                     |
| [`patch.js`](src/patch.js)                           | 연산을 실제 DOM에 적용, 양방향 북마크 관리                               |
| [`state_history.js`](src/state_history.js)           | 뒤로·앞으로 이동, 분기 이후 이력 폐기 (최대 50개)                        |
| [`operation_summary.js`](src/operation_summary.js)   | 연산 목록 요약 (예: `2개 변경 반영 (TEXT 1, ADD 1)`)                     |
| [`function_component.js`](src/function_component.js) | `FunctionComponent`와 Hooks                                              |
| [`view_builder.js`](src/view_builder.js)             | `create_view_element`, 이벤트 핸들러 저장                                |
| [`song_board.js`](src/song_board.js)                 | Phase 2 예제 앱 (최애곡 모음)                                            |

## 구현

### Phase 1 — Virtual DOM · Diff · Patch

<p align="center">
  <img src="docs/images/phase1.gif" width="100%" alt="테스트 영역의 HTML을 고치고 Patch하면 실제 영역에 바뀐 부분만 반영되고, State History에 확정 기록이 쌓이는 화면" />
  <br />
  <sub>테스트 영역의 HTML을 수정하고 <b>Patch</b>하면 변경된 노드만 실제 영역에 반영되고 하이라이트됩니다. State History로 이전·이후 상태로 이동합니다.</sub>
</p>

- **노드 구조:** `Object.freeze`로 동결한 불변 객체입니다. `id` attribute를 key로 사용합니다. 텍스트 노드도 객체로 표현합니다. `WeakMap`은 객체만 키로 받기 때문입니다.

  ```js
  { type: 'li',    key: 'a',  attributes: { id: 'a' }, children: [...], namespace: null }
  { type: '#text', key: null, text: '안녕' }
  ```

- **자식 노드 매칭:** ① key(`id`) 일치 → ② 내용 완전 일치 → ③ 남은 노드는 위치 순으로 매칭합니다. ② 단계 덕분에 공백 텍스트 노드 하나가 추가되어도 뒤쪽 노드 전체가 변경으로 판정되지 않습니다.
- **입력 정제 (Sanitization):** `script`, `base`, `meta`, `object`, `embed` 요소를 변환 단계에서 제거합니다. `on*`·`srcdoc` attribute와 `javascript:`·`vbscript:`·`data:text/html` URL도 제거합니다. SVG `animate`·`set`으로 `href`를 바꾸는 요소도 막습니다.
- **State History:** 브라우저 히스토리처럼 뒤로·앞으로 이동합니다. 이전 시점에서 새로 Patch하면 이후 이력을 폐기합니다(v1 → v2 → v3에서 v2로 이동 후 수정하면 v1 → v2 → v4). 변경 없는 노드는 이전 트리와 객체를 공유합니다. 최대 50개까지 보관합니다.

#### Diff 연산

과제의 기본 5가지 케이스(`ADD`, `REMOVE`, `REPLACE`, `TEXT`, `PROPS`)에 `MOVE`와 `BIND`를 추가해 7가지 연산을 정의했습니다.

| 연산                   | Phase 2 예제 앱의 발생 시점                       |
| ---------------------- | ------------------------------------------------- |
| `ADD`                  | 곡 추가                                           |
| `REMOVE`               | 곡 삭제                                           |
| `REPLACE`              | 수정 시작·종료, 메인곡 없음 ↔ 있음                |
| `TEXT`                 | 곡 정보 수정, 메인곡 변경                         |
| `PROPS` (`ATTRIBUTES`) | 즐겨찾기 토글                                     |
| `MOVE` (추가)          | 순서 변경 (같은 `id`의 노드를 삭제 없이 이동)     |
| `BIND` (추가)          | DOM 변경 없음. 새 노드 객체로 북마크만 이전       |

### Phase 2 — Component · State · Hooks

최애곡 모음 앱은 과제의 5가지 diff 케이스가 모두 발생하도록 설계한 예제입니다.

<p align="center">
  <img src="docs/images/phase2.gif" width="100%" alt="FunctionComponent로 만든 최애곡 모음 앱에서 곡을 추가하면 화면이 자동으로 다시 그려지는 화면" />
  <br />
  <sub><code>FunctionComponent</code>로 구현한 최애곡 모음 앱입니다. <code>set_state</code>를 호출하면 화면이 자동으로 다시 렌더링되고, 변경된 노드가 하이라이트됩니다.</sub>
</p>

- **Lifting State Up:** State는 루트 컴포넌트에서만 관리합니다. 자식 컴포넌트는 `render_child_component`로 호출하는 순수 함수입니다. `props`는 동결해 전달합니다.
- **이벤트 위임 (Event Delegation):** 리스너는 개별 노드가 아니라 컨테이너에, 이벤트 종류마다 1개씩 등록합니다. 버블링하지 않는 이벤트는 capture 단계에 등록합니다. 핸들러는 `이벤트 대상 DOM → __virtual_node → 핸들러` 순서로 조회합니다.
- **노드 재사용:** 변경 없는 곡 행은 이전 노드 객체를 그대로 사용합니다. ([노드 재사용](#노드-재사용-북마크-효과를-위한-전제))

## 사용법

```js
import {
  FunctionComponent,
  use_state,
  use_effect,
  render_child_component,
} from "./src/function_component.js";
import { create_view_element as element } from "./src/view_builder.js";

// 자식: State 없이 props만 받는 순수 함수
function counter_label(props) {
  return element("p", null, [`눌린 횟수: ${props.count}`]);
}

// 루트: Hook과 State는 루트에서만 사용
function counter_root() {
  const [count, set_count] = use_state(0);

  use_effect(() => {
    document.title = `count ${count}`;
  }, [count]);

  return element("section", null, [
    render_child_component(counter_label, { count }),
    element(
      "button",
      {
        attributes: { type: "button" },
        event_handlers: {
          click: () => set_count((previous_count) => previous_count + 1),
        },
      },
      ["+1"],
    ),
  ]);
}

new FunctionComponent(counter_root, document.querySelector("#app")).mount();
```

<details>
<summary><b>create_view_element 규칙</b></summary>

`create_view_element(태그, { attributes, event_handlers, namespace }, 자식들)`

- 자식에는 문자열·숫자(텍스트 노드), 노드, 배열(평탄화), `#fragment`(자식만 펼침)를 전달할 수 있습니다. `null`·`undefined`·`true`·`false`는 무시합니다.
- attribute 값이 `true`면 빈 불리언 attribute를 생성합니다. `false`·`null`이면 생성하지 않습니다.
- 이벤트 핸들러는 노드 외부 `WeakMap`에 저장합니다. 따라서 diff 대상이 아닙니다.

</details>

## 테스트

```bash
npm test
```

| 구분          | 내용                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------- |
| 유닛 테스트   | `node:test` + `node:assert/strict`, 15개 모듈 · **215개 통과**                                |
| DOM 테스트 더블 | jsdom 없이 직접 구현한 [`test/support/fake_dom.js`](test/support/fake_dom.js)               |
| 엣지 케이스   | 모듈별 [`docs/testing/<모듈>.md`](docs/testing)에 엣지 케이스 · 유닛 테스트 · 미검증 항목 기록 |

<details>
<summary><b>검토한 엣지 케이스</b></summary>

- `id` 누락 · 중복 · 변경, 들여쓰기 공백 · 주석만 변경된 경우
- 첫 상태에서 뒤로 가기, 이전 시점에서 수정 없이 Patch
- `<script>`, `onclick`, `javascript:` URL, SVG `animate`를 이용한 `href` 변조 (XSS)
- SVG · MathML 네임스페이스, 깊은 중첩, 대량 노드
- 렌더링 중 `set_state`, 조건문 안의 Hook, effect 안의 `unmount()`
- 테스트 영역에 공백을 입력했다가 지우면 변경 사항이 없으므로 Patch 버튼이 비활성화됨
- 한글 IME 조합 중 Enter 입력 시 마지막 글자 누락이나 곡 중복 추가가 발생하지 않음
- 주석 내부 공백, 이모지, 태그 사이 공백만 변경한 Patch는 "화면 변화 없음"으로 기록되고 하이라이트되지 않음
- `<pre>` 내부 공백과 nbsp 변경은 화면에 보이는 변경으로 처리함
- 수정 중인 곡이 필터로 숨겨지면 수정을 취소함 (이전에는 다시 표시될 때 원래 값의 폼이 복원되어 입력이 유실됨)
- 하이라이트가 배경색이 있는 요소(검정 "메인" 버튼 등)의 색과 글자를 가리지 않음
- 낮은 창 높이(1440×660)에서도 본문에 스크롤바가 생기지 않음

</details>

## React와 비교

| 항목             | React                                        | Mini React                                                    |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------- |
| 변경 없는 부분   | `React.memo` 등으로 컴포넌트 렌더링 생략     | 같은 노드 객체를 반환하면 diff와 `BIND` 모두 생략             |
| 이전 상태 보관   | 기본 기능 없음                               | 공유 노드를 State History에 보관, 이전 상태로도 diff로 이동   |
| 뷰 작성 방식     | JSX                                          | `create_view_element` 함수 호출                               |
| State 위치       | 모든 컴포넌트                                | 루트 컴포넌트만 (자식은 props만 사용)                         |
| Diff 범위        | setState한 컴포넌트의 서브트리               | 루트부터 (재사용된 노드는 생략)                               |
| key              | `key` prop                                   | `id` attribute                                                |
| 의존성           | `react`, `react-dom`                         | 없음                                                          |

### 장점

- **추적 가능한 실행 흐름:** 핵심 코드가 수백 줄 단위입니다. `set_state`부터 실제 DOM 변경까지 한 번에 따라갈 수 있습니다.
- **상태 이력 내장:** State History가 기본 제공됩니다. 북마크를 노드 밖에 두어 노드가 불변으로 남기 때문에, 여러 시점이 바뀌지 않은 노드를 공유합니다. ([구조](#구조))
- **예측 가능한 실행:** `set_state`는 마이크로태스크(`queueMicrotask`)로 update를 한 번 예약하고, 같은 작업 안의 여러 변경을 묶습니다. 예약된 update는 diff부터 patch까지 중단 없이 한 번에 끝납니다. Hook 순서 위반과 자식 컴포넌트의 Hook 호출은 즉시 오류를 냅니다.

### 단점

- **루트 집중 State:** 과제 제약(Lifting State Up)으로 State가 루트에만 있어, 상태가 많아지면 루트가 비대해지고 props 전달이 깊어집니다.
- **렌더링 비용:** 작은 변경도 루트부터 다시 만들고 비교하며, 재사용 캐시는 앱 코드에서 직접 작성해야 합니다. ([노드 재사용](#노드-재사용-북마크-효과를-위한-전제) · [성능 비교](#성능-비교))
- **`id` 기반 key:** `id`가 없는 목록은 순서가 바뀌면 `MOVE` 대신 `TEXT`, `REPLACE`로 처리될 수 있습니다.

### 성능 비교

**결론: 이벤트 핸들러 탐색은 북마크 덕분에 위치 기반 방식보다 빠르게 나왔습니다. React와 비교하면 작은 변경은 체감 차이 없이 바로 화면에 반영되지만, 많은 행을 다시 그리는 대량 변경에서는 React보다 느립니다.**

React 18 production 빌드와 같은 동작, 같은 DOM 조건에서 비교했습니다.

- **작은 변경:** 두 구현 모두 클릭 다음 프레임(60Hz 화면이 한 번 새로 그려지는 간격, 약 16.7ms)에 화면에 반영됩니다. 실제 DOM 변경 횟수도 거의 같습니다.
- **대량 변경:** 필터 전환이나 초기 렌더링처럼 많은 행을 다시 그리면 JS 실행이 더 오래 걸립니다(곡 500개 전체 필터 후 화면 반영: React 165.0ms, Mini React 205.5ms).
- **원인:** 노드 생성 시 보안 검사와 동결, 재사용된 부분까지 도는 전체 순회, 대량 변경 시 북마크 바인딩·언바인딩 비용입니다. 북마크에서 오는 비용은 마지막 하나입니다.

<details>
<summary><b>측정 조건과 상세 결과</b></summary>

**측정 조건:**
- Phase 2 페이지의 곡을 200개·500개로 늘려 측정했습니다.
- 비교 대상은 React 18 production 빌드입니다. 번들러 없이 빌드 파일을 바로 불러올 수 있는 최신 버전입니다.
- 측정 전에 두 구현이 같은 동작에서 같은 DOM을 생성하는지 확인했습니다.
- 환경은 macOS · Chrome 156입니다. 시간은 환경에 따라 달라지는 참고값입니다.

**JS 실행 시간** (두 구현 모두 재사용 적용: `React.memo` / 행 노드 재사용)

| 곡 200개            | React.memo | Mini React | 배수  |
| ------------------- | ---------- | ---------- | ----- |
| 즐겨찾기 토글       | 1.5ms      | 6.1ms      | 4.1배 |
| 메인곡 지정         | 1.3ms      | 3.7ms      | 2.8배 |
| 아래로 이동         | 0.8ms      | 4.2ms      | 5.3배 |
| 수정 시작           | 2.2ms      | 4.3ms      | 2.0배 |
| 첫 곡 삭제          | 1.6ms      | 3.7ms      | 2.3배 |
| 곡 추가             | 4.5ms      | 4.6ms      | 1.0배 |
| 즐겨찾기 필터       | 47.3ms     | 201.8ms    | 4.3배 |
| 전체 필터           | 150.4ms    | 190.2ms    | 1.3배 |
| 초기 렌더링 (mount) | 149.8ms    | 249.2ms    | 1.7배 |

전체 순회는 `create_view_root`의 중복 노드 검사와 `collect_event_types`의 이벤트 종류 수집입니다. 북마크 자체의 효과는 같은 조건의 위치 기반 버전과 비교한 [성능 검증](#성능-검증-북마크-적용-전후)에 있습니다.

**개선 과제:** 재사용된 하위 트리는 이전 렌더링에서 이미 검사했으므로, 전체 순회에서 건너뛰면 순회 비용을 줄일 수 있을 것으로 봅니다.

**브라우저 렌더링**

| 곡 500개                       | React          | Mini React       |
| ------------------------------ | -------------- | ---------------- |
| 실제 DOM 변경 횟수 (작은 변경) | 거의 동일      | 거의 동일        |
| 초기 렌더링 레이아웃 시간      | 116.0ms        | 107.8ms          |
| 토글 후 화면 반영 시간         | 15.6ms (memo)  | 16.0ms (재사용)  |
| 전체 필터 후 화면 반영 시간    | 165.0ms (memo) | 205.5ms (재사용) |

브라우저 작업(DOM 변경, 레이아웃)은 두 구현이 같고, 차이는 JS 실행 시간에서만 발생합니다.

</details>

## AI 활용 방식

- **설계 주도:** 과제 요구사항([`phase2.md`](phase2.md)), 설계([`plan.md`](plan.md), [`design.md`](design.md)), 차별화 아이디어(양방향 북마크)는 팀이 결정했습니다.
- **규칙 문서화:** [`CLAUDE.md`](CLAUDE.md)에 의존성 금지, `node:test` 전용, 엣지 케이스 문서화 등의 규칙을 정의했습니다. 모든 작업에 이 규칙을 적용했습니다.
- **일관된 코딩 규칙:** 더 나은 유지보수를 위해 모든 이름을 소문자 `snake_case`로 통일했습니다(`use_state`, `set_state`, `create_view_element`). 축약어 금지, 불리언 `is_`·`has_` 접두사 등 명명 규칙도 정의했습니다.
- **테스트 우선 (TDD):** 버그는 실패하는 테스트로 먼저 재현했습니다. Red 단계 실패 기록은 [`docs/troubleshooting`](docs/troubleshooting)에 남겼습니다.
- **엣지 케이스 검토:** 입력 · 환경 · 변경 · 이벤트 · 보안 체크리스트로 기능별 엣지 케이스를 도출했습니다. 각 케이스는 `EC-001` 형식 ID로 테스트와 연결했습니다.

| 단계  | 방법                                                   | 검증 대상                                                                                                     |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1단계 | DOM 테스트 더블 기반 유닛 테스트 (`node:test`)         | 연산, 북마크, Hook 규칙, 엣지 케이스                                                                          |
| 2단계 | 실제 페이지에서 수동 조작                              | 화면 동작, 하이라이트, 한글 입력, 레이아웃                                                                    |
| 3단계 | Playwright MCP를 연결한 AI의 실제 브라우저 재검증      | 테스트 더블로 확인할 수 없는 레이아웃 · 포커스 · 렌더링 (결과는 [`docs/testing`](docs/testing)의 미검증 항목 표) |

<!-- TODO: 팀에서 AI를 어떻게 나눠 썼는지, 잘 됐던 점 / 직접 고쳐야 했던 점을 추가 -->
