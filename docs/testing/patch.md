# patch

`src/patch.js` — diff 연산을 실제 DOM에 적용하고 양방향 북마크를 관리한다.

| 방향 | 저장 위치 | 용도 |
| --- | --- | --- |
| Virtual DOM → DOM | `bookmark_registry.dom_nodes_by_virtual_node` (`WeakMap`) | patch가 바꿀 DOM을 탐색 없이 바로 찾음 |
| DOM → Virtual DOM | `dom_node.__virtual_node` | 이벤트나 제거 처리에서 Virtual DOM을 바로 찾음 |

- 북마크 등록과 해제는 이 모듈(`bind_bookmark`, `unbind_subtree`)에서만 한다.
- `REMOVE`와 `REPLACE`가 떼어 낼 DOM은 적용 전에 모두 찾아 둔다. 북마크가 빠진 연산이 있으면 DOM을 바꾸기 전에 오류를 낸다.
- 제거된 하위 트리는 DOM 쪽 북마크를 따라 해제한다. 같은 Virtual DOM 객체가 그사이 다른 DOM에 다시 연결됐다면 그 연결은 지우지 않는다.
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
| EC-016 | 이미 문서에서 분리된 노드를 `REMOVE` | `parentNode`가 없으면 제거를 건너뜀 | 없음 | 미검증 |
| EC-017 | patch 중 `MutationObserver` 콜백 | 콜백은 microtask로 patch가 끝난 뒤 실행되므로 patch 도중 재진입이 없음 | 없음 (대역에 MutationObserver 없음) | 미검증 |

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

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| 포커스와 선택 영역 보존 | 대역에 포커스 개념이 없음 | 브라우저에서 메모 입력란에 포커스를 두고 Ctrl/⌘+Enter로 Patch. 2026-11-10 수동 확인: Patch와 뒤로가기 뒤에도 같은 `input` 노드와 입력값 유지 |
| 바뀐 노드 하이라이트 | Web Animations API(`element.animate`)는 대역에 없음 | 브라우저에서 Patch 후 테두리 애니메이션 확인. 2026-11-10 수동 확인 |
| `input`의 `value` attribute 변경 | 사용자가 이미 입력한 input은 attribute를 바꿔도 화면 값이 바뀌지 않음 (DOM 표준의 dirty value 동작) | 브라우저에서 입력 후 테스트 영역의 `value` attribute를 바꿔 확인 |
| 레이아웃, 렌더링 결과 | 대역은 렌더링하지 않음 | 브라우저 화면 확인 |
| `iframe`, Shadow DOM 안의 컨테이너 | 대역에 해당 환경 없음 | 브라우저에서 해당 환경에 mount해 확인 |
