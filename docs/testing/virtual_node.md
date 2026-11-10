# virtual_node

`src/virtual_node.js` — Virtual DOM 노드 정의, 트리 비교, DOM → Virtual DOM 변환, 안전하지 않은 요소와 attribute 걸러내기.

노드 구조 (`plan.md` 4절을 이름 규칙에 맞춰 적용):

```js
{ type: 'li', key: 'todo_a', namespace: null, attributes: { id: 'todo_a' }, children: [...] } // id가 있으면 key
{ type: '#text', key: null, text: '안녕' }      // 텍스트도 객체 (WeakMap 키로 쓰기 위해)
{ type: '#comment', key: null, text: '메모' }
{ type: '#fragment', key: null, namespace: null, attributes: {}, children: [...] } // 실제 영역 루트
```

- `plan.md`의 `props`, `value`는 각각 `attributes`, `text`로 바꿨다. 실제로 담는 것이 DOM attribute와 텍스트이고, `value`는 CLAUDE.md가 금지한 넓은 이름이다.
- 텍스트 타입을 `'TEXT'`가 아니라 DOM `nodeName`과 같은 `'#text'`로 했다. SVG에 `<text>` 요소가 있어서 태그 이름과 겹치지 않게 하려는 것이다.
- 모든 노드와 `attributes`, `children`은 `Object.freeze`로 동결한다. 공유 노드는 수정하지 않는다는 불변성 조건을 코드로 강제한다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | `element_type`이 `null`, `undefined`, 빈 문자열, 숫자, `#`로 시작 | `TypeError` | EC-001 잘못된 element_type이면 TypeError | 통과 |
| EC-002 | `id` 있음 / 빈 `id` / `id` 없음 | `id`가 key, 빈 값과 없음은 `null` | EC-002 id attribute가 key가 되고 빈 id는 key가 아니다 | 통과 |
| EC-003 | 만든 노드를 수정하려 함 | 동결되어 `TypeError` | EC-003 노드, attributes, children은 동결되어 수정할 수 없다 | 통과 |
| EC-004 | attribute 이름이 `__proto__` | prototype 없는 객체에 일반 값으로 저장 | EC-004 "__proto__" 이름의 attribute도 일반 값으로 저장된다 | 통과 |
| EC-005 | HTML / SVG 네임스페이스 | HTML은 `null`, SVG는 URI 유지 | EC-005 HTML 네임스페이스는 null로 정규화되고 SVG 네임스페이스는 유지된다 | 통과 |
| EC-006 | 구조 비교, attribute 순서 차이, 네임스페이스 차이, `null` | 값 비교, 순서 무시, 네임스페이스 다르면 다름 | EC-006 is_same_tree는 구조와 값으로 비교하고 attribute 순서는 무시한다 | 통과 |
| EC-007 | 변환 입력이 `null`, `undefined`, 일반 객체, 문자열 | `TypeError` | EC-007 create_virtual_node_from_dom에 노드가 아닌 값을 넣으면 TypeError | 통과 |
| EC-008 | 공백 텍스트, 주석이 섞인 요소 | 공백과 주석까지 그대로 변환 | EC-008 요소, 텍스트, 주석, 공백 텍스트를 그대로 변환한다 | 통과 |
| EC-009 | `script`(SVG 포함), `base`, `meta`, `object`, `embed` | 변환에서 제외 (실제 영역에서 실행 방지) | EC-009 script, base, meta, object, embed 요소는 변환에서 제외한다 (SVG script 포함) | 통과 |
| EC-010 | `on*`, `srcdoc`, `javascript:`(대소문자, 공백, 탭 포함) URL | 해당 attribute만 제거, 안전한 값은 유지 | EC-010 이벤트 핸들러, srcdoc, javascript: URL attribute는 제거하고 안전한 값은 남긴다 | 통과 |
| EC-011 | SVG 요소 (`linearGradient`, `viewBox`) | 네임스페이스와 대소문자 보존 | EC-011 SVG 요소는 네임스페이스와 대소문자를 보존한다 | 통과 |
| EC-012 | 요소나 텍스트가 아닌 노드 (processing instruction) | `null`, children에서 빠짐 | EC-012 지원하지 않는 노드(processing instruction)는 null이고 children에서 빠진다 | 통과 |
| EC-013 | `<template>` 요소 | `content`의 자식을 읽음 | EC-013 template 요소는 content의 자식을 읽는다 | 통과 |
| EC-014 | 1000단계 중첩, 형제 5000개 | 스택 넘침 없이 변환 | EC-014 깊은 중첩(1000단계)과 대량 형제 노드(5000개)를 변환한다 | 통과 |
| EC-015 | 컨테이너 변환, 컨테이너가 `null` | 내용만 `#fragment`로, `null`이면 `TypeError` | EC-015 create_root_from_container는 컨테이너의 내용만 #fragment로 만든다 | 통과 |
| EC-016 | children에 노드가 아닌 값, 배열이 아닌 children, 객체가 아닌 attributes | `TypeError` | EC-016 children에 Virtual DOM 노드가 아닌 값이 있으면 TypeError | 통과 |
| EC-017 | 문서에서 분리된 노드 | 정상 변환 | EC-017 문서에 붙지 않은(분리된) 노드도 변환된다 | 통과 |
| EC-018 | 변환 중 live `childNodes`가 바뀜 | 먼저 `Array.from`으로 복사하고 순회 | (코드 구조로 보장, 변환 중 DOM을 바꾸는 경로가 없음) | 미검증 |
| EC-019 | 중첩이 약 1500단계를 넘음 | 재귀 구현이라 `RangeError`가 날 수 있음. 브라우저 HTML 파서가 중첩을 512단계로 제한하므로 테스트 영역 입력으로는 생기지 않음 | 없음 (알려진 한계) | 미검증 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 잘못된 element_type이면 TypeError | 잘못된 태그 이름 거부 | EC-001 |
| EC-002 id attribute가 key가 되고 빈 id는 key가 아니다 | key 결정 규칙 | EC-002 |
| EC-003 노드, attributes, children은 동결되어 수정할 수 없다 | 불변성 | EC-003 |
| EC-004 "__proto__" 이름의 attribute도 일반 값으로 저장된다 | prototype 오염 방지 | EC-004 |
| EC-005 HTML 네임스페이스는 null로 정규화되고 SVG 네임스페이스는 유지된다 | 네임스페이스 정규화 | EC-005 |
| EC-006 is_same_tree는 구조와 값으로 비교하고 attribute 순서는 무시한다 | 트리 동등성 | EC-006 |
| EC-007 create_virtual_node_from_dom에 노드가 아닌 값을 넣으면 TypeError | 입력 검증 | EC-007 |
| EC-008 요소, 텍스트, 주석, 공백 텍스트를 그대로 변환한다 | 기본 변환 | EC-008 |
| EC-009 script, base, meta, object, embed 요소는 변환에서 제외한다 (SVG script 포함) | 위험 요소 제거 | EC-009 |
| EC-010 이벤트 핸들러, srcdoc, javascript: URL attribute는 제거하고 안전한 값은 남긴다 | XSS attribute 제거 | EC-010 |
| EC-011 SVG 요소는 네임스페이스와 대소문자를 보존한다 | SVG 네임스페이스 | EC-011 |
| EC-012 지원하지 않는 노드(processing instruction)는 null이고 children에서 빠진다 | 미지원 노드 | EC-012 |
| EC-013 template 요소는 content의 자식을 읽는다 | template | EC-013 |
| EC-014 깊은 중첩(1000단계)과 대량 형제 노드(5000개)를 변환한다 | 대량 노드, 깊은 중첩 | EC-014 |
| EC-015 create_root_from_container는 컨테이너의 내용만 #fragment로 만든다 | 루트 변환 | EC-015 |
| EC-016 children에 Virtual DOM 노드가 아닌 값이 있으면 TypeError | 입력 검증 | EC-016 |
| EC-017 문서에 붙지 않은(분리된) 노드도 변환된다 | 분리된 노드 | EC-017 |

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| 실제 브라우저 DOM의 `attributes`(NamedNodeMap), `localName`, `namespaceURI` 값 | 테스트 대역은 표준을 흉내 낼 뿐 실제 구현이 아님 | 브라우저에서 페이지를 열어 초기 변환 결과(현재 Virtual DOM 패널)를 확인. 2026-11-10 Chrome 계열 브라우저 패널에서 수동 확인 |
| `iframe` 안 문서의 노드 변환 | 대역에 다른 문서(realm)를 만들지 않음 | 같은 출처 iframe의 `contentDocument` 노드를 넣어 브라우저에서 확인 |
| Shadow DOM | `childNodes`는 shadow root를 포함하지 않으므로 shadow 트리는 변환되지 않음 (의도된 동작) | shadow root가 붙은 요소로 브라우저 확인 |
| 네임스페이스가 있는 attribute (`xlink:href`) | 이름 문자열로만 저장하고 `setAttribute`로 다시 만들므로 네임스페이스는 사라짐 | SVG `use`에 `xlink:href`를 넣어 브라우저에서 렌더링 확인 |
