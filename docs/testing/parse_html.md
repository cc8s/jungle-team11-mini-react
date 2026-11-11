# parse_html

`src/parse_html.js` — 테스트 영역의 HTML 문자열을 `<template>.innerHTML`로 파싱해 Virtual DOM으로 바꾼다. template의 내용은 inert 문서에 만들어지므로 파싱 중에 `<script>`가 실행되거나 `<img>`가 로드되지 않는다. 위험한 요소와 attribute는 `virtual_node`의 변환 단계에서 걸러진다.

Node에는 HTML 파서가 없고, CLAUDE.md는 jsdom 같은 파서 라이브러리를 금지한다. 그래서 이 모듈은 단위 테스트 대신 브라우저에서 확인한다. 파싱 뒤의 변환 규칙은 `docs/testing/virtual_node.md`에서 대역으로 검증한다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | `html_text`가 `null`, `undefined`, 숫자, 객체, 배열 | `TypeError` | EC-001 html_text가 문자열이 아니면 TypeError | 통과 |
| EC-002 | `document`가 `null`, `undefined`, 일반 객체, `createElement`가 함수가 아님 | `TypeError` | EC-002 document가 없거나 createElement가 없으면 TypeError | 통과 |
| EC-003 | 빈 문자열 (빈 테스트 영역) | 자식 없는 `#fragment` | 없음 (브라우저 파서 필요, 2026-11-11 Chrome 156에서 자식 0개 확인) | 통과 |
| EC-004 | `<script>`(HTML, SVG), `<img onerror>`, `javascript:` 링크 | 파싱 중 실행 안 됨(inert 문서), 결과 트리에서 요소와 attribute 제외 | 없음 (2026-11-11 Chrome 156에서 확인: 500ms 기다려도 실행 기록 0개, 트리는 `img[src]`, `a`(href 없음), 빈 `svg`, `p`) | 통과 |
| EC-005 | 닫히지 않은 태그 등 잘못된 HTML (`<ul><li>하나<li>둘</ul><p>닫히지 않음<table><tr><td>칸</table>`) | 브라우저 파서의 오류 복구 결과를 그대로 사용 | 없음 (2026-11-11 Chrome 156에서 확인: `ul`(li 2개), `p`, `table > tbody > tr > td`로 복구) | 통과 |
| EC-006 | 512단계를 넘는 중첩 (`div` 600단계) | 브라우저 파서가 더 깊은 요소를 형제로 붙임 | 없음 (2026-11-11 Chrome 156에서 확인: 최대 깊이 512, 맨 아래 단계에 `div` 89개가 형제로 붙음) | 통과 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 html_text가 문자열이 아니면 TypeError | 입력 검증 | EC-001 |
| EC-002 document가 없거나 createElement가 없으면 TypeError | 환경 검증 | EC-002 |

## 미검증 항목

| 항목 | 이유 | 검증 방법과 결과 |
| --- | --- | --- |
| EC-003 ~ EC-006 | HTML 파서가 브라우저에만 있음. 자동 테스트로 만들려면 브라우저에서 도는 테스트 페이지가 필요함 | 2026-11-11 Chrome 156(앱 내장 브라우저)에서 `parse_html_to_virtual_tree`를 직접 불러 확인 (결과는 엣지 케이스 표). 2026-11-10에는 실제 화면에서 Patch해도 스크립트가 실행되지 않음을 확인 |
