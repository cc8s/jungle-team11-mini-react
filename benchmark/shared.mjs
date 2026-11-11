// 실행기 공통: 브라우저 열기, 벤치 페이지 열기.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const implementation_names = ['mini_react', 'react_18'];
export const bench_page_url = pathToFileURL(resolve('bench.html')).href;

export async function launch_browser() {
  return chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] });
}

export async function open_bench_page(browser, implementation_name, cpu_throttle_rate = 1) {
  const browser_context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await browser_context.newPage();
  const page_errors = [];
  page.on('pageerror', (page_error) => page_errors.push(String(page_error)));
  page.on('console', (console_message) => {
    if (console_message.type() === 'error') page_errors.push(console_message.text());
  });
  if (cpu_throttle_rate !== 1) {
    const cdp_session = await browser_context.newCDPSession(page);
    await cdp_session.send('Emulation.setCPUThrottlingRate', { rate: cpu_throttle_rate });
  }
  await page.goto(`${bench_page_url}?implementation=${implementation_name}`);
  await page.waitForFunction(() => window.bench_page?.is_ready());
  return { page, browser_context, page_errors };
}
