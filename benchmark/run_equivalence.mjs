// DOM 동치 게이트: 같은 동작 순서를 두 구현에 실행하고 단계마다 DOM 스냅샷을 비교한다.
// 하나라도 다르면 종료 코드 1. 이 게이트를 통과해야 run_bench.mjs 의 시간 비교가 의미를 가진다.
// 단계마다 DOM 변경 수(MutationObserver)도 results/mutations.json 에 남긴다. 이 값은 실행할 때마다 같다(결정적).
import { writeFileSync } from 'node:fs';
import { implementation_names, launch_browser, open_bench_page } from './shared.mjs';

const song_counts = [10, 100, 500];

function create_steps(song_count) {
  const middle_id = `song_${Math.ceil(song_count / 2)}`;
  const next_id = `song_${Math.ceil(song_count / 2) + 1}`;
  return [
    ['mount', { song_count }],
    ['toggle_favorite', { song_id: middle_id }],
    ['toggle_favorite', { song_id: middle_id }],
    ['set_main', { song_id: middle_id }],
    ['set_main', { song_id: next_id }],
    ['move_down', { song_id: middle_id }],
    ['move_up', { song_id: middle_id }],
    ['filter_favorite', {}],
    ['filter_all', {}],
    ['add_song', {}],
    ['add_invalid_song', {}],
    ['start_edit', { song_id: middle_id }],
    ['save_edit', { song_id: middle_id, title: 'Edited Title' }],
    ['start_edit', { song_id: next_id }],
    ['cancel_edit', { song_id: next_id }],
    ['remove_middle', {}],
    ['remove_song', { song_id: 'song_2' }],
  ];
}

const browser = await launch_browser();
const mutation_rows = [];
let mismatch_count = 0;
for (const song_count of song_counts) {
  const step_outputs_by_implementation = {};
  for (const implementation_name of implementation_names) {
    const { page, browser_context, page_errors } = await open_bench_page(browser, implementation_name);
    const step_outputs = [];
    for (const [action_name, action_arguments] of create_steps(song_count)) {
      step_outputs.push(await page.evaluate(([name, args]) => window.bench_page.observe_action(name, args), [action_name, action_arguments]));
    }
    if (page_errors.length > 0) {
      console.error(`[${implementation_name} N=${song_count}] 페이지 오류:`, page_errors);
      mismatch_count += 1;
    }
    step_outputs_by_implementation[implementation_name] = step_outputs;
    await browser_context.close();
  }
  create_steps(song_count).forEach(([action_name], step_index) => {
    const [mini_output, react_output] = implementation_names.map((name) => step_outputs_by_implementation[name][step_index]);
    const is_same_dom = mini_output.dom_snapshot === react_output.dom_snapshot;
    if (!is_same_dom) {
      mismatch_count += 1;
      const first_difference_index = [...mini_output.dom_snapshot].findIndex((character, index) => character !== react_output.dom_snapshot[index]);
      console.error(`DOM 불일치 N=${song_count} step=${step_index} ${action_name}`);
      console.error('  mini :', mini_output.dom_snapshot.slice(Math.max(0, first_difference_index - 120), first_difference_index + 120));
      console.error('  react:', react_output.dom_snapshot.slice(Math.max(0, first_difference_index - 120), first_difference_index + 120));
    }
    for (const implementation_name of implementation_names) {
      const { dom_snapshot, ...counts } = step_outputs_by_implementation[implementation_name][step_index];
      mutation_rows.push({ song_count, step_index, action_name, implementation_name, is_same_dom, ...counts });
    }
  });
  console.log(`N=${song_count}: ${create_steps(song_count).length} 단계 비교 완료`);
}
await browser.close();
writeFileSync('results/mutations.json', JSON.stringify(mutation_rows, null, 2));
console.log(mismatch_count === 0 ? '동치 게이트 통과: 모든 단계에서 DOM 이 같다' : `동치 게이트 실패: ${mismatch_count}건`);
process.exit(mismatch_count === 0 ? 0 : 1);
