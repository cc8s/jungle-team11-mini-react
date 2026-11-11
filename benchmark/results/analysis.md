# 분석: 같은 DOM, 다른 비용

> 숫자 전체는 [summary.md](summary.md), 원자료는 `raw.jsonl`·`raw_add_song.jsonl`·`mutations.json`·`profile_*.json`.

## 한 줄 요약

**mini-react는 React 18과 같은 DOM 변경을 만든다. 그런데 갱신 한 번의 JS 비용이 3~5배다. 비용은 DOM이 아니라 diff에서 나온다.**
처음 그리기(mount)는 오히려 mini-react가 13~25% 빠르다.

## 결과 3가지

| # | 관찰 | 근거 |
|---|---|---|
| 1 | **DOM 변경은 거의 같다.** 즐겨찾기·메인곡·이동·필터·추가·삭제에서 MutationObserver 레코드 수가 React와 같다. 다른 곳은 수정 모드 진입/종료 하나다(mini 6~7, React 2). | summary.md 3장 |
| 2 | **갱신은 mini-react가 느리다.** 스크립트 시간 중앙값 배율이 N=100에서 1.3~3.2배, N=500에서 1.3~4.9배다. 95% 신뢰구간이 모두 1보다 크다. | summary.md 4장 |
| 3 | **mount는 mini-react가 빠르다.** N=100에서 0.75배, N=500에서 0.87배다(CI 상한 < 1). | summary.md 4장 |

## 원인: 바뀐 것이 2개여도 연산은 14,454개

N=500에서 즐겨찾기 하나를 토글할 때 mini-react가 만든 diff 연산이다(`on_rendered`로 셈).

| 연산 | 개수 |
|---|---:|
| BIND (북마크를 새 가상 노드로 옮김) | **14,454** |
| TEXT | 1 |
| ATTRIBUTES | 1 |
| 가상 노드 수 | 14,453 |

- [diff.js `diff_matched_pair`](../../src/diff.js)는 짝지어진 노드마다 BIND를 하나씩 만든다. 렌더 함수가 매번 새 노드 객체를 만들기 때문에 `old_node === new_node`로 건너뛰는 경우가 생기지 않는다. 그래서 **BIND 수가 트리 전체 노드 수와 같다.**
- [patch.js `apply_operations`](../../src/patch.js)는 BIND마다 `find_dom_node` 한 번과 WeakMap `set` 한 번을 한다.
- [diff.js `match_children`](../../src/diff.js)은 key가 없는 자식(행 안의 button, span, div)을 짝지을 때 `is_same_tree`로 서브트리를 **끝까지 비교**한다. 그 뒤 `diff_matched_pair`가 같은 서브트리를 한 번 더 내려간다. 프로파일 1위가 `are_attributes_equal`인 이유다.
- 갱신할 때마다 트리 전체를 도는 일이 더 있다. 중복 노드를 검사하는 `create_view_root`, 이벤트 종류를 모으는 `synchronize_event_listeners`, 노드마다 하는 `Object.freeze`와 attribute 안전 검사다.

CPU 프로파일(N=500, 즐겨찾기 토글 1번당 self time, 감속 없음):

| mini-react 함수 | ms |
|---|---:|
| `are_attributes_equal` | 9.9 |
| `diff_children` | 4.8 |
| GC | 3.8 |
| `match_children` | 3.8 |
| `bind_bookmark` | 3.3 |
| `create_attribute_record` (두 곳 합) | 4.9 |
| `is_same_tree` | 2.7 |

React 쪽은 상위 함수 하나가 2ms 남짓이고 GC는 0.6ms다. React도 `React.memo`가 없으면 500행을 모두 다시 렌더한다. 그러니 **둘 다 O(노드 수)이고, 차이는 노드 하나당 상수 비용이다.** 곡 수가 5배가 되면 mini는 5.0배, React는 3.6배 늘었다.

## mount가 mini-react에서 빠른 이유

mount에는 diff가 없다. mini-react는 가상 노드를 만들고 DOM을 만들면 끝난다. React는 노드마다 Fiber를 만들고 Hook 큐와 이벤트 시스템을 준비한다. 처음 그리기에서는 이 준비 비용이 그대로 드러난다.

## 필터 "전체"로 돌아갈 때 배율이 1에 가까운 이유

333행(DOM 약 670개)을 새로 만든다. 이때는 시간 대부분이 DOM 생성과 레이아웃이라 두 구현의 차이가 묻힌다. 다음 프레임 기준 배율이 0.96~0.98배이고 CI가 1을 포함한다.

## 수정 모드에서 DOM 변경 수가 다른 이유 (설계 차이)

- mini-react는 **출력 DOM을 비교한다.** `<li id=row_x>`가 그대로이므로 li를 두고 안쪽 4개를 빼고 form 1개를 넣는다.
- React는 **컴포넌트 타입을 비교한다.** `song_row`와 `song_edit_row`는 다른 함수라서 key가 같아도 li를 통째로 갈아 끼운다.
- DOM 변경 수로는 React가 적다. 하지만 li가 유지되지 않으므로, li에 걸린 상태(스크롤, 포커스, CSS 전환)는 mini-react 쪽이 보존한다.

## 개선 방향 (구현하지 않음, 발표 Q&A용)

1. 같은 노드를 가리키는 BIND를 만들지 않는다. 북마크 대신 DOM 노드를 가상 노드에 직접 넘겨주면 연산과 WeakMap 쓰기가 없어진다.
2. `match_children`의 1단계(내용이 같은 자식 찾기)는 HTML 들여쓰기 공백 때문에 생긴 것이다. 컴포넌트가 만든 트리에서는 위치로 짝지어도 충분하므로 이 단계를 건너뛸 수 있다.
3. 트리 전체를 도는 검사(중복 노드, 이벤트 종류)를 diff 순회 한 번에 합친다.

## 타당성 위협

| 위협 | 대응 / 한계 |
|---|---|
| AI가 쓴 React 포팅이 원본과 다를 수 있다 | DOM 동치 게이트로 3 N × 17단계 = 51회 비교했고 모두 일치한다. 첫 실행에서 포팅 결함 1건(`defaultValue` → `value=""`)을 잡아 고쳤다. 결함을 일부러 넣었을 때 막히는 것도 확인했다. |
| React에 `memo`를 쓰면 더 빨라진다 | 원본에 없는 최적화라서 넣지 않았다. 같은 구조끼리 비교한 것이다. |
| 시간 측정 시점 | 두 구현 모두 다시 그리기를 microtask로 예약한다. 그 뒤 microtask에서 재고, 표본마다 렌더가 끝났는지 확인했다(미완료 0건). |
| 기계 한 대, headless, Windows | 절대값보다 **배율**을 본다. CPU 4배 감속, 페이지는 매번 새로 열었고, 작업 순서는 무작위다. |
| N=500 `add_song`이 곡 수 상한(500)에 걸림 | 실행기 결함으로 찾았다. add_song은 488곡에서 시작해 따로 다시 쟀다. |
| 개발용 기능의 비용 | 하이라이트, 렌더 기록, localStorage 저장은 두 구현 모두에서 뺐다. 원본 앱에서는 mini-react 쪽 비용이 더 크다. |
