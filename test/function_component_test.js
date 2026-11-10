import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FunctionComponent,
  use_state,
  use_effect,
  use_memo,
  render_child_component,
  hook_kinds,
} from '../src/function_component.js';
import { create_view_element } from '../src/view_builder.js';
import { is_same_tree } from '../src/virtual_node.js';
import { find_virtual_node } from '../src/patch.js';
import { operation_kinds } from '../src/diff.js';

// BIND는 북마크만 옮기고 DOM을 바꾸지 않는다. 그 밖의 연산만 DOM 변경이다.
function select_dom_changing_operations(operations) {
  return operations.filter((operation) => operation.kind !== operation_kinds.bind);
}
import { fake_document, fake_event, svg_namespace_uri } from './support/fake_dom.js';

// set_state가 예약한 microtask update가 끝날 때까지 기다린다.
function wait_for_scheduled_update() {
  return new Promise((resolve) => setImmediate(resolve));
}

function create_container() {
  const owner_document = new fake_document();
  const container_element = owner_document.createElement('div');
  owner_document.appendChild(container_element);
  return { owner_document, container_element };
}

function click(dom_node) {
  return dom_node.dispatchEvent(new fake_event('click', { bubbles: true, cancelable: true }));
}

// 자식 컴포넌트: State 없이 props만 받는 순수 함수.
function count_label(props) {
  return create_view_element('span', { attributes: { class: 'count_label' } }, [`count: ${props.count}`]);
}

function increment_button(props) {
  return create_view_element('button', { attributes: { id: 'increment_button' }, event_handlers: { click: props.on_increment } }, [
    '+1',
  ]);
}

// 루트 컴포넌트: State를 가지고 자식에게 props로 내려 준다.
function counter_root() {
  const [count, set_count] = use_state(0);
  return create_view_element('div', { attributes: { id: 'counter_root' } }, [
    render_child_component(count_label, { count }),
    render_child_component(increment_button, { on_increment: () => set_count((previous_count) => previous_count + 1) }),
  ]);
}

function find_counter_parts(container_element) {
  const root_dom = container_element.childNodes[0];
  return { root_dom, label_dom: root_dom.childNodes[0], button_dom: root_dom.childNodes[1] };
}

test('EC-001 렌더 함수, 컨테이너, props가 잘못되면 TypeError', () => {
  const { owner_document, container_element } = create_container();
  assert.throws(() => new FunctionComponent(null, container_element), TypeError);
  assert.throws(() => new FunctionComponent('counter_root', container_element), TypeError);
  for (const invalid_container of [null, undefined, {}, owner_document.createTextNode('text'), owner_document]) {
    assert.throws(() => new FunctionComponent(counter_root, invalid_container), TypeError);
  }
  for (const invalid_props of [null, 'props', []]) {
    assert.throws(() => new FunctionComponent(counter_root, container_element, invalid_props), TypeError);
  }
});

test('EC-002 document가 없는 환경이면 mount가 TypeError', () => {
  const { container_element } = create_container();
  container_element.ownerDocument = null;
  const component = new FunctionComponent(counter_root, container_element);
  assert.throws(() => component.mount(), TypeError);
});

test('EC-003 mount()는 첫 화면을 그리고 hooks 배열에 State를 저장하며 북마크를 연결한다', () => {
  const { container_element } = create_container();
  container_element.appendChild(container_element.ownerDocument.createTextNode('기존 내용'));
  const component = new FunctionComponent(counter_root, container_element);
  assert.deepEqual(component.hooks, []);
  assert.equal(component.mount(), component);
  const { root_dom, label_dom, button_dom } = find_counter_parts(container_element);
  assert.equal(container_element.childNodes.length, 1);
  assert.equal(root_dom.getAttribute('id'), 'counter_root');
  assert.equal(label_dom.textContent, 'count: 0');
  assert.equal(button_dom.textContent, '+1');
  assert.equal(component.hooks.length, 1);
  assert.equal(component.hooks[0].hook_kind, hook_kinds.state);
  assert.equal(component.hooks[0].current_state, 0);
  assert.equal(find_virtual_node(container_element), component.current_root);
  assert.equal(find_virtual_node(root_dom), component.current_root.children[0]);
});

test('EC-004 mount() 반복 호출과 unmount 뒤 mount는 오류', () => {
  const { container_element } = create_container();
  const component = new FunctionComponent(counter_root, container_element).mount();
  assert.throws(() => component.mount(), /이미 mount/);
  component.unmount();
  assert.throws(() => component.mount(), /다시 mount할 수 없습니다/);
});

test('EC-005 State가 바뀌면 update()를 직접 부르지 않아도 화면이 다시 그려지고 DOM 노드는 재사용된다', async () => {
  const { container_element } = create_container();
  const component = new FunctionComponent(counter_root, container_element).mount();
  const { root_dom, label_dom, button_dom } = find_counter_parts(container_element);
  const label_text_dom = label_dom.childNodes[0];
  click(button_dom);
  assert.equal(label_dom.textContent, 'count: 0', 'State 변경은 microtask로 예약되어 아직 반영 전');
  await wait_for_scheduled_update();
  assert.equal(label_dom.textContent, 'count: 1');
  assert.equal(component.hooks[0].current_state, 1);
  const parts_after_update = find_counter_parts(container_element);
  assert.equal(parts_after_update.root_dom, root_dom);
  assert.equal(parts_after_update.button_dom, button_dom);
  assert.equal(label_dom.childNodes[0], label_text_dom, '텍스트 노드는 교체가 아니라 data만 바뀜');
});

test('EC-006 한 작업 안의 여러 State 변경은 update 한 번으로 묶이고, 갱신 함수는 순서대로 누적된다', async () => {
  const { container_element } = create_container();
  const component = new FunctionComponent(counter_root, container_element).mount();
  const { label_dom, button_dom } = find_counter_parts(container_element);
  click(button_dom);
  click(button_dom);
  click(button_dom);
  assert.equal(component.render_count, 1);
  await wait_for_scheduled_update();
  assert.equal(component.render_count, 2);
  assert.equal(label_dom.textContent, 'count: 3');
});

test('EC-007 같은 값(Object.is, NaN 포함)으로 State를 바꾸면 다시 그리지 않는다', async () => {
  const { container_element } = create_container();
  let captured_set_state = null;
  const component = new FunctionComponent(() => {
    const [measured_ratio, set_measured_ratio] = use_state(Number.NaN);
    captured_set_state = set_measured_ratio;
    return create_view_element('p', null, [String(measured_ratio)]);
  }, container_element).mount();
  assert.equal(captured_set_state(Number.NaN), false);
  assert.equal(captured_set_state((previous_ratio) => previous_ratio), false);
  await wait_for_scheduled_update();
  assert.equal(component.render_count, 1);
});

test('EC-008 자식 컴포넌트 안의 Hook과 렌더링 밖의 Hook 호출은 오류', () => {
  const { container_element } = create_container();
  function stateful_child() {
    use_state(0);
    return create_view_element('span');
  }
  const component = new FunctionComponent(
    () => create_view_element('div', null, [render_child_component(stateful_child, {})]),
    container_element,
  );
  assert.throws(() => component.mount(), /최상위\(루트\) 컴포넌트에서만/);
  assert.equal(container_element.childNodes.length, 0, '렌더링 실패 시 DOM은 바뀌지 않음');
  assert.throws(() => use_state(0), /렌더링하는 중에만/);
  assert.throws(() => use_effect(() => {}), /렌더링하는 중에만/);
  assert.throws(() => use_memo(() => 1, []), /렌더링하는 중에만/);
  assert.throws(() => render_child_component(stateful_child, {}), /렌더링하는 중에만/);
});

test('EC-009 자식 컴포넌트는 같은 props에 같은 결과를 돌려주고 props를 고칠 수 없다', () => {
  const first_output = render_child_component(count_label, { count: 3 });
  const second_output = render_child_component(count_label, { count: 3 });
  assert.equal(is_same_tree(first_output, second_output), true);
  assert.throws(
    () =>
      render_child_component((props) => {
        props.count = 99;
        return 'changed';
      }, { count: 1 }),
    TypeError,
  );
  assert.throws(() => render_child_component(count_label, null), TypeError);
  assert.throws(() => render_child_component('count_label', {}), TypeError);
  assert.throws(() => render_child_component(() => undefined, {}), /값을 돌려주지 않았습니다/);
});

test('EC-010 조건문으로 Hook 개수나 종류가 바뀌면 update가 오류이고 이전 화면은 유지된다', async () => {
  const { container_element } = create_container();
  let should_use_extra_hook = false;
  let should_swap_hook_kind = false;
  const component = new FunctionComponent(() => {
    if (should_swap_hook_kind) use_memo(() => 0, []);
    else use_state(0);
    if (should_use_extra_hook) use_state('extra');
    return create_view_element('p', null, ['고정']);
  }, container_element).mount();
  const paragraph_dom = container_element.childNodes[0];
  should_use_extra_hook = true;
  assert.throws(() => component.update(), /순서와 개수/);
  should_use_extra_hook = false;
  should_swap_hook_kind = true;
  assert.throws(() => component.update(), /state에서 memo로/);
  should_swap_hook_kind = false;
  assert.deepEqual(select_dom_changing_operations(component.update()), []);
  assert.equal(container_element.childNodes[0], paragraph_dom);

  // Hook이 줄어드는 경우
  let should_skip_hook = false;
  const shrinking_component = new FunctionComponent(() => {
    if (!should_skip_hook) use_state(0);
    return 'text';
  }, create_container().container_element).mount();
  should_skip_hook = true;
  assert.throws(() => shrinking_component.update(), /순서와 개수/);
});

test('EC-011 렌더링 중 State 변경과 update(), 다른 Hook 콜백 안의 Hook은 오류', () => {
  const { container_element } = create_container();
  let component = null;
  let render_action = 'none';
  component = new FunctionComponent(() => {
    const [count, set_count] = use_state(0);
    if (render_action === 'set_state') set_count(count + 1);
    if (render_action === 'update') component.update();
    if (render_action === 'unmount') component.unmount();
    if (render_action === 'nested_hook') use_memo(() => use_state(1), []);
    return String(count);
  }, container_element).mount();
  render_action = 'set_state';
  assert.throws(() => component.update(), /렌더링 중에는 State를/);
  render_action = 'update';
  assert.throws(() => component.update(), /렌더링 중에는 update/);
  render_action = 'unmount';
  assert.throws(() => component.update(), /렌더링 중에는 unmount/);
  render_action = 'none';
  assert.equal(container_element.textContent, '0');

  const nested_component = new FunctionComponent(() => {
    use_memo(() => use_state(1), []);
    return 'text';
  }, create_container().container_element);
  assert.throws(() => nested_component.mount(), /다른 Hook의 콜백 안에서/);
  const lazy_initializer_component = new FunctionComponent(() => {
    use_state(() => use_memo(() => 1, []));
    return 'text';
  }, create_container().container_element);
  assert.throws(() => lazy_initializer_component.mount(), /다른 Hook의 콜백 안에서/);
});

test('EC-012 use_effect는 patch 뒤에 실행되고, 의존성이 바뀔 때만 이전 정리 함수 다음에 다시 실행된다', async () => {
  const { container_element } = create_container();
  const effect_logs = [];
  let set_query_text = null;
  let set_unrelated_count = null;
  new FunctionComponent(() => {
    const [query_text, set_query] = use_state('a');
    const [unrelated_count, set_unrelated] = use_state(0);
    set_query_text = set_query;
    set_unrelated_count = set_unrelated;
    use_effect(() => {
      effect_logs.push(`mount_only:${container_element.textContent}`);
    }, []);
    use_effect(() => {
      effect_logs.push(`query:${query_text}:${container_element.textContent}`);
      return () => effect_logs.push(`cleanup_query:${query_text}`);
    }, [query_text]);
    use_effect(() => {
      effect_logs.push('every_render');
    });
    return create_view_element('p', null, [`${query_text}/${unrelated_count}`]);
  }, container_element).mount();
  assert.deepEqual(effect_logs, ['mount_only:a/0', 'query:a:a/0', 'every_render']);

  effect_logs.length = 0;
  set_unrelated_count(1);
  await wait_for_scheduled_update();
  assert.deepEqual(effect_logs, ['every_render']);

  effect_logs.length = 0;
  set_query_text('b');
  await wait_for_scheduled_update();
  assert.deepEqual(effect_logs, ['cleanup_query:a', 'query:b:b/1', 'every_render']);
});

test('EC-013 unmount는 정리 함수를 실행하고 리스너와 DOM을 지우며, 반복 호출과 이후 State 변경은 무시된다', async () => {
  const { container_element } = create_container();
  const effect_logs = [];
  let click_count = 0;
  let set_tick_count = null;
  const component = new FunctionComponent(() => {
    const [tick_count, set_tick] = use_state(0);
    set_tick_count = set_tick;
    use_effect(() => {
      effect_logs.push('start_timer');
      return () => effect_logs.push('clear_timer');
    }, []);
    return create_view_element('button', { event_handlers: { click: () => (click_count += 1) } }, [String(tick_count)]);
  }, container_element).mount();
  const button_dom = container_element.childNodes[0];
  assert.equal(component.unmount(), true);
  assert.deepEqual(effect_logs, ['start_timer', 'clear_timer']);
  assert.equal(container_element.childNodes.length, 0);
  assert.equal(find_virtual_node(container_element), null);
  assert.equal(component.unmount(), false);
  assert.deepEqual(effect_logs, ['start_timer', 'clear_timer'], '정리 함수 중복 실행 없음');

  container_element.appendChild(button_dom);
  click(button_dom);
  assert.equal(click_count, 0, '위임 리스너가 남아 있지 않음');
  assert.equal(set_tick_count(5), false);
  await wait_for_scheduled_update();
  assert.equal(component.render_count, 1);
  assert.deepEqual(component.update(), []);
  assert.equal(new FunctionComponent(counter_root, create_container().container_element).unmount(), false);
});

test('EC-014 effect가 함수가 아닌 값을 돌려주거나 Hook 인자가 잘못되면 TypeError', () => {
  const async_effect_component = new FunctionComponent(() => {
    use_effect(async () => {});
    return 'text';
  }, create_container().container_element);
  assert.throws(() => async_effect_component.mount(), /정리 함수나 undefined/);

  for (const invalid_hook_call of [
    () => use_effect('effect'),
    () => use_effect(() => {}, 'dependency'),
    () => use_memo(null, []),
    () => use_memo(() => 1, { length: 0 }),
  ]) {
    const component = new FunctionComponent(() => {
      invalid_hook_call();
      return 'text';
    }, create_container().container_element);
    assert.throws(() => component.mount(), TypeError);
  }
});

test('EC-015 effect 안의 State 변경은 다음 update를 예약하고 의존성으로 반복이 멈춘다', async () => {
  const { container_element } = create_container();
  const component = new FunctionComponent(() => {
    const [loaded_text, set_loaded_text] = use_state('loading');
    use_effect(() => {
      set_loaded_text('loaded');
    }, []);
    return create_view_element('p', null, [loaded_text]);
  }, container_element).mount();
  assert.equal(container_element.textContent, 'loading');
  await wait_for_scheduled_update();
  await wait_for_scheduled_update();
  assert.equal(container_element.textContent, 'loaded');
  assert.equal(component.render_count, 2);
});

test('EC-016 use_memo는 의존성이 바뀔 때만 다시 계산한다 (NaN 의존성 포함)', async () => {
  const { container_element } = create_container();
  let compute_count = 0;
  let set_filter_text = null;
  let set_unrelated_flag = null;
  new FunctionComponent(() => {
    const [filter_text, set_filter] = use_state('a');
    const [unrelated_flag, set_unrelated] = use_state(false);
    set_filter_text = set_filter;
    set_unrelated_flag = set_unrelated;
    const filtered_names = use_memo(() => {
      compute_count += 1;
      return ['apple', 'banana', 'avocado'].filter((fruit_name) => fruit_name.startsWith(filter_text));
    }, [filter_text, Number.NaN]);
    return create_view_element('p', { attributes: { 'data-flag': unrelated_flag } }, [filtered_names.join(',')]);
  }, container_element).mount();
  assert.equal(container_element.textContent, 'apple,avocado');
  set_unrelated_flag(true);
  await wait_for_scheduled_update();
  assert.equal(compute_count, 1);
  set_filter_text('b');
  await wait_for_scheduled_update();
  assert.equal(compute_count, 2);
  assert.equal(container_element.textContent, 'banana');
});

test('EC-017 이벤트 위임: 자식 노드 클릭도 핸들러에 닿고, update 뒤에는 최신 핸들러가 불린다', async () => {
  const { container_element } = create_container();
  const handled_counts = [];
  new FunctionComponent(() => {
    const [count, set_count] = use_state(0);
    return create_view_element(
      'button',
      {
        event_handlers: {
          click: (dispatched_event, handled_dom_node) => {
            handled_counts.push({ count, is_button: handled_dom_node.localName === 'button' });
            set_count(count + 1);
          },
        },
      },
      [create_view_element('span', null, ['아이콘'])],
    );
  }, container_element).mount();
  const icon_dom = container_element.childNodes[0].childNodes[0];
  click(icon_dom);
  await wait_for_scheduled_update();
  click(icon_dom);
  await wait_for_scheduled_update();
  assert.deepEqual(handled_counts, [
    { count: 0, is_button: true },
    { count: 1, is_button: true },
  ]);
  assert.equal(container_element.textContent, '아이콘');
});

test('EC-018 stopPropagation()을 부르면 바깥 핸들러는 불리지 않는다', () => {
  const { container_element } = create_container();
  const handler_logs = [];
  new FunctionComponent(
    () =>
      create_view_element('li', { event_handlers: { click: () => handler_logs.push('row') } }, [
        create_view_element(
          'button',
          {
            event_handlers: {
              click: (dispatched_event) => {
                handler_logs.push('delete');
                dispatched_event.stopPropagation();
              },
            },
          },
          ['삭제'],
        ),
        create_view_element('span', null, ['항목']),
      ]),
    container_element,
  ).mount();
  const row_dom = container_element.childNodes[0];
  click(row_dom.childNodes[0]);
  click(row_dom.childNodes[1]);
  assert.deepEqual(handler_logs, ['delete', 'row']);
});

test('EC-019 버블링하지 않는 이벤트(focus)는 capture 단계로 받아 대상의 핸들러만 부른다', () => {
  const { container_element } = create_container();
  const handler_logs = [];
  new FunctionComponent(
    () =>
      create_view_element('form', { event_handlers: { focus: () => handler_logs.push('form') } }, [
        create_view_element('input', { event_handlers: { focus: () => handler_logs.push('input') } }),
      ]),
    container_element,
  ).mount();
  const input_dom = container_element.childNodes[0].childNodes[0];
  input_dom.dispatchEvent(new fake_event('focus', { bubbles: false }));
  assert.deepEqual(handler_logs, ['input']);
});

test('EC-020 update 뒤에도 입력 중인 input DOM과 property 값이 유지된다', async () => {
  const { container_element } = create_container();
  new FunctionComponent(() => {
    const [typed_text, set_typed_text] = use_state('');
    return create_view_element('label', null, [
      create_view_element('input', {
        attributes: { id: 'memo_input' },
        event_handlers: { input: (dispatched_event) => set_typed_text(dispatched_event.target.value) },
      }),
      create_view_element('span', null, [`입력: ${typed_text}`]),
    ]);
  }, container_element).mount();
  const input_dom = container_element.childNodes[0].childNodes[0];
  input_dom.value = '안녕';
  input_dom.dispatchEvent(new fake_event('input', { bubbles: true }));
  await wait_for_scheduled_update();
  assert.equal(container_element.childNodes[0].childNodes[0], input_dom);
  assert.equal(input_dom.value, '안녕');
  assert.equal(container_element.textContent, '입력: 안녕');
});

test('EC-021 update 중 렌더 함수가 실패하면 이전 화면과 effect가 그대로이고 다음 update는 정상이다', () => {
  const { container_element } = create_container();
  let should_fail = false;
  let effect_count = 0;
  const component = new FunctionComponent(() => {
    use_effect(() => {
      effect_count += 1;
    });
    if (should_fail) throw new Error('렌더 실패');
    return create_view_element('p', null, ['정상']);
  }, container_element).mount();
  const paragraph_dom = container_element.childNodes[0];
  should_fail = true;
  assert.throws(() => component.update(), /렌더 실패/);
  assert.equal(effect_count, 1, '실패한 렌더링의 effect는 실행되지 않음');
  assert.equal(container_element.childNodes[0], paragraph_dom);
  should_fail = false;
  component.update();
  assert.equal(effect_count, 2);
  assert.equal(component.is_rendering, false);
});

test('EC-022 effect 안에서 unmount하면 그 effect의 정리 함수는 바로 실행되고 남은 effect는 실행되지 않는다', () => {
  const { container_element } = create_container();
  const effect_logs = [];
  let component = null;
  component = new FunctionComponent(() => {
    use_effect(() => {
      component.unmount();
      return () => effect_logs.push('cleanup_after_unmount');
    }, []);
    use_effect(() => {
      effect_logs.push('second_effect');
    }, []);
    return 'text';
  }, container_element);
  component.mount();
  assert.deepEqual(effect_logs, ['cleanup_after_unmount']);
  assert.equal(component.is_unmounted, true);
  assert.equal(container_element.childNodes.length, 0);
});

test('EC-023 정리 함수 하나가 실패해도 나머지 정리와 DOM 정리를 끝낸 뒤 오류를 던진다', () => {
  const { container_element } = create_container();
  const effect_logs = [];
  const component = new FunctionComponent(() => {
    use_effect(() => () => {
      throw new Error('정리 실패');
    }, []);
    use_effect(() => () => effect_logs.push('second_cleanup'), []);
    return 'text';
  }, container_element).mount();
  assert.throws(() => component.unmount(), /정리 실패/);
  assert.deepEqual(effect_logs, ['second_cleanup']);
  assert.equal(container_element.childNodes.length, 0);
  assert.equal(component.unmount(), false);
});

test('EC-024 렌더 함수가 undefined를 돌려주거나 같은 노드를 두 곳에 넣으면 TypeError', () => {
  assert.throws(() => new FunctionComponent(() => undefined, create_container().container_element).mount(), TypeError);
  const shared_node = create_view_element('hr');
  assert.throws(
    () => new FunctionComponent(() => [shared_node, shared_node], create_container().container_element).mount(),
    /두 곳/,
  );
  const empty_component = new FunctionComponent(() => null, create_container().container_element).mount();
  assert.equal(empty_component.container_element.childNodes.length, 0);
});

test('EC-025 use_memo로 다시 쓴 같은 하위 트리는 diff가 건너뛰고, 바뀌지 않은 화면은 DOM 변경 연산이 없다', async () => {
  const { container_element } = create_container();
  let set_counter = null;
  const component = new FunctionComponent(() => {
    const [counter, set_counter_state] = use_state(0);
    set_counter = set_counter_state;
    const static_header = use_memo(
      () => create_view_element('header', null, [create_view_element('h1', null, ['제목'])]),
      [],
    );
    return [static_header, create_view_element('p', null, [String(counter)])];
  }, container_element).mount();
  const header_dom = container_element.childNodes[0];
  set_counter(1);
  await wait_for_scheduled_update();
  const static_header_node = component.current_root.children[0];
  const operations = component.update();
  assert.deepEqual(select_dom_changing_operations(operations), []);
  assert.ok(operations.every((operation) => operation.old_node !== static_header_node), '같은 참조라 비교 자체를 건너뜀');
  assert.equal(container_element.childNodes[0], header_dom);
  assert.equal(find_virtual_node(header_dom), component.current_root.children[0]);
  assert.equal(container_element.textContent, '제목1');
});

test('EC-026 mount 전 update()는 오류이고, 직접 부른 update()는 예약된 update를 대신한다', async () => {
  const { container_element } = create_container();
  const component = new FunctionComponent(counter_root, container_element);
  assert.throws(() => component.update(), /mount\(\) 전/);
  component.mount();
  click(find_counter_parts(container_element).button_dom);
  component.update();
  assert.equal(component.render_count, 2);
  await wait_for_scheduled_update();
  assert.equal(component.render_count, 2, '예약된 update는 중복 실행되지 않음');
});

test('EC-027 핸들러가 사라지면 위임 리스너를 떼고, 새 이벤트가 생기면 붙인다', async () => {
  const { container_element } = create_container();
  const handler_logs = [];
  let set_is_editing = null;
  const component = new FunctionComponent(() => {
    const [is_editing, set_editing] = use_state(false);
    set_is_editing = set_editing;
    return create_view_element('input', {
      event_handlers: is_editing ? { input: () => handler_logs.push('input') } : { click: () => handler_logs.push('click') },
    });
  }, container_element).mount();
  assert.deepEqual([...component.listened_event_types.keys()], ['click']);
  set_is_editing(true);
  await wait_for_scheduled_update();
  assert.deepEqual([...component.listened_event_types.keys()], ['input']);
  const input_dom = container_element.childNodes[0];
  click(input_dom);
  input_dom.dispatchEvent(new fake_event('input', { bubbles: true }));
  assert.deepEqual(handler_logs, ['input']);
});

test('EC-028 SVG 자식 컴포넌트도 네임스페이스를 유지해 그린다', () => {
  const { container_element } = create_container();
  function progress_ring(props) {
    return create_view_element('svg', { namespace: svg_namespace_uri, attributes: { viewBox: '0 0 20 20' } }, [
      create_view_element('circle', { namespace: svg_namespace_uri, attributes: { r: props.radius } }),
    ]);
  }
  new FunctionComponent(() => render_child_component(progress_ring, { radius: 8 }), container_element).mount();
  const svg_dom = container_element.childNodes[0];
  assert.equal(svg_dom.namespaceURI, svg_namespace_uri);
  assert.equal(svg_dom.getAttribute('viewBox'), '0 0 20 20');
  assert.equal(svg_dom.childNodes[0].getAttribute('r'), '8');
});

test('EC-029 key(id)가 있는 1000개 목록을 뒤집어도 DOM 노드를 재사용한다', async () => {
  const { container_element } = create_container();
  let set_item_ids = null;
  const initial_ids = Array.from({ length: 1000 }, (unused_entry, index) => `item_${index}`);
  new FunctionComponent(() => {
    const [item_ids, set_ids] = use_state(initial_ids);
    set_item_ids = set_ids;
    return create_view_element(
      'ul',
      null,
      item_ids.map((item_id) => create_view_element('li', { attributes: { id: item_id } }, [item_id])),
    );
  }, container_element).mount();
  const list_dom = container_element.childNodes[0];
  const dom_by_id = new Map(list_dom.childNodes.map((item_dom) => [item_dom.getAttribute('id'), item_dom]));
  set_item_ids([...initial_ids].reverse());
  await wait_for_scheduled_update();
  assert.equal(list_dom.childNodes[0].getAttribute('id'), 'item_999');
  assert.ok(list_dom.childNodes.every((item_dom) => dom_by_id.get(item_dom.getAttribute('id')) === item_dom));
});

test('EC-030 대역 확인: dispatchEvent는 capture → target → bubble 순서이고 전파 중 제거된 리스너는 불리지 않는다', () => {
  const owner_document = new fake_document();
  const outer_dom = owner_document.createElement('div');
  const inner_dom = owner_document.createElement('span');
  outer_dom.appendChild(inner_dom);
  const listener_logs = [];
  const removed_listener = () => listener_logs.push('removed');
  outer_dom.addEventListener('click', () => listener_logs.push('outer_capture'), true);
  outer_dom.addEventListener('click', () => listener_logs.push('outer_bubble'));
  inner_dom.addEventListener('click', () => {
    listener_logs.push('inner_target');
    inner_dom.removeEventListener('click', removed_listener);
  });
  inner_dom.addEventListener('click', removed_listener);
  inner_dom.dispatchEvent(new fake_event('click', { bubbles: true }));
  assert.deepEqual(listener_logs, ['outer_capture', 'inner_target', 'outer_bubble']);

  listener_logs.length = 0;
  inner_dom.dispatchEvent(new fake_event('click', { bubbles: false }));
  assert.deepEqual(listener_logs, ['outer_capture', 'inner_target']);
});

test('EC-031 effect 하나가 실패하면 뒤의 effect는 이번에 실행되지 않고 다음 update에서 실행된다', () => {
  const { container_element } = create_container();
  const effect_logs = [];
  let should_fail = true;
  const component = new FunctionComponent(() => {
    use_effect(() => {
      effect_logs.push('failing_effect');
      if (should_fail) throw new Error('effect 실패');
    }, []);
    use_effect(() => {
      effect_logs.push('second_effect');
    }, []);
    return 'text';
  }, container_element);
  assert.throws(() => component.mount(), /effect 실패/);
  assert.equal(component.is_mounted, true, 'DOM은 이미 그려졌으므로 mount 상태');
  assert.deepEqual(effect_logs, ['failing_effect']);
  should_fail = false;
  component.update();
  assert.deepEqual(effect_logs, ['failing_effect', 'second_effect'], '실패한 effect는 의존성이 저장되어 다시 실행되지 않음');
});

test('EC-036 on_rendered는 mount와 update의 patch 직후 연산과 바뀐 DOM을 알려 주고, 잘못된 옵션은 TypeError', async () => {
  const { container_element } = create_container();
  const render_reports = [];
  const effect_logs = [];
  new FunctionComponent(
    () => {
      const [count, set_count] = use_state(0);
      use_effect(() => {
        effect_logs.push(`effect_after_report_${render_reports.length}`);
      });
      return create_view_element('button', { event_handlers: { click: () => set_count(count + 1) } }, [String(count)]);
    },
    container_element,
    {},
    { on_rendered: (render_report) => render_reports.push(render_report) },
  ).mount();
  click(container_element.childNodes[0]);
  await wait_for_scheduled_update();
  assert.deepEqual(render_reports.map((render_report) => render_report.render_count), [1, 2]);
  assert.deepEqual(render_reports[0].operations, []);
  assert.deepEqual(select_dom_changing_operations(render_reports[1].operations).map((operation) => operation.kind), ['TEXT']);
  assert.equal(render_reports[1].changed_records[0].dom_node, container_element.childNodes[0].childNodes[0]);
  assert.deepEqual(effect_logs, ['effect_after_report_1', 'effect_after_report_2'], 'effect보다 먼저 불림');
  assert.throws(() => new FunctionComponent(counter_root, container_element, {}, { on_rendered: 'log' }), TypeError);
  assert.throws(() => new FunctionComponent(counter_root, container_element, {}, null), TypeError);
});
