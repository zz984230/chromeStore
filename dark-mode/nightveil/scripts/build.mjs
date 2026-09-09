// scripts/build.mjs
// Bundles src/ (ES modules) into extension/ and copies public/ verbatim.
// --watch: rebuild JS on change, re-copy public/ on change.
import { build, context } from 'esbuild';
import { cp, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import process from 'node:process';

const WATCH = process.argv.includes('--watch');

const OPTIONS = {
  entryPoints: {
    background: 'src/background/main.js',
    content: 'src/content/main.js',
    options: 'src/options/main.js',
  },
  outdir: 'extension',
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  sourcemap: false,
  logLevel: 'info',
};

await rm('extension', { recursive: true, force: true });

if (!WATCH) {
  await build(OPTIONS);
  await cp('public', 'extension', { recursive: true });
} else {
  const ctx = await context(OPTIONS);
  await ctx.watch();
  await cp('public', 'extension', { recursive: true });
  watch('public', { recursive: true }, () => {
    cp('public', 'extension', { recursive: true }).catch(() => {});
  });
  console.log('[nightveil] watching src/ and public/ ...');
}
