# 최애곡 모음 벤치마크: mini-react vs React 18

Phase 2 최애곡 모음(`../src/song_board.js`)을 React 18.3.1로 똑같이 만들어 성능을 비교한다.
모델(`../src/song_board_model.js`)은 두 구현이 같은 파일을 쓴다. 라이브러리 코드(`../src`)와 루트 `package.json`은 바꾸지 않는다. React와 측정 도구는 이 폴더의 `package.json`에만 있다.

- 결과: [results/summary.md](results/summary.md) · 분석: [results/analysis.md](results/analysis.md)

## 실행

```bash
cd benchmark
npm install
npx playwright install chromium   # 처음 한 번
npm run build         # 두 구현 번들 + gzip 크기
npm run equivalence   # DOM 동치 게이트(불일치하면 종료 코드 1) + DOM 변경 수
npm run bench         # 시간 측정 → results/raw.jsonl
bench_scenarios=add_song bench_output=results/raw_add_song.jsonl node run_bench.mjs
node summarize.mjs    # results/summary.md
node run_profile.mjs && npm run build   # (선택) CPU 프로파일. 끝나면 minify 번들로 되돌린다
```

## 구성

| 파일 | 역할 |
|---|---|
| `src/react_song_board.js` | React 포팅. 원본 함수와 1:1로 대응한다 |
| `src/entry_*.js` | 두 구현을 같은 API(`mount_board`, `read_render_count`)로 띄운다 |
| `src/bench_page.js` | 실제 DOM 이벤트로 동작을 일으키고, 시간과 DOM 스냅샷을 잰다 |
| `run_equivalence.mjs` | 17단계 동작마다 두 구현의 DOM을 비교하고 DOM 변경 수를 기록한다 |
| `run_bench.mjs` | 구현 × 곡 수(100, 500) × 시나리오 6개 × 새 페이지 10개 × (워밍업 2 + 측정 10), CPU 4배 감속 |
| `summarize.mjs` | 중앙값·IQR·p95, 배율과 부트스트랩 95% CI |
| `run_profile.mjs` | CDP CPU 프로파일로 함수별 self time 집계 |
