const { spawnSync } = require('node:child_process');
const { readdirSync, statSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targets = ['main.js', 'preload.js', 'database', path.join('src', 'js')];
const files = [];

function collect(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (statSync(absolutePath).isDirectory()) {
    for (const entry of readdirSync(absolutePath)) {
      collect(path.join(relativePath, entry));
    }
    return;
  }
  if (absolutePath.endsWith('.js')) files.push(relativePath);
}

targets.forEach(collect);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`${files.length} JavaScript dosyası doğrulandı.`);
