// 데모 진입점. Phase 1 / Phase 2 화면을 탭으로 전환한다.
import { mountPhase1 } from './phase1/app.js';

const root = document.getElementById('root');
const buttons = document.querySelectorAll('[data-tab]');

function show(tab) {
  root.replaceChildren();
  if (tab === 'phase1') mountPhase1(root);
  else root.textContent = `${tab} — 준비 중`;
  buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
}

buttons.forEach((button) => {
  button.addEventListener('click', () => show(button.dataset.tab));
});

show('phase1');
