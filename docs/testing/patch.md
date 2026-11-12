# patch

`src/patch.js` — diff 연산을 실제 DOM에 적용하고 양방향 북마크를 관리한다.

| 방향 | 저장 위치 | 용도 |
| --- | --- | --- |
| Virtual DOM → DOM | `bookmark_registry.dom_nodes_by_virtual_node` (`WeakMap`) | patch가 바꿀 DOM을 탐색 없이 바로 찾음 |
| DOM → Virtual DOM | `dom_node.__virtual_node` | 이벤트나 제거 처리에서 Virtual DOM을 바로 찾음 |

- 북마크 등록과 해제는 이 모듈(`bind_bookmark`, `unbind_subtree`)에서만 한다.
- `unmount_tree`는 `mount_tree`로 그린 내용을 지우고 컨테이너를 포함한 양쪽 북마크를 해제한다. `FunctionComponent.unmount()`가 쓴다.
- `REMOVE`와 `REPLACE`가 떼어 낼 DOM은 적용 전에 모두 찾아 둔다. 북마크가 빠진 연산이 있으면 DOM을 바꾸기 전에 오류를 낸다.
- 제거된 하위 트리는 DOM 쪽 북마크를 따라 해제한다. 같은 Virtual DOM 객체가 그사이 다른 DOM에 다시 연결됐다면 그 연결은 지우지 않는다.
- attribute는 `set_dom_attribute`로 넣는다. HTML 파서가 네임스페이스를 붙이는 이름(`xlink:href` 등, `attribute_namespace.md` 참고)이 SVG·MathML 요소에 오면 `setAttributeNS`를 쓴다. 이미 있는 attribute의 값 변경과 `removeAttribute`는 qualified name으로 찾으므로 네임스페이스가 유지된다.
- 바뀌지 않은 DOM 노드는 그대로 두므로 `input`의 property 값, 포커스, 선택 영역이 유지된다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | 컨테이너가 `null`, 루트가 `#fragment`가 아님 | `TypeError` | EC-001 mount_tree는 컨테이너와 #fragment 루트가 아니면 TypeError | 통과 |
| EC-002 | `document`가 없는 환경 | `TypeError` | EC-002 document가 없는 환경이면 TypeError | 통과 |
| EC-003 | 컨테이너에 기존 내용이 있음 | 비우고 새로 그리며 양방향 북마크 연결 | EC-003 mount_tree는 기존 내용을 비우고 그리며 양방향 북마크를 연결한다 | 통과 |
| EC-004 | 텍스트 변경 | 같은 텍스트 DOM 노드의 `data`만 수정 | EC-004 텍스트 변경은 같은 DOM 텍스트 노드를 수정한다 | 통과 |
| EC-005 | 사용자가 입력한 `input`의 property 값 | 무관한 변경 뒤에도 같은 DOM, 같은 값 | EC-005 변경과 무관한 input DOM은 교체되지 않아 property 값이 보존된다 | 통과 |
| EC-006 | key 있는 항목 이동 | DOM 노드 재사용 | EC-006 key가 있는 항목 이동은 DOM 노드를 재사용한다 | 통과 |
| EC-007 | 하위 트리 제거 | 양쪽 북마크 모두 해제 | EC-007 제거된 하위 트리의 북마크는 양쪽 모두 해제된다 | 통과 |
| EC-008 | 알 수 없는 연산, 배열이 아닌 입력, 북마크 없는 노드 | 오류, DOM은 그대로 | EC-008 알 수 없는 연산과 북마크 없는 노드는 오류이며 DOM을 바꾸기 전에 멈춘다 | 통과 |
| EC-009 | 같은 연산 목록을 두 번 적용 (중복 해제) | 오류, DOM은 그대로 | EC-009 같은 연산 목록을 두 번 적용(중복 해제)하면 오류가 나고 DOM은 그대로다 | 통과 |
| EC-010 | SVG 노드 생성 | `createElementNS` 사용 | EC-010 SVG 노드는 createElementNS로 만든다 | 통과 |
| EC-011 | 같은 Virtual DOM 객체가 다른 부모로 옮겨져 `ADD`가 `REMOVE`보다 먼저 적용됨 | 원래 자리의 DOM을 지우고 새 DOM의 북마크는 유지 | EC-011 같은 Virtual DOM 객체가 다른 부모로 옮겨져도(ADD가 REMOVE보다 먼저) 원래 DOM을 지운다 | 통과 |
| EC-012 | attribute, 주석, 교체가 섞임 | 결과 DOM이 새 트리와 같음 | EC-012 attribute와 주석 변경, 교체가 섞인 patch 결과가 새 트리와 같다 | 통과 |
| EC-013 | 무작위 트리 500쌍 (중복 key, SVG, 주석, 공백 포함) | 결과 DOM이 새 트리와 같고 두 북마크가 동기화됨 | EC-013 무작위 트리 500쌍: patch 결과가 새 트리와 같고 북마크가 동기화된다 | 통과 |
| EC-014 | 공유 트리 사이를 무작위로 300번 이동 (뒤로/앞으로) | 매번 DOM과 북마크가 정확함 | EC-014 무작위 이력 이동: 공유 트리 사이를 앞뒤로 오가도 DOM과 북마크가 정확하다 | 통과 |
| EC-018 | 연산별로 바꾼 DOM 기록 | `changed_records`에 `{ operation, dom_node }`를 순서대로 담고 `changed_dom_nodes`와 같은 노드 (화면은 주석·공백 변경을 하이라이트에서 뺄 때 사용) | EC-018 patch 결과는 연산마다 바꾼 DOM 노드를 changed_records로 알려 준다 | 통과 |
| EC-015 | 1000단계 중첩 | mount와 patch 성공 | EC-015 깊은 중첩(1000단계, 브라우저 파서 한도 512의 두 배)도 mount와 patch가 된다 | 통과 |
| EC-019 | `unmount_tree` | 내용을 지우고 컨테이너를 포함한 양쪽 북마크 해제 | EC-019 unmount_tree는 내용을 지우고 컨테이너를 포함한 양쪽 북마크를 해제한다 | 통과 |
| EC-020 | `unmount_tree` 반복 호출(중복 해제), 컨테이너가 `null`·일반 객체 | 반복은 안전, 컨테이너가 아니면 `TypeError` | EC-020 unmount_tree 반복 호출(중복 해제)은 안전하고, 컨테이너가 없으면 TypeError | 통과 |
| EC-021 | SVG 요소를 만들 때 `xlink:href`, HTML 요소의 `xlink:href` | SVG는 xlink 네임스페이스(prefix `xlink`, localName `href`), HTML은 네임스페이스 없음 | EC-021 SVG 요소를 만들 때 xlink:href는 xlink 네임스페이스 attribute가 되고 HTML 요소에서는 일반 attribute다 | 통과 |
| EC-022 | `ATTRIBUTES` 연산으로 `xlink:href` 추가, 값 변경, 제거 | 네임스페이스와 함께 추가, 변경해도 attribute는 하나, 제거 후 남지 않음 | EC-022 ATTRIBUTES 연산은 xlink:href를 네임스페이스와 함께 추가하고, 값 변경과 제거도 같은 attribute 하나에 적용한다 | 통과 |
| EC-023 | 파서처럼 네임스페이스가 붙은 DOM → Virtual DOM → patch 왕복 | attribute의 네임스페이스, prefix, localName, 값이 원래 DOM과 같음 | EC-023 왕복: 파서처럼 네임스페이스를 붙인 DOM → Virtual DOM → patch로 만든 DOM의 attribute가 같다 | 통과 |
| EC-016 | 이미 문서에서 분리된 노드를 `REMOVE` / `REPLACE` | `REMOVE`는 `parentNode`가 없으면 제거를 건너뛰고 북마크는 해제. `REPLACE`는 새 노드를 넣을 자리가 없으므로 오류 | EC-016 이미 문서에서 분리된 노드를 REMOVE하면 건너뛰고 북마크는 해제하며, REPLACE는 오류다 | 통과 |
| EC-017 | patch 중 `MutationObserver` 콜백 | 콜백은 microtask로 patch가 끝난 뒤 한 번 실행되므로 patch 도중 재진입이 없음 | 없음 (대역에 MutationObserver 없음, 2026-11-11 Chrome 156에서 확인: `apply_operations` 동안 호출 0번, 끝난 뒤 microtask에서 1번, 기록 5개, 콜백 시점의 DOM은 patch가 모두 끝난 상태) | 통과 |
| EC-024 | 사용자가 고친 `input`과 고치지 않은 `input`의 `value` attribute 변경 | 같은 input DOM의 attribute만 바뀐다. 고치지 않았으면 화면 값도 바뀌고, 고쳤으면(dirty value) 사용자 입력이 남는다 (HTML 표준) | EC-024 input의 value attribute 변경은 사용자가 고치지 않은 input에만 화면 값으로 보인다 (dirty value) | 통과 |
| EC-025 | 외부 코드(확장 프로그램, 위젯 스크립트 등)가 관리하는 부모 맨 앞에 노드를 끼워 넣은 뒤 `MOVE` | 넣을 자리를 `childNodes[index]`로 세지 않고, diff가 실은 앞 형제(`previous_node`)의 DOM을 북마크로 찾아 그 바로 뒤에 넣는다. 관리하는 노드 순서가 새 트리와 같고 끼워 넣은 노드는 그대로 남는다 | EC-025 외부 코드가 부모 맨 앞에 노드를 끼워 넣어도 MOVE는 관리하는 노드의 순서를 지킨다 | 통과 |
| EC-026 | 같은 상황에서 가운데·맨 앞 `ADD` | 앞 형제 바로 뒤(맨 앞이면 부모의 첫 자식 앞)에 넣어 관리하는 노드 순서가 새 트리와 같다 | EC-026 외부 코드가 부모 맨 앞에 노드를 끼워 넣어도 ADD는 새 노드를 이전 형제 바로 뒤에 넣는다 | 통과 |
| EC-027 | 무작위 트리 300쌍, 관리하는 요소 아무 곳(컨테이너 포함)에 외부 노드 하나 | 끼워 넣은 노드를 빼고 본 DOM의 모양과 순서가 새 트리와 같다. 수정 전 코드에서는 실패한다 | EC-027 무작위 트리 300쌍: 관리하는 요소 아무 곳에 외부 노드를 끼워 넣어도 patch 뒤 관리하는 노드의 모양과 순서가 새 트리와 같다 | 통과 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 mount_tree는 컨테이너와 #fragment 루트가 아니면 TypeError | 입력 검증 | EC-001 |
| EC-002 document가 없는 환경이면 TypeError | document 없는 환경 | EC-002 |
| EC-003 mount_tree는 기존 내용을 비우고 그리며 양방향 북마크를 연결한다 | 첫 렌더링, 북마크 동기화 | EC-003 |
| EC-004 텍스트 변경은 같은 DOM 텍스트 노드를 수정한다 | 최소 DOM 변경 | EC-004 |
| EC-005 변경과 무관한 input DOM은 교체되지 않아 property 값이 보존된다 | attribute와 property 차이, 입력값 보존 | EC-005 |
| EC-006 key가 있는 항목 이동은 DOM 노드를 재사용한다 | 이동 | EC-006 |
| EC-007 제거된 하위 트리의 북마크는 양쪽 모두 해제된다 | 북마크 정리 | EC-007 |
| EC-008 알 수 없는 연산과 북마크 없는 노드는 오류이며 DOM을 바꾸기 전에 멈춘다 | 오류 처리 | EC-008 |
| EC-009 같은 연산 목록을 두 번 적용(중복 해제)하면 오류가 나고 DOM은 그대로다 | 중복 해제 | EC-009 |
| EC-010 SVG 노드는 createElementNS로 만든다 | SVG 네임스페이스 | EC-010 |
| EC-011 같은 Virtual DOM 객체가 다른 부모로 옮겨져도(ADD가 REMOVE보다 먼저) 원래 DOM을 지운다 | 북마크 재연결 순서 | EC-011 |
| EC-012 attribute와 주석 변경, 교체가 섞인 patch 결과가 새 트리와 같다 | 복합 변경 | EC-012 |
| EC-013 무작위 트리 500쌍: patch 결과가 새 트리와 같고 북마크가 동기화된다 | diff와 patch의 정확성 | EC-013 |
| EC-014 무작위 이력 이동: 공유 트리 사이를 앞뒤로 오가도 DOM과 북마크가 정확하다 | 이력 이동과 노드 공유 | EC-014 |
| EC-015 깊은 중첩(1000단계, 브라우저 파서 한도 512의 두 배)도 mount와 patch가 된다 | 깊은 중첩 | EC-015 |
| EC-018 patch 결과는 연산마다 바꾼 DOM 노드를 changed_records로 알려 준다 | 연산별 변경 기록 | EC-018 |
| EC-019 unmount_tree는 내용을 지우고 컨테이너를 포함한 양쪽 북마크를 해제한다 | unmount 정리 | EC-019 |
| EC-020 unmount_tree 반복 호출(중복 해제)은 안전하고, 컨테이너가 없으면 TypeError | 중복 해제, 입력 검증 | EC-020 |
| EC-021 SVG 요소를 만들 때 xlink:href는 xlink 네임스페이스 attribute가 되고 HTML 요소에서는 일반 attribute다 | 생성 시 attribute 네임스페이스 | EC-021 |
| EC-022 ATTRIBUTES 연산은 xlink:href를 네임스페이스와 함께 추가하고, 값 변경과 제거도 같은 attribute 하나에 적용한다 | 연산 적용 시 attribute 네임스페이스 | EC-022 |
| EC-023 왕복: 파서처럼 네임스페이스를 붙인 DOM → Virtual DOM → patch로 만든 DOM의 attribute가 같다 | 파서와 같은 DOM | EC-023 |
| EC-016 이미 문서에서 분리된 노드를 REMOVE하면 건너뛰고 북마크는 해제하며, REPLACE는 오류다 | 분리된 노드 | EC-016 |
| EC-024 input의 value attribute 변경은 사용자가 고치지 않은 input에만 화면 값으로 보인다 (dirty value) | attribute와 property 차이 | EC-024 |
| EC-025 외부 코드가 부모 맨 앞에 노드를 끼워 넣어도 MOVE는 관리하는 노드의 순서를 지킨다 | 외부 노드와 MOVE 위치 | EC-025 |
| EC-026 외부 코드가 부모 맨 앞에 노드를 끼워 넣어도 ADD는 새 노드를 이전 형제 바로 뒤에 넣는다 | 외부 노드와 ADD 위치 | EC-026 |
| EC-027 무작위 트리 300쌍: 관리하는 요소 아무 곳에 외부 노드를 끼워 넣어도 patch 뒤 관리하는 노드의 모양과 순서가 새 트리와 같다 | 외부 노드와 무작위 patch | EC-027 |

## 미검증 항목

| 항목 | 이유 | 검증 방법과 결과 |
| --- | --- | --- |
| 포커스와 선택 영역 보존 | 대역에 포커스 개념이 없음 | 브라우저에서 메모 입력란에 포커스를 두고 Ctrl/⌘+Enter로 Patch. 2026-11-10 수동 확인: Patch와 뒤로가기 뒤에도 같은 `input` 노드와 입력값 유지 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 메모 입력값을 넣고 테스트 영역에서 Ctrl/⌘+Enter로 Patch, 뒤로가기 2번과 앞으로가기 후에도 같은 `input` 노드, 값 "메모 값" 유지 |
| 바뀐 노드 하이라이트 | Web Animations API(`element.animate`)는 대역에 없음 | 브라우저에서 Patch 후 테두리 애니메이션 확인. 2026-11-10 수동 확인 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 지금은 테두리가 아니라 inset box-shadow 회색 상자. `li` 글자 Patch 후 1400ms 애니메이션, 키프레임 0.07 → 0, 모서리 6px, `style` 없음 |
| `input`의 `value` attribute 변경 | 사용자가 이미 입력한 input은 attribute를 바꿔도 화면 값이 바뀌지 않음 (DOM 표준의 dirty value 동작) | 대역은 EC-024로 확인. 2026-11-11 Chrome 156에서도 확인: 고치지 않은 input은 화면 값이 "바뀜", 사용자가 입력한 input은 같은 DOM에서 attribute만 "바뀜"이고 화면 값은 "사용자 입력" 유지 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 고치지 않은 input은 화면 값 "바뀜", 사용자가 입력한 input은 같은 DOM에서 attribute만 "바뀜"이고 화면 값 "사용자 입력" 유지 |
| 레이아웃, 렌더링 결과 | 대역은 렌더링하지 않음 | 브라우저 화면 확인 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: 1440×900, 1440×660, 1024×768, 375×812에서 Phase 1 실제 영역이 patch 결과대로 그려지고 넘침·가로 스크롤 없음 (`app.md` EC-011 ~ EC-018) |
| `xlink:href`로 참조하는 SVG `<use>` 렌더링 | 대역은 렌더링하지 않음 | 2026-11-11 Chrome 156에서 확인: mount와 `ATTRIBUTES` 연산 모두 `getBBox` 20×30 (수정 전 0×0) / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: mount 직후 `getBBox` 20×30, `xlink:href`를 다른 `rect`로 바꾸는 `ATTRIBUTES` 뒤에도 20×30 |
| `iframe`, Shadow DOM 안의 컨테이너 | 대역에 해당 환경 없음 | 2026-11-11 Chrome 156에서 확인: iframe 안의 컨테이너에 iframe 문서를 넘겨도, 바깥 문서를 넘겨도(삽입 때 노드가 iframe 문서로 옮겨짐) mount와 patch 결과가 같고 key 있는 행 DOM을 재사용. shadow root 안의 요소와 shadow root 자체를 컨테이너로 써도 같은 결과 / **Playwright MCP 2차 검증 (2026-11-11, Chromium 157)**: iframe 문서를 넘긴 경우, 바깥 문서를 넘긴 경우, shadow 안 요소, shadow root 자체 모두 결과가 같고 key 있는 `li` DOM 재사용, 노드 `ownerDocument`가 컨테이너 문서 |
| 외부 코드가 끼워 넣은 노드가 있을 때 실제 브라우저의 클릭·patch (EC-025 ~ EC-027) | 대역은 이벤트 dispatch와 DOM 순서를 흉내 낼 뿐 실제 브라우저가 아님 | **내장 브라우저(Chromium, Chrome 156) 확인 (2026-11-12, Playwright MCP 아님)**: Phase 2 예제 앱의 곡 목록(`ul`) 맨 앞에 `<aside>`를 넣고 실제 클릭. 수정 전: song_2 별 클릭은 맞는 곡을 고쳤지만, song_2 "아래로"는 State는 맞고 화면 순서만 song_3, song_1, song_2로 틀림. 수정 후: 별 클릭과 "아래로" 모두 State와 화면이 기대와 같음(song_1, song_3, song_2). 비교용으로 북마크 없이 위치(자식 index)로 찾는 변형은 같은 상황에서 엉뚱한 곡(song_3)의 핸들러를 부르고 다른 곡의 DOM을 고쳤다 |
