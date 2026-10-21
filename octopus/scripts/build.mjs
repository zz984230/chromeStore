// scripts/build.mjs
// 打包 src/ 入口 → extension/,装配 manifest,public/ 原样拷入。
// --watch:重建 JS,public/ 变更重拷。
import { build, context } from 'esbuild';
import { cp, rm, readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import process from 'node:process';
import { TOOLS } from '../src/tools/registry.js';
import { assembleManifest } from './manifest.mjs';

const WATCH = process.argv.includes('--watch');
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const OPTIONS = {
  entryPoints: {
    background: 'src/shell/background.js',
    popup: 'src/shell/popup.js',
    options: 'src/shell/options.js',
    'tools/veil/content': 'src/tools/veil/content/main.js',
    'tools/pace/content': 'src/tools/pace/content/main.js',
    diff: 'src/tools/diff/page/main.js',
  },
  outdir: 'extension',
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  sourcemap: false,
  logLevel: 'info',
};

async function emitManifest() {
  await writeFile('extension/manifest.json', `${JSON.stringify(assembleManifest(TOOLS, { version }), null, 2)}\n`);
}

if (!WATCH) {
  await rm('extension', { recursive: true, force: true });
  await build(OPTIONS);
  await emitManifest();
  await cp('public', 'extension', { recursive: true });
} else {
  const ctx = await context(OPTIONS);
  await ctx.watch();
  await emitManifest();
  await cp('public', 'extension', { recursive: true });
  watch('public', { recursive: true }, () => {
    cp('public', 'extension', { recursive: true }).catch(() => {});
  });
  console.log('[octopus] watching src/ and public/ ...');
}
