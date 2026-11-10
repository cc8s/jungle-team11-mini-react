// Phase 2 데모(오목)의 시스템 테스트 (실제 Chromium). 계약 전체는 tests/integration/app.test.js 맨 위 주석.
// jsdom 으로는 확인할 수 없는 것만 본다.
//   - main.js 탭 전환: Phase 2 mount / 떠날 때 unmount + 쿼리 지움, ?a= 로 들어오면 Phase 2 탭
//   - 실제 클릭이 겹친 격자(선 격자 + 교차점 격자) 위에서 칸에 닿는다 (레이아웃)
//   - 브라우저의 진짜 뒤로/앞으로(popstate) = 무르기/다시, 기록 수가 늘지 않음
//   - 새로고침·링크로 들어와도 복원, 잘못된 ?a= 에도 pageerror 없음
//   - 탭을 떠날 때 unmount 로 popstate 리스너가 실제로 해제된다 (E2E-APP-006: window 의 add/removeEventListener 를
//     init script 로 감싸 지금 붙어 있는 popstate 리스너 수를 센다. DOM 만 지우면 떼어 낸 App 이 리스너로 남는다)
import { test, expect } from '@playwright/test';

const id = (page, name) => page.getByTestId(name);
const cellAt = (page, i) => page.locator(`[data-index="${i}"]`);
const tab = (page, name) => page.locator(`[data-tab="${name}"]`);
const idx = (r, c) => r * 19 + c;
const enc = (moves) => Buffer.from(JSON.stringify(moves)).toString('base64');
const aParam = (page) => new URL(page.url()).searchParams.get('a');

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

async function openApp(page) {
  await page.goto('./');
  await tab(page, 'app').click();
  await expect(id(page, 'app')).toBeVisible();
}

test('E2E-APP-001 탭 전환: Phase 2 mount → 한 수 → Phase 1 (쿼리 지움, App 사라짐) → Phase 2 는 빈 판', async ({ page }) => {
  await page.goto('./');
  await expect(id(page, 'real')).toBeVisible();
  await tab(page, 'app').click();
  await expect(id(page, 'app')).toBeVisible();
  await expect(id(page, 'board').locator(':scope > *')).toHaveCount(361);
  await expect(id(page, 'status')).toHaveText('흑 차례');
  await expect(tab(page, 'app')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'phase1')).toHaveAttribute('aria-pressed', 'false');

  await cellAt(page, 180).click();
  await expect(cellAt(page, 180)).toHaveClass('cell b');
  expect(aParam(page)).toBe(enc([180]));

  await tab(page, 'phase1').click();
  await expect(id(page, 'real')).toBeVisible();
  await expect(id(page, 'app')).toHaveCount(0);
  await expect(id(page, 'stats')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');

  await tab(page, 'app').click();
  await expect(id(page, 'status')).toHaveText('흑 차례');
  await expect(cellAt(page, 180)).toHaveClass('cell');
});

test('E2E-APP-002 실제 클릭으로 5목: 한 수마다 렌더 1·patch 3, 흑 승리 뒤 클릭 무시', async ({ page }) => {
  await openApp(page);
  const black = [5, 6, 7, 8, 9].map((c) => idx(9, c));
  const white = [5, 6, 7, 8].map((c) => idx(10, c));

  await cellAt(page, black[0]).click();
  await expect(id(page, 'renders')).toHaveText('1');
  await expect(id(page, 'patches')).toHaveText('3');
  await expect(cellAt(page, black[0])).toHaveAttribute('data-move', '1');

  for (let k = 0; k < 4; k++) {
    await cellAt(page, white[k]).click();
    await cellAt(page, black[k + 1]).click();
  }
  await expect(id(page, 'status')).toHaveText('흑 승리');
  await expect(id(page, 'stones')).toHaveText('흑 5 · 백 4');
  await expect(cellAt(page, black[4])).toHaveAttribute('aria-label', '10행 10열 흑 9수');

  const url = page.url();
  await cellAt(page, 0).click();
  await expect(cellAt(page, 0)).toHaveClass('cell');
  expect(page.url()).toBe(url);
});

test('E2E-APP-003 브라우저 뒤로 = 무르기, 앞으로 = 다시 (렌더 1번, 기록 수 그대로)', async ({ page }) => {
  await openApp(page);
  for (const i of [180, 181, 182]) await cellAt(page, i).click();
  await expect(cellAt(page, 182)).toHaveClass('cell b');
  const length = await page.evaluate(() => history.length);

  await page.goBack();
  await expect(cellAt(page, 182)).toHaveClass('cell');
  await expect(id(page, 'status')).toHaveText('흑 차례');
  await expect(id(page, 'renders')).toHaveText('1');
  await expect(id(page, 'patches')).toHaveText('3');
  await page.goBack();
  await expect(cellAt(page, 181)).toHaveClass('cell');
  await expect(cellAt(page, 180)).toHaveClass('cell b');

  await page.goForward();
  await page.goForward();
  await expect(cellAt(page, 182)).toHaveClass('cell b');
  await expect(cellAt(page, 182)).toHaveAttribute('data-move', '3');
  await expect(id(page, 'status')).toHaveText('백 차례');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(aParam(page)).toBe(enc([180, 181, 182]));
});

test('E2E-APP-004 새로고침·링크로 들어오면 Phase 2 탭으로 복원', async ({ page }) => {
  await openApp(page);
  await cellAt(page, 180).click();
  await cellAt(page, 181).click();
  await page.reload();
  await expect(tab(page, 'app')).toHaveAttribute('aria-pressed', 'true');
  await expect(cellAt(page, 180)).toHaveClass('cell b');
  await expect(cellAt(page, 181)).toHaveClass('cell w');
  await expect(cellAt(page, 181)).toHaveAttribute('data-move', '2');
  await expect(id(page, 'status')).toHaveText('흑 차례');

  await page.goto(`./?a=${enc([0])}`);
  await expect(tab(page, 'app')).toHaveAttribute('aria-pressed', 'true');
  await expect(cellAt(page, 0)).toHaveClass('cell b');
  await expect(id(page, 'status')).toHaveText('백 차례');
});

test('E2E-APP-005 잘못된 ?a= 는 빈 판으로 시작 (pageerror 없음), 이어서 둘 수 있다', async ({ page }) => {
  const bad = ['!!!', enc([0, 0]), Buffer.from('{"x":1}').toString('base64'), enc([361])];
  for (const param of bad) {
    await page.goto(`./?a=${encodeURIComponent(param)}`);
    await expect(id(page, 'app')).toBeVisible();
    await expect(id(page, 'status')).toHaveText('흑 차례');
    await expect(id(page, 'stones')).toHaveText('흑 0 · 백 0');
    await expect(cellAt(page, 0)).toHaveClass('cell');
  }
  await cellAt(page, 0).click();
  await expect(cellAt(page, 0)).toHaveClass('cell b');
  expect(aParam(page)).toBe(enc([0]));
});

test('E2E-APP-006 탭을 떠나면 popstate 리스너가 해제된다 (Phase 2 → Phase 1, Phase 2 → Phase 2), 뒤로가기에도 떼어 낸 App 은 반응 없음', async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set();
    const add = window.addEventListener;
    const remove = window.removeEventListener;
    window.addEventListener = function (type, fn, options) {
      if (type === 'popstate') active.add(fn);
      return add.call(this, type, fn, options);
    };
    window.removeEventListener = function (type, fn, options) {
      if (type === 'popstate') active.delete(fn);
      return remove.call(this, type, fn, options);
    };
    window.__popstateCount = () => active.size;
  });
  const count = () => page.evaluate(() => window.__popstateCount());

  await page.goto('./');
  await expect(id(page, 'real')).toBeVisible();
  const baseline = await count();

  await tab(page, 'app').click();
  await expect(id(page, 'app')).toBeVisible();
  const withApp = await count();
  expect(withApp).toBeGreaterThan(baseline);

  await cellAt(page, 180).click();
  await cellAt(page, 181).click();
  await expect(cellAt(page, 181)).toHaveClass('cell w');
  expect(await count()).toBe(withApp);

  // Phase 2 탭을 다시 눌러도(새 App mount) 이전 App 의 리스너는 남지 않는다
  await tab(page, 'app').click();
  await expect(id(page, 'status')).toHaveText('흑 차례');
  expect(await count()).toBe(withApp);

  await cellAt(page, 200).click();
  await cellAt(page, 201).click();
  await expect(cellAt(page, 201)).toHaveClass('cell w');

  await tab(page, 'phase1').click();
  await expect(id(page, 'real')).toBeVisible();
  expect(await count()).toBe(baseline);

  // ?a= 기록으로 뒤로 가도 Phase 1 그대로 (알려진 한계), 오류 없음
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.has('a')).toBe(true);
  await expect(id(page, 'real')).toBeVisible();
  await expect(id(page, 'app')).toHaveCount(0);
  expect(await count()).toBe(baseline);
});
