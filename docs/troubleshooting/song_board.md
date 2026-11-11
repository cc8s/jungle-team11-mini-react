# song_board 트러블슈팅

TDD Red 단계에서 실패한 테스트와 원인, 수정 내용을 기록한다.

## EC-021 즐겨찾기 토글 뒤 바뀌지 않은 행은 이전 Virtual DOM 객체를 그대로 쓰고, 그 행에는 BIND가 생기지 않는다

- **발견 경위**: React 18과 2페이지 성능을 비교한 벤치마크(레포 밖 `mini-react-bench`)에서 작은 변경 하나에 4~6배 느렸다. 단계별로 재 보니 곡 500개에서 즐겨찾기 하나를 토글할 때 연산 14,836개 중 14,834개가 `BIND`였고, 시간은 diff와 렌더 함수가 대부분을 차지했다.
- **증상 (Red)**

  ```
  AssertionError [ERR_ASSERTION]: 바뀌지 않은 행은 같은 객체
  ```

  즐겨찾기를 토글하지 않은 `song_1` 행의 Virtual DOM 노드가 토글 전과 다른 객체였다.

- **원인**: `song_collection`이 렌더링마다 모든 행을 `render_child_component(song_row, ...)`로 새로 만들었다. 북마크는 Virtual DOM 객체를 키로 DOM을 가리키므로, 내용이 같아도 객체가 새것이면 diff가 `old === new`로 건너뛰지 못하고 모든 노드에 `BIND`를 만들었다. plan.md가 기대한 "patch O(k)"가 실제로는 전체 노드 수에 비례했다.
- **수정**: `render_cached_song_row`가 곡 객체를 키로 한 `WeakMap`에 행 노드를 저장하고, 곡 객체와 행 조건(`is_main`, `can_move`, `is_first`, `is_last`, `song_actions`)이 같으면 이전 노드를 돌려준다. 재사용한 행은 처음 만들 때의 핸들러를 들고 있으므로 `song_actions`를 `use_memo`로 고정하고, State는 updater 함수와 최신 State 상자(`latest_state`)로 읽도록 바꿨다. 지난 State를 닫아 두는 실수는 EC-022, EC-023으로 고정했다.
- **수정 중 만난 실패**: 처음에는 `on_set_main`의 "같은 곡이면 아무것도 안 함" 검사를 빼고 `set_main_song_id(song.id)`만 불렀다. State는 그대로라 다시 그리지 않았지만 `report_action`이 불려 EC-006(같은 곡을 다시 지정하면 변경 기록도 남기지 않음)이 실패했다. 최신 State 상자의 `main_song_id`로 비교하도록 되돌렸다.
- **효과**: 곡 500개 즐겨찾기 토글에서 연산 14,836개 → 88개, `BIND` 14,834개 → 86개. 실제 DOM 변경 횟수는 같다.
