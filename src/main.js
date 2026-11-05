// 데모 진입점. Phase 1 / Phase 2 화면을 탭으로 전환한다.
const root = document.getElementById('root');

function show(tab) {
  root.textContent = `${tab} — 준비 중`;
}

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => show(button.dataset.tab));
});

show('phase1');
