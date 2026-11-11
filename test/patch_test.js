import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_element_node as element_node,
  create_text_node as text_node,
  create_comment_node as comment_node,
  create_fragment_node as fragment_node,
  create_root_from_container,
  is_same_tree,
  is_text_like_node,
} from '../src/virtual_node.js';
import { diff_trees, share_unchanged_nodes } from '../src/diff.js';
import {
  create_bookmark_registry,
  mount_tree,
  apply_operations,
  find_dom_node,
  find_virtual_node,
  create_dom_tree,
  unmount_tree,
} from '../src/patch.js';
import {
  fake_document,
  build_element,
  svg_namespace_uri,
  xlink_namespace_uri,
  xml_namespace_uri,
  xmlns_namespace_uri,
} from './support/fake_dom.js';

function create_environment(initial_tree) {
  const owner_document = new fake_document();
  const container_element = owner_document.createElement('div');
  const bookmark_registry = create_bookmark_registry();
  mount_tree(bookmark_registry, container_element, initial_tree, owner_document);
  return { owner_document, container_element, bookmark_registry };
}

function patch_to(environment, old_tree, new_tree) {
  const operations = diff_trees(old_tree, new_tree);
  return apply_operations(environment.bookmark_registry, operations, environment.owner_document);
}

// 두 방향 북마크가 현재 트리 전체에서 서로를 가리키는지 확인한다.
function assert_bookmarks_synchronized(bookmark_registry, root_node, container_element) {
  assert.equal(find_dom_node(bookmark_registry, root_node), container_element);
  const pending_pairs = root_node.children.map((child_node, index) => [child_node, container_element.childNodes[index]]);
  assert.equal(container_element.childNodes.length, root_node.children.length);
  while (pending_pairs.length > 0) {
    const [virtual_node, dom_node] = pending_pairs.pop();
    assert.equal(find_dom_node(bookmark_registry, virtual_node), dom_node);
    assert.equal(find_virtual_node(dom_node), virtual_node);
    if (!is_text_like_node(virtual_node)) {
      assert.equal(dom_node.childNodes.length, virtual_node.children.length);
      virtual_node.children.forEach((child_node, index) => pending_pairs.push([child_node, dom_node.childNodes[index]]));
    }
  }
}

function list_tree(item_keys) {
  return fragment_node([
    element_node('ul', { id: 'todo_list' }, item_keys.map((item_key) => element_node('li', { id: item_key }, [text_node(item_key)]))),
    element_node('input', { id: 'memo_input' }),
  ]);
}

test('EC-001 mount_tree는 컨테이너와 #fragment 루트가 아니면 TypeError', () => {
  const owner_document = new fake_document();
  const bookmark_registry = create_bookmark_registry();
  assert.throws(() => mount_tree(bookmark_registry, null, fragment_node(), owner_document), TypeError);
  assert.throws(
    () => mount_tree(bookmark_registry, owner_document.createElement('div'), element_node('p'), owner_document),
    TypeError,
  );
});

test('EC-002 document가 없는 환경이면 TypeError', () => {
  const bookmark_registry = create_bookmark_registry();
  assert.throws(() => create_dom_tree(bookmark_registry, element_node('p'), undefined), TypeError);
  const mounted_tree = fragment_node();
  const environment = create_environment(mounted_tree);
  const operations = diff_trees(mounted_tree, fragment_node([element_node('p')]));
  assert.throws(() => apply_operations(environment.bookmark_registry, operations, null), TypeError);
});

test('EC-003 mount_tree는 기존 내용을 비우고 그리며 양방향 북마크를 연결한다', () => {
  const owner_document = new fake_document();
  const container_element = owner_document.createElement('div');
  container_element.appendChild(owner_document.createTextNode('이전 내용'));
  const bookmark_registry = create_bookmark_registry();
  const tree = list_tree(['a', 'b']);
  mount_tree(bookmark_registry, container_element, tree, owner_document);
  assert.ok(is_same_tree(create_root_from_container(container_element), tree));
  assert_bookmarks_synchronized(bookmark_registry, tree, container_element);
});

test('EC-004 텍스트 변경은 같은 DOM 텍스트 노드를 수정한다', () => {
  const old_tree = list_tree(['a', 'b']);
  const environment = create_environment(old_tree);
  const original_text_dom = environment.container_element.childNodes[0].childNodes[0].childNodes[0];
  const new_tree = fragment_node([
    element_node('ul', { id: 'todo_list' }, [
      element_node('li', { id: 'a' }, [text_node('A!')]),
      element_node('li', { id: 'b' }, [text_node('b')]),
    ]),
    element_node('input', { id: 'memo_input' }),
  ]);
  const { changed_dom_nodes } = patch_to(environment, old_tree, new_tree);
  assert.equal(environment.container_element.childNodes[0].childNodes[0].childNodes[0], original_text_dom);
  assert.equal(original_text_dom.data, 'A!');
  assert.deepEqual(changed_dom_nodes, [original_text_dom]);
  assert_bookmarks_synchronized(environment.bookmark_registry, new_tree, environment.container_element);
});

test('EC-005 변경과 무관한 input DOM은 교체되지 않아 property 값이 보존된다', () => {
  const old_tree = list_tree(['a']);
  const environment = create_environment(old_tree);
  const input_dom = environment.container_element.childNodes[1];
  input_dom.value = '사용자 입력';
  patch_to(environment, old_tree, list_tree(['z', 'a']));
  assert.equal(environment.container_element.childNodes[1], input_dom);
  assert.equal(input_dom.value, '사용자 입력');
});

test('EC-006 key가 있는 항목 이동은 DOM 노드를 재사용한다', () => {
  const old_tree = list_tree(['a', 'b', 'c']);
  const environment = create_environment(old_tree);
  const list_dom = environment.container_element.childNodes[0];
  const [first_dom, second_dom, third_dom] = list_dom.childNodes;
  const new_tree = list_tree(['c', 'a', 'b']);
  patch_to(environment, old_tree, new_tree);
  assert.deepEqual([...list_dom.childNodes], [third_dom, first_dom, second_dom]);
  assert_bookmarks_synchronized(environment.bookmark_registry, new_tree, environment.container_element);
});

test('EC-007 제거된 하위 트리의 북마크는 양쪽 모두 해제된다', () => {
  const old_tree = list_tree(['a', 'b']);
  const environment = create_environment(old_tree);
  const removed_item_node = old_tree.children[0].children[1];
  const removed_item_dom = find_dom_node(environment.bookmark_registry, removed_item_node);
  const removed_text_dom = removed_item_dom.childNodes[0];
  patch_to(environment, old_tree, list_tree(['a']));
  assert.equal(removed_item_dom.parentNode, null);
  assert.throws(() => find_dom_node(environment.bookmark_registry, removed_item_node), Error);
  assert.throws(() => find_dom_node(environment.bookmark_registry, removed_item_node.children[0]), Error);
  assert.equal(find_virtual_node(removed_item_dom), null);
  assert.equal(find_virtual_node(removed_text_dom), null);
});

test('EC-008 알 수 없는 연산과 북마크 없는 노드는 오류이며 DOM을 바꾸기 전에 멈춘다', () => {
  const old_tree = list_tree(['a']);
  const environment = create_environment(old_tree);
  assert.throws(() => apply_operations(environment.bookmark_registry, [{ kind: 'UNKNOWN' }], environment.owner_document), TypeError);
  assert.throws(() => apply_operations(environment.bookmark_registry, null, environment.owner_document), TypeError);
  const unbound_node = element_node('p');
  const list_dom = environment.container_element.childNodes[0];
  const operations = [
    { kind: 'ADD', parent_node: old_tree.children[0], new_node: element_node('li'), index: 0 },
    { kind: 'REMOVE', parent_node: old_tree, old_node: unbound_node },
  ];
  assert.throws(() => apply_operations(environment.bookmark_registry, operations, environment.owner_document), /북마크/);
  assert.equal(list_dom.childNodes.length, 1);
});

test('EC-009 같은 연산 목록을 두 번 적용(중복 해제)하면 오류가 나고 DOM은 그대로다', () => {
  const old_tree = list_tree(['a', 'b']);
  const environment = create_environment(old_tree);
  const operations = diff_trees(old_tree, list_tree(['a']));
  apply_operations(environment.bookmark_registry, operations, environment.owner_document);
  const list_dom = environment.container_element.childNodes[0];
  assert.throws(() => apply_operations(environment.bookmark_registry, operations, environment.owner_document), Error);
  assert.equal(list_dom.childNodes.length, 1);
});

test('EC-010 SVG 노드는 createElementNS로 만든다', () => {
  const tree = fragment_node([
    element_node('svg', { viewBox: '0 0 10 10' }, [element_node('circle', { r: '4' }, [], svg_namespace_uri)], svg_namespace_uri),
  ]);
  const environment = create_environment(tree);
  const svg_dom = environment.container_element.childNodes[0];
  assert.equal(svg_dom.namespaceURI, svg_namespace_uri);
  assert.equal(svg_dom.childNodes[0].namespaceURI, svg_namespace_uri);
  assert.equal(svg_dom.getAttribute('viewBox'), '0 0 10 10');
});

test('EC-011 같은 Virtual DOM 객체가 다른 부모로 옮겨져도(ADD가 REMOVE보다 먼저) 원래 DOM을 지운다', () => {
  const shared_text = text_node('공유');
  const old_tree = fragment_node([element_node('div', { id: 'first' }), element_node('div', { id: 'second' }, [shared_text])]);
  const new_tree = fragment_node([element_node('div', { id: 'first' }, [shared_text]), element_node('div', { id: 'second' })]);
  const environment = create_environment(old_tree);
  patch_to(environment, old_tree, new_tree);
  const [first_dom, second_dom] = environment.container_element.childNodes;
  assert.equal(first_dom.childNodes.length, 1);
  assert.equal(second_dom.childNodes.length, 0);
  assert.equal(find_dom_node(environment.bookmark_registry, shared_text), first_dom.childNodes[0]);
  assert_bookmarks_synchronized(environment.bookmark_registry, new_tree, environment.container_element);
});

test('EC-012 attribute와 주석 변경, 교체가 섞인 patch 결과가 새 트리와 같다', () => {
  const old_tree = fragment_node([
    comment_node('메모'),
    element_node('p', { class: 'a' }, [text_node('글')]),
    element_node('span', null, [text_node('교체 전')]),
  ]);
  const new_tree = fragment_node([
    comment_node('바뀐 메모'),
    element_node('p', { title: 't' }, [text_node('글')]),
    element_node('strong', null, [text_node('교체 후')]),
  ]);
  const environment = create_environment(old_tree);
  patch_to(environment, old_tree, new_tree);
  assert.ok(is_same_tree(create_root_from_container(environment.container_element), new_tree));
  assert_bookmarks_synchronized(environment.bookmark_registry, new_tree, environment.container_element);
});

// 무작위 트리로 "diff → patch 결과 DOM == 새 트리"와 북마크 동기화를 반복 검증한다.
function create_seeded_random(seed_number) {
  let random_state = seed_number >>> 0;
  return () => {
    random_state = (random_state + 0x6d2b79f5) >>> 0;
    let mixed_value = random_state;
    mixed_value = Math.imul(mixed_value ^ (mixed_value >>> 15), mixed_value | 1);
    mixed_value ^= mixed_value + Math.imul(mixed_value ^ (mixed_value >>> 7), mixed_value | 61);
    return ((mixed_value ^ (mixed_value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick_random(next_random, candidates) {
  return candidates[Math.floor(next_random() * candidates.length)];
}

function create_random_children(next_random, remaining_depth) {
  const child_count = Math.floor(next_random() * 5);
  const children = [];
  for (let child_index = 0; child_index < child_count; child_index += 1) {
    const roll = next_random();
    if (roll < 0.25) children.push(text_node(pick_random(next_random, ['a', 'b', ' ', '가'])));
    else if (roll < 0.3) children.push(comment_node(pick_random(next_random, ['x', 'y'])));
    else {
      const attributes = {};
      if (next_random() < 0.5) attributes.id = pick_random(next_random, ['k1', 'k2', 'k3', 'k4']);
      if (next_random() < 0.4) attributes.class = pick_random(next_random, ['c1', 'c2']);
      const namespace = next_random() < 0.1 ? svg_namespace_uri : null;
      const grandchildren = remaining_depth > 0 ? create_random_children(next_random, remaining_depth - 1) : [];
      children.push(element_node(pick_random(next_random, ['div', 'p', 'li', 'span']), attributes, grandchildren, namespace));
    }
  }
  return children;
}

test('EC-013 무작위 트리 500쌍: patch 결과가 새 트리와 같고 북마크가 동기화된다', () => {
  const next_random = create_seeded_random(20261110);
  for (let round_index = 0; round_index < 500; round_index += 1) {
    const old_tree = fragment_node(create_random_children(next_random, 3));
    const new_tree = fragment_node(create_random_children(next_random, 3));
    const environment = create_environment(old_tree);
    patch_to(environment, old_tree, new_tree);
    assert.ok(
      is_same_tree(create_root_from_container(environment.container_element), new_tree),
      `round ${round_index}`,
    );
    assert_bookmarks_synchronized(environment.bookmark_registry, new_tree, environment.container_element);
  }
});

test('EC-014 무작위 이력 이동: 공유 트리 사이를 앞뒤로 오가도 DOM과 북마크가 정확하다', () => {
  const next_random = create_seeded_random(42);
  let current_tree = fragment_node(create_random_children(next_random, 3));
  const environment = create_environment(current_tree);
  const saved_trees = [current_tree];
  for (let round_index = 0; round_index < 300; round_index += 1) {
    let target_tree;
    if (next_random() < 0.5 || saved_trees.length < 2) {
      target_tree = share_unchanged_nodes(current_tree, fragment_node(create_random_children(next_random, 3)));
      saved_trees.push(target_tree);
    } else {
      target_tree = pick_random(next_random, saved_trees);
    }
    patch_to(environment, current_tree, target_tree);
    assert.ok(is_same_tree(create_root_from_container(environment.container_element), target_tree), `round ${round_index}`);
    assert_bookmarks_synchronized(environment.bookmark_registry, target_tree, environment.container_element);
    current_tree = target_tree;
  }
});

test('EC-015 깊은 중첩(1000단계, 브라우저 파서 한도 512의 두 배)도 mount와 patch가 된다', () => {
  function create_nested_tree(depth_count, leaf_text) {
    let nested_node = text_node(leaf_text);
    for (let depth_index = 0; depth_index < depth_count; depth_index += 1) nested_node = element_node('div', null, [nested_node]);
    return fragment_node([nested_node]);
  }
  const old_tree = create_nested_tree(1000, '전');
  const new_tree = create_nested_tree(1000, '후');
  const environment = create_environment(old_tree);
  patch_to(environment, old_tree, new_tree);
  assert.equal(environment.container_element.textContent, '후');
});

test('EC-018 patch 결과는 연산마다 바꾼 DOM 노드를 changed_records로 알려 준다', () => {
  const old_tree = fragment_node([comment_node('메모'), element_node('p', null, [text_node('전')])]);
  const new_tree = fragment_node([comment_node('메모 🙂'), element_node('p', null, [text_node('후')])]);
  const environment = create_environment(old_tree);
  const { changed_records, changed_dom_nodes } = patch_to(environment, old_tree, new_tree);
  assert.equal(changed_records.length, 2);
  assert.deepEqual(changed_records.map((change_record) => change_record.dom_node), changed_dom_nodes);
  const [comment_record, text_record] = changed_records;
  assert.equal(comment_record.operation.old_node, old_tree.children[0]);
  assert.equal(comment_record.dom_node.data, '메모 🙂');
  assert.equal(text_record.dom_node.data, '후');
});

test('EC-019 unmount_tree는 내용을 지우고 컨테이너를 포함한 양쪽 북마크를 해제한다', () => {
  const initial_tree = list_tree(['todo_a', 'todo_b']);
  const environment = create_environment(initial_tree);
  const first_item_node = initial_tree.children[0].children[0];
  const first_item_dom = find_dom_node(environment.bookmark_registry, first_item_node);
  unmount_tree(environment.bookmark_registry, environment.container_element);
  assert.equal(environment.container_element.childNodes.length, 0);
  assert.equal(find_virtual_node(environment.container_element), null);
  assert.equal(find_virtual_node(first_item_dom), null);
  assert.throws(() => find_dom_node(environment.bookmark_registry, initial_tree), /북마크된 DOM 노드가 없습니다/);
  assert.throws(() => find_dom_node(environment.bookmark_registry, first_item_node), /북마크된 DOM 노드가 없습니다/);
});

test('EC-020 unmount_tree 반복 호출(중복 해제)은 안전하고, 컨테이너가 없으면 TypeError', () => {
  const environment = create_environment(list_tree(['todo_a']));
  unmount_tree(environment.bookmark_registry, environment.container_element);
  assert.doesNotThrow(() => unmount_tree(environment.bookmark_registry, environment.container_element));
  assert.throws(() => unmount_tree(environment.bookmark_registry, null), TypeError);
  assert.throws(() => unmount_tree(environment.bookmark_registry, {}), TypeError);
});

function find_attribute_node(dom_element, attribute_name) {
  return dom_element.attributes.find((attribute_node) => attribute_node.name === attribute_name);
}

test('EC-021 SVG 요소를 만들 때 xlink:href는 xlink 네임스페이스 attribute가 되고 HTML 요소에서는 일반 attribute다', () => {
  const owner_document = new fake_document();
  const bookmark_registry = create_bookmark_registry();
  const use_dom_node = create_dom_tree(
    bookmark_registry,
    element_node('use', { 'xlink:href': '#shape', href: '#shape' }, [], svg_namespace_uri),
    owner_document,
  );
  const xlink_attribute = find_attribute_node(use_dom_node, 'xlink:href');
  assert.equal(xlink_attribute.namespaceURI, xlink_namespace_uri);
  assert.equal(xlink_attribute.prefix, 'xlink');
  assert.equal(xlink_attribute.localName, 'href');
  assert.equal(use_dom_node.getAttributeNS(xlink_namespace_uri, 'href'), '#shape');
  assert.equal(find_attribute_node(use_dom_node, 'href').namespaceURI, null);

  const division_dom_node = create_dom_tree(bookmark_registry, element_node('div', { 'xlink:href': '#x' }), owner_document);
  assert.equal(find_attribute_node(division_dom_node, 'xlink:href').namespaceURI, null);
});

test('EC-022 ATTRIBUTES 연산은 xlink:href를 네임스페이스와 함께 추가하고, 값 변경과 제거도 같은 attribute 하나에 적용한다', () => {
  const first_tree = fragment_node([element_node('svg', null, [element_node('use', { id: 'icon' }, [], svg_namespace_uri)], svg_namespace_uri)]);
  const second_tree = fragment_node([
    element_node('svg', null, [element_node('use', { id: 'icon', 'xlink:href': '#a' }, [], svg_namespace_uri)], svg_namespace_uri),
  ]);
  const third_tree = fragment_node([
    element_node('svg', null, [element_node('use', { id: 'icon', 'xlink:href': '#b' }, [], svg_namespace_uri)], svg_namespace_uri),
  ]);
  const environment = create_environment(first_tree);
  const use_dom_node = environment.container_element.childNodes[0].childNodes[0];

  patch_to(environment, first_tree, second_tree);
  assert.equal(use_dom_node.getAttributeNS(xlink_namespace_uri, 'href'), '#a');

  patch_to(environment, second_tree, third_tree);
  assert.equal(use_dom_node.getAttributeNS(xlink_namespace_uri, 'href'), '#b');
  assert.equal(use_dom_node.attributes.filter((attribute_node) => attribute_node.localName === 'href').length, 1);

  patch_to(environment, third_tree, first_tree);
  assert.equal(use_dom_node.getAttributeNS(xlink_namespace_uri, 'href'), null);
  assert.deepEqual(use_dom_node.attributes.map((attribute_node) => attribute_node.name), ['id']);
});

test('EC-023 왕복: 파서처럼 네임스페이스를 붙인 DOM → Virtual DOM → patch로 만든 DOM의 attribute가 같다', () => {
  const owner_document = new fake_document();
  const source_svg = owner_document.createElementNS(svg_namespace_uri, 'svg');
  source_svg.setAttributeNS(xmlns_namespace_uri, 'xmlns:xlink', xlink_namespace_uri);
  source_svg.setAttribute('viewBox', '0 0 10 10');
  const source_use = owner_document.createElementNS(svg_namespace_uri, 'use');
  source_use.setAttributeNS(xlink_namespace_uri, 'xlink:href', '#shape');
  source_use.setAttributeNS(xml_namespace_uri, 'xml:lang', 'ko');
  source_use.setAttribute('href', '#shape');
  source_svg.appendChild(source_use);
  const source_container = owner_document.createElement('div');
  source_container.appendChild(source_svg);
  source_container.appendChild(build_element(owner_document, 'p', { 'xlink:href': '#plain', class: 'note' }));

  const environment = create_environment(create_root_from_container(source_container));
  const describe_attributes = (dom_element) =>
    dom_element.attributes
      .map((attribute_node) => [attribute_node.namespaceURI, attribute_node.prefix, attribute_node.localName, attribute_node.value])
      .sort((first, second) => String(first).localeCompare(String(second)));
  const source_elements = [source_svg, source_use, source_container.childNodes[1]];
  const patched_svg = environment.container_element.childNodes[0];
  const patched_elements = [patched_svg, patched_svg.childNodes[0], environment.container_element.childNodes[1]];
  source_elements.forEach((source_element, index) => {
    assert.deepEqual(describe_attributes(patched_elements[index]), describe_attributes(source_element));
  });
});

test('EC-016 이미 문서에서 분리된 노드를 REMOVE하면 건너뛰고 북마크는 해제하며, REPLACE는 오류다', () => {
  const first_tree = fragment_node([element_node('p', { id: 'first' }, [text_node('a')]), element_node('p', { id: 'second' })]);
  const removed_tree = fragment_node([element_node('p', { id: 'second' })]);
  const environment = create_environment(first_tree);
  const first_dom_node = environment.container_element.childNodes[0];
  environment.container_element.removeChild(first_dom_node);
  assert.doesNotThrow(() => patch_to(environment, first_tree, removed_tree));
  assert.equal(find_virtual_node(first_dom_node), null);
  assert.equal(environment.container_element.childNodes.length, 1);

  const replace_old_tree = fragment_node([element_node('p', null, [text_node('old')])]);
  const replace_new_tree = fragment_node([element_node('div', null, [text_node('new')])]);
  const replace_environment = create_environment(replace_old_tree);
  const old_dom_node = replace_environment.container_element.childNodes[0];
  replace_environment.container_element.removeChild(old_dom_node);
  assert.throws(() => patch_to(replace_environment, replace_old_tree, replace_new_tree), /분리/);
});

test('EC-024 input의 value attribute 변경은 사용자가 고치지 않은 input에만 화면 값으로 보인다 (dirty value)', () => {
  const old_tree = fragment_node([element_node('input', { id: 'memo', value: '처음' })]);
  const new_tree = fragment_node([element_node('input', { id: 'memo', value: '바뀜' })]);
  const clean_environment = create_environment(old_tree);
  const clean_input = clean_environment.container_element.childNodes[0];
  patch_to(clean_environment, old_tree, new_tree);
  assert.equal(clean_input.value, '바뀜');

  const dirty_environment = create_environment(old_tree);
  const dirty_input = dirty_environment.container_element.childNodes[0];
  dirty_input.value = '사용자 입력';
  patch_to(dirty_environment, old_tree, new_tree);
  assert.equal(dirty_environment.container_element.childNodes[0] === dirty_input, true, '같은 input DOM');
  assert.equal(dirty_input.getAttribute('value'), '바뀜');
  assert.equal(dirty_input.value, '사용자 입력');
});
