// scripts/build.mjs
// 将 src/ 各入口（ES modules）打包进 extension/，并把 public/ 原样拷入。
// --watch：src 变更时重打包，public 变更时重拷贝。
import { build, context } from 'esbuild';
import { cp, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import process from 'node:process';

const WATCH = process.argv.includes('--watch');

const OPTIONS = {
  entryPoints: {
    background: 'src/background/main.js',
    content: 'src/content/main.js',
    popup: 'src/popup/main.js',
  },
  outdir: 'extension',
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  sourcemap: false,
  logLevel: 'info',
};

if (!WATCH) {
  await rm('extension', { recursive: true, force: true });
  await build(OPTIONS);
  await cp('public', 'extension', { recursive: true });
} else {
  const ctx = await context(OPTIONS);
  await ctx.watch();
  await cp('public', 'extension', { recursive: true });
  watch('public', { recursive: true }, () => {
    cp('public', 'extension', { recursive: true }).catch(() => {});
  });
  console.log('[video-acc] watching src/ and public/ ...');
}
