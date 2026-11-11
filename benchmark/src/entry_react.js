// React 18 포팅을 벤치 페이지에 띄운다. mini-react 의 mount() 가 동기이므로 처음 렌더도 flushSync 로 동기로 맞춘다.
import { createElement as create_react_element } from 'react';
import { createRoot as create_react_root } from 'react-dom/client';
import { flushSync as flush_react_sync } from 'react-dom';
import { song_board_root } from './react_song_board.js';
import { parse_saved_board } from '../../src/song_board_model.js';

let render_count = 0;

function counted_song_board_root(root_props) {
  render_count += 1;
  return song_board_root(root_props);
}

window.song_board_bench = {
  implementation_name: 'react_18',
  mount_board(container_element, board_text) {
    const react_root = create_react_root(container_element);
    const root_props = {
      load_board: () => parse_saved_board(board_text),
      focus_by_id: (element_id) => document.getElementById(element_id)?.focus(),
    };
    flush_react_sync(() => react_root.render(create_react_element(counted_song_board_root, root_props)));
  },
  read_render_count: () => render_count,
};
