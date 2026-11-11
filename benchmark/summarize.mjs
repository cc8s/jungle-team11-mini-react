// results/*.json(l) 를 읽어 results/summary.md 와 results/summary.json 을 만든다.
// 시간: 중앙값·IQR·p95, 배율(mini_react 중앙값 / react_18 중앙값)과 부트스트랩 95% 신뢰구간.
// DOM 변경 수: run_equivalence.mjs 의 결정적 측정값.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const read_jsonl = (file_path) =>
  existsSync(file_path)
    ? readFileSync(file_path, 'utf8')
        .split('\n')
        .filter((line_text) => line_text.trim() !== '')
        .map((line_text) => JSON.parse(line_text))
    : [];

// 본 측정의 add_song 은 곡 수 상한에 걸린 실패 경로였으므로(seed_song_count 없음) 버리고 보충 측정으로 바꾼다.
const main_samples = read_jsonl('results/raw.jsonl').filter((sample) => !(sample.scenario_name === 'add_song' && sample.seed_song_count === undefined));
const supplement_samples = read_jsonl('results/raw_add_song.jsonl');
const samples = [...main_samples, ...supplement_samples];
const mutation_rows = JSON.parse(readFileSync('results/mutations.json', 'utf8'));
const bundle_sizes = JSON.parse(readFileSync('results/bundle_sizes.json', 'utf8'));
const environment = JSON.parse(readFileSync('results/environment.json', 'utf8'));
const implementation_names = ['mini_react', 'react_18'];

function quantile(sorted_numbers, fraction) {
  const position = (sorted_numbers.length - 1) * fraction;
  const lower_index = Math.floor(position);
  const upper_index = Math.ceil(position);
  return sorted_numbers[lower_index] + (sorted_numbers[upper_index] - sorted_numbers[lower_index]) * (position - lower_index);
}

function describe(numbers) {
  const sorted_numbers = [...numbers].sort((left, right) => left - right);
  return {
    sample_count: sorted_numbers.length,
    median_ms: quantile(sorted_numbers, 0.5),
    p25_ms: quantile(sorted_numbers, 0.25),
    p75_ms: quantile(sorted_numbers, 0.75),
    p95_ms: quantile(sorted_numbers, 0.95),
  };
}

function create_seeded_random(seed_number) {
  let state_number = seed_number >>> 0;
  return () => {
    state_number = (state_number * 1664525 + 1013904223) >>> 0;
    return state_number / 2 ** 32;
  };
}

function bootstrap_median_ratio(numerator_numbers, denominator_numbers, resample_count = 2000) {
  const next_random = create_seeded_random(7);
  const resample_median = (numbers) => {
    const resampled_numbers = numbers.map(() => numbers[Math.floor(next_random() * numbers.length)]).sort((left, right) => left - right);
    return quantile(resampled_numbers, 0.5);
  };
  const ratios = [];
  for (let resample_index = 0; resample_index < resample_count; resample_index += 1) {
    ratios.push(resample_median(numerator_numbers) / resample_median(denominator_numbers));
  }
  ratios.sort((left, right) => left - right);
  return { ratio_low: quantile(ratios, 0.025), ratio_high: quantile(ratios, 0.975) };
}

const is_mount_sample_usable = (sample) => sample.action_name !== 'mount' || sample.seed_song_count === undefined || sample.seed_song_count === sample.song_count;
const usable_samples = samples.filter(is_mount_sample_usable);
const group_keys = [...new Set(usable_samples.map((sample) => `${sample.song_count}|${sample.action_name}`))];
const action_order = ['mount', 'toggle_favorite', 'set_main', 'move_down', 'move_up', 'filter_favorite', 'filter_all', 'add_song', 'remove_middle'];
group_keys.sort((left_key, right_key) => {
  const [left_count, left_action] = left_key.split('|');
  const [right_count, right_action] = right_key.split('|');
  return Number(left_count) - Number(right_count) || action_order.indexOf(left_action) - action_order.indexOf(right_action);
});

const timing_rows = [];
for (const group_key of group_keys) {
  const [song_count_text, action_name] = group_key.split('|');
  const timing_row = { song_count: Number(song_count_text), action_name };
  for (const metric_name of ['script_ms', 'frame_ms']) {
    const numbers_by_implementation = Object.fromEntries(
      implementation_names.map((implementation_name) => [
        implementation_name,
        usable_samples
          .filter((sample) => `${sample.song_count}|${sample.action_name}` === group_key && sample.implementation_name === implementation_name)
          .map((sample) => sample[metric_name]),
      ]),
    );
    timing_row[metric_name] = {
      mini_react: describe(numbers_by_implementation.mini_react),
      react_18: describe(numbers_by_implementation.react_18),
      ...bootstrap_median_ratio(numbers_by_implementation.mini_react, numbers_by_implementation.react_18),
    };
    timing_row[metric_name].median_ratio = timing_row[metric_name].mini_react.median_ms / timing_row[metric_name].react_18.median_ms;
  }
  timing_rows.push(timing_row);
}

const action_samples = usable_samples.filter((sample) => sample.action_name !== 'mount');
const uncommitted_count = action_samples.filter((sample) => sample.is_committed_at_script !== true).length;
const render_counts = [...new Set(action_samples.map((sample) => sample.render_count))];

const format_ms = (number) => number.toFixed(1);
const format_ratio = (number) => `${number.toFixed(2)}×`;
const lines = [];
lines.push('# 최애곡 모음: mini-react vs React 18 벤치마크 결과', '');
lines.push(`- 측정: ${environment.started_at} ~ ${environment.finished_at ?? '(진행 중)'}`);
lines.push(`- 환경: ${environment.cpu_model} (${environment.cpu_count} 논리 코어), RAM ${environment.total_memory_gb}GB, Windows ${environment.os_release}, Node ${environment.node_version}, Chromium ${environment.chromium_version} headless`);
lines.push(`- CPU 감속 ${environment.cpu_throttle_rate}배(CDP), 조합마다 새 페이지 ${environment.page_count_per_job}개 × (워밍업 ${environment.warmup_action_count} + 측정 ${environment.measured_action_count}회), 작업 순서는 시드 고정 무작위`);
lines.push(`- 표본 ${usable_samples.length}개. 측정 시점에 렌더가 끝나지 않은 표본 ${uncommitted_count}개, 동작 1번당 렌더 횟수 ${render_counts.join(', ')}`);
lines.push('');
lines.push('## 1. DOM 동치 게이트', '');
const compared_step_count = mutation_rows.length / implementation_names.length;
const mismatched_step_count = mutation_rows.filter((row) => !row.is_same_dom).length / implementation_names.length;
lines.push(`- 곡 수 ${[...new Set(mutation_rows.map((row) => row.song_count))].join(' / ')} × 17단계 = ${compared_step_count}회 비교, 불일치 ${mismatched_step_count}회`);
lines.push('- attribute 순서는 정렬해서 비교한다. input 의 value property 도 함께 비교한다.', '');
lines.push('## 2. 번들 크기 (esbuild, minify, production)', '');
lines.push('| 구현 | raw | gzip |', '|---|---:|---:|');
for (const implementation_name of implementation_names) {
  const bundle_size = bundle_sizes[implementation_name];
  lines.push(`| ${implementation_name} | ${(bundle_size.raw_bytes / 1024).toFixed(1)} KB | ${(bundle_size.gzip_bytes / 1024).toFixed(1)} KB |`);
}
lines.push('', '모델(song_board_model.js)은 둘 다 포함한다. 차이는 거의 react-dom 크기다.', '');
lines.push('## 3. DOM 변경 수 (MutationObserver, 결정적)', '');
lines.push('표기: 합계 (추가 / 삭제 / attribute / 텍스트). 같은 동작이 여러 번 있으면 첫 번째 것만 적는다.', '');
for (const song_count of [100, 500]) {
  lines.push(`### N = ${song_count}`, '', '| 동작 | mini_react | react_18 | 같음 |', '|---|---|---|:---:|');
  const seen_action_names = new Set();
  const rows_for_count = mutation_rows.filter((row) => row.song_count === song_count);
  for (const step_index of [...new Set(rows_for_count.map((row) => row.step_index))]) {
    const [mini_row, react_row] = implementation_names.map((name) => rows_for_count.find((row) => row.step_index === step_index && row.implementation_name === name));
    if (seen_action_names.has(mini_row.action_name)) continue;
    seen_action_names.add(mini_row.action_name);
    const format_counts = (row) => `${row.total_mutation_count} (${row.added_node_count} / ${row.removed_node_count} / ${row.attribute_change_count} / ${row.text_change_count})`;
    lines.push(`| ${mini_row.action_name} | ${format_counts(mini_row)} | ${format_counts(react_row)} | ${mini_row.total_mutation_count === react_row.total_mutation_count ? '✓' : '✗'} |`);
  }
  lines.push('');
}
for (const [metric_name, metric_title] of [
  ['script_ms', '스크립트 시간 (이벤트 → 렌더·patch·effect 완료)'],
  ['frame_ms', '다음 프레임까지 (스타일·레이아웃·페인트 포함)'],
]) {
  lines.push(`## ${metric_name === 'script_ms' ? 4 : 5}. ${metric_title}, ms`, '');
  lines.push('배율 = mini_react 중앙값 ÷ react_18 중앙값. 1보다 크면 mini_react 가 느리다. 괄호는 부트스트랩 95% 신뢰구간.', '');
  lines.push('| N | 동작 | mini 중앙값 [IQR] | React 중앙값 [IQR] | mini p95 | React p95 | 배율 (95% CI) | 표본 |', '|---:|---|---:|---:|---:|---:|---:|---:|');
  for (const timing_row of timing_rows) {
    const metric_stats = timing_row[metric_name];
    const format_stats = (stats) => `${format_ms(stats.median_ms)} [${format_ms(stats.p25_ms)}–${format_ms(stats.p75_ms)}]`;
    lines.push(
      `| ${timing_row.song_count} | ${timing_row.action_name} | ${format_stats(metric_stats.mini_react)} | ${format_stats(metric_stats.react_18)} | ${format_ms(metric_stats.mini_react.p95_ms)} | ${format_ms(metric_stats.react_18.p95_ms)} | **${format_ratio(metric_stats.median_ratio)}** (${format_ratio(metric_stats.ratio_low)}–${format_ratio(metric_stats.ratio_high)}) | ${metric_stats.mini_react.sample_count}/${metric_stats.react_18.sample_count} |`,
    );
  }
  lines.push('');
}
writeFileSync('results/summary.md', lines.join('\n'));
writeFileSync('results/summary.json', JSON.stringify({ environment, bundle_sizes, timing_rows, uncommitted_count, render_counts }, null, 2));
console.log(lines.join('\n'));
