# attribute_namespace

`src/attribute_namespace.js` — attribute 이름으로 원래 네임스페이스를 되찾는 순수 함수 `resolve_attribute_namespace(element_namespace, attribute_name)`.

- 문제: Virtual DOM은 attribute를 이름 문자열로만 저장한다. `setAttribute('xlink:href', ...)`는 항상 네임스페이스 없는 attribute를 만들기 때문에, SVG `<use xlink:href>`를 patch로 다시 만들면 `<use>`가 대상을 참조하지 못했다(Chrome `getBBox` 20×30 → 0×0).
- 근거가 되는 DOM 동작: HTML 파서는 SVG·MathML 요소의 attribute 중 `xlink:actuate`, `xlink:arcrole`, `xlink:href`, `xlink:role`, `xlink:show`, `xlink:title`, `xlink:type`, `xml:lang`, `xml:space`, `xmlns`, `xmlns:xlink` 11개에만 네임스페이스를 붙인다(HTML 표준 "adjust foreign attributes"). HTML 요소에는 붙이지 않는다.
- 입력은 모두 HTML 파서를 거치므로 요소 네임스페이스와 이름만으로 원래 네임스페이스가 정해진다. 그래서 노드 구조에 네임스페이스를 저장하지 않고 patch가 DOM을 만들 때만 이 표를 조회한다. 비용은 HTML이 아닌 요소에 attribute를 새로 넣을 때의 `Map` 조회 한 번이다.
- 알려진 한계: XML 문서처럼 표 밖의 네임스페이스를 가진 DOM을 변환하면 네임스페이스는 사라진다. 지금은 그런 입력 경로가 없다.

## 엣지 케이스

| ID | 상황 | 기대 동작 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| EC-001 | SVG·MathML 요소의 표에 있는 11개 이름 | xlink, XML, XMLNS 네임스페이스 | EC-001 SVG와 MathML 요소에서는 HTML 파서 표의 11개 이름에 네임스페이스를 돌려준다 | 통과 |
| EC-002 | HTML 요소(`null`, `undefined`, XHTML 네임스페이스)의 `xlink:href` | `null` (파서와 같음) | EC-002 HTML 요소(namespace null)에서는 xlink:href도 네임스페이스가 없다 | 통과 |
| EC-003 | 표에 없는 이름, 대소문자가 다른 이름, `__proto__` | `null` | EC-003 표에 없는 이름, 대소문자가 다른 이름, 일반 이름은 null이다 | 통과 |
| EC-004 | `attribute_name`이 `null`, `undefined`, 숫자, 객체 | `TypeError` | EC-004 attribute_name이 문자열이 아니면 TypeError | 통과 |

## 유닛 테스트

| 테스트 이름 | 검증 내용 | 관련 ID |
| --- | --- | --- |
| EC-001 SVG와 MathML 요소에서는 HTML 파서 표의 11개 이름에 네임스페이스를 돌려준다 | 표 전체 | EC-001 |
| EC-002 HTML 요소(namespace null)에서는 xlink:href도 네임스페이스가 없다 | HTML 요소 제외 | EC-002 |
| EC-003 표에 없는 이름, 대소문자가 다른 이름, 일반 이름은 null이다 | 표 밖 이름 | EC-003 |
| EC-004 attribute_name이 문자열이 아니면 TypeError | 입력 검증 | EC-004 |

## 미검증 항목

| 항목 | 이유 | 필요한 검증 방법 |
| --- | --- | --- |
| 실제 파서가 붙이는 네임스페이스와 표가 같은지 | 대역에는 HTML 파서가 없음 | 2026-11-11 Chrome 156에서 확인: `innerHTML`로 만든 `svg`(`xmlns:xlink`, `xml:space`), `use`(`xlink:href`, `xml:lang`), HTML `p`(`xlink:href`)의 attribute 네임스페이스·prefix·localName·값이 patch로 만든 DOM과 모두 같음 |
