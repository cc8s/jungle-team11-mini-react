import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionComponent } from '../src/function_component.js';
import { song_board_root } from '../src/song_board.js';
import { parse_saved_board } from '../src/song_board_model.js';
import { operation_kinds } from '../src/diff.js';
import { fake_document, fake_event } from './support/fake_dom.js';

function wait_for_scheduled_update() {
  return new Promise((resolve) => setImmediate(resolve));
}

function find_element(root_node, is_match) {
  const pending_nodes = [root_node];
  while (pending_nodes.length > 0) {
    const current_node = pending_nodes.shift();
    if (current_node.nodeType === 1 && is_match(current_node)) return current_node;
    pending_nodes.push(...current_node.childNodes);
  }
  return null;
}

function find_all_elements(root_node, is_match) {
  const matched_elements = [];
  const pending_nodes = [root_node];
  while (pending_nodes.length > 0) {
    const current_node = pending_nodes.shift();
    if (current_node.nodeType === 1 && is_match(current_node)) matched_elements.push(current_node);
    pending_nodes.push(...current_node.childNodes);
  }
  return matched_elements;
}

const has_class = (class_name) => (element_node) => (element_node.getAttribute('class') ?? '').split(' ').includes(class_name);
const has_id = (element_id) => (element_node) => element_node.getAttribute('id') === element_id;

function select_dom_changing_kinds(operations) {
  return operations.filter((operation) => operation.kind !== operation_kinds.bind).map((operation) => operation.kind);
}

function mount_board(saved_text = null) {
  const owner_document = new fake_document();
  const container_element = owner_document.createElement('div');
  owner_document.appendChild(container_element);
  const saved_boards = [];
  const action_labels = [];
  const board_changes = [];
  const focused_ids = [];
  const render_reports = [];
  const component = new FunctionComponent(
    song_board_root,
    container_element,
    {
      load_board: () => parse_saved_board(saved_text),
      save_board: (board) => saved_boards.push(board),
      report_action: (action_label) => action_labels.push(action_label),
      on_board_change: (board_change) => board_changes.push(board_change),
      focus_by_id: (element_id) => focused_ids.push(element_id),
    },
    { on_rendered: (render_report) => render_reports.push(render_report) },
  ).mount();
  const latest_operations = () => render_reports[render_reports.length - 1].operations;
  return { owner_document, container_element, component, saved_boards, action_labels, board_changes, focused_ids, render_reports, latest_operations };
}

function click(dom_node) {
  dom_node.dispatchEvent(new fake_event('click', { bubbles: true, cancelable: true }));
}

function submit(form_element) {
  const submit_event = new fake_event('submit', { bubbles: true, cancelable: true });
  form_element.dispatchEvent(submit_event);
  return submit_event;
}

function find_row(container_element, song_id) {
  return find_element(container_element, has_id(`row_${song_id}`));
}

// 아이콘 버튼은 aria-label로, 글자 버튼(메인으로)은 보이는 글자로 찾는다.
function find_row_button(row_element, button_label) {
  return find_element(
    row_element,
    (element_node) =>
      element_node.localName === 'button' &&
      (element_node.getAttribute('aria-label') === button_label || element_node.textContent === button_label),
  );
}

function find_main_button(row_element) {
  return find_element(row_element, has_class('main_song_button'));
}

function list_row_ids(container_element) {
  return find_all_elements(container_element, has_class('song_row')).map((row_element) => row_element.getAttribute('id'));
}

function fill_add_form(container_element, field_texts) {
  const form_element = find_element(container_element, has_id('song_form'));
  for (const [field_name, field_text] of Object.entries(field_texts)) {
    form_element.elements.namedItem(field_name).value = field_text;
  }
  return form_element;
}

test('EC-001 처음 mount: 샘플 곡, 메인곡 카드, 필터 개수를 그리고 저장·탭 제목 콜백을 부른다', () => {
  const board = mount_board();
  const { container_element } = board;
  assert.equal(find_element(container_element, has_class('main_song_title')).textContent, '새벽 산책');
  assert.deepEqual(list_row_ids(container_element), ['row_song_1', 'row_song_2', 'row_song_3']);
  const segment_texts = find_all_elements(container_element, has_class('segment_button')).map((button) => button.textContent);
  assert.deepEqual(segment_texts, ['전체 3', '즐겨찾기 2']);
  assert.equal(board.saved_boards.length, 1);
  assert.deepEqual(board.board_changes, [{ song_count: 3, main_song_title_text: '새벽 산책 · 낮은 목소리' }]);
  assert.equal(find_row(container_element, 'song_1').getAttribute('aria-current'), 'true');
});

test('EC-002 곡 추가: 새 행만 ADD되고 기존 행 DOM은 그대로이며, 폼은 비워지고 제목 칸에 포커스', async () => {
  const board = mount_board();
  const { container_element, owner_document } = board;
  const existing_row_dom = find_row(container_element, 'song_1');
  const form_element = fill_add_form(container_element, { song_title: ' 밤  하늘 ', song_artist: '별빛', song_memo: '' });
  const submit_event = submit(form_element);
  assert.equal(submit_event.defaultPrevented, true, '페이지 이동(기본 제출)을 막음');
  await wait_for_scheduled_update();
  assert.deepEqual(list_row_ids(container_element), ['row_song_4', 'row_song_1', 'row_song_2', 'row_song_3']);
  assert.equal(find_row(container_element, 'song_4').textContent.startsWith('밤밤 하늘별빛'), true);
  assert.equal(find_row(container_element, 'song_1'), existing_row_dom);
  const changed_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.deepEqual(changed_kinds.filter((kind) => kind === operation_kinds.add), [operation_kinds.add]);
  assert.ok(!changed_kinds.includes(operation_kinds.replace), '전체를 다시 그리지 않음');
  assert.equal(form_element.elements.namedItem('song_title').value, '');
  assert.equal(owner_document.activeElement, form_element.elements.namedItem('song_title'));
  assert.equal(board.action_labels.at(-1), '곡 추가 · 밤 하늘');
  assert.equal(board.saved_boards.at(-1).songs[0].title, '밤 하늘');
});

test('EC-003 빈 제목은 추가하지 않고 오류 문구를 보여 주며, 다시 입력하면 문구가 사라진다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const form_element = fill_add_form(container_element, { song_title: '   ', song_artist: '가수' });
  submit(form_element);
  await wait_for_scheduled_update();
  const error_element = find_element(container_element, has_class('song_form_error'));
  assert.equal(error_element.hasAttribute('hidden'), false);
  assert.equal(error_element.textContent, '제목을 입력하세요');
  assert.equal(list_row_ids(container_element).length, 3);
  assert.equal(form_element.elements.namedItem('song_artist').value, '가수', '입력한 값은 그대로');
  form_element.elements.namedItem('song_title').dispatchEvent(new fake_event('input', { bubbles: true }));
  await wait_for_scheduled_update();
  assert.equal(error_element.hasAttribute('hidden'), true);
});

test('EC-004 같은 곡(공백·대소문자 무시) 추가는 막는다', async () => {
  const board = mount_board();
  const { container_element } = board;
  submit(fill_add_form(container_element, { song_title: 'paper  LANTERN', song_artist: 'quiet harbor' }));
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_class('song_form_error')).textContent, '이미 목록에 있는 곡입니다');
  assert.equal(list_row_ids(container_element).length, 3);
});

test('EC-005 즐겨찾기 토글은 버튼 attribute와 개수 텍스트만 바뀐다 (ADD·REMOVE·REPLACE 없음)', async () => {
  const board = mount_board();
  const { container_element } = board;
  const row_dom = find_row(container_element, 'song_2');
  const star_button = find_row_button(row_dom, '즐겨찾기');
  assert.equal(star_button.getAttribute('aria-pressed'), 'false');
  click(star_button);
  await wait_for_scheduled_update();
  assert.equal(star_button.getAttribute('aria-pressed'), 'true');
  assert.equal(find_row(container_element, 'song_2'), row_dom);
  const changed_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.deepEqual([...new Set(changed_kinds)].sort(), [operation_kinds.attributes, operation_kinds.text].sort());
  assert.equal(find_all_elements(container_element, has_class('segment_button'))[1].textContent, '즐겨찾기 3');
});

test('EC-006 메인곡 변경은 카드 구조를 재사용하고 텍스트만 바뀌며, 같은 곡을 다시 지정하면 아무 일도 없다', async () => {
  const board = mount_board();
  const { container_element, component } = board;
  const main_card_dom = find_element(container_element, has_class('main_song_card'));
  const title_text_dom = find_element(container_element, has_class('main_song_title')).childNodes[0];
  click(find_main_button(find_row(container_element, 'song_2')));
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_class('main_song_card')), main_card_dom);
  assert.equal(title_text_dom.data, 'Paper Lantern', '같은 텍스트 노드의 data만 바뀜');
  const changed_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.ok(changed_kinds.every((kind) => kind === operation_kinds.text || kind === operation_kinds.attributes), changed_kinds.join());
  assert.equal(find_row(container_element, 'song_2').getAttribute('aria-current'), 'true');
  assert.equal(find_row(container_element, 'song_1').hasAttribute('aria-current'), false);

  const render_count = component.render_count;
  const action_count = board.action_labels.length;
  click(find_main_button(find_row(container_element, 'song_2')));
  await wait_for_scheduled_update();
  assert.equal(component.render_count, render_count, '다시 그리지 않음');
  assert.equal(board.action_labels.length, action_count, '변경 기록도 남기지 않음');
});

test('EC-007 메인곡으로 지정된 곡을 삭제하면 행이 REMOVE되고 메인 카드는 안내 카드로 REPLACE된다', async () => {
  const board = mount_board();
  const { container_element } = board;
  click(find_row_button(find_row(container_element, 'song_1'), '삭제'));
  await wait_for_scheduled_update();
  assert.deepEqual(list_row_ids(container_element), ['row_song_2', 'row_song_3']);
  assert.ok(find_element(container_element, has_class('main_song_empty')));
  assert.equal(find_element(container_element, has_class('main_song_card')), null);
  const changed_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.ok(changed_kinds.includes(operation_kinds.remove));
  assert.ok(changed_kinds.includes(operation_kinds.replace));
  assert.equal(board.saved_boards.at(-1).main_song_id, null);
  assert.deepEqual(board.board_changes.at(-1), { song_count: 2, main_song_title_text: '' });
});

test('EC-008 순서 바꾸기는 같은 DOM 행을 MOVE하고, 맨 위의 위로·맨 아래의 아래로 버튼은 꺼져 있다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const first_row_dom = find_row(container_element, 'song_1');
  assert.equal(find_row_button(first_row_dom, '위로').hasAttribute('disabled'), true);
  assert.equal(find_row_button(find_row(container_element, 'song_3'), '아래로').hasAttribute('disabled'), true);
  click(find_row_button(first_row_dom, '아래로'));
  await wait_for_scheduled_update();
  assert.deepEqual(list_row_ids(container_element), ['row_song_2', 'row_song_1', 'row_song_3']);
  assert.equal(find_row(container_element, 'song_1'), first_row_dom);
  const changed_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.ok(changed_kinds.includes(operation_kinds.move));
  assert.ok(!changed_kinds.includes(operation_kinds.add) && !changed_kinds.includes(operation_kinds.remove));
});

test('EC-009 수정을 시작·종료하면 같은 행(li) 안쪽만 REPLACE되고 다른 행은 그대로다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const row_dom = find_row(container_element, 'song_2');
  const other_row_dom = find_row(container_element, 'song_1');
  click(find_row_button(row_dom, '수정'));
  await wait_for_scheduled_update();
  const start_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.ok(start_kinds.includes(operation_kinds.replace), start_kinds.join());
  assert.ok(!start_kinds.includes(operation_kinds.add), '행을 새로 만들지 않음');
  assert.equal(find_row(container_element, 'song_2'), row_dom);
  assert.equal(find_row(container_element, 'song_1'), other_row_dom);
  assert.ok(find_element(row_dom, has_class('song_edit_form')));

  click(find_element(row_dom, (element_node) => element_node.localName === 'button' && element_node.textContent === '취소'));
  await wait_for_scheduled_update();
  assert.ok(select_dom_changing_kinds(board.latest_operations()).includes(operation_kinds.replace));
  assert.equal(find_element(row_dom, has_class('song_edit_form')), null);
  assert.equal(find_element(row_dom, has_class('song_title')).textContent, 'Paper Lantern');
});

test('EC-010 즐겨찾기 필터는 즐겨찾기만 보여 주고, 없으면 빈 안내, 이동 버튼은 숨긴다', async () => {
  const board = mount_board(JSON.stringify({ songs: [{ id: 'song_1', title: 'A', artist: 'B', is_favorite: false }] }));
  const { container_element } = board;
  click(find_all_elements(container_element, has_class('segment_button'))[1]);
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_class('song_empty')).textContent, '즐겨찾기한 곡이 없습니다');
  const full_board = mount_board();
  click(find_all_elements(full_board.container_element, has_class('segment_button'))[1]);
  await wait_for_scheduled_update();
  assert.deepEqual(list_row_ids(full_board.container_element), ['row_song_1', 'row_song_3']);
  assert.equal(find_row_button(find_row(full_board.container_element, 'song_1'), '위로'), null);
});

test('EC-011 수정: 같은 행(li)을 재사용해 폼으로 바꾸고 포커스, 저장하면 메인 카드도 함께 바뀐다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const row_dom = find_row(container_element, 'song_1');
  click(find_row_button(row_dom, '수정'));
  await wait_for_scheduled_update();
  assert.equal(find_row(container_element, 'song_1'), row_dom);
  assert.deepEqual(board.focused_ids, ['edit_song_1_title']);
  const edit_form = find_element(row_dom, has_class('song_edit_form'));
  assert.equal(edit_form.elements.namedItem('song_title').value, '새벽 산책', '기존 값이 채워져 있음');
  edit_form.elements.namedItem('song_title').value = '새벽 산책 (live)';
  submit(edit_form);
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_class('main_song_title')).textContent, '새벽 산책 (live)');
  assert.equal(find_element(row_dom, has_class('song_title')).textContent, '새벽 산책 (live)');
  assert.equal(board.action_labels.at(-1), '곡 수정 · 새벽 산책 (live)');
});

test('EC-012 수정 중 다른 곡과 중복이면 오류, Escape는 취소, 한글 조합 중 Enter는 제출을 막는다', async () => {
  const board = mount_board();
  const { container_element } = board;
  click(find_row_button(find_row(container_element, 'song_1'), '수정'));
  await wait_for_scheduled_update();
  const edit_form = find_element(container_element, has_class('song_edit_form'));
  edit_form.elements.namedItem('song_title').value = 'Paper Lantern';
  edit_form.elements.namedItem('song_artist').value = 'Quiet Harbor';
  submit(edit_form);
  await wait_for_scheduled_update();
  assert.equal(find_element(edit_form, has_class('song_form_error')).textContent, '이미 목록에 있는 곡입니다');

  const composing_enter = new fake_event('keydown', { bubbles: true, cancelable: true });
  composing_enter.key = 'Enter';
  composing_enter.isComposing = true;
  edit_form.elements.namedItem('song_title').dispatchEvent(composing_enter);
  assert.equal(composing_enter.defaultPrevented, true);

  const escape_event = new fake_event('keydown', { bubbles: true, cancelable: true });
  escape_event.key = 'Escape';
  edit_form.elements.namedItem('song_title').dispatchEvent(escape_event);
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_class('song_edit_form')), null);
  assert.equal(find_element(find_row(container_element, 'song_1'), has_class('song_title')).textContent, '새벽 산책');
});

test('EC-013 제목에 넣은 HTML은 글자로만 그려지고, javascript: 링크는 저장되지 않는다 (innerHTML XSS 없음)', async () => {
  const board = mount_board();
  const { container_element } = board;
  submit(fill_add_form(container_element, { song_title: '<img src=x onerror=alert(1)>', song_artist: 'x' }));
  await wait_for_scheduled_update();
  const title_element = find_element(find_row(container_element, 'song_4'), has_class('song_title'));
  assert.equal(title_element.childNodes.length, 1);
  assert.equal(title_element.childNodes[0].nodeType, 3);
  assert.equal(find_element(container_element, (element_node) => element_node.localName === 'img'), null);

  submit(fill_add_form(container_element, { song_title: '링크 곡', song_artist: 'y', song_link: 'javascript:alert(1)' }));
  await wait_for_scheduled_update();
  assert.match(find_element(container_element, has_class('song_form_error')).textContent, /https/);
});

test('EC-014 메인곡이 없을 때 곡을 지정하면 안내 카드가 메인 카드로 REPLACE된다', async () => {
  const board = mount_board(JSON.stringify({ songs: [{ id: 'song_1', title: 'A', artist: 'B' }], main_song_id: null }));
  const { container_element } = board;
  assert.ok(find_element(container_element, has_class('main_song_empty')));
  click(find_main_button(find_row(container_element, 'song_1')));
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_class('main_song_empty')), null);
  assert.equal(find_element(container_element, has_class('main_song_title')).textContent, 'A');
  const changed_kinds = select_dom_changing_kinds(board.latest_operations());
  assert.ok(changed_kinds.includes(operation_kinds.replace));
  assert.ok(!changed_kinds.includes(operation_kinds.remove), '빈 카드를 지우고 새로 넣는 것이 아니라 교체');
});

test('EC-015 입력 중인 폼의 input DOM과 값은 다른 State 변경 뒤에도 그대로다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const form_element = fill_add_form(container_element, { song_title: '쓰는 중' });
  const title_input = form_element.elements.namedItem('song_title');
  click(find_row_button(find_row(container_element, 'song_2'), '즐겨찾기'));
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_id('new_song_title')), title_input);
  assert.equal(title_input.value, '쓰는 중');
});

test('EC-016 깨진 저장 데이터로 시작하면 빈 목록 안내와 메인곡 없음 카드를 그린다', () => {
  const board = mount_board('{broken');
  assert.ok(find_element(board.container_element, has_class('song_empty')));
  assert.ok(find_element(board.container_element, has_class('main_song_empty')));
});

test('EC-019 메인 버튼은 모든 행에서 "메인"이고 메인곡 행만 눌림, 바꾸면 같은 버튼 DOM의 attribute만 바뀐다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const old_main_button = find_main_button(find_row(container_element, 'song_1'));
  const new_main_button = find_main_button(find_row(container_element, 'song_2'));
  assert.equal(old_main_button.textContent, '메인');
  assert.equal(new_main_button.textContent, '메인');
  assert.equal(old_main_button.getAttribute('aria-pressed'), 'true');
  assert.equal(new_main_button.getAttribute('aria-pressed'), 'false');
  assert.equal(new_main_button.getAttribute('title'), '오늘의 메인곡으로 지정');

  click(new_main_button);
  await wait_for_scheduled_update();
  assert.equal(find_main_button(find_row(container_element, 'song_1')), old_main_button);
  assert.equal(find_main_button(find_row(container_element, 'song_2')), new_main_button);
  assert.equal(old_main_button.getAttribute('aria-pressed'), 'false');
  assert.equal(new_main_button.getAttribute('aria-pressed'), 'true');
  const button_operations = board
    .latest_operations()
    .filter((operation) => operation.kind !== operation_kinds.bind)
    .filter((operation) => operation.old_node?.type === 'button' || operation.parent_node?.type === 'button');
  assert.deepEqual(button_operations.map((operation) => operation.kind), ['ATTRIBUTES', 'ATTRIBUTES'], '글자는 그대로');
});

test('EC-020 즐겨찾기 별은 행 맨 앞(커버 왼쪽)에 있고 메인 버튼은 오른쪽 동작 버튼 묶음의 첫 버튼이다', () => {
  const { container_element } = mount_board();
  const row_dom = find_row(container_element, 'song_2');
  const row_children = row_dom.childNodes.filter((child_node) => child_node.nodeType === 1);
  assert.equal(row_children[0].getAttribute('aria-label'), '즐겨찾기');
  assert.ok(has_class('song_cover')(row_children[1]));
  const action_buttons = find_element(row_dom, has_class('song_actions')).childNodes.filter((child_node) => child_node.localName === 'button');
  assert.ok(has_class('main_song_button')(action_buttons[0]));
  assert.equal(find_all_elements(find_element(row_dom, has_class('song_actions')), (element_node) => element_node.getAttribute('aria-label') === '즐겨찾기').length, 0);
});

test('EC-018 한 동작에서 State 여러 개를 바꿔도 update는 한 번이다 (메인곡 삭제, 즐겨찾기 필터에서 곡 추가)', async () => {
  const board = mount_board();
  const { container_element } = board;
  const render_count_before_remove = board.render_reports.length;
  click(find_row_button(find_row(container_element, 'song_1'), '삭제'));
  await wait_for_scheduled_update();
  assert.equal(board.render_reports.length, render_count_before_remove + 1);
  assert.deepEqual(board.action_labels.slice(-1), ['곡 삭제 · 새벽 산책']);
  assert.equal(board.saved_boards.at(-1).main_song_id, null);
  assert.equal(board.saved_boards.at(-1).songs.length, 2);

  click(find_all_elements(container_element, has_class('segment_button'))[1]);
  await wait_for_scheduled_update();
  const render_count_before_add = board.render_reports.length;
  submit(fill_add_form(container_element, { song_title: '새 곡', song_artist: '새 가수' }));
  await wait_for_scheduled_update();
  assert.equal(board.render_reports.length, render_count_before_add + 1);
  const saved_board = board.saved_boards.at(-1);
  assert.equal(saved_board.filter_name, 'all');
  assert.equal(saved_board.songs.length, 3);
  assert.ok(list_row_ids(container_element).includes(`row_${saved_board.songs.at(-1).id}`));
});

test('EC-017 필터를 바꿔 수정 중인 곡이 가려지면 수정이 취소되고, 다시 보여도 폼이 되살아나지 않는다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const segment_buttons = () => find_all_elements(container_element, has_class('segment_button'));
  const editing_row = find_row(container_element, 'song_2');
  click(find_row_button(editing_row, '수정'));
  await wait_for_scheduled_update();
  assert.deepEqual(
    find_all_elements(editing_row, (element_node) => element_node.localName === 'button').map((button) => button.textContent),
    ['취소', '저장'],
    '수정 중인 행에는 즐겨찾기·삭제 버튼이 없다',
  );
  find_element(editing_row, has_id('edit_song_2_title')).value = '바꾼 제목';

  const render_count_before_filter = board.render_reports.length;
  click(segment_buttons()[1]);
  await wait_for_scheduled_update();
  assert.equal(board.render_reports.length, render_count_before_filter + 1);
  assert.deepEqual(list_row_ids(container_element), ['row_song_1', 'row_song_3']);

  click(segment_buttons()[0]);
  await wait_for_scheduled_update();
  const shown_row = find_row(container_element, 'song_2');
  assert.equal(find_element(container_element, has_class('song_edit_form')) === null, true, '수정 폼이 되살아나면 안 된다');
  assert.equal(find_element(shown_row, has_class('song_title'))?.textContent, 'Paper Lantern');
});

test('EC-017 필터를 바꿔도 수정 중인 곡이 계속 보이면 수정 폼과 입력값이 그대로다', async () => {
  const board = mount_board();
  const { container_element } = board;
  const segment_buttons = () => find_all_elements(container_element, has_class('segment_button'));
  const editing_row = find_row(container_element, 'song_1');
  click(find_row_button(editing_row, '수정'));
  await wait_for_scheduled_update();
  const title_input = find_element(editing_row, has_id('edit_song_1_title'));
  title_input.value = '바꾸는 중';
  click(segment_buttons()[1]);
  await wait_for_scheduled_update();
  assert.equal(find_element(container_element, has_id('edit_song_1_title')) === title_input, true, '같은 input DOM이어야 한다');
  assert.equal(title_input.value, '바꾸는 중');
});
