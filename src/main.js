// 데모 진입점. Phase 1 / Phase 2 화면을 탭으로 전환한다.
// 주소에 ?a= 가 있으면(새로고침·링크) Phase 2 로 연다. 계약은 tests/integration/app.test.js 맨 위 주석.
import { mountPhase1 } from './phase1/app.js';
import { mountApp } from './app/app.js';

const root = document.getElementById('root');
const buttons = document.querySelectorAll('[data-tab]');

// 지금 mount 된 Phase 2 App. 탭을 떠날 때 unmount 해 effect cleanup(popstate 리스너 해제)을 부른다.
let app = null;

function show(tab) {
  app?.unmount();
  app = null;
  root.replaceChildren();
  if (tab === 'phase1') {
    // Phase 2 의 수순 쿼리를 지운다. 새 기록은 만들지 않는다.
    history.replaceState(null, '', location.pathname);
    mountPhase1(root);
  } else {
    app = mountApp(root);
  }
  buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
}

buttons.forEach((button) => {
  button.addEventListener('click', () => show(button.dataset.tab));
});

show(new URLSearchParams(location.search).has('a') ? 'app' : 'phase1');
