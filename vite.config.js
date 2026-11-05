import { defineConfig } from 'vite';

// Vite 는 개발 서버 + 번들러로만 쓴다. 런타임 코드는 전부 Vanilla JS.
export default defineConfig({
  // GitHub Pages 는 https://cc8s.github.io/jungle-team11-mini-react/ 에 배포되므로
  // base 를 레포 이름으로 맞춰야 JS/CSS 경로가 깨지지 않는다.
  base: '/jungle-team11-mini-react/',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
