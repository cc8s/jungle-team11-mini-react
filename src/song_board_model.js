// 최애곡 모음(Phase 2 페이지)의 데이터 규칙. DOM과 무관한 순수 함수만 둔다.
// 곡은 동결된 객체이고, 바꿀 때는 새 배열과 새 곡 객체를 만든다(이전 State를 고치지 않음).
//
// 곡 모양: { id: 'song_3', title, artist, is_favorite, memo, link_url }

export const filter_names = Object.freeze({ all: 'all', favorite: 'favorite' });
export const maximum_title_length = 80;
export const maximum_artist_length = 60;
export const maximum_memo_length = 160;
export const maximum_link_length = 500;
export const maximum_song_count = 500;

const song_id_pattern = /^song_([1-9][0-9]{0,8})$/;
const allowed_link_protocols = new Set(['http:', 'https:']);

const sample_song_sources = [
  { title: '새벽 산책', artist: '낮은 목소리', is_favorite: true, memo: '출근길에 듣기 좋은 곡' },
  { title: 'Paper Lantern', artist: 'Quiet Harbor', is_favorite: false, memo: '' },
  { title: '여름의 끝', artist: '파란 자전거', is_favorite: true, memo: '' },
];

// 앞뒤 공백 제거, 연속 공백(줄바꿈, 탭 포함)은 한 칸으로, 한글 자모 조합은 NFC로 맞춘다.
export function normalize_song_text(source_text) {
  if (source_text === null || source_text === undefined) return '';
  return String(source_text).normalize('NFC').replace(/\s+/g, ' ').trim();
}

// 중복 판정 기준: 정규화한 제목 + 가수를 대소문자 구분 없이 비교한다. ("밤편지 / IU" = " 밤편지  / iu ")
export function create_song_identity(title, artist) {
  return `${normalize_song_text(title).toLocaleLowerCase('ko')}\u0000${normalize_song_text(artist).toLocaleLowerCase('ko')}`;
}

// 링크는 http, https 주소만 받는다. 비어 있으면 '', 잘못된 주소나 다른 스킴(javascript: 등)은 null.
export function normalize_link_url(source_text) {
  const link_text = normalize_song_text(source_text);
  if (link_text === '') return '';
  if (link_text.length > maximum_link_length) return null;
  let parsed_url;
  try {
    parsed_url = new URL(link_text);
  } catch {
    return null;
  }
  return allowed_link_protocols.has(parsed_url.protocol) ? parsed_url.href : null;
}

function freeze_song(song_fields) {
  return Object.freeze({
    id: song_fields.id,
    title: song_fields.title,
    artist: song_fields.artist,
    is_favorite: Boolean(song_fields.is_favorite),
    memo: song_fields.memo ?? '',
    link_url: song_fields.link_url ?? '',
  });
}

function read_song_number(song_id) {
  const id_match = song_id_pattern.exec(song_id);
  return id_match ? Number(id_match[1]) : 0;
}

// 지금까지 쓴 가장 큰 번호 + 1. 삭제한 번호도 다시 쓰지 않도록 기억한 최댓값(last_song_number)도 함께 본다.
export function create_next_song_id(songs, last_song_number = 0) {
  const largest_number = songs.reduce((largest, song) => Math.max(largest, read_song_number(song.id)), last_song_number);
  return `song_${largest_number + 1}`;
}

// 입력 폼 값을 검사한다. 통과하면 정규화한 필드를, 아니면 화면에 보여 줄 오류 문구를 돌려준다.
// excluded_song_id: 수정 중인 곡 자신은 중복 검사에서 뺀다.
export function validate_song_draft(song_draft, songs, excluded_song_id = null) {
  if (song_draft === null || typeof song_draft !== 'object') throw new TypeError('song_draft는 객체여야 합니다');
  const title = normalize_song_text(song_draft.title);
  const artist = normalize_song_text(song_draft.artist);
  const memo = normalize_song_text(song_draft.memo);
  const link_url = normalize_link_url(song_draft.link_url);
  const reject = (error_text) => Object.freeze({ is_valid: false, error_text, song_fields: null });
  if (title === '') return reject('제목을 입력하세요');
  if (artist === '') return reject('가수를 입력하세요');
  if (title.length > maximum_title_length) return reject(`제목은 ${maximum_title_length}자까지 쓸 수 있습니다`);
  if (artist.length > maximum_artist_length) return reject(`가수는 ${maximum_artist_length}자까지 쓸 수 있습니다`);
  if (memo.length > maximum_memo_length) return reject(`메모는 ${maximum_memo_length}자까지 쓸 수 있습니다`);
  if (link_url === null) return reject('링크는 http:// 또는 https:// 주소만 쓸 수 있습니다');
  const draft_identity = create_song_identity(title, artist);
  const is_duplicate = songs.some(
    (song) => song.id !== excluded_song_id && create_song_identity(song.title, song.artist) === draft_identity,
  );
  if (is_duplicate) return reject('이미 목록에 있는 곡입니다');
  if (excluded_song_id === null && songs.length >= maximum_song_count) {
    return reject(`곡은 ${maximum_song_count}개까지 모을 수 있습니다`);
  }
  return Object.freeze({ is_valid: true, error_text: '', song_fields: Object.freeze({ title, artist, memo, link_url }) });
}

// 새 곡은 목록 맨 위에 붙인다.
export function add_song(songs, song_id, song_fields) {
  return Object.freeze([freeze_song({ ...song_fields, id: song_id, is_favorite: false }), ...songs]);
}

export function remove_song(songs, song_id) {
  const remaining_songs = songs.filter((song) => song.id !== song_id);
  return remaining_songs.length === songs.length ? songs : Object.freeze(remaining_songs);
}

// 대상이 없으면 같은 배열을 돌려준다. 같은 참조이므로 State가 바뀌지 않아 다시 그리지 않는다.
function replace_song(songs, song_id, create_next_song) {
  const song_index = songs.findIndex((song) => song.id === song_id);
  if (song_index === -1) return songs;
  const next_song = create_next_song(songs[song_index]);
  if (next_song === songs[song_index]) return songs;
  const next_songs = [...songs];
  next_songs[song_index] = next_song;
  return Object.freeze(next_songs);
}

export function toggle_favorite(songs, song_id) {
  return replace_song(songs, song_id, (song) => freeze_song({ ...song, is_favorite: !song.is_favorite }));
}

export function update_song(songs, song_id, song_fields) {
  return replace_song(songs, song_id, (song) => {
    const is_unchanged = ['title', 'artist', 'memo', 'link_url'].every((field_name) => song[field_name] === song_fields[field_name]);
    return is_unchanged ? song : freeze_song({ ...song, ...song_fields, id: song.id });
  });
}

// move_offset: -1(위로) 또는 1(아래로). 맨 위에서 위로, 맨 아래에서 아래로는 같은 배열.
export function move_song(songs, song_id, move_offset) {
  if (move_offset !== -1 && move_offset !== 1) throw new TypeError('move_offset은 -1 또는 1이어야 합니다');
  const song_index = songs.findIndex((song) => song.id === song_id);
  const target_index = song_index + move_offset;
  if (song_index === -1 || target_index < 0 || target_index >= songs.length) return songs;
  const next_songs = [...songs];
  [next_songs[song_index], next_songs[target_index]] = [next_songs[target_index], next_songs[song_index]];
  return Object.freeze(next_songs);
}

export function find_song(songs, song_id) {
  if (song_id === null || song_id === undefined) return null;
  return songs.find((song) => song.id === song_id) ?? null;
}

// 메인곡으로 지정된 곡이 사라졌으면 null로 되돌린다.
export function resolve_main_song_id(songs, main_song_id) {
  return find_song(songs, main_song_id) === null ? null : main_song_id;
}

export function filter_songs(songs, filter_name) {
  if (filter_name === filter_names.favorite) return Object.freeze(songs.filter((song) => song.is_favorite));
  return songs;
}

export function count_songs(songs) {
  return Object.freeze({
    total_count: songs.length,
    favorite_count: songs.filter((song) => song.is_favorite).length,
  });
}

// 커버 대신 쓰는 이니셜. 한글이면 첫 글자, 영문이면 앞 두 단어의 첫 글자. 이모지 같은 서로게이트 쌍도 한 글자로 센다.
export function create_song_initials(title) {
  const words = normalize_song_text(title).split(' ').filter((word) => word !== '');
  if (words.length === 0) return '♪';
  const first_characters = words.map((word) => Array.from(word)[0]);
  const is_latin = /^[A-Za-z0-9]$/.test(first_characters[0]);
  return is_latin ? first_characters.slice(0, 2).join('').toUpperCase() : first_characters[0];
}

export function create_sample_board() {
  const songs = Object.freeze(
    sample_song_sources.map((song_source, index) => freeze_song({ ...song_source, id: `song_${index + 1}`, link_url: '' })),
  );
  return Object.freeze({
    songs,
    main_song_id: songs[0].id,
    filter_name: filter_names.all,
    last_song_number: songs.length,
  });
}

function create_empty_board() {
  return Object.freeze({
    songs: Object.freeze([]),
    main_song_id: null,
    filter_name: filter_names.all,
    last_song_number: 0,
  });
}

export function serialize_board(board) {
  return JSON.stringify({
    songs: board.songs,
    main_song_id: board.main_song_id,
    filter_name: board.filter_name,
    last_song_number: board.last_song_number,
  });
}

function parse_saved_song(saved_song, seen_ids, seen_identities) {
  if (saved_song === null || typeof saved_song !== 'object') return null;
  if (typeof saved_song.id !== 'string' || !song_id_pattern.test(saved_song.id) || seen_ids.has(saved_song.id)) return null;
  const validation = validate_song_draft(
    { title: saved_song.title, artist: saved_song.artist, memo: saved_song.memo, link_url: saved_song.link_url },
    [],
  );
  if (!validation.is_valid) return null;
  const song_identity = create_song_identity(validation.song_fields.title, validation.song_fields.artist);
  if (seen_identities.has(song_identity)) return null;
  seen_ids.add(saved_song.id);
  seen_identities.add(song_identity);
  return freeze_song({ ...validation.song_fields, id: saved_song.id, is_favorite: saved_song.is_favorite === true });
}

// 저장된 문자열을 읽는다. 예전 버전이 저장한 view_mode 같은 모르는 항목은 무시한다. 저장된 적이 없으면(null) 샘플 곡으로 시작하고, 깨진 JSON이나 모양이 틀린 값은 빈 목록으로 시작한다.
// 곡 하나가 잘못됐으면 그 곡만 빼고, 같은 id나 같은 곡(제목+가수)은 처음 것만 남긴다.
export function parse_saved_board(saved_text) {
  if (saved_text === null || saved_text === undefined) return create_sample_board();
  let saved_board;
  try {
    saved_board = JSON.parse(saved_text);
  } catch {
    return create_empty_board();
  }
  if (saved_board === null || typeof saved_board !== 'object' || !Array.isArray(saved_board.songs)) {
    return create_empty_board();
  }
  const seen_ids = new Set();
  const seen_identities = new Set();
  const songs = Object.freeze(
    saved_board.songs
      .slice(0, maximum_song_count)
      .map((saved_song) => parse_saved_song(saved_song, seen_ids, seen_identities))
      .filter((song) => song !== null),
  );
  const saved_last_number = Number.isSafeInteger(saved_board.last_song_number) ? Math.max(saved_board.last_song_number, 0) : 0;
  return Object.freeze({
    songs,
    main_song_id: resolve_main_song_id(songs, typeof saved_board.main_song_id === 'string' ? saved_board.main_song_id : null),
    filter_name: Object.values(filter_names).includes(saved_board.filter_name) ? saved_board.filter_name : filter_names.all,
    last_song_number: songs.reduce((largest, song) => Math.max(largest, read_song_number(song.id)), saved_last_number),
  });
}

// 탭 제목에 쓸 글자. 메인곡이 없으면 빈 문자열.
export function create_main_song_title_text(main_song) {
  return main_song ? `${main_song.title} · ${main_song.artist}` : '';
}
