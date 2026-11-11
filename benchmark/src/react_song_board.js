// 벤치마크용: ../../src/song_board.js 를 React 18 로 옮긴 것.
// 원본과 함수 하나씩 대응하고, 같은 DOM(태그·attribute·텍스트·순서)을 만들도록 맞춘다.
// 모델(순수 함수)은 원본 파일을 그대로 import 하므로 두 구현의 차이는 뷰 계층만 남는다.
// DOM 이 같은지는 run_equivalence.mjs 가 시나리오마다 확인한다.

import { createElement as create_react_element, Fragment as react_fragment, useState as use_react_state, useEffect as use_react_effect, useMemo as use_react_memo } from 'react';
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
} from '../../src/song_board_model.js';

const icon_shapes = Object.freeze({
  star: 'M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5L10 14.2l-4.5 2.4.9-5-3.6-3.5 5-.7z',
  edit: 'M12.8 4.2l3 3L7.5 15.5H4.5v-3z',
  move_up: 'M5 12.5l5-5 5 5',
  move_down: 'M5 7.5l5 5 5-5',
  remove: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  link: 'M8.5 4.5h-4v11h11v-4M11.5 3.5h5v5M16.5 3.5l-7 7',
});

function song_icon(props) {
  return create_react_element('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' }, create_react_element('path', { d: props.path_text }));
}

function song_icon_button(props) {
  return create_react_element(
    'button',
    {
      type: 'button',
      className: `icon_button song_icon_button ${props.class_name ?? ''}`.trim(),
      'aria-label': props.label,
      title: props.label,
      'aria-pressed': props.is_pressed === undefined ? undefined : String(props.is_pressed),
      disabled: Boolean(props.is_disabled),
      onClick: props.on_click,
    },
    create_react_element(song_icon, { path_text: props.icon_shape }),
  );
}

function main_song_button(props) {
  return create_react_element(
    'button',
    {
      type: 'button',
      className: 'main_song_button',
      'aria-pressed': String(props.is_main),
      title: props.is_main ? '오늘의 메인곡' : '오늘의 메인곡으로 지정',
      onClick: props.on_click,
    },
    '메인',
  );
}

function song_cover(props) {
  return create_react_element('span', { className: `song_cover song_cover_${props.size_name}`, 'aria-hidden': 'true' }, create_song_initials(props.title));
}

function song_link(props) {
  if (props.link_url === '') return null;
  return create_react_element(
    'a',
    { className: 'song_link', href: props.link_url, target: '_blank', rel: 'noopener noreferrer', title: props.link_url },
    create_react_element(song_icon, { path_text: icon_shapes.link }),
    '듣기',
  );
}

function main_song_card(props) {
  const { song } = props;
  if (song === null) {
    return create_react_element(
      'div',
      { className: 'main_song_empty' },
      create_react_element('span', { className: 'song_cover song_cover_large', 'aria-hidden': 'true' }, '♪'),
      create_react_element('p', { className: 'main_song_empty_text' }, '메인곡 없음'),
    );
  }
  return create_react_element(
    'article',
    { className: 'main_song_card' },
    create_react_element(song_cover, { title: song.title, size_name: 'large' }),
    create_react_element(
      'div',
      { className: 'main_song_text' },
      create_react_element('strong', { className: 'main_song_title' }, song.title),
      create_react_element('span', { className: 'main_song_artist' }, song.artist),
      create_react_element('p', { className: 'main_song_memo', hidden: song.memo === '' }, song.memo),
      create_react_element(song_link, { link_url: song.link_url }),
    ),
  );
}

function song_text_field(props) {
  return create_react_element(
    'label',
    { className: `song_field ${props.class_name ?? ''}`.trim() },
    create_react_element('span', { className: 'song_field_label' }, props.label),
    // 원본은 value 를 attribute 로만 쓰고 입력은 DOM 에 맡긴다(비제어). React 에서는 defaultValue 가 같다.
    // defaultValue 키가 있기만 해도(값이 undefined 여도) React 는 value="" attribute 를 붙이므로, 값이 없으면 키를 뺀다.
    // (동치 게이트가 처음 실행에서 잡은 포팅 결함)
    create_react_element('input', {
      id: props.input_id,
      className: 'song_input',
      name: props.input_name,
      type: props.input_type ?? 'text',
      ...(props.initial_text === undefined || props.initial_text === null ? {} : { defaultValue: props.initial_text }),
      placeholder: props.placeholder,
      maxLength: props.maximum_length,
      autoComplete: 'off',
      spellCheck: 'false',
    }),
  );
}

function song_fields(props) {
  const id_prefix = props.id_prefix;
  const song = props.song ?? null;
  return create_react_element(
    'div',
    { className: 'song_form_grid' },
    create_react_element(song_text_field, { label: '제목', input_id: `${id_prefix}_title`, input_name: 'song_title', initial_text: song?.title, placeholder: '노래 제목', maximum_length: maximum_title_length }),
    create_react_element(song_text_field, { label: '가수', input_id: `${id_prefix}_artist`, input_name: 'song_artist', initial_text: song?.artist, placeholder: '가수 이름', maximum_length: maximum_artist_length }),
    create_react_element(song_text_field, { label: '링크', input_id: `${id_prefix}_link`, input_name: 'song_link', input_type: 'url', initial_text: song?.link_url, placeholder: 'https:// (선택)', maximum_length: maximum_link_length }),
    create_react_element(song_text_field, { label: '메모', input_id: `${id_prefix}_memo`, input_name: 'song_memo', initial_text: song?.memo, placeholder: '선택', maximum_length: maximum_memo_length }),
  );
}

function form_error(props) {
  return create_react_element('p', { className: 'song_form_error', role: 'alert', hidden: props.error_text === '' }, props.error_text);
}

function song_form(props) {
  return create_react_element(
    'form',
    {
      id: 'song_form',
      className: 'song_form',
      noValidate: true,
      autoComplete: 'off',
      onSubmit: (submit_event) => props.on_submit(submit_event, submit_event.currentTarget),
      onInput: props.on_input,
      onKeyDown: props.on_keydown,
    },
    create_react_element(song_fields, { id_prefix: 'new_song' }),
    create_react_element(
      'div',
      { className: 'song_form_footer' },
      create_react_element(form_error, { error_text: props.error_text }),
      create_react_element('button', { type: 'submit', className: 'primary_button' }, '추가'),
    ),
  );
}

function segment_button(props) {
  return create_react_element('button', { type: 'button', className: 'segment_button', 'aria-pressed': String(props.is_pressed), onClick: props.on_click }, props.label);
}

function library_toolbar(props) {
  const { filter_name, song_counts } = props;
  return create_react_element(
    'div',
    { className: 'library_toolbar' },
    create_react_element(
      'div',
      { className: 'segment_group', role: 'group', 'aria-label': '곡 필터' },
      create_react_element(segment_button, { label: `전체 ${song_counts.total_count}`, is_pressed: filter_name === filter_names.all, on_click: () => props.on_filter_change(filter_names.all) }),
      create_react_element(segment_button, { label: `즐겨찾기 ${song_counts.favorite_count}`, is_pressed: filter_name === filter_names.favorite, on_click: () => props.on_filter_change(filter_names.favorite) }),
    ),
  );
}

function song_row(props) {
  const { song, song_actions } = props;
  return create_react_element(
    'li',
    { id: `row_${song.id}`, className: 'song_row', 'aria-current': props.is_main ? 'true' : undefined },
    create_react_element(song_icon_button, {
      class_name: 'song_favorite_button',
      label: song.is_favorite ? '즐겨찾기 해제' : '즐겨찾기',
      icon_shape: icon_shapes.star,
      is_pressed: song.is_favorite,
      on_click: () => song_actions.on_toggle_favorite(song),
    }),
    create_react_element(song_cover, { title: song.title, size_name: 'small' }),
    create_react_element(
      'div',
      { className: 'song_text' },
      create_react_element('span', { className: 'song_title' }, song.title),
      create_react_element('span', { className: 'song_artist' }, song.artist),
      create_react_element('span', { className: 'song_memo', hidden: song.memo === '' }, song.memo),
    ),
    create_react_element(
      'div',
      { className: 'song_actions' },
      create_react_element(song_link, { link_url: song.link_url }),
      create_react_element(main_song_button, { is_main: props.is_main, on_click: () => song_actions.on_set_main(song) }),
      create_react_element(song_icon_button, { label: '수정', icon_shape: icon_shapes.edit, on_click: () => song_actions.on_start_edit(song) }),
      props.can_move
        ? create_react_element(
            react_fragment,
            null,
            create_react_element(song_icon_button, { label: '위로', icon_shape: icon_shapes.move_up, is_disabled: props.is_first, on_click: () => song_actions.on_move(song, -1) }),
            create_react_element(song_icon_button, { label: '아래로', icon_shape: icon_shapes.move_down, is_disabled: props.is_last, on_click: () => song_actions.on_move(song, 1) }),
          )
        : null,
      create_react_element(song_icon_button, { label: '삭제', icon_shape: icon_shapes.remove, on_click: () => song_actions.on_remove(song) }),
    ),
  );
}

function song_edit_row(props) {
  const { song, song_actions } = props;
  return create_react_element(
    'li',
    { id: `row_${song.id}`, className: 'song_row song_row_editing' },
    create_react_element(
      'form',
      {
        className: 'song_edit_form',
        noValidate: true,
        autoComplete: 'off',
        'aria-label': `${song.title} 수정`,
        onSubmit: (submit_event) => song_actions.on_save_edit(song, submit_event, submit_event.currentTarget),
        onKeyDown: song_actions.on_edit_keydown,
      },
      create_react_element(song_fields, { id_prefix: `edit_${song.id}`, song }),
      create_react_element(
        'div',
        { className: 'song_form_footer' },
        create_react_element(form_error, { error_text: props.error_text }),
        create_react_element('button', { type: 'button', className: 'ghost_button', onClick: song_actions.on_cancel_edit }, '취소'),
        create_react_element('button', { type: 'submit', className: 'primary_button' }, '저장'),
      ),
    ),
  );
}

// 원본은 li 의 id 로 key 를 잡는다. React 에서는 같은 값을 key 로 준다.
function song_collection(props) {
  const { songs, main_song_id } = props;
  if (songs.length === 0) {
    return create_react_element('p', { className: 'song_empty' }, props.filter_name === filter_names.favorite ? '즐겨찾기한 곡이 없습니다' : '아직 모은 곡이 없습니다');
  }
  return create_react_element(
    'ul',
    { className: 'song_list' },
    songs.map((song, index) =>
      song.id === props.editing_song_id
        ? create_react_element(song_edit_row, { key: song.id, song, error_text: props.edit_error_text, song_actions: props.song_actions })
        : create_react_element(song_row, {
            key: song.id,
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

function read_song_draft(form_element) {
  const read_field = (field_name) => form_element?.elements?.namedItem(field_name)?.value ?? '';
  return { title: read_field('song_title'), artist: read_field('song_artist'), link_url: read_field('song_link'), memo: read_field('song_memo') };
}

function is_composing_enter(keyboard_event) {
  return keyboard_event.key === 'Enter' && (keyboard_event.nativeEvent?.isComposing === true || keyboard_event.keyCode === 229);
}

export function song_board_root(props) {
  const initial_board = use_react_memo(() => props.load_board(), []);
  const [songs, set_songs] = use_react_state(initial_board.songs);
  const [main_song_id, set_main_song_id] = use_react_state(initial_board.main_song_id);
  const [filter_name, set_filter_name] = use_react_state(initial_board.filter_name);
  const [last_song_number, set_last_song_number] = use_react_state(initial_board.last_song_number);
  const [editing_song_id, set_editing_song_id] = use_react_state(null);
  const [form_error_text, set_form_error_text] = use_react_state('');
  const [edit_error_text, set_edit_error_text] = use_react_state('');

  const main_song = use_react_memo(() => find_song(songs, main_song_id), [songs, main_song_id]);
  const visible_songs = use_react_memo(() => filter_songs(songs, filter_name), [songs, filter_name]);
  const song_counts = use_react_memo(() => count_songs(songs), [songs]);

  use_react_effect(() => {
    props.save_board?.({ songs, main_song_id, filter_name, last_song_number });
  }, [songs, main_song_id, filter_name, last_song_number]);

  use_react_effect(() => {
    props.on_board_change?.({ song_count: songs.length, main_song_title_text: create_main_song_title_text(main_song) });
  }, [songs.length, main_song]);

  use_react_effect(() => {
    if (editing_song_id !== null) props.focus_by_id?.(`edit_${editing_song_id}_title`);
  }, [editing_song_id]);

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

  const song_actions = Object.freeze({
    on_toggle_favorite: (song) => {
      set_songs(toggle_favorite(songs, song.id));
      report_action(`${song.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'} · ${song.title}`);
    },
    on_set_main: (song) => {
      if (song.id === main_song_id) return;
      set_main_song_id(song.id);
      report_action(`메인곡 지정 · ${song.title}`);
    },
    on_remove: (song) => {
      set_songs(remove_song(songs, song.id));
      if (song.id === main_song_id) set_main_song_id(null);
      if (song.id === editing_song_id) set_editing_song_id(null);
      report_action(`곡 삭제 · ${song.title}`);
    },
    on_move: (song, move_offset) => {
      set_songs(move_song(songs, song.id, move_offset));
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
      const validation = validate_song_draft(read_song_draft(form_element), songs, song.id);
      if (!validation.is_valid) {
        set_edit_error_text(validation.error_text);
        report_action('곡 수정 실패');
        return;
      }
      set_songs(update_song(songs, song.id, validation.song_fields));
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
  });

  const handle_filter_change = (next_filter_name) => {
    if (next_filter_name === filter_name) return;
    set_filter_name(next_filter_name);
    const is_editing_song_hidden = editing_song_id !== null && !filter_songs(songs, next_filter_name).some((song) => song.id === editing_song_id);
    if (is_editing_song_hidden) {
      set_editing_song_id(null);
      set_edit_error_text('');
    }
    report_action(next_filter_name === filter_names.favorite ? '필터 · 즐겨찾기' : '필터 · 전체');
  };

  return create_react_element(
    react_fragment,
    null,
    create_react_element(
      'div',
      { className: 'song_column' },
      create_react_element(
        'section',
        { className: 'content_card', 'aria-labelledby': 'main_song_heading' },
        create_react_element('header', { className: 'card_header' }, create_react_element('h2', { id: 'main_song_heading', className: 'card_title' }, '오늘의 메인곡')),
        create_react_element(main_song_card, { song: main_song }),
      ),
      create_react_element(
        'section',
        { className: 'content_card', 'aria-labelledby': 'song_form_heading' },
        create_react_element('header', { className: 'card_header' }, create_react_element('h2', { id: 'song_form_heading', className: 'card_title' }, '곡 추가')),
        create_react_element(song_form, { error_text: form_error_text, on_submit: handle_add_submit, on_input: handle_add_input, on_keydown: handle_form_keydown }),
      ),
    ),
    create_react_element(
      'section',
      { className: 'content_card song_library', 'aria-labelledby': 'song_library_heading' },
      create_react_element(
        'header',
        { className: 'card_header' },
        create_react_element('h2', { id: 'song_library_heading', className: 'card_title' }, '내 노래'),
        create_react_element(library_toolbar, { filter_name, song_counts, on_filter_change: handle_filter_change }),
      ),
      create_react_element(song_collection, {
        songs: visible_songs,
        filter_name,
        main_song_id,
        editing_song_id,
        edit_error_text,
        can_move: filter_name === filter_names.all,
        song_actions,
      }),
    ),
  );
}
