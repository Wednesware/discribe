import * as esbuild from 'esbuild';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = 'discribe/web/assets';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await esbuild.build({
  entryPoints: {
    app: 'frontend/app.ts',
    'editor.worker': './node_modules/monaco-editor/esm/vs/editor/editor.worker.js',
    'json.worker': './node_modules/monaco-editor/esm/vs/language/json/json.worker.js',
    'css.worker': './node_modules/monaco-editor/esm/vs/language/css/css.worker.js',
    'html.worker': './node_modules/monaco-editor/esm/vs/language/html/html.worker.js',
    'ts.worker': './node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js',
  },
  plugins: [
    {
      name: 'y-monaco-legacy-import',
      setup(build) {
        build.onResolve({ filter: /^monaco-editor\/esm\/vs\// }, (args) => ({
          path: resolve('node_modules', args.path),
        }));
      },
    },
  ],
  outdir: out,
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: 'es2022',
  conditions: ['style', 'import', 'browser'],
  loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.svg': 'file' },
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info',
});
// esbuild gathers every imported stylesheet into app.css. Lazy CSS duplicates
// are not referenced by JavaScript and need not inflate the offline cache.
for (const file of await readdir(`${out}/chunks`)) {
  if (file.endsWith('.css')) await rm(`${out}/chunks/${file}`);
}
