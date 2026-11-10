# view_builder

`src/view_builder.js` — 컴포넌트가 화면 모양(Virtual DOM)을 만들 때 쓰는 도우미와 이벤트 핸들러 저장소.

```js
create_view_element('button', {
  attributes: { class: 'primary', disabled: false },   // null·undefined·false는 없음, true는 빈 값
  event_handlers: { click: (dispatched_event, handled_dom_node) => {} },
  namespace: null,                                      // SVG면 'http://www.w3.org/2000/svg'
}, ['저장', count, is_dirty && '*', [other_node]]);     // 문자열·숫자는 텍스트, 배열은 펼침, null·불리언은 건너뜀
```

설계 근거:

- **해결할 문제:** 컴포넌트는 클릭 같은 이벤트로 State를 바꿔야 하는데, Virtual DOM 노드는 동결된 순수 데이터이고 attribute는 문자열만 담는다. 또 `on*` attribute 문자열은 실제 DOM에서 코드로 실행되므로 막혀 있다.
- **방법:** 핸들러를 노드 안에 넣지 않고 노드 밖 `WeakMap`(노드 → 핸들러)에 둔다. `plan.md` 1절의 "vnode는 순수 데이터, 연결 정보는 vnode 밖"과 같은 원칙이다. 노드 모양과 diff는 바뀌지 않고, 노드가 버려지면 핸들러도 함께 수거된다.
- **근거가 되는 DOM 동작:** 이벤트는 대상에서 조상으로 버블링하므로 컨테이너 하나의 리스너로 모든 자손의 이벤트를 받을 수 있다. 대상 DOM에서 `__virtual_node` 북마크로 노드를, 노드에서 `WeakMap`으로 핸들러를 바로 찾는다(`function_component.md` 참고).
- 같은 노드 객체가 트리 두 곳에 있으면 북마크 `WeakMap`이 DOM 하나만 가리킬 수 있어 patch가 틀어진다. `create_view_root`가 이를 오류로 막는다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | children에 문자열, 숫자, 빈 문자열, `null`, `undefined`, 불리언, 중첩 배열, `#fragment` | 텍스트 노드로 바꾸고 펼치며 비어 있는 값은 건너뜀 | EC-001 문자열·숫자는 텍스트 노드, 배열과 #fragment는 펼치고 null·undefined·불리언은 건너뛴다 | 통과 |
| EC-002 | children에 일반 객체, 함수, `Symbol` | `TypeError` | EC-002 그릴 수 없는 값(일반 객체, 함수, Symbol)은 TypeError | 통과 |
| EC-003 | attribute 값이 `null`, `undefined`, `false`, `true`, 숫자, 이름이 `__proto__` | 없음 / 빈 값 / 문자열, prototype 없는 객체에 저장 | EC-003 attribute: null·undefined·false는 없음, true는 빈 값, 숫자는 문자열, "__proto__"도 일반 값 | 통과 |
| EC-004 | attribute에 함수 | `TypeError` (event_handlers 안내) | EC-004 attribute에 함수를 넣으면 TypeError (event_handlers로 안내) | 통과 |
| EC-005 | `on*` 문자열, `srcdoc`, 대소문자·탭 섞인 `javascript:` URL, 텍스트 안의 HTML | attribute는 만들지 않고, 텍스트는 텍스트 노드로만 (`innerHTML` XSS 없음) | EC-005 on* 문자열, srcdoc, javascript: URL attribute는 만들지 않는다 (innerHTML XSS 방지) | 통과 |
| EC-006 | `script`(대문자 포함), `base`, `object`, 잘못된 element_type | `TypeError` | EC-006 script 등 막힌 요소와 잘못된 element_type은 TypeError | 통과 |
| EC-007 | view_options, attributes, event_handlers가 객체가 아님 | `TypeError` | EC-007 view_options와 attributes, event_handlers가 객체가 아니면 TypeError | 통과 |
| EC-008 | 핸들러 등록 | 노드 밖 저장, 노드는 동결되고 모양이 그대로, 핸들러만 다른 노드는 `is_same_tree` | EC-008 이벤트 핸들러는 노드 밖에 저장되고 노드는 동결된 순수 데이터로 남는다 | 통과 |
| EC-009 | 핸들러가 함수가 아님, `onClick`·빈 이름, 핸들러가 `null` | `TypeError`, `null`은 없는 것 | EC-009 핸들러가 함수가 아니면 TypeError, null 핸들러는 없는 것, 잘못된 이벤트 이름은 TypeError | 통과 |
| EC-010 | `find_event_handler`에 노드가 아닌 값 | `null` | EC-010 find_event_handler에 노드가 아닌 값을 넣으면 null | 통과 |
| EC-011 | 트리 여러 곳의 핸들러 | 이벤트 이름을 중복 없이 수집 | EC-011 collect_event_types는 트리 전체의 이벤트 이름을 중복 없이 모은다 | 통과 |
| EC-012 | 같은 요소·텍스트 노드 객체를 두 곳에 넣음 | `TypeError` | EC-012 create_view_root는 같은 노드 객체가 두 곳에 있으면 TypeError | 통과 |
| EC-013 | SVG 요소 | `namespace` 옵션 유지, `viewBox` 대소문자 보존 | EC-013 SVG 네임스페이스는 namespace 옵션으로 지정한다 | 통과 |
| EC-014 | 10000단계 중첩 배열, 형제 5000개 | 반복문이라 스택 넘침 없음 | EC-014 깊게 중첩된 배열(10000단계)과 대량 형제(5000개)도 스택 넘침 없이 펼친다 | 통과 |
| EC-015 | 노드 수 세기: 루트 `#fragment`, 빈 루트, 단독 노드, `null` | 루트는 빼고 요소·텍스트를 셈, 단독 노드는 자신 포함, `null`은 0 | EC-015 count_view_nodes는 루트 #fragment를 빼고 요소·텍스트 노드를 모두 센다 | 통과 |
| EC-016 | `create_view_element` 중첩 깊이 | 노드 생성은 렌더 함수의 호출 깊이를 따르므로 이 모듈의 한계가 아님. patch는 `patch.md` EC-015 참고 | 없음 | 미검증 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 문자열·숫자는 텍스트 노드, 배열과 #fragment는 펼치고 null·undefined·불리언은 건너뛴다 | children 정규화 | EC-001 |
| EC-002 그릴 수 없는 값(일반 객체, 함수, Symbol)은 TypeError | 잘못된 타입 | EC-002 |
| EC-003 attribute: null·undefined·false는 없음, true는 빈 값, 숫자는 문자열, "__proto__"도 일반 값 | attribute 정규화 | EC-003 |
| EC-004 attribute에 함수를 넣으면 TypeError (event_handlers로 안내) | 잘못된 attribute | EC-004 |
| EC-005 on* 문자열, srcdoc, javascript: URL attribute는 만들지 않는다 (innerHTML XSS 방지) | 보안 | EC-005 |
| EC-006 script 등 막힌 요소와 잘못된 element_type은 TypeError | 보안, 입력 검증 | EC-006 |
| EC-007 view_options와 attributes, event_handlers가 객체가 아니면 TypeError | 입력 검증 | EC-007 |
| EC-008 이벤트 핸들러는 노드 밖에 저장되고 노드는 동결된 순수 데이터로 남는다 | 핸들러 저장 위치, 불변성 | EC-008 |
| EC-009 핸들러가 함수가 아니면 TypeError, null 핸들러는 없는 것, 잘못된 이벤트 이름은 TypeError | 핸들러 검증 | EC-009 |
| EC-010 find_event_handler에 노드가 아닌 값을 넣으면 null | 요소가 아닌 입력 | EC-010 |
| EC-011 collect_event_types는 트리 전체의 이벤트 이름을 중복 없이 모은다 | 위임 리스너 대상 수집 | EC-011 |
| EC-012 create_view_root는 같은 노드 객체가 두 곳에 있으면 TypeError | 북마크 충돌 방지 | EC-012 |
| EC-013 SVG 네임스페이스는 namespace 옵션으로 지정한다 | SVG 네임스페이스 | EC-013 |
| EC-014 깊게 중첩된 배열(10000단계)과 대량 형제(5000개)도 스택 넘침 없이 펼친다 | 깊은 중첩, 대량 노드 | EC-014 |
| EC-015 count_view_nodes는 루트 #fragment를 빼고 요소·텍스트 노드를 모두 센다 | 노드 수 (Phase 2 기록 카드의 "전체 노드 N개") | EC-015 |

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| 실제 브라우저에서 막힌 attribute가 빠진 채 그려지는지 | 대역은 렌더링하지 않음 | 브라우저 개발자 도구 Elements 패널에서 attribute 확인 |
