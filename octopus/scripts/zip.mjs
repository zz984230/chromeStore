// scripts/zip.mjs — 上架打包:extension/ → dist/octopus-<version>.zip(manifest 在包根)
// 系统 zip 打包,排除点文件;版本三处同步(package.json = manifest = 文件名)不同步即拒。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'extension');
if (!existsSync(path.join(extDir, 'manifest.json'))) {
  console.error('[zip] 缺 extension/manifest.json —— 先 npm run build');
  process.exit(1);
}
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const manifestVersion = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8')).version;
if (version !== manifestVersion) {
  console.error(`[zip] 版本不同步:package.json=${version} manifest=${manifestVersion}`);
  process.exit(1);
}
mkdirSync(path.join(root, 'dist'), { recursive: true });
const zipPath = path.join(root, 'dist', `octopus-${version}.zip`);
rmSync(zipPath, { force: true }); // zip 是增量更新语义,先清避免陈旧 entry
const r = spawnSync('zip', ['-X', '-r', zipPath, '.', '-x', '.*', '*.DS_Store', '*/.*'], { cwd: extDir, stdio: 'inherit' });
if (r.error) { console.error('[zip] spawn failed:', r.error.message); process.exit(1); }
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`[zip] ${path.relative(root, zipPath)}`);
