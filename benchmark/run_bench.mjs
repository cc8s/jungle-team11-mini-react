// 시간 측정: 구현 × 곡 수 × 시나리오마다 새 페이지 여러 개를 열고, 워밍업 뒤 같은 동작을 반복해 잰다.
// CPU 4배 감속(CDP), 작업 순서는 시드 고정 무작위로 섞는다. 결과는 한 줄에 표본 하나씩 results/raw.jsonl.
import { writeFileSync, appendFileSync } from 'node:fs';
import { cpus, totalmem, release } from 'node:os';
import { implementation_names, launch_browser, open_bench_page } from './shared.mjs';

const song_counts = (process.env.bench_song_counts ?? '100,500').split(',').map(Number);
const page_count_per_job = Number(process.env.bench_page_count ?? 10);
const warmup_action_count = 2;
const measured_action_count = 10;
const cpu_throttle_rate = Number(process.env.bench_cpu_throttle ?? 4);
const output_path = process.env.bench_output ?? 'results/raw.jsonl';
const selected_scenario_names = process.env.bench_scenarios?.split(',') ?? null;

// 시나리오: 동작 순번 → [동작 이름, 인자]
const scenarios = {
  toggle_favorite: (action_index, middle_id) => ['toggle_favorite', { song_id: middle_id }],
  set_main: (action_index, middle_id, next_id) => ['set_main', { song_id: action_index % 2 === 0 ? middle_id : next_id }],
  move_row: (action_index, middle_id) => [action_index % 2 === 0 ? 'move_down' : 'move_up', { song_id: middle_id }],
  filter_toggle: (action_index) => [action_index % 2 === 0 ? 'filter_favorite' : 'filter_all', {}],
  add_song: () => ['add_song', {}],
  remove_middle: () => ['remove_middle', {}],
};

function create_seeded_random(seed_number) {
  let state_number = seed_number >>> 0;
  return () => {
    state_number = (state_number * 1664525 + 1013904223) >>> 0;
    return state_number / 2 ** 32;
  };
}

const jobs = [];
for (const implementation_name of implementation_names)
  for (const song_count of song_counts)
    for (const scenario_name of Object.keys(scenarios).filter((name) => selected_scenario_names === null || selected_scenario_names.includes(name)))
      for (let page_index = 0; page_index < page_count_per_job; page_index += 1) jobs.push({ implementation_name, song_count, scenario_name, page_index });
const next_random = create_seeded_random(20261111);
for (let index = jobs.length - 1; index > 0; index -= 1) {
  const swap_index = Math.floor(next_random() * (index + 1));
  [jobs[index], jobs[swap_index]] = [jobs[swap_index], jobs[index]];
}

const browser = await launch_browser();
const environment = {
  started_at: new Date().toISOString(),
  os_release: release(),
  cpu_model: cpus()[0]?.model,
  cpu_count: cpus().length,
  total_memory_gb: Math.round(totalmem() / 2 ** 30),
  node_version: process.version,
  chromium_version: browser.version(),
  cpu_throttle_rate,
  page_count_per_job,
  warmup_action_count,
  measured_action_count,
};
const is_main_output = output_path === 'results/raw.jsonl';
if (is_main_output) writeFileSync('results/environment.json', JSON.stringify(environment, null, 2));
writeFileSync(output_path, '');

let finished_job_count = 0;
for (const job of jobs) {
  const { page, browser_context, page_errors } = await open_bench_page(browser, job.implementation_name, cpu_throttle_rate);
  // 곡 수 상한(maximum_song_count = 500)에서 add_song 이 실패 경로를 재지 않도록, add_song 은 반복 횟수만큼 적게 시작한다.
  // 이 페이지의 mount 는 곡 수가 달라 집계에서 뺀다(seed_song_count 로 구분).
  const seed_song_count = job.scenario_name === 'add_song' ? job.song_count - warmup_action_count - measured_action_count : job.song_count;
  const mount_sample = await page.evaluate((song_count) => window.bench_page.measure_mount(song_count), seed_song_count);
  appendFileSync(output_path, JSON.stringify({ ...job, seed_song_count, action_name: 'mount', action_index: 0, ...mount_sample }) + '\n');
  const middle_id = `song_${Math.ceil(seed_song_count / 2)}`;
  const next_id = `song_${Math.ceil(seed_song_count / 2) + 1}`;
  for (let action_index = 0; action_index < warmup_action_count + measured_action_count; action_index += 1) {
    const [action_name, action_arguments] = scenarios[job.scenario_name](action_index, middle_id, next_id);
    const action_sample = await page.evaluate(([name, args]) => window.bench_page.measure_action(name, args), [action_name, action_arguments]);
    if (action_index < warmup_action_count) continue;
    appendFileSync(output_path, JSON.stringify({ ...job, seed_song_count, action_name, action_index, ...action_sample }) + '\n');
  }
  if (page_errors.length > 0) throw new Error(`${JSON.stringify(job)} 페이지 오류: ${page_errors.join(' | ')}`);
  await browser_context.close();
  finished_job_count += 1;
  if (finished_job_count % 20 === 0) console.log(`${finished_job_count}/${jobs.length}`);
}
await browser.close();
if (is_main_output) writeFileSync('results/environment.json', JSON.stringify({ ...environment, finished_at: new Date().toISOString() }, null, 2));
console.log(`완료: ${jobs.length} 페이지`);
