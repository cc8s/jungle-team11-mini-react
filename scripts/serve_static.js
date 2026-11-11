// 검증 페이지를 띄우는 정적 파일 서버. ES 모듈은 file://에서 로드되지 않으므로 HTTP로 제공한다.
// 실행: node scripts/serve_static.js  (포트: PORT 환경 변수, 기본 4173)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project_root_path = resolve(fileURLToPath(new URL('..', import.meta.url)));
const listen_port = Number(process.env.PORT ?? 4173);
const content_types_by_extension = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const static_server = createServer(async (incoming_request, server_response) => {
  let request_path;
  try {
    request_path = decodeURIComponent(new URL(incoming_request.url, 'http://localhost').pathname);
  } catch {
    // 잘못된 퍼센트 인코딩("%E0%A4%A")에서 서버가 죽지 않도록 400으로 응답한다.
    server_response.writeHead(400).end('bad request');
    return;
  }
  const relative_path = request_path === '/' ? 'index.html' : request_path.slice(1);
  const file_path = normalize(join(project_root_path, relative_path));
  // 프로젝트 폴더 밖(../)과 숨김 파일(.git 등)은 제공하지 않는다.
  const is_outside_root = !file_path.startsWith(project_root_path + sep);
  const is_hidden_path = relative_path.split('/').some((path_segment) => path_segment.startsWith('.'));
  if (is_outside_root || is_hidden_path) {
    server_response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const file_contents = await readFile(file_path);
    server_response.writeHead(200, {
      'content-type': content_types_by_extension[extname(file_path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    server_response.end(file_contents);
  } catch {
    server_response.writeHead(404).end('not found');
  }
});

static_server.listen(listen_port, '127.0.0.1', () => {
  console.log(`http://localhost:${listen_port}`);
});
