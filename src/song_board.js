// Phase 2 페이지: 최애곡 모음 앱 (phase2idea.md).
// State는 루트 song_board_root에만 있고, 나머지는 props만 받는 순수 함수다(Lifting State Up).
// State가 바뀌면 FunctionComponent가 Virtual DOM 생성 → diff → patch로 바뀐 부분만 실제 DOM에 반영한다.
//
// song_board_root (State: songs, main_song_id, filter_name, editing_song_id, ...)
// ├─ main_song_card   (props: song)
// ├─ song_form        (props: error_text, on_submit, ...)
// ├─ library_toolbar  (props: filter_name, song_counts, ...)
// └─ song_collection  (props: songs, ...)
//    └─ song_row / song_edit_row

import { use_state, use_effect, use_memo, render_child_component } from './function_component.js';
import { create_view_element } from './view_builder.js';
import {
  filter_names,
  maximum_title_length,
  maximum_artist_length,
  maximum_memo_length,
  maximum_link_length,
  validate_song_draft,
  create_next_song_id,
  add_song,
  remove_song,
  toggle_favorite,
  update_song,
  move_song,
  find_song,
  filter_songs,
  count_songs,
  create_song_initials,
  create_main_song_title_text,
} from './song_board_model.js';

const svg_namespace = 'http://www.w3.org/2000/svg';

// 아이콘 모양: [요소 이름, attribute] 목록. viewBox 0 0 20 20, 선 굵기는 style.css의 svg 규칙을 따른다.
const icon_shapes = Object.freeze({
  star: [['path', { d: 'M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5L10 14.2l-4.5 2.4.9-5-3.6-3.5 5-.7z' }]],
  edit: [['path', { d: 'M12.8 4.2l3 3L7.5 15.5H4.5v-3z' }]],
  move_up: [['path', { d: 'M5 12.5l5-5 5 5' }]],
  move_down: [['path', { d: 'M5 7.5l5 5 5-5' }]],
  remove: [['path', { d: 'M5.5 5.5l9 9M14.5 5.5l-9 9' }]],
  link: [['path', { d: 'M8.5 4.5h-4v11h11v-4M11.5 3.5h5v5M16.5 3.5l-7 7' }]],
});

function create_icon(shape_specs) {
  return create_view_element(
    'svg',
    { namespace: svg_namespace, attributes: { viewBox: '0 0 20 20', 'aria-hidden': 'true' } },
    shape_specs.map(([shape_type, shape_attributes]) =>
      create_view_element(shape_type, { namespace: svg_namespace, attributes: shape_attributes }),
    ),
  );
}

// ---------- 자식 컴포넌트 (State 없음, props만 사용) ----------

function song_icon_button(props) {
  return create_view_element(
    'button',
    {
      attributes: {
        type: 'button',
        class: `icon_button song_icon_button ${props.class_name ?? ''}`.trim(),
        'aria-label': props.label,
        title: props.label,
        'aria-pressed': props.is_pressed === undefined ? null : String(props.is_pressed),
        disabled: Boolean(props.is_disabled),
      },
      event_handlers: { click: props.on_click },
    },
    [create_icon(props.icon_shape)],
  );
}

// 아이콘만으로는 뜻이 읽히지 않아 "메인" 글자 버튼으로 둔다. 메인곡 행만 검정 면("현재")으로 바뀐다.
// 글자는 같으므로 메인곡을 바꾸면 두 버튼의 aria-pressed·title(ATTRIBUTES)만 바뀐다.
function main_song_button(props) {
  return create_view_element(
    'button',
    {
      attributes: {
        type: 'button',
        class: 'main_song_button',
        'aria-pressed': String(props.is_main),
        title: props.is_main ? '오늘의 메인곡' : '오늘의 메인곡으로 지정',
      },
      event_handlers: { click: props.on_click },
    },
    ['메인'],
  );
}

function song_cover(props) {
  return create_view_element('span', { attributes: { class: `song_cover song_cover_${props.size_name}`, 'aria-hidden': 'true' } }, [
    create_song_initials(props.title),
  ]);
}

function song_link(props) {
  if (props.link_url === '') return null;
  return create_view_element(
    'a',
    {
      attributes: {
        class: 'song_link',
        href: props.link_url,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: props.link_url,
      },
    },
    [create_icon(icon_shapes.link), '듣기'],
  );
}

// 메인곡이 없을 때(div)와 있을 때(article)는 key(id) 없는 서로 다른 요소라 diff가 REPLACE로 바꾼다.
// (id를 붙이면 key로 비교해 REMOVE + ADD가 된다)
// 메인곡만 바뀌면 같은 구조를 재사용하고 이니셜·제목·가수 텍스트만 TEXT로 바뀐다.
function main_song_card(props) {
  const { song } = props;
  if (song === null) {
    return create_view_element('div', { attributes: { class: 'main_song_empty' } }, [
      create_view_element('span', { attributes: { class: 'song_cover song_cover_large', 'aria-hidden': 'true' } }, ['♪']),
      create_view_element('p', { attributes: { class: 'main_song_empty_text' } }, ['메인곡 없음']),
    ]);
  }
  return create_view_element('article', { attributes: { class: 'main_song_card' } }, [
    render_child_component(song_cover, { title: song.title, size_name: 'large' }),
    create_view_element('div', { attributes: { class: 'main_song_text' } }, [
      create_view_element('strong', { attributes: { class: 'main_song_title' } }, [song.title]),
      create_view_element('span', { attributes: { class: 'main_song_artist' } }, [song.artist]),
      create_view_element('p', { attributes: { class: 'main_song_memo', hidden: song.memo === '' } }, [song.memo]),
      render_child_component(song_link, { link_url: song.link_url }),
    ]),
  ]);
}

function song_text_field(props) {
  return create_view_element('label', { attributes: { class: `song_field ${props.class_name ?? ''}`.trim() } }, [
    create_view_element('span', { attributes: { class: 'song_field_label' } }, [props.label]),
    create_view_element('input', {
      attributes: {
        id: props.input_id,
        class: 'song_input',
        name: props.input_name,
        type: props.input_type ?? 'text',
        value: props.initial_text ?? null,
        placeholder: props.placeholder,
        maxlength: props.maximum_length,
        autocomplete: 'off',
        spellcheck: 'false',
      },
    }),
  ]);
}

function song_fields(props) {
  const id_prefix = props.id_prefix;
  const song = props.song ?? null;
  return create_view_element('div', { attributes: { class: 'song_form_grid' } }, [
    render_child_component(song_text_field, {
      label: '제목',
      input_id: `${id_prefix}_title`,
      input_name: 'song_title',
      initial_text: song?.title,
      placeholder: '노래 제목',
      maximum_length: maximum_title_length,
    }),
    render_child_component(song_text_field, {
      label: '가수',
      input_id: `${id_prefix}_artist`,
      input_name: 'song_artist',
      initial_text: song?.artist,
      placeholder: '가수 이름',
      maximum_length: maximum_artist_length,
    }),
    render_child_component(song_text_field, {
      label: '링크',
      input_id: `${id_prefix}_link`,
      input_name: 'song_link',
      input_type: 'url',
      initial_text: song?.link_url,
      placeholder: 'https:// (선택)',
      maximum_length: maximum_link_length,
    }),
    render_child_component(song_text_field, {
      label: '메모',
      input_id: `${id_prefix}_memo`,
      input_name: 'song_memo',
      initial_text: song?.memo,
      placeholder: '선택',
      maximum_length: maximum_memo_length,
    }),
  ]);
}

function form_error(props) {
  return create_view_element('p', { attributes: { class: 'song_form_error', role: 'alert', hidden: props.error_text === '' } }, [
    props.error_text,
  ]);
}

function song_form(props) {
  return create_view_element(
    'form',
    {
      attributes: { id: 'song_form', class: 'song_form', novalidate: true, autocomplete: 'off' },
      event_handlers: { submit: props.on_submit, input: props.on_input, keydown: props.on_keydown },
    },
    [
      render_child_component(song_fields, { id_prefix: 'new_song' }),
      create_view_element('div', { attributes: { class: 'song_form_footer' } }, [
        render_child_component(form_error, { error_text: props.error_text }),
        create_view_element('button', { attributes: { type: 'submit', class: 'primary_button' } }, ['추가']),
      ]),
    ],
  );
}

function segment_button(props) {
  return create_view_element(
    'button',
    {
      attributes: { type: 'button', class: 'segment_button', 'aria-pressed': String(props.is_pressed) },
      event_handlers: { click: props.on_click },
    },
    [props.label],
  );
}

function library_toolbar(props) {
  const { filter_name, song_counts } = props;
  return create_view_element('div', { attributes: { class: 'library_toolbar' } }, [
    create_view_element('div', { attributes: { class: 'segment_group', role: 'group', 'aria-label': '곡 필터' } }, [
      render_child_component(segment_button, {
        label: `전체 ${song_counts.total_count}`,
        is_pressed: filter_name === filter_names.all,
        on_click: () => props.on_filter_change(filter_names.all),
      }),
      render_child_component(segment_button, {
        label: `즐겨찾기 ${song_counts.favorite_count}`,
        is_pressed: filter_name === filter_names.favorite,
        on_click: () => props.on_filter_change(filter_names.favorite),
      }),
    ]),
  ]);
}

function song_row(props) {
  const { song, song_actions } = props;
  return create_view_element(
    'li',
    { attributes: { id: `row_${song.id}`, class: 'song_row', 'aria-current': props.is_main ? 'true' : null } },
    [
      // 즐겨찾기 별은 커버 왼쪽에 두어 오른쪽 동작 버튼(메인, 수정, 이동, 삭제)과 나눈다.
      render_child_component(song_icon_button, {
        class_name: 'song_favorite_button',
        label: song.is_favorite ? '즐겨찾기 해제' : '즐겨찾기',
        icon_shape: icon_shapes.star,
        is_pressed: song.is_favorite,
        on_click: () => song_actions.on_toggle_favorite(song),
      }),
      render_child_component(song_cover, { title: song.title, size_name: 'small' }),
      create_view_element('div', { attributes: { class: 'song_text' } }, [
        create_view_element('span', { attributes: { class: 'song_title' } }, [song.title]),
        create_view_element('span', { attributes: { class: 'song_artist' } }, [song.artist]),
        create_view_element('span', { attributes: { class: 'song_memo', hidden: song.memo === '' } }, [song.memo]),
      ]),
      create_view_element('div', { attributes: { class: 'song_actions' } }, [
        render_child_component(song_link, { link_url: song.link_url }),
        render_child_component(main_song_button, {
          is_main: props.is_main,
          on_click: () => song_actions.on_set_main(song),
        }),
        render_child_component(song_icon_button, {
          label: '수정',
          icon_shape: icon_shapes.edit,
          on_click: () => song_actions.on_start_edit(song),
        }),
        props.can_move
          ? [
              render_child_component(song_icon_button, {
                label: '위로',
                icon_shape: icon_shapes.move_up,
                is_disabled: props.is_first,
                on_click: () => song_actions.on_move(song, -1),
              }),
              render_child_component(song_icon_button, {
                label: '아래로',
                icon_shape: icon_shapes.move_down,
                is_disabled: props.is_last,
                on_click: () => song_actions.on_move(song, 1),
              }),
            ]
          : null,
        render_child_component(song_icon_button, {
          label: '삭제',
          icon_shape: icon_shapes.remove,
          on_click: () => song_actions.on_remove(song),
        }),
      ]),
    ],
  );
}

// 수정 중인 행은 li(key)는 그대로 두고 안쪽만 폼으로 바뀐다.
function song_edit_row(props) {
  const { song, song_actions } = props;
  return create_view_element('li', { attributes: { id: `row_${song.id}`, class: 'song_row song_row_editing' } }, [
    create_view_element(
      'form',
      {
        attributes: { class: 'song_edit_form', novalidate: true, autocomplete: 'off', 'aria-label': `${song.title} 수정` },
        event_handlers: {
          submit: (submit_event, form_element) => song_actions.on_save_edit(song, submit_event, form_element),
          keydown: song_actions.on_edit_keydown,
        },
      },
      [
        render_child_component(song_fields, { id_prefix: `edit_${song.id}`, song }),
        create_view_element('div', { attributes: { class: 'song_form_footer' } }, [
          render_child_component(form_error, { error_text: props.error_text }),
          create_view_element(
            'button',
            { attributes: { type: 'button', class: 'ghost_button' }, event_handlers: { click: song_actions.on_cancel_edit } },
            ['취소'],
          ),
          create_view_element('button', { attributes: { type: 'submit', class: 'primary_button' } }, ['저장']),
        ]),
      ],
    ),
  ]);
}

// 목록(ul) ↔ 빈 안내(p)는 key 없는 서로 다른 요소라 diff가 REPLACE로 바꾼다.
// 행은 곡 id로 key를 달아 추가·삭제·이동만 일어나게 한다.
function song_collection(props) {
  const { songs, main_song_id } = props;
  if (songs.length === 0) {
    return create_view_element('p', { attributes: { class: 'song_empty' } }, [
      props.filter_name === filter_names.favorite ? '즐겨찾기한 곡이 없습니다' : '아직 모은 곡이 없습니다',
    ]);
  }
  return create_view_element(
    'ul',
    { attributes: { class: 'song_list' } },
    songs.map((song, index) =>
      song.id === props.editing_song_id
        ? render_child_component(song_edit_row, { song, error_text: props.edit_error_text, song_actions: props.song_actions })
        : render_cached_song_row(props.row_cache, {
            song,
            is_main: song.id === main_song_id,
            can_move: props.can_move,
            is_first: index === 0,
            is_last: index === songs.length - 1,
            song_actions: props.song_actions,
          }),
    ),
  );
}

// 곡 객체가 같고 행이 읽는 조건(is_main, can_move, is_first, is_last, song_actions)도 같으면
// 이전 렌더링의 행 Virtual DOM 객체를 그대로 돌려준다. 노드가 불변이므로 같은 객체 = 같은 내용이다.
// 북마크는 Virtual DOM 객체를 키로 DOM을 가리키므로, 객체가 같으면 북마크도 그대로 맞다.
// 그래서 diff는 old === new에서 하위 트리를 건너뛰고, 그 행에는 BIND도 생기지 않는다.
// 곡 데이터는 불변이라 바뀐 곡만 새 객체가 되고(song_board_model), 캐시는 곡 객체를 키로 한 WeakMap이라 지운 곡과 함께 해제된다.
function render_cached_song_row(row_cache, row_props) {
  const cached_entry = row_cache.get(row_props.song);
  const is_reusable =
    cached_entry !== undefined &&
    cached_entry.is_main === row_props.is_main &&
    cached_entry.can_move === row_props.can_move &&
    cached_entry.is_first === row_props.is_first &&
    cached_entry.is_last === row_props.is_last &&
    cached_entry.song_actions === row_props.song_actions;
  if (is_reusable) return cached_entry.row_node;
  const row_node = render_child_component(song_row, row_props);
  row_cache.set(row_props.song, {
    is_main: row_props.is_main,
    can_move: row_props.can_move,
    is_first: row_props.is_first,
    is_last: row_props.is_last,
    song_actions: row_props.song_actions,
    row_node,
  });
  return row_node;
}

// ---------- 루트 컴포넌트 (State와 Hook은 여기에만) ----------

function read_song_draft(form_element) {
  const read_field = (field_name) => form_element?.elements?.namedItem(field_name)?.value ?? '';
  return {
    title: read_field('song_title'),
    artist: read_field('song_artist'),
    link_url: read_field('song_link'),
    memo: read_field('song_memo'),
  };
}

// 한글 입력(IME) 조합을 끝내려고 누른 Enter가 폼을 제출하지 않게 막는다.
function is_composing_enter(keyboard_event) {
  return keyboard_event.key === 'Enter' && (keyboard_event.isComposing === true || keyboard_event.keyCode === 229);
}

// root props:
// - load_board(): 처음 State (song_board_model.parse_saved_board 결과)
// - save_board(board): State가 바뀌면 저장
// - on_board_change({ song_count, main_song_title_text }): 탭 제목, 상단 바 갱신용
// - report_action(action_label): 이번 State 변경의 이름(변경 기록 카드용)
// - focus_by_id(element_id): 수정 시작 후 입력란에 포커스
export function song_board_root(props) {
  const initial_board = use_memo(() => props.load_board(), []);
  const [songs, set_songs] = use_state(initial_board.songs);
  const [main_song_id, set_main_song_id] = use_state(initial_board.main_song_id);
  const [filter_name, set_filter_name] = use_state(initial_board.filter_name);
  const [last_song_number, set_last_song_number] = use_state(initial_board.last_song_number);
  const [editing_song_id, set_editing_song_id] = use_state(null);
  const [form_error_text, set_form_error_text] = use_state('');
  const [edit_error_text, set_edit_error_text] = use_state('');

  // 메인곡은 복사본이 아니라 id만 State에 두고 찾는다. 곡을 수정하면 카드와 목록이 자동으로 같아진다.
  const main_song = use_memo(() => find_song(songs, main_song_id), [songs, main_song_id]);
  const visible_songs = use_memo(() => filter_songs(songs, filter_name), [songs, filter_name]);
  const song_counts = use_memo(() => count_songs(songs), [songs]);

  use_effect(() => {
    props.save_board?.({ songs, main_song_id, filter_name, last_song_number });
  }, [songs, main_song_id, filter_name, last_song_number]);

  use_effect(() => {
    props.on_board_change?.({ song_count: songs.length, main_song_title_text: create_main_song_title_text(main_song) });
  }, [songs.length, main_song]);

  use_effect(() => {
    if (editing_song_id !== null) props.focus_by_id?.(`edit_${editing_song_id}_title`);
  }, [editing_song_id]);

  // report_action은 State를 바꾼 뒤에 부른다. 이번 update가 그 이름을 가져가도록 순서를 맞춘 것이다.
  const report_action = (action_label) => props.report_action?.(action_label);

  const handle_add_submit = (submit_event, form_element) => {
    submit_event.preventDefault();
    const validation = validate_song_draft(read_song_draft(form_element), songs);
    if (!validation.is_valid) {
      set_form_error_text(validation.error_text);
      report_action('곡 추가 실패');
      return;
    }
    const song_id = create_next_song_id(songs, last_song_number);
    set_songs(add_song(songs, song_id, validation.song_fields));
    set_last_song_number(Number(song_id.slice('song_'.length)));
    set_form_error_text('');
    // 새 곡은 즐겨찾기가 아니므로 즐겨찾기 필터에서는 보이지 않는다. 방금 추가한 곡이 보이도록 전체로 돌린다.
    set_filter_name(filter_names.all);
    form_element.reset?.();
    form_element.elements?.namedItem('song_title')?.focus?.();
    report_action(`곡 추가 · ${validation.song_fields.title}`);
  };

  const handle_add_input = () => {
    set_form_error_text('');
  };

  const handle_form_keydown = (keyboard_event) => {
    if (is_composing_enter(keyboard_event)) keyboard_event.preventDefault();
  };

  // 재사용한 행은 처음 만들 때의 핸들러를 그대로 들고 있다.
  // 그래서 song_actions는 렌더링마다 같은 객체로 두고, 렌더링 시점의 State를 닫아 두지 않도록
  // updater 함수(현재 값을 받아 다음 값을 돌려줌)와 최신 State 상자로 계산한다.
  const row_cache = use_memo(() => new WeakMap(), []);
  const latest_state = use_memo(() => ({ songs: null, main_song_id: null }), []);
  latest_state.songs = songs;
  latest_state.main_song_id = main_song_id;

  const song_actions = use_memo(() => Object.freeze({
    on_toggle_favorite: (song) => {
      set_songs((current_songs) => toggle_favorite(current_songs, song.id));
      report_action(`${song.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'} · ${song.title}`);
    },
    // 같은 곡을 다시 지정하면 State가 그대로라 다시 그리지 않는다.
    on_set_main: (song) => {
      if (song.id === latest_state.main_song_id) return;
      set_main_song_id(song.id);
      report_action(`메인곡 지정 · ${song.title}`);
    },
    on_remove: (song) => {
      set_songs((current_songs) => remove_song(current_songs, song.id));
      set_main_song_id((current_main_song_id) => (current_main_song_id === song.id ? null : current_main_song_id));
      set_editing_song_id((current_editing_song_id) => (current_editing_song_id === song.id ? null : current_editing_song_id));
      report_action(`곡 삭제 · ${song.title}`);
    },
    on_move: (song, move_offset) => {
      set_songs((current_songs) => move_song(current_songs, song.id, move_offset));
      report_action(`순서 변경 · ${song.title}`);
    },
    on_start_edit: (song) => {
      set_editing_song_id(song.id);
      set_edit_error_text('');
      report_action(`수정 시작 · ${song.title}`);
    },
    on_cancel_edit: () => {
      set_editing_song_id(null);
      set_edit_error_text('');
      report_action('수정 취소');
    },
    on_save_edit: (song, submit_event, form_element) => {
      submit_event.preventDefault();
      const validation = validate_song_draft(read_song_draft(form_element), latest_state.songs, song.id);
      if (!validation.is_valid) {
        set_edit_error_text(validation.error_text);
        report_action('곡 수정 실패');
        return;
      }
      set_songs((current_songs) => update_song(current_songs, song.id, validation.song_fields));
      set_editing_song_id(null);
      set_edit_error_text('');
      report_action(`곡 수정 · ${validation.song_fields.title}`);
    },
    on_edit_keydown: (keyboard_event) => {
      if (is_composing_enter(keyboard_event)) {
        keyboard_event.preventDefault();
        return;
      }
      if (keyboard_event.key === 'Escape') {
        set_editing_song_id(null);
        set_edit_error_text('');
        report_action('수정 취소');
      }
    },
  }), []);

  const handle_filter_change = (next_filter_name) => {
    if (next_filter_name === filter_name) return;
    set_filter_name(next_filter_name);
    // 수정 중인 곡이 새 필터에서 가려지면 폼 DOM이 사라지며 입력도 함께 버려진다.
    // 수정 상태를 남겨 두면 나중에 다시 보일 때 원래 값의 폼이 말없이 되살아나므로, 취소 버튼과 같게 끝낸다.
    const is_editing_song_hidden =
      editing_song_id !== null && !filter_songs(songs, next_filter_name).some((song) => song.id === editing_song_id);
    if (is_editing_song_hidden) {
      set_editing_song_id(null);
      set_edit_error_text('');
    }
    report_action(next_filter_name === filter_names.favorite ? '필터 · 즐겨찾기' : '필터 · 전체');
  };

  return [
    create_view_element('div', { attributes: { class: 'song_column' } }, [
      create_view_element('section', { attributes: { class: 'content_card', 'aria-labelledby': 'main_song_heading' } }, [
        create_view_element('header', { attributes: { class: 'card_header' } }, [
          create_view_element('h2', { attributes: { id: 'main_song_heading', class: 'card_title' } }, ['오늘의 메인곡']),
        ]),
        render_child_component(main_song_card, { song: main_song }),
      ]),
      create_view_element('section', { attributes: { class: 'content_card', 'aria-labelledby': 'song_form_heading' } }, [
        create_view_element('header', { attributes: { class: 'card_header' } }, [
          create_view_element('h2', { attributes: { id: 'song_form_heading', class: 'card_title' } }, ['곡 추가']),
        ]),
        render_child_component(song_form, {
          error_text: form_error_text,
          on_submit: handle_add_submit,
          on_input: handle_add_input,
          on_keydown: handle_form_keydown,
        }),
      ]),
    ]),
    create_view_element('section', { attributes: { class: 'content_card song_library', 'aria-labelledby': 'song_library_heading' } }, [
      create_view_element('header', { attributes: { class: 'card_header' } }, [
        create_view_element('h2', { attributes: { id: 'song_library_heading', class: 'card_title' } }, ['내 노래']),
        render_child_component(library_toolbar, {
          filter_name,
          song_counts,
          on_filter_change: handle_filter_change,
        }),
      ]),
      render_child_component(song_collection, {
        songs: visible_songs,
        filter_name,
        main_song_id,
        editing_song_id,
        edit_error_text,
        can_move: filter_name === filter_names.all,
        song_actions,
        row_cache,
      }),
    ]),
  ];
}
