# serialize_html

`src/serialize_html.js` — Virtual DOM을 테스트 영역(textarea)에 보여 줄 HTML 문자열로 바꾼다. 결과는 `textarea.value`에만 넣고 `innerHTML`에 직접 넣지 않는다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | 입력이 `null`, `undefined`, 문자열, 일반 객체 | `TypeError` | EC-001 Virtual DOM 노드가 아니면 TypeError | 통과 |
| EC-002 | 텍스트에 `<img onerror>` 같은 태그 문자열, `&`, nbsp | 이스케이프해서 다시 파싱해도 태그가 되지 않음 | EC-002 텍스트의 &, <, >, nbsp를 이스케이프해 innerHTML XSS를 막는다 | 통과 |
| EC-003 | attribute 값에 `"`, `&` | 이스케이프 | EC-003 attribute 값의 따옴표와 &를 이스케이프한다 | 통과 |
| EC-004 | void 요소 (`input`, `br`) | 닫는 태그 없음 | EC-004 void 요소는 닫는 태그가 없다 | 통과 |
| EC-005 | `style` 안의 `>` | 이스케이프하지 않음 (raw text) | EC-005 style 안의 텍스트는 이스케이프하지 않는다 | 통과 |
| EC-006 | 주석, 공백 텍스트 | 그대로 출력 | EC-006 주석과 공백 텍스트를 그대로 직렬화한다 | 통과 |
| EC-007 | SVG 안의 `source`처럼 HTML void 이름과 같은 요소, SVG `text` | 닫는 태그를 쓰고 텍스트는 이스케이프 | EC-007 SVG 요소는 이름이 HTML void 요소와 같아도 닫는 태그를 쓴다 | 통과 |
| EC-008 | 빈 루트 (빈 테스트 영역) | 빈 문자열 | EC-008 빈 루트는 빈 문자열이다 | 통과 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 Virtual DOM 노드가 아니면 TypeError | 입력 검증 | EC-001 |
| EC-002 텍스트의 &, <, >, nbsp를 이스케이프해 innerHTML XSS를 막는다 | 텍스트 이스케이프 | EC-002 |
| EC-003 attribute 값의 따옴표와 &를 이스케이프한다 | attribute 이스케이프 | EC-003 |
| EC-004 void 요소는 닫는 태그가 없다 | void 요소 | EC-004 |
| EC-005 style 안의 텍스트는 이스케이프하지 않는다 | raw text 요소 | EC-005 |
| EC-006 주석과 공백 텍스트를 그대로 직렬화한다 | 주석, 공백 | EC-006 |
| EC-007 SVG 요소는 이름이 HTML void 요소와 같아도 닫는 태그를 쓴다 | SVG 네임스페이스 | EC-007 |
| EC-008 빈 루트는 빈 문자열이다 | 빈 입력 | EC-008 |

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| 직렬화 → 브라우저 파싱 왕복 결과가 원래 트리와 같은지 | Node에는 HTML 파서가 없음 | 브라우저에서 `parse_html_to_virtual_tree(serialize_to_html(tree))`와 `tree`를 `is_same_tree`로 비교. 2026-11-10 수동 확인: 뒤로가기 후 수정 없이 Patch하면 "변경 사항이 없습니다"가 나옴 (왕복이 같다는 뜻) |
| `<pre>`, `<textarea>` 첫 줄바꿈 | HTML 파서는 이 요소 바로 뒤의 첫 줄바꿈을 버리므로 텍스트가 줄바꿈으로 시작하면 왕복 때 한 줄이 사라질 수 있음 | 브라우저에서 줄바꿈으로 시작하는 `<pre>` 내용으로 Patch 반복 |
