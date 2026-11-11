// 원인 분석: N=500 에서 동작을 반복하는 동안 CPU 프로파일(CDP Profiler)을 떠서 함수별 self time 을 모은다.
// 원본 이름을 보려고 minify 하지 않은 번들(dist_profile/)을 쓴다. 결과: results/profile_<구현>_<동작>.json
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { implementation_names, launch_browser, open_bench_page } from './shared.mjs';

const song_count = 500;
const repeat_count = 20;
const profiled_actions = { toggle_favorite: (index, middle_id) => ['toggle_favorite', { song_id: middle_id }] };

for (const implementation_name of implementation_names) {
  await build({
    entryPoints: [implementation_name === 'mini_react' ? 'src/entry_mini_react.js' : 'src/entry_react.js'],
    outfile: `dist/${implementation_name}.js`, bundle: true, format: 'iife', minify: false, target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  });
}
const browser = await launch_browser();
for (const implementation_name of implementation_names) {
  for (const [scenario_name, create_action] of Object.entries(profiled_actions)) {
    const { page, browser_context } = await open_bench_page(browser, implementation_name);
    await page.evaluate((count) => window.bench_page.measure_mount(count), song_count);
    const cdp_session = await browser_context.newCDPSession(page);
    await cdp_session.send('Profiler.enable');
    await cdp_session.send('Profiler.setSamplingInterval', { interval: 50 });
    await cdp_session.send('Profiler.start');
    for (let index = 0; index < repeat_count; index += 1) {
      const [action_name, action_arguments] = create_action(index, `song_${song_count / 2}`);
      await page.evaluate(([name, args]) => window.bench_page.measure_action(name, args), [action_name, action_arguments]);
    }
    const { profile } = await cdp_session.send('Profiler.stop');
    const sample_interval_ms = (profile.endTime - profile.startTime) / 1000 / profile.samples.length;
    const self_ms_by_function = new Map();
    const hit_counts = new Map();
    for (const sample_id of profile.samples) hit_counts.set(sample_id, (hit_counts.get(sample_id) ?? 0) + 1);
    for (const profile_node of profile.nodes) {
      const function_label = `${profile_node.callFrame.functionName || '(anonymous)'} @${profile_node.callFrame.url.split('/').pop()}:${profile_node.callFrame.lineNumber + 1}`;
      self_ms_by_function.set(function_label, (self_ms_by_function.get(function_label) ?? 0) + (hit_counts.get(profile_node.id) ?? 0) * sample_interval_ms);
    }
    const ranked_functions = [...self_ms_by_function.entries()].sort((left, right) => right[1] - left[1]).slice(0, 25)
      .map(([function_label, self_ms]) => ({ function_label, self_ms_per_action: self_ms / repeat_count }));
    writeFileSync(`results/profile_${implementation_name}_${scenario_name}.json`, JSON.stringify(ranked_functions, null, 2));
    console.log(`\n== ${implementation_name} ${scenario_name} N=${song_count} (동작 1번당 self ms, 감속 없음)`);
    for (const ranked_function of ranked_functions.slice(0, 14)) console.log(ranked_function.self_ms_per_action.toFixed(2).padStart(7), ranked_function.function_label);
    await browser_context.close();
  }
}
await browser.close();
