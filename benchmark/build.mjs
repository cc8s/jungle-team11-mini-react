// 두 구현을 같은 조건(esbuild, iife, minify, production)으로 번들하고 gzip 크기를 기록한다.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const implementation_entries = { mini_react: 'src/entry_mini_react.js', react_18: 'src/entry_react.js' };
mkdirSync('dist', { recursive: true });
mkdirSync('results', { recursive: true });
const bundle_sizes = {};
for (const [implementation_name, entry_path] of Object.entries(implementation_entries)) {
  await build({
    entryPoints: [entry_path],
    outfile: `dist/${implementation_name}.js`,
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  const bundle_bytes = readFileSync(`dist/${implementation_name}.js`);
  bundle_sizes[implementation_name] = { raw_bytes: bundle_bytes.length, gzip_bytes: gzipSync(bundle_bytes, { level: 9 }).length };
}
writeFileSync('results/bundle_sizes.json', JSON.stringify(bundle_sizes, null, 2));
console.log(bundle_sizes);
