// 검증용 웹페이지: 좌측 페이지 선택(Phase 1/2), 가운데 실제 영역과 테스트 영역, 우측 State History.
// Phase 2는 최애곡 모음 앱(FunctionComponent)을 그리고, 렌더링마다 바뀐 노드를 하이라이트하며 변경 기록을 쌓는다.

import { create_root_from_container, is_same_tree } from './virtual_node.js';
import { diff_trees, share_unchanged_nodes } from './diff.js';
import { create_bookmark_registry, mount_tree, apply_operations } from './patch.js';
import { serialize_to_html } from './serialize_html.js';
import { parse_html_to_virtual_tree } from './parse_html.js';
import {
  create_state_history,
  get_current_entry,
  can_go_back,
  can_go_forward,
  go_back,
  go_forward,
  go_to_index,
  commit_tree,
  commit_outcomes,
} from './state_history.js';
import {
  summarize_operations,
  format_operation_summary,
  is_hidden_operation,
  is_hidden_only_summary,
} from './operation_summary.js';
import { format_relative_time } from './relative_time.js';
import { resolve_page_name } from './page_route.js';
import { FunctionComponent } from './function_component.js';
import { count_view_nodes } from './view_builder.js';
import { song_board_root } from './song_board.js';
import { parse_saved_board, serialize_board } from './song_board_model.js';

const highlight_duration_ms = 1400;
const relative_time_refresh_ms = 30 * 1000;
const sidebar_storage_key = 'equalize_sidebar_state';
const song_board_storage_key = 'equalize_song_board';
const change_highlight_storage_key = 'equalize_change_highlight';
const maximum_render_record_count = 50;
const default_document_title = 'Equalize';
const page_titles = Object.freeze({
  phase1: 'Phase 1 · Virtual DOM · Diff · Patch',
  phase2: 'Phase 2 · 최애곡 모음',
});

const app_shell_element = document.getElementById('app_shell');
const page_sidebar_element = document.getElementById('page_sidebar');
const sidebar_toggle_button = document.getElementById('sidebar_toggle_button');
const page_title_element = document.getElementById('page_title');
const page_meta_element = document.getElementById('page_meta');
const real_area_element = document.getElementById('real_area');
const test_area_element = document.getElementById('test_area');
const patch_button = document.getElementById('patch_button');
const back_button = document.getElementById('back_button');
const forward_button = document.getElementById('forward_button');
const history_list_element = document.getElementById('history_list');
const history_count_element = document.getElementById('history_count');
const song_board_element = document.getElementById('song_board');
const render_history_list_element = document.getElementById('render_history_list');
const highlight_toggle_button = document.getElementById('highlight_toggle_button');

const bookmark_registry = create_bookmark_registry();
// 이력 모듈은 트리만 다루므로, 화면에 보여 줄 확정 시각과 요약은 여기서 entry_id별로 보관한다.
const entry_details_by_id = new Map();
let state_history = null;
let is_test_area_dirty = false;
let current_page_name = 'phase1';

// Phase 2: 곡 모음 컴포넌트와 렌더링 기록. 기록은 화면 표시용이라 컴포넌트 State에 넣지 않는다.
let song_board_component = null;
let render_records = [];
let pending_action_label = null;
let song_board_status = { song_count: 0, main_song_title_text: '' };
let is_change_highlight_enabled = true;

function entry_label(entry) {
  return `v${entry.entry_id}`;
}

// is_hidden_only: 주석·공백만 바뀌어 실제 영역 화면에는 변화가 없는 상태. 카드 요약을 한 단계 연하게 보여 준다.
function record_entry_details(entry, summary_text, is_hidden_only = false) {
  entry_details_by_id.set(entry.entry_id, { summary_text, is_hidden_only, confirmed_at_ms: Date.now() });
}

// 이력에서 버려진 상태의 카드 정보도 함께 지운다.
function forget_entry_details(entries) {
  for (const entry of entries) entry_details_by_id.delete(entry.entry_id);
}

function render_test_area(virtual_tree) {
  const serialized_html = serialize_to_html(virtual_tree);
  // 내용이 같으면 그대로 두어 커서 위치와 스크롤을 보존한다.
  if (test_area_element.value !== serialized_html) test_area_element.value = serialized_html;
  is_test_area_dirty = false;
}

// 히스토리 카드 안쪽(배지, 이름, 요약, 시간)은 Phase 1과 Phase 2가 같은 모양을 쓴다.
function fill_history_card(card_element, card_parts) {
  const head_element = document.createElement('span');
  head_element.className = 'history_card_head';
  const badge_element = document.createElement('span');
  badge_element.className = 'history_badge';
  badge_element.textContent = card_parts.badge_text;
  const name_element = document.createElement('span');
  name_element.className = 'history_name';
  name_element.textContent = card_parts.name_text;
  head_element.append(badge_element, name_element);

  const summary_element = document.createElement('span');
  summary_element.className = card_parts.is_quiet ? 'history_summary history_summary_quiet' : 'history_summary';
  summary_element.textContent = card_parts.summary_text;

  const time_element = document.createElement('span');
  time_element.className = 'history_time';
  const elapsed_element = document.createElement('span');
  elapsed_element.textContent = card_parts.recorded_at_ms === null ? '' : format_relative_time(Date.now() - card_parts.recorded_at_ms);
  time_element.append(elapsed_element);

  card_element.append(head_element, summary_element, time_element);
  return card_element;
}

function create_history_card(entry, history_index) {
  const entry_details = entry_details_by_id.get(entry.entry_id);
  const is_current = history_index === state_history.current_index;

  const card_button = document.createElement('button');
  card_button.type = 'button';
  card_button.className = 'history_card';
  card_button.dataset.history_index = String(history_index);
  card_button.setAttribute('aria-current', String(is_current));
  card_button.title = `${entry_label(entry)} 상태로 이동`;
  // 현재 상태는 별도 문구 없이 검정 배지와 흰 카드 배경으로만 표시한다.
  return fill_history_card(card_button, {
    badge_text: entry_label(entry),
    name_text: `${history_index + 1}번째 확정`,
    summary_text: entry_details?.summary_text ?? '',
    is_quiet: Boolean(entry_details?.is_hidden_only),
    recorded_at_ms: entry_details?.confirmed_at_ms ?? null,
  });
}

// 최근 확정이 위로 오도록 거꾸로 보여 준다.
function render_history_list() {
  const card_items = state_history.entries
    .map((entry, history_index) => {
      const list_item = document.createElement('li');
      list_item.appendChild(create_history_card(entry, history_index));
      return list_item;
    })
    .reverse();
  history_list_element.replaceChildren(...card_items);
}

// Phase 2 기록 카드: 최근 렌더링이 위로 온다. 이동 기능이 없으므로 버튼이 아니라 정적 카드다.
function render_render_history() {
  const latest_render_count = render_records.at(-1)?.render_count ?? null;
  const card_items = render_records
    .map((render_record) => {
      const list_item = document.createElement('li');
      const card_element = document.createElement('div');
      card_element.className = 'history_card history_card_static';
      card_element.setAttribute('aria-current', String(render_record.render_count === latest_render_count));
      list_item.appendChild(
        fill_history_card(card_element, {
          badge_text: `r${render_record.render_count}`,
          name_text: render_record.action_label,
          summary_text: render_record.summary_text,
          is_quiet: render_record.is_quiet,
          recorded_at_ms: render_record.recorded_at_ms,
        }),
      );
      return list_item;
    })
    .reverse();
  render_history_list_element.replaceChildren(...card_items);
}

function render_page_meta() {
  if (current_page_name === 'phase2') {
    const render_count = song_board_component?.render_count ?? 0;
    page_meta_element.textContent = `렌더링 ${render_count}회 · 곡 ${song_board_status.song_count}개`;
    history_count_element.textContent = `${render_records.length}개 기록`;
    return;
  }
  const current_entry = get_current_entry(state_history);
  page_meta_element.textContent = `${entry_label(current_entry)} · 상태 ${state_history.entries.length}개`;
  history_count_element.textContent = `${state_history.entries.length}개 상태`;
}

function update_controls() {
  back_button.disabled = !can_go_back(state_history);
  forward_button.disabled = !can_go_forward(state_history);
  // 테스트 영역을 고쳤을 때만 Patch할 수 있다. 수정 없는 Patch는 이력을 바꾸지 않는다.
  patch_button.disabled = !is_test_area_dirty;
  render_history_list();
  render_page_meta();
}

// 텍스트 노드가 바뀌면 부모 요소를 칠한다. scope_element 밖이나 scope_element 자신은 칠하지 않는다.
function highlight_dom_nodes(changed_dom_nodes, scope_element = real_area_element) {
  const highlighted_elements = new Set();
  for (const dom_node of changed_dom_nodes) {
    const target_element = dom_node.nodeType === Node.ELEMENT_NODE ? dom_node : dom_node.parentElement;
    if (!target_element || target_element === scope_element || !scope_element.contains(target_element)) continue;
    highlighted_elements.add(target_element);
  }
  // 외곽선 없이 연한 회색 상자로만 잠깐 표시한다. class나 style attribute를 건드리지 않도록 Web Animations API를 쓴다.
  // background-color를 애니메이션하면 그동안 요소의 원래 배경(예: 검정 "메인" 버튼)을 덮어써 흰 글자가 사라지므로,
  // 배경 위·글자 아래에 그려지는 inset box-shadow로 칠한다. 모서리는 요소에 원래 모서리가 없을 때만 6px로 둥글린다.
  for (const target_element of highlighted_elements) {
    if (typeof target_element.animate !== 'function') continue;
    const has_own_radius = window.getComputedStyle(target_element).borderTopLeftRadius !== '0px';
    const radius_keyframe = has_own_radius ? {} : { borderRadius: '6px' };
    target_element.animate(
      [
        { boxShadow: 'inset 0 0 0 100vmax rgb(0 0 0 / 0.07)', ...radius_keyframe },
        { boxShadow: 'inset 0 0 0 100vmax rgb(0 0 0 / 0)', ...radius_keyframe },
      ],
      { duration: highlight_duration_ms, easing: 'ease-out' },
    );
  }
}

function patch_real_area(current_tree, target_tree) {
  const operations = diff_trees(current_tree, target_tree);
  const { changed_records } = apply_operations(bookmark_registry, operations, document);
  // 주석·공백처럼 화면에 보이지 않는 변경은 하이라이트하지 않는다(부모 전체가 깜빡여 헷갈리지 않도록).
  highlight_dom_nodes(
    changed_records.filter((change_record) => !is_hidden_operation(change_record.operation)).map((change_record) => change_record.dom_node),
  );
  return operations;
}

function handle_patch() {
  if (patch_button.disabled) return;
  const current_entry = get_current_entry(state_history);
  const parsed_tree = parse_html_to_virtual_tree(test_area_element.value, document);
  const shared_tree = share_unchanged_nodes(current_entry.tree, parsed_tree);
  const commit_result = commit_tree(state_history, shared_tree, is_same_tree);
  const operations = patch_real_area(current_entry.tree, commit_result.tree);
  state_history = commit_result.history;
  render_test_area(commit_result.tree);

  if (commit_result.outcome === commit_outcomes.appended) {
    // 뒤로 간 상태에서 고쳤다면 뒤쪽 상태는 버려지고 새 상태가 바로 뒤에 붙는다(브라우저 방식).
    forget_entry_details(commit_result.discarded_entries);
    // 화면 변화가 없는 변경(주석, 공백)도 Patch 기록으로 남긴다.
    const operation_summary = summarize_operations(operations);
    record_entry_details(commit_result.entry, format_operation_summary(operation_summary), is_hidden_only_summary(operation_summary));
  }
  update_controls();
}

function move_history(next_history) {
  if (next_history === state_history) return;
  const current_tree = get_current_entry(state_history).tree;
  const target_entry = next_history.entries[next_history.current_index];
  patch_real_area(current_tree, target_entry.tree);
  state_history = next_history;
  // Patch하지 않은 편집은 버리고 이동한 상태의 HTML로 테스트 영역을 바꾼다.
  render_test_area(target_entry.tree);
  update_controls();
}

// ---------- 페이지 선택과 사이드바 접기 ----------

function show_page(page_name) {
  current_page_name = page_name;
  for (const page_view of document.querySelectorAll('.page_view')) {
    page_view.hidden = page_view.dataset.page_name !== page_name;
  }
  for (const nav_item of document.querySelectorAll('.nav_item[data-page_name]')) {
    if (nav_item.dataset.page_name === page_name) nav_item.setAttribute('aria-current', 'page');
    else nav_item.removeAttribute('aria-current');
  }
  for (const scoped_element of document.querySelectorAll('[data-page_scope]')) {
    scoped_element.hidden = scoped_element.dataset.page_scope !== page_name;
  }
  page_title_element.textContent = page_titles[page_name];
  render_document_title();
  render_page_meta();
}

function render_document_title() {
  const main_song_title_text = song_board_status.main_song_title_text;
  document.title =
    current_page_name === 'phase2' && main_song_title_text !== ''
      ? `♪ ${main_song_title_text} · ${default_document_title}`
      : `${default_document_title} · ${page_titles[current_page_name]}`;
}

// ---------- Phase 2: 최애곡 모음 ----------

function read_storage_text(storage_key) {
  try {
    return window.localStorage.getItem(storage_key);
  } catch {
    return null;
  }
}

function write_storage_text(storage_key, storage_text) {
  try {
    window.localStorage.setItem(storage_key, storage_text);
  } catch {
    // 저장소를 쓸 수 없거나 가득 찬 환경에서는 새로고침 뒤 유지되지 않을 뿐 앱은 계속 동작한다.
  }
}

// 핸들러가 State를 바꾼 뒤 부르므로, 이미 예약된 update가 먼저 이름을 가져간다.
// State가 그대로라 update가 없으면 다음 microtask에서 이름을 버려 다른 렌더링에 붙지 않게 한다.
function report_song_board_action(action_label) {
  pending_action_label = action_label;
  queueMicrotask(() => {
    if (pending_action_label === action_label) pending_action_label = null;
  });
}

function record_song_board_render(render_report) {
  const node_count = count_view_nodes(song_board_component.current_root);
  const is_first_render = render_report.render_count === 1;
  const operation_summary = summarize_operations(render_report.operations);
  const summary_text = is_first_render
    ? `mount · 노드 ${node_count}개 생성`
    : `${format_operation_summary(operation_summary)} · 전체 노드 ${node_count}개`;
  render_records = [
    ...render_records,
    {
      render_count: render_report.render_count,
      action_label: pending_action_label ?? (is_first_render ? '첫 렌더링' : '다시 렌더링'),
      summary_text,
      is_quiet: !is_first_render && operation_summary.visible_count === 0,
      recorded_at_ms: Date.now(),
    },
  ].slice(-maximum_render_record_count);
  pending_action_label = null;

  if (is_change_highlight_enabled && !is_first_render) {
    highlight_dom_nodes(
      render_report.changed_records
        .filter((change_record) => !is_hidden_operation(change_record.operation))
        .map((change_record) => change_record.dom_node),
      song_board_element,
    );
  }
  render_render_history();
  render_page_meta();
}

function apply_change_highlight_state(is_enabled) {
  is_change_highlight_enabled = is_enabled;
  highlight_toggle_button.setAttribute('aria-pressed', String(is_enabled));
  const toggle_label = is_enabled ? '변경 하이라이트 끄기' : '변경 하이라이트 켜기';
  highlight_toggle_button.setAttribute('aria-label', toggle_label);
  highlight_toggle_button.title = toggle_label;
}

function initialize_song_board() {
  apply_change_highlight_state(read_storage_text(change_highlight_storage_key) !== 'off');
  highlight_toggle_button.addEventListener('click', () => {
    apply_change_highlight_state(!is_change_highlight_enabled);
    write_storage_text(change_highlight_storage_key, is_change_highlight_enabled ? 'on' : 'off');
  });

  song_board_component = new FunctionComponent(
    song_board_root,
    song_board_element,
    {
      load_board: () => parse_saved_board(read_storage_text(song_board_storage_key)),
      save_board: (board) => write_storage_text(song_board_storage_key, serialize_board(board)),
      on_board_change: (board_change) => {
        song_board_status = board_change;
        render_document_title();
        render_page_meta();
      },
      report_action: report_song_board_action,
      focus_by_id: (element_id) => document.getElementById(element_id)?.focus(),
    },
    { on_rendered: record_song_board_render },
  );
  song_board_component.mount();
}

function read_saved_sidebar_state() {
  try {
    return window.localStorage.getItem(sidebar_storage_key);
  } catch {
    return null;
  }
}

function save_sidebar_state(sidebar_state) {
  try {
    window.localStorage.setItem(sidebar_storage_key, sidebar_state);
  } catch {
    // 저장소를 쓸 수 없는 환경(비공개 창 등)에서는 기억하지 않는다.
  }
}

function apply_sidebar_state(sidebar_state) {
  const is_collapsed = sidebar_state === 'collapsed';
  app_shell_element.dataset.sidebar_state = is_collapsed ? 'collapsed' : 'expanded';
  sidebar_toggle_button.setAttribute('aria-expanded', String(!is_collapsed));
  const toggle_label = is_collapsed ? '사이드바 펼치기' : '사이드바 접기';
  sidebar_toggle_button.setAttribute('aria-label', toggle_label);
  sidebar_toggle_button.title = toggle_label;
}

function initialize_layout() {
  const narrow_media_query = window.matchMedia('(max-width: 720px)');
  // 좁은 화면에서 펼친 사이드바는 본문을 덮으므로 처음에는 접어 둔다.
  apply_sidebar_state(narrow_media_query.matches ? 'collapsed' : read_saved_sidebar_state() ?? 'expanded');
  sidebar_toggle_button.addEventListener('click', () => {
    const next_state = app_shell_element.dataset.sidebar_state === 'collapsed' ? 'expanded' : 'collapsed';
    apply_sidebar_state(next_state);
    if (!narrow_media_query.matches) save_sidebar_state(next_state);
  });
  narrow_media_query.addEventListener('change', (media_event) => {
    apply_sidebar_state(media_event.matches ? 'collapsed' : read_saved_sidebar_state() ?? 'expanded');
  });
  // 좁은 화면에서는 페이지를 고르면 덮고 있던 사이드바를 닫는다.
  page_sidebar_element.addEventListener('click', (click_event) => {
    if (narrow_media_query.matches && click_event.target.closest('.nav_item')) apply_sidebar_state('collapsed');
  });

  window.addEventListener('hashchange', () => show_page(resolve_page_name(window.location.hash)));
  show_page(resolve_page_name(window.location.hash));
}

// ---------- 시작 ----------

function initialize() {
  const initial_tree = create_root_from_container(real_area_element);
  mount_tree(bookmark_registry, real_area_element, initial_tree, document);
  state_history = create_state_history(initial_tree);
  record_entry_details(get_current_entry(state_history), '실제 영역의 샘플 HTML에서 만든 초기 상태');
  render_test_area(initial_tree);
  initialize_song_board();
  initialize_layout();
  update_controls();

  test_area_element.addEventListener('input', () => {
    is_test_area_dirty = true;
    update_controls();
  });
  test_area_element.addEventListener('keydown', (keyboard_event) => {
    if (keyboard_event.key === 'Enter' && (keyboard_event.ctrlKey || keyboard_event.metaKey)) {
      keyboard_event.preventDefault();
      handle_patch();
    }
  });
  patch_button.addEventListener('click', handle_patch);
  back_button.addEventListener('click', () => move_history(go_back(state_history)));
  forward_button.addEventListener('click', () => move_history(go_forward(state_history)));
  history_list_element.addEventListener('click', (click_event) => {
    const card_button = click_event.target.closest('button[data-history_index]');
    if (!card_button) return;
    move_history(go_to_index(state_history, Number(card_button.dataset.history_index)));
  });
  // 상대 시간("3분 전")이 낡지 않도록 주기적으로 다시 그린다. 페이지 수명 동안 타이머 하나만 쓴다.
  window.setInterval(() => {
    render_history_list();
    render_render_history();
  }, relative_time_refresh_ms);
}

initialize();
