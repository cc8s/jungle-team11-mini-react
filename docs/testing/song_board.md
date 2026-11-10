# song_board

`src/song_board.js` — Phase 2 페이지의 최애곡 모음 앱 (`phase2idea.md`). `FunctionComponent`로 감싼 루트 `song_board_root`와 props만 받는 자식 컴포넌트들이다. 데이터 규칙은 `song_board_model.md`.

## Phase 1 엔진 활용 (Virtual DOM → Diff → Patch)

State가 바뀌면 `FunctionComponent.update()`가 다음을 실행한다. 전체를 다시 그리지 않고 바뀐 부분만 실제 DOM에 반영한다.

1. **Virtual DOM 생성:** `song_board_root`를 다시 실행해 Phase 1과 같은 Virtual DOM 노드(`create_element_node`)로 새 트리를 만든다.
2. **Diff:** Phase 1의 `diff_trees`로 이전 트리와 비교한다. 행과 타일은 곡 id(`row_song_3`)를 key로 비교한다.
3. **Patch:** Phase 1의 `apply_operations`가 양방향 북마크로 바뀐 DOM만 바로 찾아 고친다.

동작별 연산 (대역 테스트와 브라우저에서 확인):

| 동작 | 실제 DOM에 반영되는 것 |
| --- | --- |
| 곡 추가 | 새 행 `ADD` 1개 + 개수 `TEXT` + 이전 첫 행의 "위로" 버튼 `ATTRIBUTES` |
| 곡 삭제 | 그 행 `REMOVE` (메인곡이었으면 메인 카드 `REPLACE`) |
| 즐겨찾기 | 별 버튼 `ATTRIBUTES`(`aria-pressed`, 이름) + 개수 `TEXT` |
| 메인곡 변경 | 카드는 그대로, 이니셜·제목·가수·메모 `TEXT` + 행 표시·두 메인 버튼의 눌림 상태 `ATTRIBUTES` (버튼 글자는 둘 다 `메인`이라 그대로) |
| 곡 수정 시작·종료 | 같은 `li`는 그대로 두고 안쪽만 `REPLACE`(보기 ↔ 수정 폼). 저장하면 메인곡일 때 카드 `TEXT` |
| 순서 바꾸기 | 같은 행 DOM을 `MOVE` |
| 메인곡 없음 ↔ 있음, 곡 목록 ↔ 빈 안내 | key 없는 서로 다른 요소라 `REPLACE` |

- `REPLACE`가 나오도록 번갈아 나오는 바깥 요소(메인 카드 `div`/`article`, 목록 `ul`/빈 안내 `p`)에는 id를 붙이지 않았다. id(key)가 다르면 diff는 교체가 아니라 `REMOVE` + `ADD`로 처리한다.
- 입력란은 State에 값을 두지 않는다(비제어). 제출할 때 `form.elements`로 읽는다. 다시 그려도 같은 `input` DOM이라 입력 중인 값과 포커스가 유지되고, 한글 조합에 State 갱신이 끼어들지 않는다.
- 이벤트 핸들러는 `view_builder`의 노드 밖 `WeakMap`에 있고 컨테이너 위임 리스너로 불린다.

## 컴포넌트 구조

```
song_board_root (State: songs, main_song_id, filter_name, last_song_number,
                        editing_song_id, form_error_text, edit_error_text)
├─ main_song_card (props: song)
├─ song_form      (props: error_text, on_submit, on_input, on_keydown)
├─ library_toolbar(props: filter_name, song_counts, on_filter_change)
└─ song_collection(props: songs, main_song_id, editing_song_id, song_actions, ...)
   └─ song_row / song_edit_row
```

| Hook | 쓰는 곳 |
| --- | --- |
| `use_state` | 위 State 7개. 모두 루트에만 있다 |
| `use_memo` | 저장된 State 읽기(한 번), 메인곡 찾기, 필터 결과, 개수 |
| `use_effect` | `localStorage` 저장, 탭 제목·상단 바 갱신, 수정 시작 시 입력란 포커스 |

root props (페이지가 넣어 줌): `load_board`, `save_board`, `on_board_change`, `report_action`, `focus_by_id`. 저장소와 `document`를 직접 만지지 않으므로 대역에서 그대로 테스트한다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | 첫 mount | 샘플 곡, 메인 카드, 필터 개수, 저장·탭 제목 콜백 | EC-001 처음 mount: 샘플 곡, 메인곡 카드, 필터 개수를 그리고 저장·탭 제목 콜백을 부른다 | 통과 |
| EC-002 | 곡 추가 | 새 행만 `ADD`, 기존 행 DOM 그대로, 기본 제출 막음, 폼 비움, 제목 칸 포커스 | EC-002 곡 추가: 새 행만 ADD되고 기존 행 DOM은 그대로이며, 폼은 비워지고 제목 칸에 포커스 | 통과 |
| EC-003 | 빈 제목 | 추가 안 함, 오류 문구, 입력값 유지, 다시 입력하면 문구 숨김 | EC-003 빈 제목은 추가하지 않고 오류 문구를 보여 주며, 다시 입력하면 문구가 사라진다 | 통과 |
| EC-004 | 같은 곡 추가 (공백·대소문자만 다름) | 막음 | EC-004 같은 곡(공백·대소문자 무시) 추가는 막는다 | 통과 |
| EC-005 | 즐겨찾기 토글 | `ATTRIBUTES`와 `TEXT`만, 같은 행 DOM | EC-005 즐겨찾기 토글은 버튼 attribute와 개수 텍스트만 바뀐다 (ADD·REMOVE·REPLACE 없음) | 통과 |
| EC-006 | 메인곡 변경, 같은 곡 다시 지정 | 같은 카드·텍스트 노드 재사용, 다시 지정은 렌더링·기록 없음 | EC-006 메인곡 변경은 카드 구조를 재사용하고 텍스트만 바뀌며, 같은 곡을 다시 지정하면 아무 일도 없다 | 통과 |
| EC-007 | 메인곡으로 지정된 곡 삭제 | 행 `REMOVE`, 메인 카드 `REPLACE`, 저장된 메인곡 `null` | EC-007 메인곡으로 지정된 곡을 삭제하면 행이 REMOVE되고 메인 카드는 안내 카드로 REPLACE된다 | 통과 |
| EC-008 | 순서 바꾸기, 맨 위·맨 아래 | 같은 행 `MOVE`, 경계 버튼 꺼짐 | EC-008 순서 바꾸기는 같은 DOM 행을 MOVE하고, 맨 위의 위로·맨 아래의 아래로 버튼은 꺼져 있다 | 통과 |
| EC-009 | 수정 시작·취소 | 같은 `li`와 다른 행 DOM은 그대로, 안쪽만 `REPLACE`, `ADD` 없음 | EC-009 수정을 시작·종료하면 같은 행(li) 안쪽만 REPLACE되고 다른 행은 그대로다 | 통과 |
| EC-010 | 즐겨찾기 필터, 즐겨찾기 0개 | 즐겨찾기만, 빈 안내, 이동 버튼 숨김(걸러진 목록에서 이웃이 모호함) | EC-010 즐겨찾기 필터는 즐겨찾기만 보여 주고, 없으면 빈 안내, 이동 버튼은 숨긴다 | 통과 |
| EC-011 | 수정 시작·저장 | 같은 `li`, 기존 값 채움, 포커스 요청, 저장 후 메인 카드도 바뀜 | EC-011 수정: 같은 행(li)을 재사용해 폼으로 바꾸고 포커스, 저장하면 메인 카드도 함께 바뀐다 | 통과 |
| EC-012 | 수정 중 중복, 한글 조합 중 Enter, Escape | 오류 문구, 제출 막음, 취소 | EC-012 수정 중 다른 곡과 중복이면 오류, Escape는 취소, 한글 조합 중 Enter는 제출을 막는다 | 통과 |
| EC-013 | 제목에 HTML, `javascript:` 링크 | 텍스트 노드로만 그림(`img` 없음), 링크 거부 | EC-013 제목에 넣은 HTML은 글자로만 그려지고, javascript: 링크는 저장되지 않는다 (innerHTML XSS 없음) | 통과 |
| EC-014 | 메인곡 없음에서 곡 지정 | 안내 카드가 메인 카드로 `REPLACE` (`REMOVE` + `ADD` 아님) | EC-014 메인곡이 없을 때 곡을 지정하면 안내 카드가 메인 카드로 REPLACE된다 | 통과 |
| EC-015 | 입력 중 다른 State 변경 | 같은 `input` DOM과 값 | EC-015 입력 중인 폼의 input DOM과 값은 다른 State 변경 뒤에도 그대로다 | 통과 |
| EC-016 | 깨진 저장 데이터 | 빈 목록 안내, 메인곡 없음 카드 | EC-016 깨진 저장 데이터로 시작하면 빈 목록 안내와 메인곡 없음 카드를 그린다 | 통과 |
| EC-019 | 메인 버튼 표시와 메인곡 변경 | 모든 행이 `메인`, 메인곡 행만 눌림(검정). 바꾸면 같은 버튼 DOM에서 `ATTRIBUTES` 2만 | EC-019 메인 버튼은 모든 행에서 "메인"이고 메인곡 행만 눌림, 바꾸면 같은 버튼 DOM의 attribute만 바뀐다 | 통과 |
| EC-020 | 행 버튼 배치 | 즐겨찾기 별은 커버 왼쪽, 메인 버튼은 오른쪽 묶음 첫 버튼 | EC-020 즐겨찾기 별은 행 맨 앞(커버 왼쪽)에 있고 메인 버튼은 오른쪽 동작 버튼 묶음의 첫 버튼이다 | 통과 |
| EC-017 | 수정 중인 곡을 즐겨찾기 필터에서 즐겨찾기 해제 | 행이 목록에서 빠지며 수정 폼도 사라짐(수정 상태 id는 남지만 그릴 행이 없음) | 없음 | 미검증 |
| EC-018 | 같은 작업에서 State 여러 개 변경 (삭제 시 `songs` + `main_song_id` + `editing_song_id`) | update 한 번 (`function_component.md` EC-006) | 없음 (FunctionComponent 테스트로 보장) | 미검증 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 처음 mount: 샘플 곡, 메인곡 카드, 필터 개수를 그리고 저장·탭 제목 콜백을 부른다 | mount | EC-001 |
| EC-002 곡 추가: 새 행만 ADD되고 기존 행 DOM은 그대로이며, 폼은 비워지고 제목 칸에 포커스 | ADD, 부분 갱신 | EC-002 |
| EC-003 빈 제목은 추가하지 않고 오류 문구를 보여 주며, 다시 입력하면 문구가 사라진다 | 입력 검사 | EC-003 |
| EC-004 같은 곡(공백·대소문자 무시) 추가는 막는다 | 중복 | EC-004 |
| EC-005 즐겨찾기 토글은 버튼 attribute와 개수 텍스트만 바뀐다 (ADD·REMOVE·REPLACE 없음) | ATTRIBUTES | EC-005 |
| EC-006 메인곡 변경은 카드 구조를 재사용하고 텍스트만 바뀌며, 같은 곡을 다시 지정하면 아무 일도 없다 | TEXT, 반복 호출 | EC-006 |
| EC-007 메인곡으로 지정된 곡을 삭제하면 행이 REMOVE되고 메인 카드는 안내 카드로 REPLACE된다 | REMOVE, REPLACE | EC-007 |
| EC-008 순서 바꾸기는 같은 DOM 행을 MOVE하고, 맨 위의 위로·맨 아래의 아래로 버튼은 꺼져 있다 | MOVE | EC-008 |
| EC-009 수정을 시작·종료하면 같은 행(li) 안쪽만 REPLACE되고 다른 행은 그대로다 | REPLACE | EC-009 |
| EC-010 즐겨찾기 필터는 즐겨찾기만 보여 주고, 없으면 빈 안내, 이동 버튼은 숨긴다 | 필터 | EC-010 |
| EC-011 수정: 같은 행(li)을 재사용해 폼으로 바꾸고 포커스, 저장하면 메인 카드도 함께 바뀐다 | 수정, id로 메인곡 연결 | EC-011 |
| EC-012 수정 중 다른 곡과 중복이면 오류, Escape는 취소, 한글 조합 중 Enter는 제출을 막는다 | 수정 오류, IME | EC-012 |
| EC-013 제목에 넣은 HTML은 글자로만 그려지고, javascript: 링크는 저장되지 않는다 (innerHTML XSS 없음) | 보안 | EC-013 |
| EC-014 메인곡이 없을 때 곡을 지정하면 안내 카드가 메인 카드로 REPLACE된다 | REPLACE | EC-014 |
| EC-015 입력 중인 폼의 input DOM과 값은 다른 State 변경 뒤에도 그대로다 | 입력값 보존 | EC-015 |
| EC-016 깨진 저장 데이터로 시작하면 빈 목록 안내와 메인곡 없음 카드를 그린다 | 저장 데이터 깨짐 | EC-016 |
| EC-019 메인 버튼은 모든 행에서 "메인"이고 메인곡 행만 눌림, 바꾸면 같은 버튼 DOM의 attribute만 바뀐다 | 메인 버튼, ATTRIBUTES | EC-019 |
| EC-020 즐겨찾기 별은 행 맨 앞(커버 왼쪽)에 있고 메인 버튼은 오른쪽 동작 버튼 묶음의 첫 버튼이다 | 행 배치 | EC-020 |

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| 한글 입력(IME) 조합 중 Enter | 대역과 자동화 도구로는 실제 조합 입력을 만들 수 없음. 코드는 `isComposing`과 `keyCode 229`로 막음 | 브라우저에서 한글 제목을 치고 Enter로 조합을 끝낼 때 제출되지 않는지, 다시 Enter를 누르면 추가되는지 확인 |
| 포커스 유지 (실제 브라우저) | 대역의 `focus()`는 `activeElement`만 기록 | 2026-11-11 앱 내장 브라우저에서 확인: 곡 추가 후 제목 칸, 수정 시작 후 수정 제목 칸에 포커스 |
| 변경 하이라이트 | `element.animate`는 대역에 없음 | 2026-11-11 브라우저에서 메인곡 지정 후 카드 텍스트와 행이 잠깐 회색으로 칠해지는지 확인 |
| `localStorage`가 막힌 환경 | 브라우저 설정 필요 | 사이트 데이터를 막고 로드: 샘플 곡으로 시작하고 저장만 되지 않아야 함 |
| 레이아웃 (800px, 375px) | 대역은 렌더링하지 않음 | 2026-11-11 확인: 800px에서 두 열, 375px에서 한 열·가로 스크롤 없음 |
