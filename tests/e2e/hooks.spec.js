// #8 useState 리뷰에서 재현된 결함의 시스템 테스트 (실제 Chromium). 계약은 tests/unit/hooks.test.js 맨 위
// "#8 리뷰" 절. jsdom 과 실제 브라우저가 다를 수 있는 지점을 실제 입력(locator.click / press)으로 확인한다.
//   - (e5) 체크박스 onClick 에서 preventDefault + setState: 브라우저는 취소된 activation 을 dispatch 가 끝난 뒤
//     되돌린다. 그 뒤에도 .checked 는 상태 값이어야 한다.
//   - (e1) 제어 input / select / checkbox: 핸들러가 상태를 안 바꾸면 화면 값은 마지막 VNode 값으로 돌아간다.
//   - (e3) custom element 의 attributeChangedCallback(patch 의 setAttribute 안)에서 setState: DOM = render(vnode).
//   - (e6·e7) 제어 textarea / select 의 값이 render·patch 모두 value prop.
// 데모 화면은 쓰지 않는다: 페이지에서 src 모듈을 동적 import 해 컴포넌트를 따로 띄운다.
import { test, expect } from '@playwright/test';

const SRC = '/jungle-team11-mini-react/src';
const root = (page) => page.getByTestId('hook-root');
const quick = { timeout: 1500 };

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  await page.goto('./');
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test('E2E-HOOK-001 (e5) 체크박스 onClick 에서 preventDefault + setState(p => !p): 실제 클릭 뒤 .checked 는 상태 값', async ({ page }) => {
  await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const container = document.createElement('div');
    container.dataset.testid = 'hook-root';
    document.body.appendChild(container);
    new FunctionComponent(() => {
      const [on, setOn] = useState(false);
      return h('div', null,
        h('input', { type: 'checkbox', checked: on, onClick: (e) => { e.preventDefault(); setOn((p) => !p); } }),
        h('span', null, on ? 'on' : 'off'),
      );
    }).mount(container);
  }, SRC);

  const box = root(page).locator('input');
  const label = root(page).locator('span');

  await box.click();
  await expect(label).toHaveText('on', quick);
  await expect(box).toBeChecked(quick);
  // 다음 작업(타이머 뒤)까지 기다려도 그대로
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  expect(await box.evaluate((el) => el.checked)).toBe(true);

  await box.click();
  await expect(label).toHaveText('off', quick);
  await expect(box).not.toBeChecked(quick);
});

test('E2E-HOOK-002 (e1) 숫자만 받는 제어 input 에 실제로 "1", "a", "2" 입력 → "1", "1", "12"', async ({ page }) => {
  await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const container = document.createElement('div');
    container.dataset.testid = 'hook-root';
    document.body.appendChild(container);
    new FunctionComponent(() => {
      const [v, setV] = useState('');
      return h('div', null,
        h('input', { class: 'num', value: v, onInput: (e) => setV(e.target.value.replace(/\D/g, '')) }),
        h('input', { class: 'free', onInput: () => {} }),
      );
    }).mount(container);
  }, SRC);

  const num = root(page).locator('input.num');
  await num.click();
  await num.press('1');
  await expect(num).toHaveValue('1', quick);
  await num.press('a');
  await expect(num).toHaveValue('1', quick);
  await num.press('2');
  await expect(num).toHaveValue('12', quick);

  // 비제어 input 은 입력 그대로
  const free = root(page).locator('input.free');
  await free.pressSequentially('hi');
  await expect(free).toHaveValue('hi', quick);
});

test('E2E-HOOK-003 (e1) 핸들러가 상태를 안 바꾸는 제어 checkbox·select: 실제 클릭·선택 뒤 VNode 값으로 돌아간다', async ({ page }) => {
  await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const container = document.createElement('div');
    container.dataset.testid = 'hook-root';
    document.body.appendChild(container);
    new FunctionComponent(() => {
      const [sel] = useState('a');
      const [on] = useState(false);
      return h('div', null,
        h('select', { value: sel, onChange: () => {} }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
        h('input', { type: 'checkbox', checked: on, onClick: () => {} }),
      );
    }).mount(container);
  }, SRC);

  const box = root(page).locator('input');
  await box.click();
  await expect(box).not.toBeChecked(quick);

  const select = root(page).locator('select');
  await select.selectOption('b');
  await expect(select).toHaveValue('a', quick);
});

test('E2E-HOOK-004 (e3) attributeChangedCallback(patch 도중)에서 setState → data-v="2" 와 <p>2</p>, DOM = render(vnode)', async ({ page }) => {
  const result = await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const { render } = await import(`${src}/vdom/render.js`);
    let setN;
    customElements.define('x-echo-e2e', class extends HTMLElement {
      static get observedAttributes() { return ['data-v']; }
      attributeChangedCallback(_a, _o, v) { if (v === '1') setN(2); }
    });
    const container = document.createElement('div');
    container.dataset.testid = 'hook-root';
    document.body.appendChild(container);
    const comp = new FunctionComponent(() => {
      const [n, s] = useState(0);
      setN = s;
      return h('div', null, h('x-echo-e2e', { 'data-v': String(n) }), h('p', null, String(n)));
    });
    comp.mount(container);
    setN(1);
    await new Promise((r) => setTimeout(r, 0));
    return { html: container.innerHTML, same: comp.dom.isEqualNode(render(comp.vnode)) };
  }, SRC);

  expect(result.html).toBe('<div><x-echo-e2e data-v="2"></x-echo-e2e><p>2</p></div>');
  expect(result.same).toBe(true);
});

test('E2E-HOOK-005 (e6·e7) 제어 textarea·select: mount 와 patch 모두 value prop (새 option 과 같은 렌더, 자식 텍스트 변경)', async ({ page }) => {
  const result = await page.evaluate(async (src) => {
    const { FunctionComponent } = await import(`${src}/core/component.js`);
    const { useState } = await import(`${src}/core/hooks.js`);
    const { h } = await import(`${src}/vdom/vnode.js`);
    const tick = () => new Promise((r) => setTimeout(r, 0));
    let set;
    const container = document.createElement('div');
    container.dataset.testid = 'hook-root';
    document.body.appendChild(container);
    new FunctionComponent(() => {
      const [s, setS] = useState({ opts: ['a', 'b'], sel: 'b', text: 'a', note: 'x' });
      set = setS;
      return h('div', null,
        h('select', { value: s.sel }, s.opts.map((o) => h('option', { value: o }, o.toUpperCase()))),
        h('textarea', { value: s.text }, s.note),
      );
    }).mount(container);
    const select = container.querySelector('select');
    const area = container.querySelector('textarea');
    const out = { mountSelect: select.value, mountArea: area.value };
    set((p) => ({ ...p, opts: ['a', 'b', 'c'], sel: 'c' }));
    await tick();
    out.addedSelect = select.value;
    set((p) => ({ ...p, note: 'y' }));
    await tick();
    out.noteArea = area.value;
    return out;
  }, SRC);

  expect(result).toEqual({ mountSelect: 'b', mountArea: 'a', addedSelect: 'c', noteArea: 'a' });
});
