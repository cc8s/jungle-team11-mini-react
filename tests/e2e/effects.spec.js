// #9 useEffect 의 시스템 테스트 (실제 Chromium). 계약은 tests/unit/effects.test.js 맨 위 주석.
// jsdom 에는 레이아웃과 실제 resize 가 없으므로 그 두 가지만 브라우저에서 확인한다.
//   - effect 는 commit 뒤에 실행되므로 그 안에서 측정한 크기는 이번 렌더의 DOM 크기다.
//   - [] effect 의 window 리스너는 unmount 의 cleanup 으로 떨어진다.
// 데모 화면은 쓰지 않는다: 페이지에서 src 모듈을 동적 import 해 컴포넌트를 따로 띄운다.
import { test, expect } from '@playwright/test';

const SRC = '/jungle-team11-mini-react/src';
const root = (page) => page.getByTestId('effect-root');
const quick = { timeout: 1500 };

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  await page.goto('./');
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test('E2E-EFF-001 effect 안에서 측정한 폭은 이번 렌더의 DOM 폭이다 (텍스트가 길어지면 측정값도 커짐)', async ({ page }) => {
  await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState, useEffect } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const container = document.createElement('div');
    container.dataset.testid = 'effect-root';
    document.body.appendChild(container);
    new FunctionComponent(() => {
      const [text, setText] = useState('W');
      const [width, setWidth] = useState(0);
      useEffect(() => {
        const span = container.querySelector('span');
        setWidth(Math.round(span.getBoundingClientRect().width));
      }, [text]);
      return h('div', null,
        h('span', null, text),
        h('button', { onClick: () => setText((t) => t + 'WWWWWWWWWW') }, 'grow'),
        h('output', null, String(width)),
      );
    }).mount(container);
  }, SRC);

  const out = root(page).locator('output');
  const span = root(page).locator('span');
  await expect(out).not.toHaveText('0', quick);
  const first = Number(await out.textContent());
  expect(first).toBe(Math.round((await span.boundingBox()).width));
  expect(first).toBeGreaterThan(0);

  await root(page).locator('button').click();
  await expect(out).not.toHaveText(String(first), quick);
  const second = Number(await out.textContent());
  expect(second).toBeGreaterThan(first);
  expect(second).toBe(Math.round((await span.boundingBox()).width));
});

test('E2E-EFF-002 [] effect 의 resize 리스너는 실제 창 크기 변경에 반응하고, unmount 뒤에는 떨어져 있다', async ({ page }) => {
  await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState, useEffect } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const container = document.createElement('div');
    container.dataset.testid = 'effect-root';
    document.body.appendChild(container);
    window.__resizeCalls = 0;
    const comp = new FunctionComponent(() => {
      const [w, setW] = useState(window.innerWidth);
      useEffect(() => {
        const on = () => {
          window.__resizeCalls += 1;
          setW(window.innerWidth);
        };
        window.addEventListener('resize', on);
        return () => window.removeEventListener('resize', on);
      }, []);
      return h('p', null, String(w));
    });
    comp.mount(container);
    window.__unmountEffect = () => comp.unmount();
  }, SRC);

  await page.setViewportSize({ width: 700, height: 500 });
  await expect(root(page).locator('p')).toHaveText('700', quick);
  const calls = await page.evaluate(() => window.__resizeCalls);
  expect(calls).toBeGreaterThan(0);

  await page.evaluate(() => window.__unmountEffect());
  await expect(root(page).locator('p')).toHaveCount(0, quick);
  await page.setViewportSize({ width: 640, height: 480 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  expect(await page.evaluate(() => window.__resizeCalls)).toBe(calls);
});
