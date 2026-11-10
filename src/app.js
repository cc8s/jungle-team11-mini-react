// 검증용 웹페이지: 실제 영역(patch 대상)과 테스트 영역(HTML 편집)을 State History로 연결한다.

import { create_root_from_container, is_same_tree } from './virtual_node.js';
import { diff_trees, share_unchanged_nodes } from './diff.js';
import { create_bookmark_registry, mount_tree, apply_operations } from './patch.js';
import { serialize_to_html } from './serialize_html.js';
import { parse_html_to_virtual_tree } from './parse_html.js';
import {
  create_state_history,
  get_current_entry,
  is_at_latest_entry,
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
  describe_operation,
  select_visible_operations,
} from './operation_summary.js';

const highlight_duration_ms = 1400;

const real_area_element = document.getElementById('real_area');
const test_area_element = document.getElementById('test_area');
const patch_button = document.getElementById('patch_button');
const back_button = document.getElementById('back_button');
const forward_button = document.getElementById('forward_button');
const feedback_element = document.getElementById('feedback_message');
const history_list_element = document.getElementById('history_list');
const operation_log_element = document.getElementById('operation_log');
const virtual_tree_view_element = document.getElementById('virtual_tree_view');

const bookmark_registry = create_bookmark_registry();
let state_history = null;
let is_test_area_dirty = false;

function entry_label(entry) {
  return `v${entry.entry_id}`;
}

function show_feedback(message_text, tone) {
  feedback_element.textContent = message_text;
  feedback_element.dataset.tone = tone;
}

function render_test_area(virtual_tree) {
  const serialized_html = serialize_to_html(virtual_tree);
  // 내용이 같으면 그대로 두어 커서 위치와 스크롤을 보존한다.
  if (test_area_element.value !== serialized_html) test_area_element.value = serialized_html;
  is_test_area_dirty = false;
}

function render_history_list() {
  const chip_items = state_history.entries.map((entry, index) => {
    const list_item = document.createElement('li');
    const chip_button = document.createElement('button');
    chip_button.type = 'button';
    chip_button.className = 'history_chip';
    chip_button.textContent = entry_label(entry);
    chip_button.dataset.history_index = String(index);
    chip_button.setAttribute('aria-current', String(index === state_history.current_index));
    chip_button.title = `${index + 1}번째로 확정된 상태로 이동`;
    list_item.appendChild(chip_button);
    return list_item;
  });
  history_list_element.replaceChildren(...chip_items);
}

function render_operation_log(operations) {
  const visible_operations = select_visible_operations(operations);
  if (visible_operations.length === 0) {
    const empty_item = document.createElement('li');
    empty_item.textContent = '적용된 연산이 없습니다';
    operation_log_element.replaceChildren(empty_item);
    return;
  }
  const log_items = visible_operations.map((operation) => {
    const list_item = document.createElement('li');
    const kind_element = document.createElement('span');
    kind_element.className = 'operation_kind';
    kind_element.textContent = operation.kind;
    list_item.append(kind_element, describe_operation(operation));
    return list_item;
  });
  operation_log_element.replaceChildren(...log_items);
}

function render_virtual_tree_view() {
  virtual_tree_view_element.textContent = JSON.stringify(get_current_entry(state_history).tree, null, 2);
}

function update_controls() {
  back_button.disabled = !can_go_back(state_history);
  forward_button.disabled = !can_go_forward(state_history);
  // 이전 상태를 보고 있으면 수정이 없어도 Patch로 그 상태를 맨 앞으로 올릴 수 있다.
  patch_button.disabled = !is_test_area_dirty && is_at_latest_entry(state_history);
  render_history_list();
  render_virtual_tree_view();
}

function highlight_dom_nodes(changed_dom_nodes) {
  const highlighted_elements = new Set();
  for (const dom_node of changed_dom_nodes) {
    const target_element = dom_node.nodeType === Node.ELEMENT_NODE ? dom_node : dom_node.parentElement;
    if (!target_element || target_element === real_area_element || !real_area_element.contains(target_element)) continue;
    highlighted_elements.add(target_element);
  }
  // class나 style attribute를 건드리지 않도록 Web Animations API로만 표시한다.
  for (const target_element of highlighted_elements) {
    if (typeof target_element.animate !== 'function') continue;
    target_element.animate(
      [
        { outline: '2px solid rgb(245 158 11)', outlineOffset: '2px', backgroundColor: 'rgb(245 158 11 / 0.22)' },
        { outline: '2px solid rgb(245 158 11 / 0)', outlineOffset: '2px', backgroundColor: 'rgb(245 158 11 / 0)' },
      ],
      { duration: highlight_duration_ms, easing: 'ease-out' },
    );
  }
}

function patch_real_area(current_tree, target_tree) {
  const operations = diff_trees(current_tree, target_tree);
  const { changed_dom_nodes } = apply_operations(bookmark_registry, operations, document);
  highlight_dom_nodes(changed_dom_nodes);
  render_operation_log(operations);
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

  const summary_text = format_operation_summary(summarize_operations(operations));
  const label_text = entry_label(commit_result.entry);
  if (commit_result.outcome === commit_outcomes.unchanged) {
    show_feedback('변경 사항이 없습니다. 이력에 저장하지 않았습니다', 'notice');
  } else if (commit_result.outcome === commit_outcomes.promoted) {
    show_feedback(`변경 사항이 없습니다. ${label_text} 상태를 맨 앞으로 올렸습니다`, 'notice');
  } else if (commit_result.outcome === commit_outcomes.deduplicated) {
    show_feedback(`${summary_text} · 같은 내용의 ${label_text} 상태를 맨 앞으로 올렸습니다`, 'success');
  } else {
    show_feedback(`${summary_text} · ${label_text} 저장`, 'success');
  }
  update_controls();
}

function move_history(next_history) {
  if (next_history === state_history) {
    show_feedback('더 이상 이동할 수 없습니다', 'notice');
    return;
  }
  const current_tree = get_current_entry(state_history).tree;
  const target_entry = next_history.entries[next_history.current_index];
  const operations = patch_real_area(current_tree, target_entry.tree);
  const had_unsaved_edit = is_test_area_dirty;
  state_history = next_history;
  render_test_area(target_entry.tree);
  const summary_text = format_operation_summary(summarize_operations(operations));
  const discard_text = had_unsaved_edit ? ' · Patch하지 않은 편집은 버렸습니다' : '';
  show_feedback(`${entry_label(target_entry)} 로 이동 · ${summary_text}${discard_text}`, 'success');
  update_controls();
}

function initialize() {
  const initial_tree = create_root_from_container(real_area_element);
  mount_tree(bookmark_registry, real_area_element, initial_tree, document);
  state_history = create_state_history(initial_tree);
  render_test_area(initial_tree);
  render_operation_log([]);
  show_feedback('실제 영역을 Virtual DOM으로 변환해 v0 으로 저장했습니다', 'neutral');
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
    const chip_button = click_event.target.closest('button[data-history_index]');
    if (!chip_button) return;
    move_history(go_to_index(state_history, Number(chip_button.dataset.history_index)));
  });
}

initialize();
