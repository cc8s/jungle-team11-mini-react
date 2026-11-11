import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filter_names,
  maximum_title_length,
  normalize_song_text,
  create_song_identity,
  normalize_link_url,
  create_next_song_id,
  validate_song_draft,
  add_song,
  remove_song,
  toggle_favorite,
  update_song,
  move_song,
  find_song,
  resolve_main_song_id,
  filter_songs,
  count_songs,
  create_song_initials,
  create_sample_board,
  serialize_board,
  parse_saved_board,
  create_main_song_title_text,
} from '../src/song_board_model.js';

function create_songs() {
  let songs = Object.freeze([]);
  songs = add_song(songs, 'song_1', { title: '첫 곡', artist: '가수 A', memo: '', link_url: '' });
  songs = add_song(songs, 'song_2', { title: '둘째 곡', artist: '가수 B', memo: '메모', link_url: '' });
  songs = add_song(songs, 'song_3', { title: 'Third Song', artist: 'Singer C', memo: '', link_url: '' });
  return songs;
}

test('EC-001 텍스트 정규화: null·undefined는 빈 문자열, 앞뒤 공백 제거, 연속 공백·줄바꿈은 한 칸, 한글 자모는 NFC', () => {
  assert.equal(normalize_song_text(null), '');
  assert.equal(normalize_song_text(undefined), '');
  assert.equal(normalize_song_text('  밤  편지\n\t '), '밤 편지');
  assert.equal(normalize_song_text('가'), '가');
  assert.equal(normalize_song_text(42), '42');
});

test('EC-002 중복 기준: 공백과 대소문자를 무시한 제목 + 가수', () => {
  assert.equal(create_song_identity(' Paper  Lantern ', 'QUIET harbor'), create_song_identity('paper lantern', 'Quiet Harbor'));
  assert.notEqual(create_song_identity('같은 제목', '가수 A'), create_song_identity('같은 제목', '가수 B'));
  // 제목과 가수 경계가 섞이지 않는다 ("ab"+"c" ≠ "a"+"bc")
  assert.notEqual(create_song_identity('ab', 'c'), create_song_identity('a', 'bc'));
});

test('EC-003 링크는 http·https만 받고 javascript:, data:, 상대 주소, 너무 긴 주소는 거부한다', () => {
  assert.equal(normalize_link_url(''), '');
  assert.equal(normalize_link_url('  '), '');
  assert.equal(normalize_link_url('https://example.com/song?id=1'), 'https://example.com/song?id=1');
  assert.equal(normalize_link_url('HTTP://Example.com'), 'http://example.com/');
  for (const rejected_link of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'ftp://example.com', '/relative', 'not a url']) {
    assert.equal(normalize_link_url(rejected_link), null, rejected_link);
  }
  assert.equal(normalize_link_url(`https://example.com/${'a'.repeat(600)}`), null);
});

test('EC-004 입력 검사: 빈 제목·가수, 길이 초과, 잘못된 링크, 중복은 오류 문구, 통과하면 정규화한 필드', () => {
  const songs = create_songs();
  assert.equal(validate_song_draft({ title: ' ', artist: 'x' }, songs).error_text, '제목을 입력하세요');
  assert.equal(validate_song_draft({ title: 'x', artist: '' }, songs).error_text, '가수를 입력하세요');
  assert.match(validate_song_draft({ title: 'x'.repeat(maximum_title_length + 1), artist: 'y' }, songs).error_text, /자까지/);
  assert.match(validate_song_draft({ title: 'x', artist: 'y', link_url: 'javascript:alert(1)' }, songs).error_text, /https/);
  assert.equal(validate_song_draft({ title: '  첫  곡 ', artist: '가수 a' }, songs).error_text, '이미 목록에 있는 곡입니다');
  const validation = validate_song_draft({ title: ' 새 곡 ', artist: ' 새 가수 ', memo: ' 좋아요 ', link_url: '' }, songs);
  assert.equal(validation.is_valid, true);
  assert.deepEqual({ ...validation.song_fields }, { title: '새 곡', artist: '새 가수', memo: '좋아요', link_url: '' });
  assert.throws(() => validate_song_draft(null, songs), TypeError);
});

test('EC-005 수정할 때는 자기 자신과의 중복은 허용하고 다른 곡과의 중복은 막는다', () => {
  const songs = create_songs();
  assert.equal(validate_song_draft({ title: '첫 곡', artist: '가수 A', memo: '새 메모' }, songs, 'song_1').is_valid, true);
  assert.equal(validate_song_draft({ title: '둘째 곡', artist: '가수 B' }, songs, 'song_1').is_valid, false);
});

test('EC-006 새 id는 지금까지 쓴 가장 큰 번호 + 1이고, 삭제한 번호를 다시 쓰지 않는다', () => {
  const songs = create_songs();
  assert.equal(create_next_song_id(songs), 'song_4');
  assert.equal(create_next_song_id(remove_song(songs, 'song_3'), 3), 'song_4');
  assert.equal(create_next_song_id([]), 'song_1');
  assert.equal(create_next_song_id([{ id: 'broken' }]), 'song_1');
});

test('EC-007 추가는 맨 위에 붙이고, 모든 변경은 새 배열과 새 곡을 만들며 원래 배열은 그대로다(불변성)', () => {
  const songs = create_songs();
  assert.deepEqual(songs.map((song) => song.id), ['song_3', 'song_2', 'song_1']);
  assert.equal(Object.isFrozen(songs), true);
  assert.equal(Object.isFrozen(songs[0]), true);
  const toggled_songs = toggle_favorite(songs, 'song_2');
  assert.equal(toggled_songs[1].is_favorite, true);
  assert.equal(songs[1].is_favorite, false);
  assert.equal(toggled_songs[0], songs[0], '바뀌지 않은 곡은 같은 객체를 공유');
});

test('EC-008 대상이 없거나 내용이 같으면 같은 배열을 돌려준다 (State 그대로 → 다시 그리지 않음)', () => {
  const songs = create_songs();
  assert.equal(remove_song(songs, 'song_99'), songs);
  assert.equal(toggle_favorite(songs, 'song_99'), songs);
  assert.equal(update_song(songs, 'song_1', { title: '첫 곡', artist: '가수 A', memo: '', link_url: '' }), songs);
  assert.equal(move_song(songs, 'song_3', -1), songs, '맨 위에서 위로');
  assert.equal(move_song(songs, 'song_1', 1), songs, '맨 아래에서 아래로');
  assert.equal(move_song(songs, 'song_99', 1), songs);
  assert.throws(() => move_song(songs, 'song_1', 2), TypeError);
});

test('EC-009 수정과 이동', () => {
  const songs = create_songs();
  const updated_songs = update_song(songs, 'song_1', { title: '고친 곡', artist: '가수 A', memo: 'm', link_url: '' });
  assert.equal(find_song(updated_songs, 'song_1').title, '고친 곡');
  assert.equal(find_song(updated_songs, 'song_1').is_favorite, false);
  assert.deepEqual(move_song(songs, 'song_1', -1).map((song) => song.id), ['song_3', 'song_1', 'song_2']);
});

test('EC-010 메인곡으로 지정된 곡을 삭제하면 메인곡 id는 null이 된다', () => {
  const songs = create_songs();
  assert.equal(resolve_main_song_id(remove_song(songs, 'song_2'), 'song_2'), null);
  assert.equal(resolve_main_song_id(songs, 'song_2'), 'song_2');
  assert.equal(resolve_main_song_id(songs, null), null);
  assert.equal(find_song(songs, undefined), null);
});

test('EC-011 필터와 개수', () => {
  const songs = toggle_favorite(create_songs(), 'song_1');
  assert.deepEqual(filter_songs(songs, filter_names.favorite).map((song) => song.id), ['song_1']);
  assert.equal(filter_songs(songs, filter_names.all), songs);
  assert.deepEqual({ ...count_songs(songs) }, { total_count: 3, favorite_count: 1 });
});

test('EC-012 예전 버전이 저장한 view_mode 항목은 무시하고 읽으며, 다시 저장하면 사라진다', () => {
  const saved_text = JSON.stringify({ songs: [{ id: 'song_1', title: 'A', artist: 'B' }], view_mode: 'card' });
  const restored_board = parse_saved_board(saved_text);
  assert.equal(restored_board.songs.length, 1);
  assert.equal(Object.hasOwn(restored_board, 'view_mode'), false);
  assert.equal(Object.hasOwn(JSON.parse(serialize_board(restored_board)), 'view_mode'), false);
});

test('EC-013 커버 이니셜: 한글은 첫 글자, 영문은 두 단어 첫 글자 대문자, 이모지는 한 글자, 빈 제목은 ♪', () => {
  assert.equal(create_song_initials('새벽 산책'), '새');
  assert.equal(create_song_initials('paper lantern'), 'PL');
  assert.equal(create_song_initials('Solo'), 'S');
  assert.equal(create_song_initials('🎵 노래'), '🎵');
  assert.equal(create_song_initials('   '), '♪');
});

test('EC-014 저장한 적이 없으면 샘플 곡, 깨진 JSON이나 모양이 틀리면 빈 목록으로 시작한다', () => {
  const sample_board = parse_saved_board(null);
  assert.equal(sample_board.songs.length, 3);
  assert.equal(sample_board.main_song_id, 'song_1');
  for (const broken_text of ['{', 'null', '[]', '"text"', '{"songs":"x"}']) {
    const empty_board = parse_saved_board(broken_text);
    assert.deepEqual([...empty_board.songs], [], broken_text);
    assert.equal(empty_board.main_song_id, null);
  }
});

test('EC-015 저장 → 읽기를 거쳐도 같은 State로 돌아온다', () => {
  const board = { ...create_sample_board(), filter_name: filter_names.favorite, last_song_number: 7 };
  const restored_board = parse_saved_board(serialize_board(board));
  assert.deepEqual(restored_board.songs.map((song) => ({ ...song })), board.songs.map((song) => ({ ...song })));
  assert.equal(restored_board.main_song_id, board.main_song_id);
  assert.equal(restored_board.filter_name, filter_names.favorite);
  assert.equal(restored_board.last_song_number, 7);
});

test('EC-016 저장된 곡 중 잘못된 것(빈 제목, 이상한 id, 중복 id·곡, javascript: 링크)만 빼고 읽는다', () => {
  const saved_text = JSON.stringify({
    songs: [
      { id: 'song_1', title: '정상', artist: 'A', is_favorite: true, memo: '', link_url: '' },
      { id: 'song_2', title: '', artist: 'A' },
      { id: '<img>', title: 'x', artist: 'y' },
      { id: 'song_1', title: '중복 id', artist: 'B' },
      { id: 'song_3', title: ' 정상 ', artist: 'a' },
      { id: 'song_4', title: '링크', artist: 'C', link_url: 'javascript:alert(1)' },
      null,
      { id: 'song_5', title: '좋음', artist: 'D', is_favorite: 'yes' },
    ],
    main_song_id: 'song_2',
    filter_name: 'unknown',
    last_song_number: -5,
  });
  const restored_board = parse_saved_board(saved_text);
  assert.deepEqual(restored_board.songs.map((song) => song.id), ['song_1', 'song_5']);
  assert.equal(restored_board.songs[1].is_favorite, false, 'true가 아니면 즐겨찾기 아님');
  assert.equal(restored_board.main_song_id, null, '없는 곡을 가리키는 메인곡 id는 null');
  assert.equal(restored_board.filter_name, filter_names.all);
  assert.equal(restored_board.last_song_number, 5);
});

test('EC-017 탭 제목 글자', () => {
  assert.equal(create_main_song_title_text(null), '');
  assert.equal(create_main_song_title_text({ title: '새벽 산책', artist: '낮은 목소리' }), '새벽 산책 · 낮은 목소리');
});
