// 벤치 페이지에서 두 구현이 함께 쓰는 동작·측정·스냅샷 도우미. 구현 코드와 섞이지 않게 번들 밖에 둔다.
// 동작은 모두 실제 DOM 이벤트(click, requestSubmit)로 일으켜 이벤트 위임 비용까지 포함한다.

(() => {
  const read_container = () => document.getElementById('song_board');

  // 같은 작업 안의 microtask(두 구현 모두 여기서 다시 그린다)가 끝난 뒤의 다음 task.
  function wait_for_next_task() {
    return new Promise((resolve) => {
      const message_channel = new MessageChannel();
      message_channel.port1.onmessage = () => resolve();
      message_channel.port2.postMessage(null);
    });
  }

  // 다음 프레임(스타일·레이아웃·페인트)까지.
  async function wait_for_next_frame() {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await wait_for_next_task();
  }

  function create_seed_board_text(song_count) {
    const songs = [];
    for (let song_number = 1; song_number <= song_count; song_number += 1) {
      songs.push({
        id: `song_${song_number}`,
        title: `Song ${song_number}`,
        artist: `Artist ${song_number % 37}`,
        memo: song_number % 4 === 0 ? `memo ${song_number}` : '',
        link_url: song_number % 5 === 0 ? `https://example.com/${song_number}` : '',
        is_favorite: song_number % 3 === 0,
      });
    }
    return JSON.stringify({ songs, main_song_id: 'song_1', filter_name: 'all', last_song_number: song_count });
  }

  const find_row = (song_id) => read_container().querySelector(`#row_${song_id}`);
  const find_rows = () => read_container().querySelectorAll('li.song_row');
  let added_song_number = 0;

  function fill_and_submit(form_element, input_prefix, field_texts) {
    for (const [field_name, field_text] of Object.entries(field_texts)) {
      form_element.querySelector(`#${input_prefix}_${field_name}`).value = field_text;
    }
    form_element.requestSubmit();
  }

  // 이름 → 실제 DOM 동작. 인자(song_id 등)는 실행기가 정한다.
  const bench_actions = {
    toggle_favorite: ({ song_id }) => find_row(song_id).querySelector('.song_favorite_button').click(),
    set_main: ({ song_id }) => find_row(song_id).querySelector('.main_song_button').click(),
    move_down: ({ song_id }) => find_row(song_id).querySelector('[aria-label="아래로"]').click(),
    move_up: ({ song_id }) => find_row(song_id).querySelector('[aria-label="위로"]').click(),
    remove_song: ({ song_id }) => find_row(song_id).querySelector('[aria-label="삭제"]').click(),
    remove_middle: () => {
      const rows = find_rows();
      rows[Math.floor(rows.length / 2)].querySelector('[aria-label="삭제"]').click();
    },
    filter_favorite: () => read_container().querySelectorAll('.segment_button')[1].click(),
    filter_all: () => read_container().querySelectorAll('.segment_button')[0].click(),
    add_song: () => {
      added_song_number += 1;
      fill_and_submit(document.getElementById('song_form'), 'new_song', {
        title: `Added ${added_song_number}`,
        artist: 'Bench Artist',
        link: '',
        memo: '',
      });
    },
    add_invalid_song: () => fill_and_submit(document.getElementById('song_form'), 'new_song', { title: '', artist: '', link: '', memo: '' }),
    start_edit: ({ song_id }) => find_row(song_id).querySelector('[aria-label="수정"]').click(),
    cancel_edit: ({ song_id }) => find_row(song_id).querySelector('.ghost_button').click(),
    save_edit: ({ song_id, title }) => {
      const edit_form = find_row(song_id).querySelector('.song_edit_form');
      edit_form.querySelector(`#edit_${song_id}_title`).value = title;
      edit_form.requestSubmit();
    },
  };

  // attribute 순서와 무관하게 비교할 수 있도록 정렬해 직렬화한다. input 의 value property 도 함께 적는다.
  function serialize_node(dom_node) {
    if (dom_node.nodeType === Node.TEXT_NODE) return dom_node.data.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (dom_node.nodeType !== Node.ELEMENT_NODE) return '';
    const attribute_texts = Array.from(dom_node.attributes)
      .map((attribute) => `${attribute.name}="${attribute.value}"`)
      .sort();
    if (dom_node.tagName === 'INPUT') attribute_texts.push(`[value_property]="${dom_node.value}"`);
    const child_texts = Array.from(dom_node.childNodes).map(serialize_node).join('');
    const tag_name = dom_node.tagName.toLowerCase();
    return `<${tag_name}${attribute_texts.length ? ' ' + attribute_texts.join(' ') : ''}>${child_texts}</${tag_name}>`;
  }

  function count_mutations(mutation_records) {
    const mutation_counts = { added_node_count: 0, removed_node_count: 0, attribute_change_count: 0, text_change_count: 0 };
    for (const mutation_record of mutation_records) {
      if (mutation_record.type === 'childList') {
        mutation_counts.added_node_count += mutation_record.addedNodes.length;
        mutation_counts.removed_node_count += mutation_record.removedNodes.length;
      } else if (mutation_record.type === 'attributes') mutation_counts.attribute_change_count += 1;
      else if (mutation_record.type === 'characterData') mutation_counts.text_change_count += 1;
    }
    mutation_counts.total_mutation_count =
      mutation_counts.added_node_count + mutation_counts.removed_node_count + mutation_counts.attribute_change_count + mutation_counts.text_change_count;
    return mutation_counts;
  }

  window.bench_page = {
    is_ready: () => window.song_board_bench !== undefined,

    // 시간 측정용: observer 없이 잰다.
    async measure_mount(song_count) {
      const board_text = create_seed_board_text(song_count);
      const start_ms = performance.now();
      window.song_board_bench.mount_board(read_container(), board_text);
      const script_ms = performance.now() - start_ms;
      await wait_for_next_frame();
      return { script_ms, frame_ms: performance.now() - start_ms };
    },

    async measure_action(action_name, action_arguments = {}) {
      const render_count_before = window.song_board_bench.read_render_count();
      const start_ms = performance.now();
      bench_actions[action_name](action_arguments);
      // 두 구현 모두 다시 그리기를 microtask 로 예약한다. 그 뒤에 넣은 microtask 가 돌 때는 렌더·patch·effect 가 끝나 있다.
      // is_committed_at_script 로 실제로 끝났는지 표본마다 확인한다.
      await new Promise((resolve) => queueMicrotask(resolve));
      const script_ms = performance.now() - start_ms;
      const render_count_at_script = window.song_board_bench.read_render_count() - render_count_before;
      await wait_for_next_frame();
      const frame_ms = performance.now() - start_ms;
      const render_count = window.song_board_bench.read_render_count() - render_count_before;
      return { script_ms, frame_ms, render_count, is_committed_at_script: render_count_at_script === render_count && render_count > 0 };
    },

    // 동치 확인용: 동작 하나의 DOM 변경 수와 끝난 뒤 DOM 스냅샷.
    async observe_action(action_name, action_arguments = {}) {
      const mutation_records = [];
      const mutation_observer = new MutationObserver((observed_records) => mutation_records.push(...observed_records));
      mutation_observer.observe(read_container(), { subtree: true, childList: true, attributes: true, characterData: true });
      const render_count_before = window.song_board_bench.read_render_count();
      if (action_name === 'mount') window.song_board_bench.mount_board(read_container(), create_seed_board_text(action_arguments.song_count));
      else bench_actions[action_name](action_arguments);
      await wait_for_next_task();
      await wait_for_next_frame();
      mutation_records.push(...mutation_observer.takeRecords());
      mutation_observer.disconnect();
      return {
        ...count_mutations(mutation_records),
        render_count: window.song_board_bench.read_render_count() - render_count_before,
        dom_snapshot: serialize_node(read_container()),
        dom_node_count: read_container().querySelectorAll('*').length,
      };
    },
  };
})();
