// mountPhase1 의 patch 예외 처리 계약 (이슈 #6, 사용자 결정 3). 화면 계약 전체는 phase1.test.js 맨 위 주석.
//
//   - app 은 src/vdom/patch.js 의 patch 로 실제 영역을 바꾼다. 이 파일은 그 모듈을 감싸서,
//     지정한 다음 호출에서 patch 목록의 **앞 하나만 적용한 뒤** 예외를 던지게 만든다 (원자성 없음 재현).
//   - Patch 버튼에서 patch 가 예외를 내면
//       예외를 click 밖(window 'error')으로 내보내지 않는다.
//       로그 맨 앞에 data-action="error" 항목, textContent 에 오류 메시지 포함.
//       실제 영역은 이전 VNode 를 다시 render 해서 복구 (반쯤 적용된 상태가 남지 않음).
//       History 에 넣지 않는다 (index·size·버튼 그대로).
//       다음 Patch 는 이전 VNode 기준으로 정상 동작한다.
//   - 뒤로/앞으로에서 patch 가 예외를 내면
//       History 위치를 이동 전으로 되돌린다 (위치 표시·버튼 상태도 이동 전과 같다).
//       실제 영역은 이동 전 VNode 를 다시 render 해서 복구한다.
//       source·preview 는 바꾸지 않는다. 로그 맨 앞에 data-action="error" 항목. 예외는 새어 나가지 않는다.
import { describe, it, expect, afterEach, vi } from 'vitest';

const fault = vi.hoisted(() => ({ armed: false }));

vi.mock('../../src/vdom/patch.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    patch(dom, patches) {
      if (fault.armed) {
        fault.armed = false;
        mod.patch(dom, patches.slice(0, 1));
        throw new Error('boom-test');
      }
      return mod.patch(dom, patches);
    },
  };
});

import { mountPhase1 } from '../../src/phase1/app.js';
import { render } from '../../src/vdom/render.js';
import { childrenToVNodes } from '../../src/vdom/dom-to-vnode.js';

function expectedHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const box = document.createElement('div');
  for (const v of childrenToVNodes(tpl.content)) box.appendChild(render(v));
  return box.innerHTML;
}

function mount(initialHTML) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountPhase1(container, { initialHTML });
  const q = (id) => container.querySelector(`[data-testid="${id}"]`);
  return { real: q('real'), source: q('source'), preview: q('preview'), patchBtn: q('patch'), backBtn: q('back'), forwardBtn: q('forward'), history: q('history'), log: q('log') };
}

function patchTo(ui, html) {
  ui.source.value = html;
  ui.source.dispatchEvent(new Event('input', { bubbles: true }));
  ui.patchBtn.click();
}

const entries = (ui) => [...ui.log.querySelectorAll('[data-testid="log-entry"]')];

afterEach(() => {
  fault.armed = false;
  document.body.innerHTML = '';
});

describe('Phase 1: patch 예외', () => {
  it('TC-P1-039 Patch 중 예외: 오류 로그, 실제 영역은 이전 VNode 로 복구, History 그대로, 예외가 새어 나가지 않음', () => {
    const V0 = '<h1>t</h1><p>a</p><ul><li>1</li></ul>';
    const ui = mount(V0);
    const onError = vi.fn();
    window.addEventListener('error', onError);
    try {
      fault.armed = true;
      expect(() => patchTo(ui, '<h1>T</h1><p>b</p><ul><li>1</li><li>2</li></ul>')).not.toThrow();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(fault.armed).toBe(false); // patch 가 실제로 불렸다
    expect(onError).not.toHaveBeenCalled();

    expect(ui.real.innerHTML).toBe(expectedHTML(V0));
    expect(ui.history.textContent.trim()).toBe('1 / 1');
    expect(ui.backBtn.disabled).toBe(true);
    expect(ui.forwardBtn.disabled).toBe(true);
    const [entry] = entries(ui);
    expect(entry.dataset.action).toBe('error');
    expect(entry.textContent).toContain('boom-test');
  });

  it('TC-P1-040 예외 뒤 다음 Patch 는 이전 VNode 기준으로 정상 동작하고 History 에 들어간다', () => {
    const V0 = '<p class="a">x</p><p>y</p>';
    const ui = mount(V0);
    patchTo(ui, '<p class="b">x</p>');
    const afterFirst = '<p class="b">x</p>';
    expect(ui.real.innerHTML).toBe(expectedHTML(afterFirst));

    fault.armed = true;
    patchTo(ui, '<div>z</div><p>q</p><p>r</p>');
    expect(ui.real.innerHTML).toBe(expectedHTML(afterFirst));
    expect(ui.history.textContent.trim()).toBe('2 / 2');

    const V2 = '<p class="b">x!</p><p>new</p>';
    patchTo(ui, V2);
    expect(ui.real.innerHTML).toBe(expectedHTML(V2));
    expect(ui.history.textContent.trim()).toBe('3 / 3');
    expect(entries(ui)[0].dataset.action).toBe('patch');
    ui.backBtn.click();
    expect(ui.real.innerHTML).toBe(expectedHTML(afterFirst));
    ui.backBtn.click();
    expect(ui.real.innerHTML).toBe(expectedHTML(V0));
  });
});

describe('Phase 1: 뒤로/앞으로 중 patch 예외', () => {
  const V0 = '<h1>t</h1><p>a</p>';
  const V1 = '<h1>T</h1><p>b</p><p>c</p>';

  function clickWithFault(ui, btn) {
    const onError = vi.fn();
    window.addEventListener('error', onError);
    try {
      fault.armed = true;
      btn.click();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(fault.armed).toBe(false); // patch 가 실제로 불렸다
    expect(onError).not.toHaveBeenCalled();
  }

  it('TC-P1-055 뒤로 중 예외: 위치·버튼 그대로(2 / 2), 실제 영역은 V1 로 복구, source·preview 그대로, error 로그', () => {
    const ui = mount(V0);
    patchTo(ui, V1);
    const previewBefore = ui.preview.innerHTML;
    clickWithFault(ui, ui.backBtn);
    expect(ui.history.textContent.trim()).toBe('2 / 2');
    expect(ui.backBtn.disabled).toBe(false);
    expect(ui.forwardBtn.disabled).toBe(true);
    expect(ui.real.innerHTML).toBe(expectedHTML(V1));
    expect(ui.source.value).toBe(V1);
    expect(ui.preview.innerHTML).toBe(previewBefore);
    expect(entries(ui)[0].dataset.action).toBe('error');
    // 위치가 되돌려졌으므로 다시 뒤로 가면 V0
    ui.backBtn.click();
    expect(ui.real.innerHTML).toBe(expectedHTML(V0));
    expect(ui.history.textContent.trim()).toBe('1 / 2');
  });

  it('TC-P1-056 앞으로 중 예외: 위치·버튼 그대로(1 / 2), 실제 영역은 V0 로 복구, source 그대로, error 로그', () => {
    const ui = mount(V0);
    patchTo(ui, V1);
    ui.backBtn.click();
    clickWithFault(ui, ui.forwardBtn);
    expect(ui.history.textContent.trim()).toBe('1 / 2');
    expect(ui.backBtn.disabled).toBe(true);
    expect(ui.forwardBtn.disabled).toBe(false);
    expect(ui.real.innerHTML).toBe(expectedHTML(V0));
    expect(ui.source.value).toBe(V0);
    expect(entries(ui)[0].dataset.action).toBe('error');
    ui.forwardBtn.click();
    expect(ui.real.innerHTML).toBe(expectedHTML(V1));
    expect(ui.history.textContent.trim()).toBe('2 / 2');
  });
});
