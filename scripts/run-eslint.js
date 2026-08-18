#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const [targetDir, ...files] = process.argv.slice(2);

if (!targetDir || files.length === 0) {
  process.exit(0);
}

const result = spawnSync('npx', ['eslint', '--fix', ...files], {
  cwd: path.join(__dirname, '..', targetDir),
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);