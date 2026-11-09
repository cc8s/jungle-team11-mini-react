// Phase 1 데모: 테스트 영역 textarea 의 HTML 을 diff/patch 로 실제 영역에 반영한다.
// 계약은 tests/integration/phase1.test.js, phase1-error.test.js 맨 위 주석.
//
//   로드     initialHTML → VNode 들(V0) → 실제 영역을 render(V0) 로 채운다
//   Patch    source → Vn → diff(이전, Vn) → 실제 영역에 patch → History 에 { vnode, source }
//   뒤로/앞으로  History 이동 → diff/patch 로 실제 영역을 맞추고 source 는 저장된 문자열로
//
// 실제 영역에는 MutationObserver 를 붙여, 조작 한 번마다 takeRecords() 로 기록을 모아 로그에 남긴다.
// 사용자 HTML 은 라이브러리가 아니라 여기서 허용 목록으로 거른다 (sanitize.js).
// diff 의 old 는 지금 실제 영역을 읽은 VNode 다. 사용자가 실제 영역을 바꿨을 수 있다 (read-dom.js).
import { h } from '../vdom/vnode.js';
import { childrenToVNodes } from '../vdom/dom-to-vnode.js';
import { render } from '../vdom/render.js';
import { diff } from '../vdom/diff.js';
import { patch } from '../vdom/patch.js';
import { toHTML } from '../vdom/to-html.js';
import { createHistory } from './history.js';
import { sanitize } from './sanitize.js';
import { normalizeReal, readChildren } from './read-dom.js';

const SAMPLE_HTML = `<div class="card">
  <h2>할 일 목록</h2>
  <ul>
    <li>Virtual DOM 만들기</li>
    <li>Diff 알고리즘</li>
    <li class="done">Patch 적용</li>
  </ul>
  <p>텍스트, 속성, 태그를 고친 뒤 <b>Patch</b> 를 누르세요.</p>
</div>
`;

export function mountPhase1(container, { initialHTML = SAMPLE_HTML } = {}) {
  const ui = buildLayout(container);

  const initial = sanitize(parse(initialHTML));
  ui.real.replaceChildren(...initial.vnodes.map((v) => render(v)));
  ui.source.value = initialHTML;
  showPreview(ui.preview, initial.vnodes);

  const history = createHistory({ vnode: initial.vnodes, source: initialHTML });
  const observer = new MutationObserver(() => {});
  observer.observe(ui.real, { childList: true, attributes: true, characterData: true, subtree: true });

  const refresh = () => {
    ui.back.disabled = !history.canBack;
    ui.forward.disabled = !history.canForward;
    ui.history.textContent = `${history.index + 1} / ${history.size}`;
  };

  // 실제 영역을 next 로 맞춘다. diff old 는 저장된 prev 가 아니라 지금 실제 영역을 읽은 VNode 다
  // (사용자 결정 C). 사용자 조작이 만든 기록은 먼저 버린다. 실패하면 prev 를 다시 그려
  // 반쯤 적용된 상태를 남기지 않는다.
  const update = (prev, next) => {
    normalizeReal(ui.real);
    observer.takeRecords();
    const patches = diff(wrap(readChildren(ui.real, prev)), wrap(next));
    try {
      if (patches.length) patch(ui.real, patches);
      return { patches, records: observer.takeRecords() };
    } catch (error) {
      ui.real.replaceChildren(...prev.map((v) => render(v)));
      observer.takeRecords();
      return { error };
    }
  };

  const onPatch = () => {
    const source = ui.source.value;
    const { vnodes, removed } = sanitize(parse(source));
    const result = update(history.current.vnode, vnodes);
    if (result.error) {
      addLog(ui.log, { action: 'error', message: result.error.message });
      return;
    }
    // 사용자 조작을 되돌리기만 한 Patch(같은 source, 같은 VNode)는 History 에 또 넣지 않는다.
    const unchanged = source === history.current.source && sameVNodes(vnodes, history.current.vnode);
    if (result.patches.length && !unchanged) history.push({ vnode: vnodes, source });
    addLog(ui.log, { action: 'patch', ...result, sanitized: removed });
    refresh();
  };

  const onMove = (action) => {
    const canMove = action === 'back' ? history.canBack : history.canForward;
    if (!canMove) return;
    const prev = history.current.vnode;
    const entry = action === 'back' ? history.back() : history.forward();
    const result = update(prev, entry.vnode);
    if (result.error) {
      if (action === 'back') history.forward();
      else history.back();
      addLog(ui.log, { action: 'error', message: result.error.message });
      return;
    }
    ui.source.value = entry.source ?? toHTML(entry.vnode);
    showPreview(ui.preview, entry.vnode);
    addLog(ui.log, { action, ...result });
    refresh();
  };

  ui.source.addEventListener('input', () => showPreview(ui.preview, sanitize(parse(ui.source.value)).vnodes));
  ui.patch.addEventListener('click', onPatch);
  ui.back.addEventListener('click', () => onMove('back'));
  ui.forward.addEventListener('click', () => onMove('forward'));
  refresh();
}

function buildLayout(container) {
  container.innerHTML = `
    <div class="phase1">
      <section class="pane pane-real">
        <h2>실제 영역</h2>
        <div class="surface" data-testid="real"></div>
      </section>
      <section class="pane pane-source">
        <h2>테스트 영역</h2>
        <textarea class="source" data-testid="source" spellcheck="false" aria-label="테스트 영역 HTML"></textarea>
        <h3>미리보기</h3>
        <div class="surface preview" data-testid="preview"></div>
      </section>
      <div class="toolbar">
        <button type="button" data-testid="back" aria-label="뒤로">◀ 뒤로</button>
        <span class="position" data-testid="history"></span>
        <button type="button" data-testid="forward" aria-label="앞으로">앞으로 ▶</button>
        <button type="button" class="primary" data-testid="patch">Patch</button>
      </div>
      <section class="pane pane-log">
        <h2>Patch 로그 <small>MutationObserver</small></h2>
        <ol class="log" data-testid="log"></ol>
      </section>
    </div>`;
  const q = (id) => container.querySelector(`[data-testid="${id}"]`);
  return {
    real: q('real'),
    source: q('source'),
    preview: q('preview'),
    patch: q('patch'),
    back: q('back'),
    forward: q('forward'),
    history: q('history'),
    log: q('log'),
  };
}

// <template> 은 파싱만 하고 스크립트 실행·이미지 로딩을 하지 않는다 (결정 0008).
function parse(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return childrenToVNodes(tpl.content);
}

// 실제 영역 래퍼의 자식들을 한 트리로 묶어 diff 한다. 래퍼 자체는 같으므로 patch 는 자식에만 생긴다.
const wrap = (vnodes) => h('div', null, vnodes);

function showPreview(preview, vnodes) {
  preview.replaceChildren(...vnodes.map((v) => render(v)));
}

// 같은 내용인지: Patch 한 결과를 History 에 또 넣을지 정할 때 쓴다.
function sameVNodes(a, b) {
  return a.length === b.length && a.every((v, i) => sameVNode(v, b[i]));
}

function sameVNode(a, b) {
  if (a.type !== b.type || a.key !== b.key || a.text !== b.text) return false;
  const pa = Object.entries(a.props);
  const pb = Object.entries(b.props);
  if (pa.length !== pb.length || pa.some(([name, value], i) => pb[i][0] !== name || pb[i][1] !== value)) return false;
  return sameVNodes(a.children, b.children);
}

// 로그 ---------------------------------------------------------------------

const ACTION_LABELS = { patch: 'Patch', back: '뒤로', forward: '앞으로', error: '오류' };

// 최신 항목이 맨 앞에 온다.
function addLog(log, { action, patches = [], records = [], sanitized, message }) {
  const item = document.createElement('li');
  item.className = `log-entry log-${action}`;
  item.dataset.testid = 'log-entry';
  item.dataset.action = action;

  const counts = countRecords(records);
  item.dataset.added = counts.added;
  item.dataset.removed = counts.removed;
  item.dataset.attributes = counts.attributes;
  item.dataset.text = counts.text;
  if (action === 'patch') {
    item.dataset.sanitized = sanitized;
    if (!patches.length) item.dataset.empty = 'true';
  }

  const title = document.createElement('strong');
  title.textContent = ACTION_LABELS[action];
  const detail = document.createElement('span');
  if (message !== undefined) {
    detail.textContent = `${message} (실제 영역을 이전 상태로 복구)`;
  } else if (!patches.length) {
    detail.textContent = '변경 없음';
  } else {
    const parts = [
      summarizePatches(patches),
      `노드 +${counts.added} −${counts.removed}`,
      `속성 ${counts.attributes}`,
      `텍스트 ${counts.text}`,
    ];
    if (sanitized) parts.push(`정화 ${sanitized}`);
    detail.textContent = parts.join(' · ');
  }
  item.append(title, ' ', detail);
  log.prepend(item);
}

function countRecords(records) {
  const counts = { added: 0, removed: 0, attributes: 0, text: 0 };
  for (const record of records) {
    if (record.type === 'childList') {
      counts.added += record.addedNodes.length;
      counts.removed += record.removedNodes.length;
    } else if (record.type === 'attributes') {
      counts.attributes += 1;
    } else if (record.type === 'characterData') {
      counts.text += 1;
    }
  }
  return counts;
}

// 'TEXT ×2, ADD ×1' 처럼 처음 나온 순서대로 종류별 개수.
function summarizePatches(patches) {
  const byType = new Map();
  for (const { type } of patches) byType.set(type, (byType.get(type) ?? 0) + 1);
  return [...byType].map(([type, n]) => `${type} ×${n}`).join(', ');
}
