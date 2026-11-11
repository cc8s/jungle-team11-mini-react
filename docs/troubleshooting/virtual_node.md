# virtual_node 트러블슈팅

TDD Red 단계에서 실패한 테스트와 원인, 수정 내용을 기록한다.

## EC-021 HTML 파서가 만든 잘못된 attribute 이름(<p =x>)은 변환에서 빼서 patch가 InvalidCharacterError를 내지 않는다

- **발견 경위**: 다른 레포와 비교 시연 중 테스트 영역에 `<p =x>`를 넣고 Patch하자 pageerror가 나고, 실제 영역이 비며, 이후 Patch가 하나도 반영되지 않았다.
- **증상 (Red)**

  ```
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    actual: [ 'class', '=x', '==' ],
    expected: [ 'class' ],
  ```

- **원인**: HTML 파서(tokenizer)는 attribute 이름을 검사하지 않아 `<p =x>`에서 이름이 `=x`인 attribute를 만든다. `create_virtual_node_from_dom`은 보안 검사(`is_safe_attribute`)만 하고 이름은 그대로 Virtual DOM에 담았다. patch의 `setAttribute("=x")`는 DOM 표준대로 `InvalidCharacterError`를 던지고, 연산 적용이 중간에 멈췄다.
- **수정**: DOM 표준 "valid attribute local name"(빈 이름, ASCII 공백, NULL, `/`, `=`, `>` 거부)을 따르는 순수 함수 `is_valid_attribute_name`을 추가하고, DOM → Virtual DOM 변환에서 이 검사를 통과한 attribute만 담는다. 2026-11-11 Chrome 156에서 파서가 만든 이름 중 `setAttribute`가 거부하는 것은 `=x`뿐임을 확인했다.
- **함께 고친 대역**: `test/support/fake_dom.js`의 이름 검사가 따옴표와 비 ASCII 공백까지 거부해 표준(과 Chrome)보다 엄격했다. 표준 규칙으로 맞추고, 파서 결과를 흉내 내는 `append_parsed_attribute`를 추가했다.
