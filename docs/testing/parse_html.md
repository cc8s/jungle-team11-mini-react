# parse_html

`src/parse_html.js` — 테스트 영역의 HTML 문자열을 `<template>.innerHTML`로 파싱해 Virtual DOM으로 바꾼다. template의 내용은 inert 문서에 만들어지므로 파싱 중에 `<script>`가 실행되거나 `<img>`가 로드되지 않는다. 위험한 요소와 attribute는 `virtual_node`의 변환 단계에서 걸러진다.

Node에는 HTML 파서가 없고, CLAUDE.md는 jsdom 같은 파서 라이브러리를 금지한다. 그래서 이 모듈은 단위 테스트 대신 브라우저에서 확인한다. 파싱 뒤의 변환 규칙은 `docs/testing/virtual_node.md`에서 대역으로 검증한다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | `html_text`가 문자열이 아님 | `TypeError` | 없음 | 미검증 |
| EC-002 | `document`가 없음 | `TypeError` | 없음 | 미검증 |
| EC-003 | 빈 문자열 (빈 테스트 영역) | 자식 없는 `#fragment` | 없음 | 미검증 |
| EC-004 | `<script>`, `onerror`, `javascript:` 링크 | 파싱 중 실행 안 됨, 결과 트리에서 제외 | 없음 | 미검증 |
| EC-005 | 닫히지 않은 태그 등 잘못된 HTML | 브라우저 파서의 오류 복구 결과를 그대로 사용 | 없음 | 미검증 |
| EC-006 | 512단계를 넘는 중첩 | 브라우저 파서가 더 깊은 요소를 형제로 붙임 | 없음 | 미검증 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| (없음) | HTML 파서가 브라우저에만 있음 | EC-001 ~ EC-006 |

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| EC-001 ~ EC-006 | 브라우저 파서 필요. 자동 테스트로 만들려면 브라우저에서 도는 테스트 페이지가 필요함 | 2026-11-10 브라우저 수동 확인: 숫자 입력과 `document` 없음 → `TypeError`, 빈 문자열 → 자식 0개, `<ul><li>하나<li>둘</ul><p>닫히지 않음` → `ul`(자식 2개)와 `p`로 복구, `<div>` 600단계 → 512단계에서 멈춤, `<img onerror>`·`<script>`·`javascript:` 링크를 넣고 Patch해도 스크립트가 실행되지 않고 해당 요소와 attribute가 빠짐, SVG `circle`은 SVG 네임스페이스로 생성됨 |
