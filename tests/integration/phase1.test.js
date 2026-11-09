// mountPhase1(container, options) 의 API 계약 (이슈 #6, Phase 1 데모 페이지). 이 파일이 명세다.
//
// import { mountPhase1 } from '../../src/phase1/app.js';
//
// mountPhase1(container, { initialHTML? })
//   - container 안에 Phase 1 화면을 만든다. 반환값은 정하지 않는다 (테스트는 DOM 만 본다).
//   - initialHTML 을 주지 않으면 내장 샘플 HTML(요소가 하나 이상)을 쓴다.
//   - 요소는 data-testid 로 찾는다 (container 안에 각각 하나):
//       real     실제 영역 래퍼. 고정 요소 하나이며 교체되지 않고, 래퍼 자신의 속성도 바뀌지 않는다.
//                diff/patch 대상은 래퍼의 **자식들**이다 (최상위 노드 여러 개, 텍스트 허용).
//       source   테스트 영역 <textarea> (HTML 소스).
//       preview  미리보기. source 를 파싱한 VNode 들을 render 한 결과를 자식으로 가진다.
//                source 의 'input' 이벤트마다, 그리고 뒤로/앞으로로 source 가 바뀔 때 갱신된다.
//                실제 영역과는 별개다 (preview 갱신은 실제 영역을 건드리지 않는다).
//       patch / back / forward   <button>. back.disabled === !canBack, forward.disabled === !canForward.
//       history  History 위치 표시. textContent.trim() === `${index + 1} / ${size}` (예: '2 / 3').
//       log      MutationObserver 로그 패널.
//   - 정화(sanitize, 사용자 결정): **허용 목록** 방식. source 를 파싱한 VNode 에서 목록에 없는 요소와 속성을
//     뺀다. 로드·Patch·preview 모두 같은 규칙이라 실제 영역·preview 어디에서도 사용자 HTML 이 스크립트를
//     실행하거나, 페이지를 이동시키거나, 페이지 스타일·baseURI 를 바꾸지 못한다.
//     라이브러리(render/domToVNode/toHTML)는 바꾸지 않는다. 데모(app)가 거른다.
//     [허용 요소 — HTML 문맥]
//       div p span h1 h2 h3 h4 h5 h6 ul ol li dl dt dd
//       table caption colgroup col thead tbody tfoot tr td th
//       a b strong i em u s small mark code pre kbd blockquote q sub sup br hr img figure figcaption
//       section article header footer nav main aside details summary
//       label input textarea select option optgroup button fieldset legend progress meter
//       svg (그 안은 SVG 문맥)
//     [허용 요소 — SVG 문맥(svg 의 자손)]
//       g path rect circle ellipse line polyline polygon text tspan title desc defs
//       linearGradient radialGradient stop
//       SVG title·desc 의 자식은 텍스트만 남긴다 (요소 자식은 하위 트리째 뺀다: HTML integration point).
//     반드시 빠지는 것 (예): script style link meta base iframe frame object embed applet form template
//       noscript plaintext xmp, math 전체, SVG 의 a animate set animateTransform animateMotion use
//       foreignObject image.
//     허용되지 않은 요소는 **하위 트리째**(텍스트 포함) 뺀다.
//     [허용 속성] 이름은 HTML 요소는 소문자, SVG 는 대소문자 그대로 비교한다. on* 은 전부 빠진다.
//       전역: class id title lang dir hidden contenteditable role tabindex data-* aria-*   (style 은 빠진다)
//       a: href target rel        img: src alt width height
//       input: type value checked placeholder disabled readonly name min max step
//       textarea: placeholder disabled readonly name rows cols
//       select: disabled name multiple size     option: value selected disabled label
//       optgroup: label disabled                button: type disabled name value
//       label: for     fieldset: disabled     td·th: colspan rowspan     th: scope     col·colgroup: span
//       ol: start reversed type     li: value     details: open
//       progress: value max         meter: value min max low high optimum
//       SVG 요소 공통: viewBox width height x y dx dy cx cy r rx ry x1 y1 x2 y2 points d fill stroke
//         stroke-width stroke-linecap stroke-linejoin fill-opacity stroke-opacity opacity transform
//         offset stop-color stop-opacity gradientUnits gradientTransform text-anchor font-size font-family
//         preserveAspectRatio xmlns
//     [URL 속성] a href, img src 는 값이 http: https: mailto: 이거나, 스킴이 없는 상대 경로(`/x`, `x/y`,
//       `?q`, `#frag`, 빈 값)일 때만 남긴다. 그 밖의 스킴(javascript: data: vbscript: blob: file: ftp: …)이면
//       속성을 뺀다. 판단할 때 값의 탭·줄바꿈(\t \n \r)은 어디에 있든 무시하고, 앞쪽 공백·C0 제어문자
//       (U+0000~U+0020)를 무시하며, 대소문자를 무시한다. 스킴 = /^[a-z][a-z0-9+.-]*:/.
//     HTML 파서가 만든, setAttribute 로는 만들 수 없는 이름(`<p =x>` 의 "=x")도 목록에 없으므로 빠진다.
//     뺀 개수(data-sanitized) = 뺀 요소 수(하위 트리째 뺀 것은 1) + 남은 요소에서 뺀 속성 수.
//   - 실제 DOM 과 대조 (사용자 결정 C): 사용자는 실제 영역을 직접 바꿀 수 있다(체크박스 클릭, input·textarea
//     입력, select 선택, details 열기, contenteditable 편집, 개발자 도구). Patch·뒤로·앞으로의 diff 는
//     old 로 저장된 이전 VNode 가 아니라 **지금 실제 영역을 읽은 VNode** 를 쓴다. 읽을 때 속성에 드러나지
//     않는 화면 상태(input .value, checkbox·radio .checked, option .selected, textarea .value)도 반영해서,
//     결과가 아래를 만족해야 한다 (라이브러리를 고칠지 app 에서 할지는 자유):
//       조작 후 실제 영역 = render(목표 VNode) — DOM 구조·속성뿐 아니라 .value / .checked / .selected 까지.
//       (체크가 풀리고, 입력값이 덮이고, contenteditable 편집이 덮이고, details 가 닫힌다. 목표 VNode 에
//        그 상태가 있으면 유지된다.)
//     사용자 조작이 만든 MutationObserver 기록은 로그에 섞지 않는다 (조작 전에 비운다).
//     사용자 조작으로 실제 영역이 목표와 달라져 있으면 diff 는 빈 목록이 아니다 (예: input 에 입력한 뒤
//     같은 source 로 Patch → 값을 되돌리는 patch 가 나온다). 이때의 History 처리는 결정 필요(테스트 안 함).
//   - History 항목: { vnode, source } — 정화한 VNode 배열과 그때의 textarea 문자열. (History 모듈은 그대로.)
//   - 로드: initialHTML 을 <template> 으로 파싱 → childrenToVNodes → 정화 → V0. 실제 영역의 자식을
//     V0 를 render 한 결과로 채운다 (공백 텍스트·주석이 남은 DOM 에 patch 하지 않는다. specs/react.md 전제).
//     source 값은 **initialHTML 문자열 그대로**, preview 는 V0 의 render 결과. History = [{V0, initialHTML}].
//     로드 시에는 로그 항목이 없다.
//   - Patch 버튼: source 를 파싱·정화 → Vn → diff(이전, Vn) →
//       diff 가 빈 목록이면: 실제 영역을 건드리지 않고 History 에 넣지 않는다(index·size 그대로, 앞쪽 기록도
//         버리지 않는다). 로그 항목은 남긴다: data-action="patch", 개수 모두 0, data-empty="true".
//       아니면: 실제 영역 자식에 patch → History.push({ vnode: Vn, source: 사용자가 쓴 문자열 }).
//     실제 영역 결과는 Vn 의 render 결과와 같고, 바뀌지 않은 노드는 같은 DOM 객체로 남는다.
//     Patch 후 source 는 사용자가 쓴 문자열 그대로 둔다 (다시 쓰지 않는다).
//   - patch 예외 (Patch 버튼): 예외를 click 밖으로 던지지 않는다. 로그에 data-action="error" 항목을 남기고
//     (textContent 에 오류 메시지 포함), 실제 영역은 이전 VNode 를 다시 render 해서 복구하며, History 에
//     넣지 않는다. 다음 Patch 는 이전 VNode 기준으로 정상 동작한다. (tests/integration/phase1-error.test.js)
//   - 뒤로/앞으로: History 이동 → diff/patch 로 실제 영역을 그 VNode 에 맞춘다 (전체 다시 그리기 금지).
//     source 는 그 항목에 저장된 문자열로 **정확히** 되돌린다 (Patch 하지 않은 입력은 버려진다).
//     preview 도 갱신한다. 비활성 상태에서는 아무 일도 일어나지 않는다.
//     toHTML(vnode) 는 저장된 문자열이 없을 때의 대비용이지만, 현재 앱에서는 모든 History 항목이 source 를
//     가지므로 **이 경로에 닿지 않는다** (toHTML 은 단위 테스트로만 검증된다).
//   - 뒤로/앞으로 중 patch 예외: History 위치를 이동 전으로 되돌리고, 실제 영역은 이동 전 VNode 를 다시
//     render 해서 복구하며, source·preview 는 바꾸지 않고, data-action="error" 로그를 남긴다
//     (tests/integration/phase1-error.test.js).
//   - 로그: 실제 영역에 MutationObserver(childList, attributes, characterData, subtree).
//     Patch·뒤로·앞으로 한 번마다, 그 조작이 만든 기록을 takeRecords() 로 모아 **동기적으로**
//     log 안에 data-testid="log-entry" 요소 하나를 **맨 앞에** 추가한다 (최신이 첫 번째). 항목의 dataset:
//       data-action      'patch' | 'back' | 'forward' | 'error'
//       data-added       childList 기록들의 addedNodes 개수 합
//       data-removed     childList 기록들의 removedNodes 개수 합
//       data-attributes  attributes 기록 개수
//       data-text        characterData 기록 개수
//       data-sanitized   (patch 항목) 정화로 뺀 개수. 없으면 '0'.
//       data-empty       diff 가 빈 목록인 patch 항목만 'true'. 그 밖의 항목에는 'true' 가 아니다.
//     항목의 textContent 에는 그 조작에 쓰인 patch 들의 type(ADD/REMOVE/REPLACE/TEXT/PROPS)이 들어간다.
//     한 조작의 기록이 다른 항목에 섞이거나 비동기로 한 번 더 기록되지 않는다.
//   - 알려진 한계 (테스트하지 않음): `a<!--x-->b` 처럼 주석 때문에 이웃한 텍스트 VNode 둘은 toHTML 에서
//     'ab' 로 이어진다. History 가 source 문자열을 저장하므로 데모 흐름에서는 toHTML 을 거의 쓰지 않는다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountPhase1 } from '../../src/phase1/app.js';
import { render } from '../../src/vdom/render.js';
import { childrenToVNodes } from '../../src/vdom/dom-to-vnode.js';

function parseList(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return childrenToVNodes(tpl.content);
}

// HTML 을 파싱한 VNode 들을 render 한 결과의 innerHTML.
function expectedHTML(html) {
  const box = document.createElement('div');
  for (const v of parseList(html)) box.appendChild(render(v));
  return box.innerHTML;
}

function mount(initialHTML) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountPhase1(container, initialHTML === undefined ? {} : { initialHTML });
  const q = (id) => container.querySelector(`[data-testid="${id}"]`);
  return {
    container,
    real: q('real'),
    source: q('source'),
    preview: q('preview'),
    patchBtn: q('patch'),
    backBtn: q('back'),
    forwardBtn: q('forward'),
    history: q('history'),
    log: q('log'),
  };
}

function edit(ui, html) {
  ui.source.value = html;
  ui.source.dispatchEvent(new Event('input', { bubbles: true }));
}

function patchTo(ui, html) {
  edit(ui, html);
  ui.patchBtn.click();
}

function observe(el) {
  const obs = new MutationObserver(() => {});
  obs.observe(el, { childList: true, attributes: true, characterData: true, subtree: true });
  return obs;
}

const entries = (ui) => [...ui.log.querySelectorAll('[data-testid="log-entry"]')];

function counts(entry) {
  const d = entry.dataset;
  return { action: d.action, added: Number(d.added), removed: Number(d.removed), attributes: Number(d.attributes), text: Number(d.text) };
}

function expectReal(ui, html) {
  expect(ui.real.innerHTML).toBe(expectedHTML(html));
}

// source 는 저장된 문자열을 정확히 되돌린다 (사용자 결정 5).
function expectSource(ui, html) {
  expect(ui.source.value).toBe(html);
}

function expectPreview(ui, html) {
  expect(ui.preview.innerHTML).toBe(expectedHTML(html));
}

function expectButtons(ui, { back, forward, pos }) {
  expect(ui.backBtn.disabled).toBe(!back);
  expect(ui.forwardBtn.disabled).toBe(!forward);
  expect(ui.history.textContent.trim()).toBe(pos);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Phase 1: 화면 구성과 로드', () => {
  it('TC-P1-001 data-testid 요소가 모두 있고 종류가 맞다', () => {
    const ui = mount('<p>a</p>');
    for (const key of ['real', 'source', 'preview', 'patchBtn', 'backBtn', 'forwardBtn', 'history', 'log']) {
      expect(ui[key], key).not.toBeNull();
    }
    expect(ui.source.localName).toBe('textarea');
    for (const b of [ui.patchBtn, ui.backBtn, ui.forwardBtn]) expect(b.localName).toBe('button');
    expect(ui.container.contains(ui.real)).toBe(true);
  });

  it('TC-P1-002 들여쓰기·주석이 있는 초기 HTML: 실제 영역은 render 결과(공백·주석 노드 없음), source·preview 도 같은 VNode', () => {
    const html = '\n<!-- c -->\n<h1>제목</h1>\n<ul class="l">\n  <li>a</li>\n  <li>b</li>\n</ul>\n';
    const ui = mount(html);
    expectReal(ui, html);
    expect(ui.real.childNodes).toHaveLength(2);
    expect(ui.real.childNodes[1].childNodes).toHaveLength(2);
    expectSource(ui, html);
    expectPreview(ui, html);
    expectButtons(ui, { back: false, forward: false, pos: '1 / 1' });
    expect(entries(ui)).toHaveLength(0);
  });

  it('TC-P1-003 initialHTML 이 없으면 내장 샘플: 실제 영역이 비어 있지 않고 source 와 일치', () => {
    const ui = mount();
    expect(ui.real.childNodes.length).toBeGreaterThan(0);
    expect(ui.real.innerHTML).toBe(expectedHTML(ui.source.value));
    expectButtons(ui, { back: false, forward: false, pos: '1 / 1' });
  });
});

describe('Phase 1: Patch 는 바뀐 노드만 건드린다 (MutationObserver)', () => {
  it('TC-P1-004 텍스트 하나만 바꾸면 기록은 그 텍스트 노드의 characterData 1건, 형제는 같은 객체', () => {
    const ui = mount('<h1>title</h1><p id="p">hello</p><ul><li>a</li><li>b</li></ul>');
    const [h1, p, ul] = ui.real.childNodes;
    const text = p.firstChild;
    const lis = [...ul.childNodes];
    const obs = observe(ui.real);

    patchTo(ui, '<h1>title</h1><p id="p">world</p><ul><li>a</li><li>b</li></ul>');

    const recs = obs.takeRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('characterData');
    expect(recs[0].target).toBe(text);
    expect(text.data).toBe('world');
    expect([...ui.real.childNodes]).toEqual([h1, p, ul]);
    expect(ui.real.childNodes[0]).toBe(h1);
    expect(ui.real.childNodes[1]).toBe(p);
    expect(ui.real.childNodes[2]).toBe(ul);
    expect(ul.childNodes[0]).toBe(lis[0]);
    expect(ul.childNodes[1]).toBe(lis[1]);

    const [entry] = entries(ui);
    expect(counts(entry)).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 0, text: 1 });
    expect(entry.textContent).toContain('TEXT');
  });

  it('TC-P1-005 속성 하나만 바꾸면 attributes 기록 1건, 요소는 같은 객체', () => {
    const ui = mount('<p id="a">x</p>');
    const p = ui.real.firstChild;
    const obs = observe(ui.real);
    patchTo(ui, '<p id="b">x</p>');
    const recs = obs.takeRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('attributes');
    expect(recs[0].attributeName).toBe('id');
    expect(recs[0].target).toBe(p);
    expect(ui.real.firstChild).toBe(p);
    expect(p.id).toBe('b');
    const [entry] = entries(ui);
    expect(counts(entry)).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 1, text: 0 });
    expect(entry.textContent).toContain('PROPS');
  });

  it('TC-P1-006 최상위 노드 추가: 기존 노드는 같은 객체, 노드 추가 1', () => {
    const ui = mount('<p>a</p>');
    const p = ui.real.firstChild;
    patchTo(ui, '<p>a</p><p>b</p>');
    expectReal(ui, '<p>a</p><p>b</p>');
    expect(ui.real.firstChild).toBe(p);
    const [entry] = entries(ui);
    expect(counts(entry)).toEqual({ action: 'patch', added: 1, removed: 0, attributes: 0, text: 0 });
    expect(entry.textContent).toContain('ADD');
  });

  it('TC-P1-007 최상위 노드 삭제: 남은 노드는 같은 객체, 노드 삭제 1', () => {
    const ui = mount('<p>a</p><p>b</p>');
    const p = ui.real.firstChild;
    patchTo(ui, '<p>a</p>');
    expectReal(ui, '<p>a</p>');
    expect(ui.real.firstChild).toBe(p);
    const [entry] = entries(ui);
    expect(counts(entry)).toEqual({ action: 'patch', added: 0, removed: 1, attributes: 0, text: 0 });
    expect(entry.textContent).toContain('REMOVE');
  });

  it('TC-P1-008 최상위 노드 타입 변경: 그 노드만 교체 (추가 1 + 삭제 1), 형제는 같은 객체', () => {
    const ui = mount('<p>a</p><span>s</span>');
    const span = ui.real.childNodes[1];
    patchTo(ui, '<div>a</div><span>s</span>');
    expectReal(ui, '<div>a</div><span>s</span>');
    expect(ui.real.childNodes[1]).toBe(span);
    const [entry] = entries(ui);
    expect(counts(entry)).toEqual({ action: 'patch', added: 1, removed: 1, attributes: 0, text: 0 });
    expect(entry.textContent).toContain('REPLACE');
  });

  it('TC-P1-009 한 번에 여러 종류가 바뀌면 로그에 patch type 이 모두 나온다', () => {
    const ui = mount('<p class="a">x</p><ul><li>1</li></ul>');
    patchTo(ui, '<p class="b">y</p><ul><li>1</li><li>2</li></ul>');
    expectReal(ui, '<p class="b">y</p><ul><li>1</li><li>2</li></ul>');
    const [entry] = entries(ui);
    expect(counts(entry)).toEqual({ action: 'patch', added: 1, removed: 0, attributes: 1, text: 1 });
    for (const type of ['PROPS', 'TEXT', 'ADD']) expect(entry.textContent).toContain(type);
  });

  it.each([
    ['구조 변경', '<div><h1>a</h1><p>b</p></div>', '<div><h2>a</h2><p class="x">B</p><em>c</em></div>'],
    ['깊은 곳 추가와 얕은 곳 삭제', '<div><div><span>a</span></div><b>1</b><b>2</b></div>', '<div><div><span>a</span><span>b</span></div></div>'],
    ['텍스트와 요소가 섞인 자식', '<p>a<b>x</b>c</p>', '<p><i>a</i>x<b>c</b></p>'],
    ['input 속성', '<div><input type="text" value="a"><input type="checkbox" checked></div>', '<div><input type="text" value="b"><input type="checkbox"></div>'],
    ['최상위 개수 3 → 1', '<p>1</p><p>2</p><p>3</p>', '<p>1</p>'],
  ])('TC-P1-010 %s: Patch 후 실제 영역 = render(새 VNode)', (_name, before, after) => {
    const ui = mount(before);
    patchTo(ui, after);
    expectReal(ui, after);
  });
});

describe('Phase 1: History 와 뒤로/앞으로 (상태 전이)', () => {
  const V0 = '<h1>t</h1><p>hello</p>';
  const V1 = '<h1>t</h1><p>world</p>';

  it('TC-P1-011 Patch 후: 뒤로 활성, 앞으로 비활성, 위치 2 / 2', () => {
    const ui = mount(V0);
    patchTo(ui, V1);
    expectButtons(ui, { back: true, forward: false, pos: '2 / 2' });
  });

  it('TC-P1-012 뒤로: 실제 영역은 diff/patch 로 V0 (같은 객체, characterData 1건), source·preview 도 V0', () => {
    const ui = mount(V0);
    const [h1, p] = ui.real.childNodes;
    const text = p.firstChild;
    patchTo(ui, V1);
    const obs = observe(ui.real);

    ui.backBtn.click();

    const recs = obs.takeRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('characterData');
    expect(recs[0].target).toBe(text);
    expectReal(ui, V0);
    expect(ui.real.childNodes[0]).toBe(h1);
    expect(ui.real.childNodes[1]).toBe(p);
    expectSource(ui, V0);
    expectPreview(ui, V0);
    expectButtons(ui, { back: false, forward: true, pos: '1 / 2' });
    expect(counts(entries(ui)[0])).toEqual({ action: 'back', added: 0, removed: 0, attributes: 0, text: 1 });
  });

  it('TC-P1-013 앞으로: 실제 영역·source·preview 가 V1, 위치 2 / 2', () => {
    const ui = mount(V0);
    patchTo(ui, V1);
    ui.backBtn.click();
    const p = ui.real.childNodes[1];
    ui.forwardBtn.click();
    expectReal(ui, V1);
    expect(ui.real.childNodes[1]).toBe(p);
    expectSource(ui, V1);
    expectPreview(ui, V1);
    expectButtons(ui, { back: true, forward: false, pos: '2 / 2' });
    expect(counts(entries(ui)[0])).toEqual({ action: 'forward', added: 0, removed: 0, attributes: 0, text: 1 });
  });

  it('TC-P1-014 뒤로 간 뒤 Patch 하면 앞쪽 기록을 버린다', () => {
    const ui = mount('<p>0</p>');
    patchTo(ui, '<p>1</p>');
    patchTo(ui, '<p>2</p>');
    ui.backBtn.click(); // 1
    patchTo(ui, '<p>3</p>');
    expectButtons(ui, { back: true, forward: false, pos: '3 / 3' });
    ui.forwardBtn.click(); // 비활성: 그대로
    expectReal(ui, '<p>3</p>');
    ui.backBtn.click();
    expectReal(ui, '<p>1</p>');
    expectSource(ui, '<p>1</p>');
    ui.backBtn.click();
    expectReal(ui, '<p>0</p>');
    expectButtons(ui, { back: false, forward: true, pos: '1 / 3' });
  });

  it('TC-P1-015 무효 전이: 처음에서 뒤로, 끝에서 앞으로는 아무것도 바꾸지 않는다 (DOM·로그·위치)', () => {
    const ui = mount(V0);
    const obs = observe(ui.real);
    ui.backBtn.click();
    ui.forwardBtn.click();
    expect(obs.takeRecords()).toHaveLength(0);
    expect(entries(ui)).toHaveLength(0);
    expectButtons(ui, { back: false, forward: false, pos: '1 / 1' });

    patchTo(ui, V1);
    obs.takeRecords();
    const before = entries(ui).length;
    ui.forwardBtn.click();
    expect(obs.takeRecords()).toHaveLength(0);
    expect(entries(ui)).toHaveLength(before);
    expectButtons(ui, { back: true, forward: false, pos: '2 / 2' });
  });

  it('TC-P1-016 Patch 하지 않은 source 수정은 뒤로를 누르면 History 의 값으로 덮인다', () => {
    const ui = mount(V0);
    patchTo(ui, V1);
    edit(ui, '<p>저장 안 한 입력 <b>x');
    ui.backBtn.click();
    expectSource(ui, V0);
    expectPreview(ui, V0);
    ui.forwardBtn.click();
    expectSource(ui, V1);
    expectReal(ui, V1);
  });

  it('TC-P1-017 버전 4개를 Patch 한 뒤 뒤로 3번·앞으로 3번: 매 단계 일치, 루트 요소는 같은 객체', () => {
    const versions = [
      '<div class="app"><h1>할 일</h1><ul><li>a</li></ul></div>',
      '<div class="app dark"><h1>할 일 (2)</h1><ul><li>a</li><li class="done">b</li></ul><p>끝</p></div>',
      '<div class="app"><h2>할 일</h2><ul></ul></div>',
      '<div class="app" id="x"><h1>할 일</h1><ul><li>a</li><li>c</li></ul></div>',
    ];
    const ui = mount(versions[0]);
    const root = ui.real.firstChild;
    for (let i = 1; i < versions.length; i++) patchTo(ui, versions[i]);
    for (let i = versions.length - 2; i >= 0; i--) {
      ui.backBtn.click();
      expectReal(ui, versions[i]);
      expectSource(ui, versions[i]);
      expect(ui.real.firstChild).toBe(root);
    }
    for (let i = 1; i < versions.length; i++) {
      ui.forwardBtn.click();
      expectReal(ui, versions[i]);
      expectSource(ui, versions[i]);
      expect(ui.real.firstChild).toBe(root);
    }
    expectButtons(ui, { back: true, forward: false, pos: '4 / 4' });
  });

  it('TC-P1-018 key 속성: 뒤로 가도 source 에 key 가 남고, 실제 영역에는 key 속성이 없다', () => {
    const ui = mount('<ul><li key="a">x</li></ul>');
    expect(ui.real.innerHTML).toBe('<ul><li>x</li></ul>');
    patchTo(ui, '<ul><li key="b">x</li></ul>');
    expect(counts(entries(ui)[0])).toMatchObject({ added: 1, removed: 1 }); // key 가 다르면 교체
    ui.backBtn.click();
    expect(parseList(ui.source.value)[0].children[0].key).toBe('a');
    expect(ui.real.innerHTML).toBe('<ul><li>x</li></ul>');
  });
});

describe('Phase 1: 미리보기와 로그', () => {
  it('TC-P1-019 source 를 고치면 preview 만 바뀌고 실제 영역·로그·History 는 그대로', () => {
    const ui = mount('<p>a</p>');
    const obs = observe(ui.real);
    edit(ui, '<p class="n">new</p><ul><li>1</li></ul>');
    expectPreview(ui, '<p class="n">new</p><ul><li>1</li></ul>');
    expect(obs.takeRecords()).toHaveLength(0);
    expectReal(ui, '<p>a</p>');
    expect(entries(ui)).toHaveLength(0);
    expectButtons(ui, { back: false, forward: false, pos: '1 / 1' });
  });

  it('TC-P1-020 로그는 조작마다 한 항목, 최신이 맨 앞, 비동기로 더 늘지 않는다', async () => {
    const ui = mount('<p>a</p>');
    patchTo(ui, '<p>b</p>');
    patchTo(ui, '<p>b</p><p>c</p>');
    ui.backBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    const list = entries(ui);
    expect(list).toHaveLength(3);
    expect(list.map((e) => e.dataset.action)).toEqual(['back', 'patch', 'patch']);
    expect(counts(list[0])).toEqual({ action: 'back', added: 0, removed: 1, attributes: 0, text: 0 });
    expect(counts(list[1])).toEqual({ action: 'patch', added: 1, removed: 0, attributes: 0, text: 0 });
    expect(counts(list[2])).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 0, text: 1 });
  });

  it('TC-P1-021 preview 의 변화와 source 입력은 로그 항목의 개수에 섞이지 않는다', () => {
    const ui = mount('<p>a</p>');
    edit(ui, '<div>1</div><div>2</div><div>3</div>');
    edit(ui, '<p>z</p>');
    ui.patchBtn.click();
    expect(counts(entries(ui)[0])).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 0, text: 1 });
  });
});

describe('Phase 1: 경계값과 에러 추측', () => {
  it('TC-P1-022 실제 영역 래퍼는 Patch·뒤로·앞으로 후에도 같은 객체, 속성도 그대로', () => {
    const ui = mount('<p>a</p>');
    const attrs = () => [...ui.real.attributes].map((a) => [a.name, a.value]);
    const before = attrs();
    patchTo(ui, '<div>b</div>');
    ui.backBtn.click();
    ui.forwardBtn.click();
    expect(ui.container.querySelector('[data-testid="real"]')).toBe(ui.real);
    expect(attrs()).toEqual(before);
  });

  it('TC-P1-023 source 를 비우고 Patch: 실제 영역이 비고, 뒤로 가면 복원', () => {
    const ui = mount('<p>a</p><p>b</p>');
    patchTo(ui, '');
    expect(ui.real.childNodes).toHaveLength(0);
    expect(counts(entries(ui)[0])).toMatchObject({ removed: 2, added: 0 });
    ui.backBtn.click();
    expectReal(ui, '<p>a</p><p>b</p>');
    expectSource(ui, '<p>a</p><p>b</p>');
  });

  it('TC-P1-024 빈 초기 HTML 에서 시작해 Patch 로 노드 추가', () => {
    const ui = mount('');
    expect(ui.real.childNodes).toHaveLength(0);
    patchTo(ui, '<p>a</p>');
    expectReal(ui, '<p>a</p>');
    expect(counts(entries(ui)[0])).toMatchObject({ added: 1, removed: 0 });
  });

  it('TC-P1-025 최상위가 텍스트뿐: 텍스트 변경은 같은 Text 노드의 characterData', () => {
    const ui = mount('hello');
    const text = ui.real.firstChild;
    expect(text.nodeType).toBe(Node.TEXT_NODE);
    const obs = observe(ui.real);
    patchTo(ui, 'hello!');
    const recs = obs.takeRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('characterData');
    expect(ui.real.firstChild).toBe(text);
    expect(text.data).toBe('hello!');
  });

  it('TC-P1-026 들여쓰기만 바꾼 Patch: 실제 영역 기록 0, History 그대로, 로그는 "변경 없음" 항목', () => {
    const ui = mount('<ul><li>a</li></ul>');
    const before = ui.real.innerHTML;
    const obs = observe(ui.real);
    patchTo(ui, '\n<ul>\n  <li>a</li>\n</ul>\n<!-- 주석 -->\n');
    expect(obs.takeRecords()).toHaveLength(0);
    expect(ui.real.innerHTML).toBe(before);
    expectButtons(ui, { back: false, forward: false, pos: '1 / 1' });
    const list = entries(ui);
    expect(list).toHaveLength(1);
    expect(counts(list[0])).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 0, text: 0 });
    expect(list[0].dataset.empty).toBe('true');
  });

  it('TC-P1-027 pre 안의 공백만 바꿔도 TEXT 로 반영된다', () => {
    const ui = mount('<pre>a b</pre>');
    const obs = observe(ui.real);
    patchTo(ui, '<pre>a  b</pre>');
    const recs = obs.takeRecords();
    expect(recs.map((r) => r.type)).toEqual(['characterData']);
    expect(ui.real.firstChild.textContent).toBe('a  b');
  });

  it('TC-P1-028 닫지 않은 태그도 파서가 복구한 결과로 Patch 된다', () => {
    const ui = mount('<p>x</p>');
    patchTo(ui, '<p>a<p>b<ul><li>c');
    expectReal(ui, '<p>a</p><p>b</p><ul><li>c</li></ul>');
  });

  it('TC-P1-029 텍스트에 태그처럼 보이는 글자를 넣고 뒤로/앞으로 해도 요소로 바뀌지 않는다', () => {
    const ui = mount('<p>a</p>');
    patchTo(ui, '<p>&lt;b&gt;x&lt;/b&gt; &amp;</p>');
    ui.backBtn.click();
    ui.forwardBtn.click();
    expect(ui.real.firstChild.childNodes).toHaveLength(1);
    expect(ui.real.firstChild.textContent).toBe('<b>x</b> &');
    expectSource(ui, '<p>&lt;b&gt;x&lt;/b&gt; &amp;</p>');
  });
});

describe('Phase 1: 사용자 HTML 정화 (script, on* 문자열 속성)', () => {
  const DIRTY =
    '<img src="x" onerror="window.__pwned=1"><p onclick="window.__pwned=2" class="k">a</p><script>window.__pwned=3</script>';
  const CLEAN = '<img src="x"><p class="k">a</p>';

  function expectNoDanger(el) {
    expect(el.querySelectorAll('script')).toHaveLength(0);
    for (const node of el.querySelectorAll('*')) {
      for (const { name } of node.attributes) expect(name.toLowerCase().startsWith('on'), `${node.localName} ${name}`).toBe(false);
    }
  }

  afterEach(() => {
    delete window.__pwned;
  });

  it('TC-P1-030 Patch: 실제 영역에 script·on* 속성이 없고, 나머지 속성은 남고, 부작용이 없다', async () => {
    const ui = mount('<p>start</p>');
    patchTo(ui, DIRTY);
    expectNoDanger(ui.real);
    expectReal(ui, CLEAN);
    ui.real.querySelector('p').click();
    ui.real.querySelector('img').dispatchEvent(new Event('error'));
    await new Promise((r) => setTimeout(r, 0));
    expect(window.__pwned).toBeUndefined();
    const [entry] = entries(ui);
    expect(entry.dataset.action).toBe('patch');
    expect(entry.dataset.sanitized).toBe('3');
    expectSource(ui, DIRTY); // textarea 는 사용자가 쓴 문자열 그대로
  });

  it('TC-P1-031 preview: 입력만 해도 script·on* 속성이 없고 부작용이 없다', async () => {
    const ui = mount('<p>start</p>');
    edit(ui, DIRTY);
    expectNoDanger(ui.preview);
    expectPreview(ui, CLEAN);
    ui.preview.querySelector('p').click();
    ui.preview.querySelector('img').dispatchEvent(new Event('error'));
    await new Promise((r) => setTimeout(r, 0));
    expect(window.__pwned).toBeUndefined();
  });

  it('TC-P1-032 초기 HTML 에도 같은 규칙 (source 는 원본 그대로)', async () => {
    const ui = mount(DIRTY);
    expectNoDanger(ui.real);
    expectNoDanger(ui.preview);
    expectReal(ui, CLEAN);
    expectSource(ui, DIRTY);
    ui.real.querySelector('p').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(window.__pwned).toBeUndefined();
  });

  it('TC-P1-033 중첩·SVG 안의 script, 대문자 속성 이름, 여러 on* 속성도 뺀다 (개수는 하위 트리 제외)', () => {
    const ui = mount('<p>start</p>');
    patchTo(
      ui,
      '<div ONMOUSEOVER="window.__pwned=1" onfocus="x()" title="t"><script>window.__pwned=2<\/script><span>ok</span></div>' +
        '<svg><script>window.__pwned=3<\/script><circle r="1" onload="window.__pwned=4"></circle></svg>',
    );
    expectNoDanger(ui.real);
    expectReal(ui, '<div title="t"><span>ok</span></div><svg><circle r="1"></circle></svg>');
    expect(entries(ui)[0].dataset.sanitized).toBe('5');
    expect(window.__pwned).toBeUndefined();
  });

  it('TC-P1-034 정화할 것이 없으면 data-sanitized 는 0, on 으로 시작하지 않는 속성은 남는다', () => {
    const ui = mount('<p>a</p>');
    patchTo(ui, '<p class="one" data-on="1" title="onclick">b</p>');
    expectReal(ui, '<p class="one" data-on="1" title="onclick">b</p>');
    expect(entries(ui)[0].dataset.sanitized).toBe('0');
  });

  it('TC-P1-041 javascript: URL(공백·제어문자·대소문자 무시)·form·SVG a·iframe 을 뺀다, URL 속성이 아닌 것은 남긴다', () => {
    const ui = mount('<p>start</p>');
    patchTo(
      ui,
      '<a href=" JaVaScRiPt:alert(1)">a</a>' +
        '<a href="java&#9;scr&#10;ipt:x">b</a>' +
        '<img src="&#1;javascript:x">' +
        '<form action="javascript:x"><button formaction="JAVASCRIPT:y">b</button></form>' +
        '<svg><a xlink:href="javascript:z"><text>t</text></a></svg>' +
        '<iframe srcdoc="<script>parent.__pwned=1</script>"></iframe>' +
        '<a href="https://x/javascript:y" data-href="javascript:k">c</a><a href="/javascript">d</a>',
    );
    // 속성 3 (href, href, src) + 요소 3 (form, svg a, iframe — 하위 트리째)
    expectReal(
      ui,
      '<a>a</a><a>b</a><img><svg></svg>' +
        '<a href="https://x/javascript:y" data-href="javascript:k">c</a><a href="/javascript">d</a>',
    );
    expect(ui.real.querySelector('[srcdoc], form, iframe')).toBeNull();
    expect(entries(ui)[0].dataset.sanitized).toBe('6');
    expect(window.__pwned).toBeUndefined();
  });

  it('TC-P1-035 뒤로/앞으로 해도 실제 영역에 script·on* 이 생기지 않고, source 는 저장된 원문', () => {
    const ui = mount('<p>start</p>');
    patchTo(ui, DIRTY);
    patchTo(ui, '<p>end</p>');
    ui.backBtn.click();
    expectNoDanger(ui.real);
    expectNoDanger(ui.preview);
    expectReal(ui, CLEAN);
    expectSource(ui, DIRTY);
    expect(window.__pwned).toBeUndefined();
  });
});

describe('Phase 1: 변경 없는 Patch 와 source 문자열 보존 (사용자 결정)', () => {
  it('TC-P1-036 같은 내용을 다시 Patch: History 에 넣지 않고 "변경 없음" 로그, 뒤로는 바로 이전 버전', () => {
    const ui = mount('<p>0</p>');
    patchTo(ui, '<p>1</p>');
    patchTo(ui, '<p>1</p>');
    expectButtons(ui, { back: true, forward: false, pos: '2 / 2' });
    const [entry, prev] = entries(ui);
    expect(entry.dataset.empty).toBe('true');
    expect(counts(entry)).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 0, text: 0 });
    expect(prev.dataset.empty).not.toBe('true');
    ui.backBtn.click();
    expectReal(ui, '<p>0</p>');
    expectButtons(ui, { back: false, forward: true, pos: '1 / 2' });
  });

  it('TC-P1-037 뒤로 간 뒤 변경 없는 Patch 는 앞쪽 기록을 버리지 않는다', () => {
    const ui = mount('<p>0</p>');
    patchTo(ui, '<p>1</p>');
    ui.backBtn.click();
    patchTo(ui, '  <p>0</p>  ');
    expectButtons(ui, { back: false, forward: true, pos: '1 / 2' });
    ui.forwardBtn.click();
    expectReal(ui, '<p>1</p>');
    expectSource(ui, '<p>1</p>');
  });

  it('TC-P1-038 들여쓰기 있는 원본: 로드·Patch 후·뒤로·앞으로 모두 저장된 문자열 그대로', () => {
    const v0 = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>\n';
    const v1 = '<ul>\n    <li>a</li>\n    <li>B</li>\n</ul>\n<!-- 메모 -->\n';
    const ui = mount(v0);
    expect(ui.source.value).toBe(v0);
    patchTo(ui, v1);
    expect(ui.source.value).toBe(v1);
    ui.backBtn.click();
    expect(ui.source.value).toBe(v0);
    ui.forwardBtn.click();
    expect(ui.source.value).toBe(v1);
    expectReal(ui, v1);
  });
});

describe('Phase 1: 허용 목록 정화 (사용자 결정 A)', () => {
  it('TC-P1-042 허용되지 않은 HTML 요소는 하위 트리째(텍스트 포함) 빠지고 하나당 1 로 센다', () => {
    const ui = mount('<p>start</p>');
    patchTo(
      ui,
      '<p>k</p><style>p{}</style><link rel="stylesheet" href="x.css"><meta http-equiv="refresh" content="0">' +
        '<base href="https://e.com/"><iframe src="x"></iframe><object data="x">fb<p>o</p></object><embed src="x">' +
        '<form><input name="f"></form><template><p>t</p></template><noscript><p>n</p></noscript>' +
        '<applet>ap</applet><math><mi>m</mi></math><xmp>x</xmp><plaintext>rest',
    );
    expectReal(ui, '<p>k</p>');
    expect(entries(ui)[0].dataset.sanitized).toBe('14');
  });

  it('TC-P1-043 SVG 는 기본 도형만: animate·set·use·foreignObject·image·a 를 빼고, desc 안의 HTML 요소도 뺀다', () => {
    const ui = mount('<p>start</p>');
    patchTo(
      ui,
      '<svg viewBox="0 0 10 10"><g><rect x="1" y="1" width="2" height="2" fill="red"></rect>' +
        '<animate attributeName="x" to="5"></animate><set attributeName="href" to="javascript:x"></set>' +
        '<animateTransform></animateTransform><animateMotion></animateMotion><use href="#a"></use>' +
        '<foreignObject><p>f</p></foreignObject><image href="x"></image><a><text>t</text></a></g>' +
        '<desc>d<b>x</b></desc></svg>',
    );
    expectReal(ui, '<svg viewBox="0 0 10 10"><g><rect x="1" y="1" width="2" height="2" fill="red"></rect></g><desc>d</desc></svg>');
    expect(ui.real.querySelector('svg').namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(entries(ui)[0].dataset.sanitized).toBe('9');
  });

  it('TC-P1-044 허용되지 않은 속성(style 포함)만 빠지고 전역·요소별 허용 속성은 순서대로 남는다', () => {
    const ui = mount('<p>start</p>');
    patchTo(
      ui,
      '<p style="color:red" class="c" id="i" title="t" lang="ko" dir="ltr" hidden data-x="1" aria-label="l" role="note" tabindex="0" contenteditable="true" align="left" foo="bar">x</p>' +
        '<a href="https://e.com" target="_blank" rel="noopener" download="f" ping="https://x">l</a>' +
        '<img src="a.png" alt="" width="1" height="1" srcset="b.png 2x" loading="lazy">' +
        '<input type="text" value="v" name="n" form="f" formaction="https://x" autofocus>' +
        '<button type="button" value="v" name="n" disabled>b</button>' +
        '<table><tbody><tr><td colspan="2" rowspan="1" bgcolor="red">c</td></tr></tbody></table>',
    );
    expectReal(
      ui,
      '<p class="c" id="i" title="t" lang="ko" dir="ltr" hidden="" data-x="1" aria-label="l" role="note" tabindex="0" contenteditable="true">x</p>' +
        '<a href="https://e.com" target="_blank" rel="noopener">l</a>' +
        '<img src="a.png" alt="" width="1" height="1">' +
        '<input type="text" value="v" name="n">' +
        '<button type="button" value="v" name="n" disabled="">b</button>' +
        '<table><tbody><tr><td colspan="2" rowspan="1">c</td></tr></tbody></table>',
    );
    // style, align, foo / download, ping / srcset, loading / form, formaction, autofocus / bgcolor
    expect(entries(ui)[0].dataset.sanitized).toBe('11');
  });

  it('TC-P1-045 URL 속성: http·https·mailto·상대 경로·#·빈 값만 남기고 다른 스킴은 뺀다 (대소문자·공백·제어문자 무시)', () => {
    const keep = ['http://a', 'HTTPS://A', 'mailto:x@y', 'rel/path', '/abs', '#frag', '?q=1', ''];
    const drop = ['data:text/html,x', 'vbscript:x', 'blob:https://a/x', 'file:///etc', '&#32;&#9;JaVa&#10;ScRiPt:x', 'ftp://x'];
    const ui = mount('<p>start</p>');
    patchTo(
      ui,
      keep.map((u, i) => `<a href="${u}">k${i}</a>`).join('') +
        drop.map((u, i) => `<a href="${u}">d${i}</a>`).join('') +
        '<img src="data:image/png;base64,AAAA" alt="x">',
    );
    expectReal(
      ui,
      keep.map((u, i) => `<a href="${u}">k${i}</a>`).join('') +
        drop.map((_u, i) => `<a>d${i}</a>`).join('') +
        '<img alt="x">',
    );
    expect(entries(ui)[0].dataset.sanitized).toBe('7');
  });

  it('TC-P1-046 setAttribute 가 거부하는 속성 이름(`<p =x>`)도 빠져서 preview·Patch 가 오류 없이 동작한다', () => {
    const ui = mount('<p>start</p>');
    const onError = vi.fn();
    window.addEventListener('error', onError);
    try {
      edit(ui, '<p =x class="k">a</p>');
      expectPreview(ui, '<p class="k">a</p>');
      ui.patchBtn.click();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(onError).not.toHaveBeenCalled();
    expectReal(ui, '<p class="k">a</p>');
    const [entry] = entries(ui);
    expect(entry.dataset.action).toBe('patch');
    expect(entry.dataset.sanitized).toBe('1');
  });
});

// 실제 영역의 화면 상태(.value / .checked / .selected)까지 render(html) 와 같은지 본다.
function liveState(root) {
  return [...root.querySelectorAll('input, textarea, select, option')].map((el) => ({
    tag: el.localName,
    value: el.value,
    checked: el.checked ?? null,
    selected: el.selected ?? null,
  }));
}

function expectLive(ui, html) {
  expectReal(ui, html);
  const box = document.createElement('div');
  for (const v of parseList(html)) box.appendChild(render(v));
  expect(liveState(ui.real)).toEqual(liveState(box));
}

describe('Phase 1: 사용자가 바꾼 실제 영역과 대조 (사용자 결정 C)', () => {
  it('TC-P1-047 체크박스를 클릭한 뒤 다른 노드만 바꾸는 Patch: 체크 상태가 render(새 VNode) 로 돌아간다', () => {
    const ui = mount('<input type="checkbox"><p>a</p>');
    ui.real.querySelector('input').click();
    expect(ui.real.querySelector('input').checked).toBe(true);
    patchTo(ui, '<input type="checkbox"><p>b</p>');
    expectLive(ui, '<input type="checkbox"><p>b</p>');
    expect(ui.real.querySelector('input').checked).toBe(false);

    const ui2 = mount('<input type="checkbox" checked><p>a</p>');
    ui2.real.querySelector('input').click(); // 사용자가 체크를 풂
    patchTo(ui2, '<input type="checkbox" checked><p>b</p>');
    expect(ui2.real.querySelector('input').checked).toBe(true); // 새 VNode 에 checked 가 있으면 유지
  });

  it('TC-P1-048 input 에 입력한 뒤 Patch: 값이 덮이고, 같은 source 로 다시 Patch 해도 값을 되돌린다 (빈 diff 아님)', () => {
    const ui = mount('<input value="a"><p>1</p>');
    const input = ui.real.querySelector('input');
    input.value = '사용자';
    patchTo(ui, '<input value="a"><p>2</p>');
    expectLive(ui, '<input value="a"><p>2</p>');
    expect(input.value).toBe('a');

    input.value = 'zzz';
    ui.patchBtn.click(); // source 는 그대로
    expect(ui.real.querySelector('input').value).toBe('a');
    const [entry] = entries(ui);
    expect(entry.dataset.action).toBe('patch');
    expect(entry.dataset.empty).not.toBe('true');
  });

  it('TC-P1-049 textarea 에 입력한 뒤 다른 노드만 바꾸는 Patch: .value 가 원래 텍스트로', () => {
    const ui = mount('<textarea>t</textarea><p>1</p>');
    ui.real.querySelector('textarea').value = '사용자';
    patchTo(ui, '<textarea>t</textarea><p>2</p>');
    expectLive(ui, '<textarea>t</textarea><p>2</p>');
    expect(ui.real.querySelector('textarea').value).toBe('t');
  });

  it('TC-P1-050 select 에서 고른 뒤 Patch: 선택이 render(새 VNode) 로 돌아가고, 새 VNode 의 selected 는 지킨다', () => {
    const sel = (s) => `<select><option value="a">A</option><option value="b"${s}>B</option></select>`;
    const ui = mount(`${sel('')}<p>1</p>`);
    ui.real.querySelector('select').value = 'b';
    patchTo(ui, `${sel('')}<p>2</p>`);
    expectLive(ui, `${sel('')}<p>2</p>`);
    expect(ui.real.querySelector('select').value).toBe('a');

    ui.real.querySelector('select').value = 'b';
    patchTo(ui, `${sel(' selected')}<p>3</p>`);
    expectLive(ui, `${sel(' selected')}<p>3</p>`);
    expect(ui.real.querySelector('select').value).toBe('b');
  });

  it('TC-P1-051 details 를 연 뒤 Patch: 닫히고, 사용자의 속성 변경은 로그 개수에 섞이지 않는다', () => {
    const d = (open, n) => `<details${open}><summary>s</summary>x</details><p>${n}</p>`;
    const ui = mount(d('', 1));
    ui.real.querySelector('details').open = true;
    patchTo(ui, d('', 2));
    expectReal(ui, d('', 2));
    expect(ui.real.querySelector('details').open).toBe(false);
    expect(counts(entries(ui)[0])).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 1, text: 1 });

    // 사용자가 연 상태가 새 VNode 와 같으면 속성을 건드리지 않는다 (실제 DOM 과 대조했으므로)
    ui.real.querySelector('details').open = true;
    patchTo(ui, d(' open', 3));
    expect(ui.real.querySelector('details').open).toBe(true);
    expect(counts(entries(ui)[0])).toEqual({ action: 'patch', added: 0, removed: 0, attributes: 0, text: 1 });
  });

  it('TC-P1-052 contenteditable 내용을 지워 <br> 만 남은 뒤 Patch: 오류 없이 새 내용, 개수는 patch 가 만든 것만', () => {
    const ui = mount('<p contenteditable="true">ab</p>');
    ui.real.querySelector('p').replaceChildren(document.createElement('br')); // Chrome 이 전부 지울 때 남기는 모양
    patchTo(ui, '<p contenteditable="true">ac</p>');
    expectReal(ui, '<p contenteditable="true">ac</p>');
    expect(counts(entries(ui)[0])).toEqual({ action: 'patch', added: 1, removed: 1, attributes: 0, text: 0 });
  });

  it('TC-P1-053 개발자 도구로 속성·노드를 바꾼 실제 영역도 Patch 후 render(새 VNode) 와 같다', () => {
    const ui = mount('<p>a</p>');
    ui.real.querySelector('p').setAttribute('class', 'user');
    const span = document.createElement('span');
    span.textContent = 'x';
    ui.real.appendChild(span);
    patchTo(ui, '<p>b</p><p>c</p>');
    expectReal(ui, '<p>b</p><p>c</p>');
    // class 제거 1 + 텍스트 1 + span → p 교체(추가 1, 삭제 1). 사용자가 만든 기록은 섞이지 않는다.
    expect(counts(entries(ui)[0])).toEqual({ action: 'patch', added: 1, removed: 1, attributes: 1, text: 1 });
  });

  it('TC-P1-054 뒤로/앞으로도 실제 DOM 과 대조한다: 체크한 뒤 뒤로 가면 render(V0) 상태', () => {
    const ui = mount('<input type="checkbox"><p>0</p>');
    patchTo(ui, '<input type="checkbox"><p>1</p>');
    ui.real.querySelector('input').click();
    ui.backBtn.click();
    expectLive(ui, '<input type="checkbox"><p>0</p>');
    ui.real.querySelector('input').click();
    ui.forwardBtn.click();
    expectLive(ui, '<input type="checkbox"><p>1</p>');
    expect(ui.real.querySelector('input').checked).toBe(false);
  });
});
