const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');

const electron = require('electron');
const testFiles = readdirSync(path.resolve(__dirname, '..', 'test'))
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join('test', file));

const result = spawnSync(electron, ['--test', ...testFiles], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);
