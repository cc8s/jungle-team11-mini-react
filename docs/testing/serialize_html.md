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
| EC-009 | `pre`, `textarea`, `listing`의 텍스트가 줄바꿈으로 시작 (`<pre>\n\n둘째`를 파싱하면 텍스트는 `\n둘째`) | 여는 태그 뒤에 줄바꿈을 하나 더 쓴다. HTML 파서가 여는 태그 바로 뒤 줄바꿈 하나를 버리기 때문. 수정 전에는 왕복할 때마다 한 줄씩 사라졌다. 자식이 요소이거나 HTML이 아닌 요소면 쓰지 않음 | EC-009 pre, textarea, listing의 텍스트가 줄바꿈으로 시작하면 파서가 버릴 줄바꿈을 하나 더 쓴다 | 통과 |
| EC-010 | `noscript` 안의 텍스트 `<img onerror>` | 이스케이프한다. 테스트 영역은 `<template>`(script가 꺼진 inert 문서)으로 파싱해 `noscript` 안을 일반 요소와 텍스트로 읽기 때문. 수정 전에는 raw text로 보고 그대로 써서, 텍스트가 다시 파싱될 때 요소가 됐다(이스케이프 우회) | EC-010 noscript 안의 텍스트는 이스케이프한다 (inert 파싱은 script가 꺼져 있어 일반 요소로 읽는다) | 통과 |
| EC-011 | `plaintext` 요소 (조상 안에 있을 때 포함) | 자신과 조상의 닫는 태그를 쓰지 않는다. `plaintext`는 문서 끝까지 이어지므로 닫는 태그가 텍스트에 붙는다. 수정 전에는 왕복할 때마다 `</plaintext>`가 하나씩 늘었다 | EC-011 plaintext 요소는 문서 끝까지 이어지므로 자신과 조상의 닫는 태그를 쓰지 않는다 | 통과 |
| EC-012 | 파서가 HTML로 다시 쓸 수 없는 DOM을 만든 경우: 중첩된 `<a>`(`<a><table><a>`), 중첩된 `<form>`(`<form><div></form><form>`) | 첫 왕복에서 트리가 바뀌고(바깥 `a`가 비고 안쪽 `a`가 형제로, 안쪽 `form`이 사라짐) 그 뒤로는 바뀌지 않는다. HTML 문법으로 표현할 수 없는 구조라 직렬화로 고칠 수 없다 (알려진 한계) | 없음 (Node에 HTML 파서가 없음, 브라우저에서 확인) | 통과 |

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
| EC-009 pre, textarea, listing의 텍스트가 줄바꿈으로 시작하면 파서가 버릴 줄바꿈을 하나 더 쓴다 | 첫 줄바꿈 보존 | EC-009 |
| EC-010 noscript 안의 텍스트는 이스케이프한다 (inert 파싱은 script가 꺼져 있어 일반 요소로 읽는다) | 이스케이프 우회 방지 | EC-010 |
| EC-011 plaintext 요소는 문서 끝까지 이어지므로 자신과 조상의 닫는 태그를 쓰지 않는다 | plaintext 왕복 안정 | EC-011 |

## 미검증 항목

| 항목 | 이유 | 검증 방법과 결과 |
| --- | --- | --- |
| 직렬화 → 브라우저 파싱 왕복 결과가 원래 트리와 같은지 | Node에는 HTML 파서가 없음 | 2026-11-11 Chrome 156에서 `parse_html_to_virtual_tree(serialize_to_html(tree))`와 `tree`를 `is_same_tree`로 3번 연속 비교. 26가지 입력(페이지 기본 샘플, raw text 요소, `textarea`·`title` 엔티티, nbsp, attribute 엔티티, SVG `style`·`text`·`foreignObject`, MathML, table foster parenting, `template`, 주석, CRLF, `select`, 닫히지 않은 `p` 등) 중 수정 전 4가지가 달랐다. EC-009 ~ EC-011을 고친 뒤 남은 차이는 EC-012의 2가지뿐이고, 그것도 첫 왕복 뒤에는 바뀌지 않음 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 20가지 입력(페이지 샘플, `pre`·`textarea`·`listing` 줄바꿈, raw text, 엔티티, nbsp, SVG `style`·`text`·`foreignObject`, MathML, foster parenting, `template`, 주석, CRLF, `select`, 닫히지 않은 `p`, 중첩 `a`·`form`)을 3번 왕복. 중첩 `a`·`form` 2가지만 첫 왕복에서 다르고 그 뒤로는 같음, 나머지 18가지는 모두 같음 |
| `<pre>`, `<textarea>` 첫 줄바꿈 | HTML 파서는 이 요소 바로 뒤의 첫 줄바꿈을 버림 | 해결함 (EC-009). 위 브라우저 왕복에서 `pre`·`textarea`·`listing`의 줄바꿈 두 개로 시작하는 내용, 줄바꿈만 있는 내용 모두 3번 왕복해도 같음 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: `pre`·`textarea`·`listing`의 줄바꿈 두 개로 시작하는 내용과 줄바꿈만 있는 `pre` 모두 3번 왕복해도 같음 |
| 실제 화면에서 뒤로가기 후 수정 없이 Patch | 왕복 결과가 화면 동작으로 이어지는지 | 화면에서는 이 상황이 생기지 않는다. 테스트 영역 내용이 마지막으로 그린 HTML과 같으면 Patch 버튼이 꺼지므로(`app.md` EC-001, 고쳤다가 되돌린 경우 포함) 수정 없는 Patch는 할 수 없다. 2026-11-11 앱 내장 브라우저에서 확인: v2에서 뒤로가기 후 스페이스를 쳤다 지우면 Patch는 꺼지고 앞으로가기는 켜진 채. 왕복 자체가 같은지는 위 행의 브라우저 비교로 확인함 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: v2에서 뒤로가기 후 스페이스 입력 → Patch 켜짐, 지우면 Patch 꺼지고 앞으로가기는 켜진 채(`v1 · 상태 3개`) |
