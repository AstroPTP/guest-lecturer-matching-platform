const path = require('path');

module.exports = {
  'backend/**/*.{ts,js}': (files) => {
    const rel = files.map((f) => path.relative('backend', f));
    return [`cd backend && npx eslint --fix ${rel.join(' ')}`];
  },
  'frontend/**/*.{ts,tsx,js,jsx}': (files) => {
    const rel = files.map((f) => path.relative('frontend', f));
    return [`cd frontend && npx eslint --fix ${rel.join(' ')}`];
  },
};