// 원인 분석용: mini-react 가 update 한 번에 만드는 diff 연산을 종류별로 센다(on_rendered 옵션 사용).
import { FunctionComponent } from '../../src/function_component.js';
import { song_board_root } from '../../src/song_board.js';
import { parse_saved_board } from '../../src/song_board_model.js';
import { count_view_nodes } from '../../src/view_builder.js';

let render_count = 0;
window.last_operation_counts = null;
function counted_song_board_root(root_props) {
  render_count += 1;
  return song_board_root(root_props);
}
window.song_board_bench = {
  implementation_name: 'mini_react_operation_count',
  mount_board(container_element, board_text) {
    const song_board_component = new FunctionComponent(counted_song_board_root, container_element, {
      load_board: () => parse_saved_board(board_text),
    }, {
      on_rendered: (render_report) => {
        const operation_counts = {};
        for (const operation of render_report.operations) operation_counts[operation.kind] = (operation_counts[operation.kind] ?? 0) + 1;
        window.last_operation_counts = { ...operation_counts, virtual_node_count: count_view_nodes(song_board_component.current_root) };
      },
    });
    song_board_component.mount();
  },
  read_render_count: () => render_count,
};
