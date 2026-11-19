const path = require('path');

module.exports = {
  'backend/**/*.{ts,js}': (files) => {
    const rel = files.map((f) => path.relative('backend', f));
    return [`node scripts/run-eslint.js backend ${rel.join(' ')}`];
  },
  'frontend/**/*.{ts,tsx,js,jsx}': (files) => {
    const rel = files.map((f) => path.relative('frontend', f));
    return [`node scripts/run-eslint.js frontend ${rel.join(' ')}`];
  },
  '**/*.{ts,tsx,js,jsx,md,json}': ['npx cspell --no-must-find-files'],
};