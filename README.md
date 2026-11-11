# Mini React

> **Krafton Jungle WEEK11-12 · Team 11** — [mini-react](https://github.com/cc8s/jungle-team11-mini-react) · [mini-redis](https://github.com/cc8s/jungle-team11-mini-redis) · [mini-dbms](https://github.com/cc8s/jungle-team11-mini-dbms) · [보드](https://github.com/users/cc8s/projects/9)

Virtual DOM · Diff · Patch 와 함수형 Component · Hooks(`useState` / `useEffect` / `useMemo`) 를 **Vanilla JS 로 직접 구현**한 미니 리액트.

- 데모: https://cc8s.github.io/jungle-team11-mini-react/ (준비 중)

## 아키텍처

<!-- 흐름도: DOM → VNode → diff → patch → 실제 DOM / setState → update() → 새 VNode → diff → patch -->

## 핵심 로직

### Phase 1 — Virtual DOM · Diff · Patch

<!-- VNode 구조, DOM→VNode 변환 규칙(공백·주석 노드 처리), Diff 5 케이스, Patch 반영 방식, MutationObserver 로그 -->

### Phase 2 — Component · State · Hooks

<!-- FunctionComponent(hooks 배열, mount, update), "함수는 매번 새로 실행되는데 상태는 어떻게 유지하나", batching -->

## 테스트

| 구분 | 내용 |
|---|---|
| 단위 | |
| 기능 | |
| 엣지 케이스 | |

## 실제 React 와의 차이

## 한계와 다음 단계

## 팀

| 이름 | GitHub | 역할 |
|---|---|---|
| | [@cc8s](https://github.com/cc8s) | |
| | [@bloro-sh](https://github.com/bloro-sh) | |

## Contributing

- `main` 에 직접 push 하지 않는다. 브랜치 → PR → 리뷰 1명 승인 → merge
- 브랜치: `feat/<주제>`, `fix/<주제>`, `docs/<주제>`
- 커밋: `[Feat]` `[Fix]` `[Test]` `[Docs]` `[Refactor]` `[Chore]` + 제목, 빈 줄, 한 줄 설명
- 이슈 1개 ↔ PR 1개. PR 본문에 `Closes #이슈번호`
