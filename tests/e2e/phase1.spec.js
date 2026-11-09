// Phase 1 데모의 시스템 테스트 (실제 Chromium). jsdom 으로는 확인할 수 없는 것만 본다.
//   - 실제 브라우저에서도 "바뀐 노드만 건드린다" (MutationObserver 기록, 형제 노드 동일성)
//   - 정화: 사용자 HTML 의 스크립트가 실제 브라우저에서 실행되지 않는다 (jsdom 은 스크립트를 실행하지 않음)
//   - #5 리뷰에서 고친 value/select 동작이 Chromium 에서도 render(new) 와 같다
//   - 뒤로/앞으로가 textarea 원문을 그대로 되돌린다
//   - (#6 리뷰, 사용자 결정 A) 허용 목록 정화: Chromium 에서 재현된 우회(SVG animate/set 로 href 주입,
//     data: URL 의 iframe/object/embed, meta refresh, style·base)가 preview(입력만)와 실제 영역(Patch)
//     어디에서도 동작하지 않는다.
//   - (사용자 결정 C) 사용자가 실제 영역을 조작한 상태(체크, details 열기, contenteditable 편집, input 입력)도
//     Patch 때 실제 DOM 과 대조해 render(새 VNode) 로 맞춘다.
//   - (D) setAttribute 가 거부하는 속성 이름 `<p =x>` 이 pageerror 를 내지 않는다.
// 계약 전체는 tests/integration/phase1.test.js 맨 위 주석.
import { test, expect } from '@playwright/test';

const id = (page, name) => page.getByTestId(name);

async function patchWith(page, html) {
  await id(page, 'source').fill(html);
  await id(page, 'patch').click();
}

// 실제 영역에 브라우저 MutationObserver 를 따로 붙여 기록을 모은다(앱의 로그와 독립된 검증).
async function observeReal(page) {
  await page.evaluate(() => {
    const real = document.querySelector('[data-testid="real"]');
    window.__records = [];
    window.__mo = new MutationObserver((rs) => window.__records.push(...rs.map((r) => r.type)));
    window.__mo.observe(real, { childList: true, attributes: true, characterData: true, subtree: true });
  });
}
const takeTypes = (page) =>
  page.evaluate(() => {
    window.__records.push(...window.__mo.takeRecords().map((r) => r.type));
    const out = window.__records;
    window.__records = [];
    return out;
  });

let consoleErrors;
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  await page.goto('./');
  await expect(id(page, 'real')).toBeVisible();
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test('E2E-P1-001 텍스트 하나만 바꾸면 브라우저 기록은 characterData 1건, 형제는 같은 노드', async ({ page }) => {
  await patchWith(page, '<ul><li>a</li><li>b</li></ul><p>x</p>');
  await page.evaluate(() => {
    document.querySelector('[data-testid="real"] p').__mark = 'same';
  });
  await observeReal(page);
  await patchWith(page, '<ul><li>a</li><li>B</li></ul><p>x</p>');
  expect(await takeTypes(page)).toEqual(['characterData']);
  expect(await page.evaluate(() => document.querySelector('[data-testid="real"] p').__mark)).toBe('same');
  await expect(id(page, 'log').getByTestId('log-entry').first()).toHaveAttribute('data-text', '1');
});

test('E2E-P1-002 사용자 HTML 의 스크립트는 미리보기·실제 영역 어디에서도 실행되지 않는다', async ({ page }) => {
  const evil =
    '<img src="data:," onerror="window.__pwned=1">' +
    '<img src="x" onerror="window.__pwned=2">' +
    '<script>window.__pwned=3</script>' +
    '<iframe srcdoc="<script>parent.__pwned=4</script>"></iframe>' +
    '<svg><script>window.__pwned=5</script></svg>' +
    '<a href="javascript:window.__pwned=6">link</a>';
  await id(page, 'source').fill(evil); // input 이벤트 → preview
  await page.waitForTimeout(300);
  await id(page, 'patch').click();
  await page.waitForTimeout(500); // 이미지 오류·iframe 로딩이 일어날 시간
  await page.getByTestId('real').getByText('link').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  const real = id(page, 'real');
  await expect(real.locator('script')).toHaveCount(0);
  await expect(real.locator('[onerror]')).toHaveCount(0);
  await expect(real.locator('[srcdoc]')).toHaveCount(0);
});

test('E2E-P1-003 value 제거가 Chromium 에서도 render(new) 와 같다 (#5 리뷰 수정 확인)', async ({ page }) => {
  await patchWith(
    page,
    '<select><option value="x">X</option><option value="y">Y</option></select>' +
      '<button value="v">b</button><input type="checkbox" value="yes"><ol><li value="3">a</li></ol>',
  );
  await patchWith(
    page,
    '<select><option>X</option><option value="y">Y</option></select>' +
      '<button>b</button><input type="checkbox"><ol><li>a</li></ol>',
  );
  const got = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="real"]');
    return {
      html: r.innerHTML,
      option: r.querySelector('option').value,
      select: r.querySelector('select').value,
      checkbox: r.querySelector('input').value,
    };
  });
  expect(got.html).toBe(
    '<select><option>X</option><option value="y">Y</option></select>' +
      '<button>b</button><input type="checkbox"><ol><li>a</li></ol>',
  );
  expect(got.option).toBe('X');
  expect(got.select).toBe('X');
  expect(got.checkbox).toBe('on');
});

test('E2E-P1-004 select 의 value prop 제거 후 첫 option 이 선택된다', async ({ page }) => {
  await patchWith(page, '<select value="b"><option value="a">A</option><option value="b">B</option></select>');
  await patchWith(page, '<select><option value="a">A</option><option value="b">B</option></select>');
  expect(await page.evaluate(() => document.querySelector('[data-testid="real"] select').selectedIndex)).toBe(0);
});

test('E2E-P1-005 뒤로/앞으로가 textarea 원문(들여쓰기 포함)과 실제 영역을 함께 되돌린다', async ({ page }) => {
  const original = await id(page, 'source').inputValue();
  const v2 = '<div>\n  <h2>둘째</h2>\n  <p>본문</p>\n</div>';
  await patchWith(page, v2);
  await expect(id(page, 'history')).toHaveText('2 / 2');
  const realV2 = await id(page, 'real').innerHTML();

  await id(page, 'back').click();
  await expect(id(page, 'source')).toHaveValue(original);
  await expect(id(page, 'history')).toHaveText('1 / 2');
  await expect(id(page, 'forward')).toBeEnabled();

  await id(page, 'forward').click();
  await expect(id(page, 'source')).toHaveValue(v2);
  expect(await id(page, 'real').innerHTML()).toBe(realV2);
  await expect(id(page, 'forward')).toBeDisabled();
});

test('E2E-P1-006 사용자가 입력한 input 값도 Patch 로 바뀐다 (dirty value)', async ({ page }) => {
  await patchWith(page, '<input value="a"><textarea>t1</textarea>');
  await id(page, 'real').locator('input').fill('사용자 입력');
  await id(page, 'real').locator('textarea').fill('사용자 입력');
  await patchWith(page, '<input value="b"><textarea>t2</textarea>');
  await expect(id(page, 'real').locator('input')).toHaveValue('b');
  await expect(id(page, 'real').locator('textarea')).toHaveValue('t2');
});

// 입력만(preview) 한 뒤 확인하고, Patch(실제 영역) 한 뒤 다시 확인한다.
async function inputThenPatch(page, html, check) {
  await id(page, 'source').fill(html);
  await page.waitForTimeout(300);
  await check('preview');
  await id(page, 'patch').click();
  await page.waitForTimeout(300);
  await check('real');
}

test('E2E-P1-007 SVG animate/set 으로 a 의 href 에 javascript: 를 넣어도 클릭해서 실행되지 않는다', async ({ page }) => {
  const html =
    '<svg width="120" height="40"><a>' +
    '<animate attributeName="href" values="javascript:window.__p=1"/>' +
    '<set attributeName="href" to="javascript:window.__p=2"/>' +
    '<text x="5" y="20">ANIM</text></a></svg><p>after</p>';
  await inputThenPatch(page, html, async (area) => {
    const svg = id(page, area).locator('svg');
    await expect(svg).toHaveCount(1);
    await svg.click({ position: { x: 15, y: 15 } });
    await page.waitForTimeout(300);
    await expect(id(page, area).locator('svg a, svg animate, svg set')).toHaveCount(0);
    await expect(id(page, area).getByText('after')).toBeVisible();
  });
  expect(await page.evaluate(() => window.__p)).toBeUndefined();
});

test('E2E-P1-008 data: URL 을 iframe src / object data / embed src 에 넣어도 문서가 실행되지 않는다', async ({ page }) => {
  await page.evaluate(() => {
    window.__msgs = [];
    window.addEventListener('message', (e) => window.__msgs.push(String(e.data)));
  });
  const payload = (tag) => `data:text/html,<script>parent.postMessage('${tag}','*')</script>`;
  const html =
    `<iframe src="${payload('iframe')}"></iframe>` +
    `<object data="${payload('object')}"></object>` +
    `<embed src="${payload('embed')}">` +
    '<p>after</p>';
  await inputThenPatch(page, html, async (area) => {
    await page.waitForTimeout(700); // 프레임이 로드돼 메시지를 보낼 시간
    await expect(id(page, area).locator('iframe, object, embed')).toHaveCount(0);
  });
  expect(await page.evaluate(() => window.__msgs)).toEqual([]);
});

test('E2E-P1-009 meta refresh 를 입력만 해도, Patch 해도 페이지가 이동하지 않는다', async ({ page }) => {
  const before = page.url();
  await inputThenPatch(page, '<meta http-equiv="refresh" content="1;url=about:blank#moved"><p>m</p>', async (area) => {
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(before);
    await expect(id(page, area).locator('meta')).toHaveCount(0);
  });
});

test('E2E-P1-010 style 은 페이지 스타일을, base 는 document.baseURI 를 바꾸지 못한다', async ({ page }) => {
  await inputThenPatch(page, '<style>header{display:none}</style><p>s</p>', async () => {
    await expect(page.locator('header').first()).toBeVisible();
  });
  const baseBefore = await page.evaluate(() => document.baseURI);
  await inputThenPatch(page, '<base href="https://example.com/"><p>b</p>', async (area) => {
    expect(await page.evaluate(() => document.baseURI)).toBe(baseBefore);
    await expect(id(page, area).locator('base, style')).toHaveCount(0);
  });
});

test('E2E-P1-011 체크박스를 클릭한 뒤 다른 노드만 바꾸는 Patch: 체크가 풀린다', async ({ page }) => {
  await patchWith(page, '<input type="checkbox" id="c"><p>a</p>');
  const box = id(page, 'real').locator('input');
  await box.check();
  await expect(box).toBeChecked();
  await patchWith(page, '<input type="checkbox" id="c"><p>b</p>');
  await expect(id(page, 'real').locator('input')).not.toBeChecked();
});

test('E2E-P1-012 details 를 연 뒤 Patch: 닫힌다', async ({ page }) => {
  await patchWith(page, '<details><summary>s</summary><p>body</p></details><p>a</p>');
  await id(page, 'real').locator('summary').click();
  expect(await page.evaluate(() => document.querySelector('[data-testid="real"] details').open)).toBe(true);
  await patchWith(page, '<details><summary>s</summary><p>body</p></details><p>b</p>');
  expect(await page.evaluate(() => document.querySelector('[data-testid="real"] details').open)).toBe(false);
});

test('E2E-P1-013 contenteditable 내용을 전부 지운 뒤 Patch: 오류 없이 새 내용', async ({ page }) => {
  await patchWith(page, '<p contenteditable="true">ab</p>');
  await id(page, 'real').locator('p').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await patchWith(page, '<p contenteditable="true">ac</p>');
  expect(await id(page, 'real').innerHTML()).toBe('<p contenteditable="true">ac</p>');
  await expect(id(page, 'log').getByTestId('log-entry').first()).toHaveAttribute('data-action', 'patch');
});

test('E2E-P1-014 실제 영역 input 에 입력한 뒤 같은 source 로 Patch: 값이 되돌아간다', async ({ page }) => {
  await patchWith(page, '<input value="a">');
  await id(page, 'real').locator('input').fill('zzz');
  await id(page, 'patch').click(); // source 는 그대로
  await expect(id(page, 'real').locator('input')).toHaveValue('a');
});

test('E2E-P1-015 setAttribute 가 거부하는 속성 이름 `<p =x>`: preview·Patch 모두 pageerror 없이 동작', async ({ page }) => {
  await id(page, 'source').fill('<p =x class="k">a</p>');
  await expect(id(page, 'preview').locator('p.k')).toHaveText('a');
  await id(page, 'patch').click();
  await expect(id(page, 'real').locator('p.k')).toHaveText('a');
  await expect(id(page, 'log').getByTestId('log-entry').first()).toHaveAttribute('data-action', 'patch');
  // pageerror·console error 가 없는지는 afterEach 가 확인한다
});
