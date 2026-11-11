// FunctionComponent: 루트 함수형 컴포넌트를 감싸 hooks 배열, mount(), update()를 제공한다. (phase2.md)
//
// - State와 Hook은 루트 컴포넌트에서만 쓴다. 자식 컴포넌트는 render_child_component로 부르는 순수 함수이며,
//   그 안에서 Hook을 부르면 오류를 낸다(Lifting State Up).
// - update() 순서 (plan.md 6절): hook 위치 0부터 → 렌더 함수 실행 → diff → patch(북마크 갱신 포함) → effect 실행.
// - State가 바뀌면 queueMicrotask로 update()를 한 번 예약한다. 같은 작업 안의 여러 변경은 한 번의 update로 묶인다.
// - 이벤트는 컨테이너 하나에 위임 리스너를 붙이고, 이벤트 대상 DOM → __virtual_node → 핸들러 순서로 찾는다.
//   patch가 BIND로 북마크를 최신 노드로 옮기므로 항상 마지막 렌더링의 핸들러가 호출된다.

import { diff_trees } from './diff.js';
import {
  create_bookmark_registry,
  mount_tree,
  unmount_tree,
  apply_operations,
  find_virtual_node,
} from './patch.js';
import { create_view_root, collect_event_types, find_event_handler } from './view_builder.js';
import { validate_dependencies, are_dependencies_changed, freeze_dependencies } from './hook_dependencies.js';

export const hook_kinds = Object.freeze({ state: 'state', effect: 'effect', memo: 'memo' });

// DOM 표준에서 bubbles가 false로 만들어지는 이벤트. 컨테이너에서 받으려면 capture 단계에 리스너를 붙여야 한다.
const non_bubbling_event_types = new Set([
  'focus', 'blur', 'load', 'unload', 'error', 'abort', 'scroll', 'scrollend', 'toggle', 'invalid', 'cancel', 'close',
  'mouseenter', 'mouseleave', 'pointerenter', 'pointerleave', 'loadstart', 'loadend', 'progress',
]);

// 지금 렌더링 중인 루트 컴포넌트와 hook 위치. 렌더링은 동기로 끝나므로 전역 하나로 충분하고,
// 렌더 함수 안에서 다른 컴포넌트를 mount해도 끝나면 이전 값으로 되돌린다.
let active_render_context = null;

function claim_hook_slot(hook_kind, hook_name) {
  const render_context = active_render_context;
  if (render_context === null) {
    throw new Error(`${hook_name}은 FunctionComponent가 렌더링하는 중에만 쓸 수 있습니다`);
  }
  if (render_context.child_depth > 0) {
    throw new Error(`${hook_name}은 최상위(루트) 컴포넌트에서만 쓸 수 있습니다. 자식 컴포넌트는 props만 사용합니다`);
  }
  if (render_context.is_inside_hook_callback) {
    throw new Error(`${hook_name}을 다른 Hook의 콜백 안에서 부를 수 없습니다`);
  }
  const owner_component = render_context.component;
  const hook_index = render_context.hook_index;
  render_context.hook_index += 1;
  const existing_slot = owner_component.hooks[hook_index];
  if (existing_slot === undefined) {
    if (owner_component.is_mounted) {
      throw new Error('렌더링마다 Hook의 호출 순서와 개수가 같아야 합니다 (조건문, 반복문 안에서 Hook을 부르지 마세요)');
    }
    return { owner_component, hook_index, existing_slot: null };
  }
  if (existing_slot.hook_kind !== hook_kind) {
    throw new Error(
      `${hook_index}번째 Hook이 ${existing_slot.hook_kind}에서 ${hook_kind}로 바뀌었습니다. 렌더링마다 Hook 호출 순서가 같아야 합니다`,
    );
  }
  return { owner_component, hook_index, existing_slot };
}

// 다른 Hook의 콜백(use_state 초기화 함수, use_memo 계산 함수) 안에서 Hook을 부르지 못하게 감싼다.
function run_hook_callback(hook_callback) {
  const render_context = active_render_context;
  render_context.is_inside_hook_callback = true;
  try {
    return hook_callback();
  } finally {
    render_context.is_inside_hook_callback = false;
  }
}

export function use_state(initial_state) {
  const { owner_component, hook_index, existing_slot } = claim_hook_slot(hook_kinds.state, 'use_state');
  if (existing_slot !== null) return Object.freeze([existing_slot.current_state, existing_slot.set_state]);
  const state_slot = {
    hook_kind: hook_kinds.state,
    current_state: typeof initial_state === 'function' ? run_hook_callback(initial_state) : initial_state,
    set_state: null,
  };
  // set_state는 slot마다 한 번만 만든다. 렌더링이 바뀌어도 같은 함수라 props나 의존성으로 넘겨도 안전하다.
  state_slot.set_state = (next_state_or_updater) => owner_component.change_state(state_slot, next_state_or_updater);
  owner_component.hooks[hook_index] = state_slot;
  return Object.freeze([state_slot.current_state, state_slot.set_state]);
}

export function use_effect(effect_callback, dependencies) {
  if (typeof effect_callback !== 'function') throw new TypeError('use_effect에는 함수가 필요합니다');
  validate_dependencies(dependencies, 'use_effect');
  const { owner_component, hook_index, existing_slot } = claim_hook_slot(hook_kinds.effect, 'use_effect');
  const effect_slot = existing_slot ?? { hook_kind: hook_kinds.effect, dependencies: null, cleanup_callback: null };
  owner_component.hooks[hook_index] = effect_slot;
  // 의존성은 effect가 실제로 실행될 때 저장한다. 렌더링이 중간에 실패하면 다음 렌더링에서 다시 실행 대상이 된다.
  if (are_dependencies_changed(effect_slot.dependencies, dependencies)) {
    owner_component.pending_effects.push({
      effect_slot,
      effect_callback,
      next_dependencies: freeze_dependencies(dependencies),
    });
  }
}

export function use_memo(compute_callback, dependencies) {
  if (typeof compute_callback !== 'function') throw new TypeError('use_memo에는 함수가 필요합니다');
  validate_dependencies(dependencies, 'use_memo');
  const { owner_component, hook_index, existing_slot } = claim_hook_slot(hook_kinds.memo, 'use_memo');
  if (existing_slot !== null && !are_dependencies_changed(existing_slot.dependencies, dependencies)) {
    return existing_slot.computed_output;
  }
  const computed_output = run_hook_callback(compute_callback);
  const memo_slot = existing_slot ?? { hook_kind: hook_kinds.memo, dependencies: null, computed_output: undefined };
  memo_slot.dependencies = freeze_dependencies(dependencies);
  memo_slot.computed_output = computed_output;
  owner_component.hooks[hook_index] = memo_slot;
  return computed_output;
}

// 자식 컴포넌트를 부른다. 자식은 State 없이 props만 받는 순수 함수다.
// props는 얕게 복사해 동결하므로 자식이 props를 고칠 수 없고, 자식 안의 Hook 호출은 오류가 된다.
export function render_child_component(child_component, child_props = {}) {
  if (typeof child_component !== 'function') throw new TypeError('자식 컴포넌트는 함수여야 합니다');
  if (child_props === null || typeof child_props !== 'object' || Array.isArray(child_props)) {
    throw new TypeError('props는 객체여야 합니다');
  }
  const frozen_props = Object.isFrozen(child_props) ? child_props : Object.freeze({ ...child_props });
  const render_context = active_render_context;
  if (render_context !== null) render_context.child_depth += 1;
  try {
    const child_output = child_component(frozen_props);
    if (child_output === undefined) {
      throw new TypeError(`자식 컴포넌트 ${child_component.name || '(이름 없음)'}가 값을 돌려주지 않았습니다`);
    }
    return child_output;
  } finally {
    if (render_context !== null) render_context.child_depth -= 1;
  }
}

function require_container_element(container_element) {
  if (
    container_element === null ||
    container_element === undefined ||
    container_element.nodeType !== 1 ||
    typeof container_element.addEventListener !== 'function'
  ) {
    throw new TypeError('FunctionComponent에는 컨테이너 요소가 필요합니다');
  }
  return container_element;
}

export class FunctionComponent {
  // component_options.on_rendered(render_report): mount와 update가 patch를 마친 직후(effect 전)에 불린다.
  // render_report = { render_count, operations, changed_records }. State 변경으로 microtask에서 일어난 update는
  // 돌려받을 호출자가 없으므로, 화면 쪽(하이라이트, 변경 기록)은 이 콜백으로 무엇이 바뀌었는지 받는다.
  constructor(render_function, container_element, root_props = {}, component_options = {}) {
    if (typeof render_function !== 'function') throw new TypeError('FunctionComponent에는 렌더 함수가 필요합니다');
    if (root_props === null || typeof root_props !== 'object' || Array.isArray(root_props)) {
      throw new TypeError('props는 객체여야 합니다');
    }
    if (component_options === null || typeof component_options !== 'object') {
      throw new TypeError('component_options는 객체여야 합니다');
    }
    const on_rendered = component_options.on_rendered ?? null;
    if (on_rendered !== null && typeof on_rendered !== 'function') throw new TypeError('on_rendered는 함수여야 합니다');
    this.on_rendered = on_rendered;
    this.render_function = render_function;
    this.container_element = require_container_element(container_element);
    this.root_props = Object.isFrozen(root_props) ? root_props : Object.freeze({ ...root_props });
    this.hooks = [];
    this.bookmark_registry = create_bookmark_registry();
    this.current_root = null;
    this.pending_effects = [];
    this.is_mounted = false;
    this.is_unmounted = false;
    this.is_rendering = false;
    this.has_pending_update = false;
    this.is_update_queued = false;
    this.render_count = 0;
    this.listened_event_types = new Map();
    this.handle_delegated_event = (dispatched_event) => this.dispatch_to_event_handlers(dispatched_event);
  }

  // 처음 렌더링. 컨테이너의 기존 내용은 비우고 그린다.
  mount() {
    if (this.is_unmounted) throw new Error('unmount된 컴포넌트는 다시 mount할 수 없습니다. 새로 만드세요');
    if (this.is_mounted) throw new Error('이미 mount된 컴포넌트입니다');
    if (this.is_rendering) throw new Error('렌더링 중에는 mount()를 부를 수 없습니다');
    this.hooks.length = 0;
    const next_root = this.render_tree();
    mount_tree(this.bookmark_registry, this.container_element, next_root, this.container_element.ownerDocument);
    this.current_root = next_root;
    this.is_mounted = true;
    this.synchronize_event_listeners(next_root);
    this.report_render([], []);
    this.run_pending_effects();
    return this;
  }

  // State 변경 후 다시 렌더링. 바뀐 부분만 diff → patch로 반영하고, 적용한 연산 목록을 돌려준다.
  update() {
    if (this.is_rendering) throw new Error('렌더링 중에는 update()를 부를 수 없습니다');
    if (this.is_unmounted) return [];
    if (!this.is_mounted) throw new Error('mount() 전에는 update()를 부를 수 없습니다');
    this.has_pending_update = false;
    const next_root = this.render_tree();
    const operations = diff_trees(this.current_root, next_root);
    const { changed_records } = apply_operations(this.bookmark_registry, operations, this.container_element.ownerDocument);
    this.current_root = next_root;
    this.synchronize_event_listeners(next_root);
    this.report_render(operations, changed_records);
    this.run_pending_effects();
    return operations;
  }

  // effect 정리 함수 실행, 위임 리스너 제거, DOM과 북마크 정리. 반복 호출하면 false를 돌려주고 아무것도 하지 않는다.
  unmount() {
    if (this.is_rendering) throw new Error('렌더링 중에는 unmount()를 부를 수 없습니다');
    if (!this.is_mounted) return false;
    this.is_mounted = false;
    this.is_unmounted = true;
    this.pending_effects = [];
    for (const [event_type, is_capture] of this.listened_event_types) {
      this.container_element.removeEventListener(event_type, this.handle_delegated_event, is_capture);
    }
    this.listened_event_types.clear();
    // 정리 함수 하나가 실패해도 나머지 정리와 DOM 정리는 끝낸 뒤 첫 오류를 다시 던진다.
    let first_cleanup_error = null;
    for (const hook_slot of this.hooks) {
      if (hook_slot?.hook_kind !== hook_kinds.effect || hook_slot.cleanup_callback === null) continue;
      const cleanup_callback = hook_slot.cleanup_callback;
      hook_slot.cleanup_callback = null;
      try {
        cleanup_callback();
      } catch (cleanup_error) {
        first_cleanup_error ??= cleanup_error;
      }
    }
    unmount_tree(this.bookmark_registry, this.container_element);
    this.current_root = null;
    if (first_cleanup_error !== null) throw first_cleanup_error;
    return true;
  }

  render_tree() {
    const previous_render_context = active_render_context;
    active_render_context = { component: this, hook_index: 0, child_depth: 0, is_inside_hook_callback: false };
    this.is_rendering = true;
    this.pending_effects = [];
    try {
      const view_output = this.render_function(this.root_props);
      if (view_output === undefined) throw new TypeError('렌더 함수가 값을 돌려주지 않았습니다');
      if (this.is_mounted && active_render_context.hook_index !== this.hooks.length) {
        throw new Error('렌더링마다 Hook의 호출 순서와 개수가 같아야 합니다 (조건문, 반복문 안에서 Hook을 부르지 마세요)');
      }
      const next_root = create_view_root(view_output);
      this.render_count += 1;
      return next_root;
    } catch (render_error) {
      this.pending_effects = [];
      throw render_error;
    } finally {
      active_render_context = previous_render_context;
      this.is_rendering = false;
    }
  }

  report_render(operations, changed_records) {
    if (this.on_rendered === null) return;
    this.on_rendered(Object.freeze({ render_count: this.render_count, operations, changed_records }));
  }

  change_state(state_slot, next_state_or_updater) {
    if (this.is_unmounted) return false;
    if (this.is_rendering) {
      throw new Error('렌더링 중에는 State를 바꿀 수 없습니다. 이벤트 핸들러나 use_effect에서 바꾸세요');
    }
    const next_state =
      typeof next_state_or_updater === 'function'
        ? next_state_or_updater(state_slot.current_state)
        : next_state_or_updater;
    if (Object.is(next_state, state_slot.current_state)) return false;
    state_slot.current_state = next_state;
    this.schedule_update();
    return true;
  }

  schedule_update() {
    this.has_pending_update = true;
    if (this.is_update_queued) return;
    this.is_update_queued = true;
    queueMicrotask(() => {
      this.is_update_queued = false;
      // 그사이 update()를 직접 불렀거나 unmount됐으면 다시 그리지 않는다.
      if (this.has_pending_update && this.is_mounted) this.update();
    });
  }

  // 정리 함수를 모두 먼저 실행한 뒤 effect를 hook 순서대로 실행한다.
  run_pending_effects() {
    const pending_effects = this.pending_effects;
    this.pending_effects = [];
    for (const { effect_slot } of pending_effects) {
      const cleanup_callback = effect_slot.cleanup_callback;
      effect_slot.cleanup_callback = null;
      if (cleanup_callback !== null) cleanup_callback();
    }
    for (const { effect_slot, effect_callback, next_dependencies } of pending_effects) {
      if (this.is_unmounted) break;
      effect_slot.dependencies = next_dependencies;
      const returned_cleanup = effect_callback();
      if (returned_cleanup !== undefined && returned_cleanup !== null && typeof returned_cleanup !== 'function') {
        throw new TypeError('use_effect 콜백은 정리 함수나 undefined만 돌려줄 수 있습니다 (async 함수는 쓸 수 없습니다)');
      }
      if (typeof returned_cleanup !== 'function') continue;
      // effect 안에서 unmount됐다면 정리 함수를 저장할 곳이 없으므로 바로 실행한다.
      if (this.is_unmounted) returned_cleanup();
      else effect_slot.cleanup_callback = returned_cleanup;
    }
  }

  synchronize_event_listeners(root_node) {
    const event_types = collect_event_types(root_node);
    for (const [event_type, is_capture] of this.listened_event_types) {
      if (event_types.has(event_type)) continue;
      this.container_element.removeEventListener(event_type, this.handle_delegated_event, is_capture);
      this.listened_event_types.delete(event_type);
    }
    for (const event_type of event_types) {
      if (this.listened_event_types.has(event_type)) continue;
      const is_capture = non_bubbling_event_types.has(event_type);
      this.container_element.addEventListener(event_type, this.handle_delegated_event, is_capture);
      this.listened_event_types.set(event_type, is_capture);
    }
  }

  // 이벤트 대상부터 컨테이너 직전까지 거슬러 오르며 핸들러를 부른다(버블링과 같은 순서).
  // bubbles가 false인 이벤트는 대상의 핸들러만 부른다. stopPropagation()을 부르면 거기서 멈춘다.
  dispatch_to_event_handlers(dispatched_event) {
    if (!this.is_mounted) return;
    // 핸들러가 DOM을 직접 바꿔도 이번 전파 경로가 흔들리지 않도록 먼저 경로를 만든다(DOM 표준 dispatch와 같음).
    const propagation_path = [];
    let current_dom_node = dispatched_event.target;
    while (current_dom_node && current_dom_node !== this.container_element) {
      propagation_path.push(current_dom_node);
      current_dom_node = current_dom_node.parentNode;
    }
    if (current_dom_node !== this.container_element) return;
    const handled_path = dispatched_event.bubbles ? propagation_path : propagation_path.slice(0, 1);
    for (const handled_dom_node of handled_path) {
      const event_handler = find_event_handler(find_virtual_node(handled_dom_node), dispatched_event.type);
      if (event_handler === null) continue;
      event_handler(dispatched_event, handled_dom_node);
      if (dispatched_event.cancelBubble || !this.is_mounted) break;
    }
  }
}
