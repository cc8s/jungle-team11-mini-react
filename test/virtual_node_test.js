import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  create_element_node,
  create_text_node,
  create_comment_node,
  create_fragment_node,
  create_virtual_node_from_dom,
  create_root_from_container,
  is_same_tree,
  is_safe_attribute,
  is_url_animation_element,
  text_node_type,
  comment_node_type,
  fragment_node_type,
} from '../src/virtual_node.js';
import { fake_document, build_element, svg_namespace_uri, html_namespace_uri } from './support/fake_dom.js';

test('EC-001 잘못된 element_type이면 TypeError', () => {
  for (const invalid_type of [null, undefined, '', 42, '#text']) {
    assert.throws(() => create_element_node(invalid_type), TypeError);
  }
});

test('EC-002 id attribute가 key가 되고 빈 id는 key가 아니다', () => {
  assert.equal(create_element_node('li', { id: 'todo_a' }).key, 'todo_a');
  assert.equal(create_element_node('li', { id: '' }).key, null);
  assert.equal(create_element_node('li', { class: 'item' }).key, null);
  assert.equal(create_element_node('li').key, null);
});

test('EC-003 노드, attributes, children은 동결되어 수정할 수 없다', () => {
  const list_node = create_element_node('ul', { class: 'list' }, [create_text_node('항목')]);
  assert.ok(Object.isFrozen(list_node));
  assert.ok(Object.isFrozen(list_node.attributes));
  assert.ok(Object.isFrozen(list_node.children));
  assert.throws(() => {
    list_node.children.push(create_text_node('추가'));
  }, TypeError);
  assert.throws(() => {
    list_node.attributes.class = 'changed';
  }, TypeError);
});

test('EC-004 "__proto__" 이름의 attribute도 일반 값으로 저장된다', () => {
  const source_attributes = JSON.parse('{"__proto__": "danger", "title": "ok"}');
  const element_node = create_element_node('div', source_attributes);
  assert.equal(Object.getPrototypeOf(element_node.attributes), null);
  assert.equal(element_node.attributes.__proto__, 'danger');
  assert.deepEqual(Object.keys(element_node.attributes).sort(), ['__proto__', 'title']);
});

test('EC-005 HTML 네임스페이스는 null로 정규화되고 SVG 네임스페이스는 유지된다', () => {
  assert.equal(create_element_node('div', null, [], html_namespace_uri).namespace, null);
  assert.equal(create_element_node('circle', null, [], svg_namespace_uri).namespace, svg_namespace_uri);
});

test('EC-006 is_same_tree는 구조와 값으로 비교하고 attribute 순서는 무시한다', () => {
  const first_tree = create_fragment_node([
    create_element_node('p', { class: 'a', title: 'b' }, [create_text_node('글')]),
  ]);
  const second_tree = create_fragment_node([
    create_element_node('p', { title: 'b', class: 'a' }, [create_text_node('글')]),
  ]);
  const text_changed_tree = create_fragment_node([
    create_element_node('p', { class: 'a', title: 'b' }, [create_text_node('글자')]),
  ]);
  const namespace_changed_tree = create_fragment_node([
    create_element_node('p', { class: 'a', title: 'b' }, [create_text_node('글')], svg_namespace_uri),
  ]);
  assert.equal(is_same_tree(first_tree, second_tree), true);
  assert.equal(is_same_tree(first_tree, text_changed_tree), false);
  assert.equal(is_same_tree(first_tree, namespace_changed_tree), false);
  assert.equal(is_same_tree(create_text_node('a'), create_comment_node('a')), false);
  assert.equal(is_same_tree(first_tree, null), false);
});

test('EC-007 create_virtual_node_from_dom에 노드가 아닌 값을 넣으면 TypeError', () => {
  for (const invalid_input of [null, undefined, {}, 'div', 3]) {
    assert.throws(() => create_virtual_node_from_dom(invalid_input), TypeError);
  }
});

test('EC-008 요소, 텍스트, 주석, 공백 텍스트를 그대로 변환한다', () => {
  const owner_document = new fake_document();
  const list_element = build_element(owner_document, 'ul', { id: 'todo_list', class: 'list' }, [
    '\n  ',
    build_element(owner_document, 'li', { id: 'todo_a' }, ['장보기']),
    owner_document.createComment(' 메모 '),
  ]);
  const list_node = create_virtual_node_from_dom(list_element);
  assert.equal(list_node.type, 'ul');
  assert.equal(list_node.key, 'todo_list');
  assert.equal(list_node.attributes.class, 'list');
  assert.equal(list_node.children.length, 3);
  assert.deepEqual(list_node.children[0], { type: text_node_type, key: null, text: '\n  ' });
  assert.equal(list_node.children[1].key, 'todo_a');
  assert.equal(list_node.children[1].children[0].text, '장보기');
  assert.equal(list_node.children[2].type, comment_node_type);
});

test('EC-009 script, base, meta, object, embed 요소는 변환에서 제외한다 (SVG script 포함)', () => {
  const owner_document = new fake_document();
  const container_element = build_element(owner_document, 'div', {}, [
    build_element(owner_document, 'script', {}, ['alert(1)']),
    build_element(owner_document, 'base', { href: 'https://evil.example/' }),
    build_element(owner_document, 'meta', { 'http-equiv': 'refresh' }),
    build_element(owner_document, 'object'),
    build_element(owner_document, 'embed'),
    owner_document.createElementNS(svg_namespace_uri, 'script'),
    build_element(owner_document, 'p', {}, ['남는 문단']),
  ]);
  const root_node = create_root_from_container(container_element);
  assert.deepEqual(
    root_node.children.map((child_node) => child_node.type),
    ['p'],
  );
});

test('EC-010 이벤트 핸들러, srcdoc, javascript: URL attribute는 제거하고 안전한 값은 남긴다', () => {
  assert.equal(is_safe_attribute('onclick', 'alert(1)'), false);
  assert.equal(is_safe_attribute('ONERROR', 'alert(1)'), false);
  assert.equal(is_safe_attribute('srcdoc', '<script></script>'), false);
  assert.equal(is_safe_attribute('href', 'javascript:alert(1)'), false);
  assert.equal(is_safe_attribute('href', '  JaVa\tScRiPt:alert(1)'), false);
  assert.equal(is_safe_attribute('src', 'data:text/html,<script></script>'), false);
  assert.equal(is_safe_attribute('xlink:href', 'javascript:alert(1)'), false);
  assert.equal(is_safe_attribute('href', 'https://example.com/?q=javascript:'), true);
  assert.equal(is_safe_attribute('title', 'javascript:은 글자일 뿐'), true);
  assert.equal(is_safe_attribute('', 'x'), false);
  assert.equal(is_safe_attribute(null, 'x'), false);

  const owner_document = new fake_document();
  const image_element = build_element(owner_document, 'img', { src: 'cat.png', onerror: 'alert(1)', alt: '고양이' });
  assert.deepEqual({ ...create_virtual_node_from_dom(image_element).attributes }, { src: 'cat.png', alt: '고양이' });
});

test('EC-011 SVG 요소는 네임스페이스와 대소문자를 보존한다', () => {
  const owner_document = new fake_document();
  const svg_element = owner_document.createElementNS(svg_namespace_uri, 'svg');
  const gradient_element = owner_document.createElementNS(svg_namespace_uri, 'linearGradient');
  gradient_element.setAttribute('viewBox', '0 0 10 10');
  svg_element.appendChild(gradient_element);
  const svg_node = create_virtual_node_from_dom(svg_element);
  assert.equal(svg_node.namespace, svg_namespace_uri);
  assert.equal(svg_node.children[0].type, 'linearGradient');
  assert.equal(svg_node.children[0].attributes.viewBox, '0 0 10 10');
});

test('EC-012 지원하지 않는 노드(processing instruction)는 null이고 children에서 빠진다', () => {
  const owner_document = new fake_document();
  const instruction_node = owner_document.createProcessingInstruction('xml-stylesheet', 'href="a.css"');
  assert.equal(create_virtual_node_from_dom(instruction_node), null);
  const container_element = build_element(owner_document, 'div', {}, [instruction_node, '글']);
  assert.equal(create_virtual_node_from_dom(container_element).children.length, 1);
});

test('EC-013 template 요소는 content의 자식을 읽는다', () => {
  const owner_document = new fake_document();
  const template_element = owner_document.createElement('template');
  template_element.content.appendChild(build_element(owner_document, 'span', {}, ['안']));
  const template_node = create_virtual_node_from_dom(template_element);
  assert.equal(template_node.children[0].type, 'span');
});

test('EC-014 깊은 중첩(1000단계)과 대량 형제 노드(5000개)를 변환한다', () => {
  const owner_document = new fake_document();
  const root_element = owner_document.createElement('div');
  let current_element = root_element;
  for (let depth_index = 0; depth_index < 1000; depth_index += 1) {
    const nested_element = owner_document.createElement('div');
    current_element.appendChild(nested_element);
    current_element = nested_element;
  }
  let nested_node = create_virtual_node_from_dom(root_element);
  let measured_depth = 0;
  while (nested_node.children.length > 0) {
    nested_node = nested_node.children[0];
    measured_depth += 1;
  }
  assert.equal(measured_depth, 1000);

  const wide_element = owner_document.createElement('ul');
  for (let item_index = 0; item_index < 5000; item_index += 1) {
    wide_element.appendChild(build_element(owner_document, 'li', { id: `item_${item_index}` }, [String(item_index)]));
  }
  assert.equal(create_virtual_node_from_dom(wide_element).children.length, 5000);
});

test('EC-015 create_root_from_container는 컨테이너의 내용만 #fragment로 만든다', () => {
  assert.throws(() => create_root_from_container(null), TypeError);
  const owner_document = new fake_document();
  const container_element = build_element(owner_document, 'div', { id: 'real_area' }, ['글']);
  const root_node = create_root_from_container(container_element);
  assert.equal(root_node.type, fragment_node_type);
  assert.equal(root_node.key, null);
  assert.equal(root_node.children[0].text, '글');
});

test('EC-016 children에 Virtual DOM 노드가 아닌 값이 있으면 TypeError', () => {
  assert.throws(() => create_element_node('div', null, ['문자열']), TypeError);
  assert.throws(() => create_element_node('div', null, 'not array'), TypeError);
  assert.throws(() => create_element_node('div', 'not object'), TypeError);
});

test('EC-017 문서에 붙지 않은(분리된) 노드도 변환된다', () => {
  const owner_document = new fake_document();
  const detached_element = build_element(owner_document, 'p', {}, ['분리됨']);
  assert.equal(detached_element.parentNode, null);
  assert.equal(create_virtual_node_from_dom(detached_element).children[0].text, '분리됨');
});

test('EC-018 변환 중 live childNodes가 바뀌어도 시작 시점의 자식을 모두 변환한다', () => {
  const owner_document = new fake_document();
  const container_element = build_element(owner_document, 'div', {}, ['첫째', '둘째', '셋째']);
  const [first_text_node, second_text_node] = container_element.childNodes;
  const first_text = first_text_node.data;
  let is_sibling_removed = false;
  // 첫 텍스트를 읽는 순간 다음 형제를 떼어 내 live 컬렉션을 순회 중에 줄인다.
  Object.defineProperty(first_text_node, 'data', {
    get() {
      if (!is_sibling_removed) {
        is_sibling_removed = true;
        container_element.removeChild(second_text_node);
      }
      return first_text;
    },
  });
  const container_node = create_virtual_node_from_dom(container_element);
  assert.equal(container_element.childNodes.length, 2);
  assert.deepEqual(
    container_node.children.map((child_node) => child_node.text),
    ['첫째', '둘째', '셋째'],
  );
});

test('EC-019 HTML 파서 중첩 제한(512단계)보다 충분히 깊은 3000단계도 RangeError 없이 변환한다', () => {
  const owner_document = new fake_document();
  const root_element = owner_document.createElement('div');
  let current_element = root_element;
  for (let depth_index = 0; depth_index < 3000; depth_index += 1) {
    const nested_element = owner_document.createElement('div');
    current_element.appendChild(nested_element);
    current_element = nested_element;
  }
  assert.doesNotThrow(() => create_virtual_node_from_dom(root_element));
});

test('EC-020 URL attribute를 바꾸는 SVG animate와 set 요소는 변환에서 제외하고 다른 애니메이션은 남긴다', () => {
  const owner_document = new fake_document();
  const create_animation_element = (element_name, animation_attributes) => {
    const animation_element = owner_document.createElementNS(svg_namespace_uri, element_name);
    for (const [attribute_name, attribute_value] of Object.entries(animation_attributes)) {
      animation_element.setAttribute(attribute_name, attribute_value);
    }
    return animation_element;
  };
  const anchor_element = owner_document.createElementNS(svg_namespace_uri, 'a');
  for (const animation_element of [
    create_animation_element('animate', { attributeName: 'href', values: 'javascript:alert(1)' }),
    create_animation_element('set', { attributeName: 'xlink:href', to: 'javascript:alert(1)' }),
    create_animation_element('animate', { attributeName: ' HREF ', values: 'javascript:alert(1)' }),
    create_animation_element('set', { attributeName: 'href', to: 'https://example.com/' }),
    create_animation_element('animate', { attributeName: 'opacity', values: '0;1' }),
  ]) {
    anchor_element.appendChild(animation_element);
  }
  const anchor_node = create_virtual_node_from_dom(anchor_element);
  assert.deepEqual(
    anchor_node.children.map((child_node) => child_node.attributes.attributeName),
    ['opacity'],
  );
  assert.equal(is_url_animation_element('animate', { attributeName: 'href' }), true);
  assert.equal(is_url_animation_element('animate', { attributeName: 'fill' }), false);
  assert.equal(is_url_animation_element('rect', { attributeName: 'href' }), false);
  assert.equal(is_url_animation_element('set', {}), false);
});
