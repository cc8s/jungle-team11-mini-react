// 팀원 mini-react 의 song_board_root 를 벤치 페이지에 띄운다. 원본 app.js 의 하이라이트·기록·저장은 빼고 컴포넌트만 둔다.
import { FunctionComponent } from '../../src/function_component.js';
import { song_board_root } from '../../src/song_board.js';
import { parse_saved_board } from '../../src/song_board_model.js';

let render_count = 0;

function counted_song_board_root(root_props) {
  render_count += 1;
  return song_board_root(root_props);
}

window.song_board_bench = {
  implementation_name: 'mini_react',
  mount_board(container_element, board_text) {
    const song_board_component = new FunctionComponent(counted_song_board_root, container_element, {
      load_board: () => parse_saved_board(board_text),
      focus_by_id: (element_id) => document.getElementById(element_id)?.focus(),
    });
    song_board_component.mount();
  },
  read_render_count: () => render_count,
};
