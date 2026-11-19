import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isSignedInPath,
  parseTheme,
  themeForPath,
  type Theme,
} from '../../../frontend/src/components/theme/themePolicy';
import { themeScript } from '../../../frontend/src/components/theme/themeScript';

/**
 * The student app themes a page by its path: the signed-in dashboards honour a
 * stored Light, System or Dark choice, and every public page is light. The
 * frontend has no test runner of its own, so the rules are pinned here, where
 * the repository's tests run.
 */
const FRONTEND_SRC = join(__dirname, '../../../frontend/src');

const PUBLIC_PATHS = [
  '/',
  '/landing',
  '/login',
  '/register',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/forgot_password',
  '/reset_password',
  '/verify',
  '/success',
  '/guest_lecturer_archive',
  '/not-a-page',
];

const SIGNED_IN_PATHS = [
  '/guest_lecturer',
  '/guest_lecturer/discovery',
  '/guest_lecturer/settings',
  '/unit_coordinator',
  '/unit_coordinator/matches',
  '/unit_coordinator/help',
];

const CHOICES: Theme[] = ['light', 'system', 'dark'];

/** Runs the inline head script against a fake page and returns what it set. */
function runThemeScript(
  pathname: string,
  storage: { getItem: (key: string) => string | null },
): string | undefined {
  let attribute: string | undefined;
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        if (name === 'data-theme') attribute = value;
      },
    },
  };

  runInNewContext(themeScript, {
    location: { pathname },
    localStorage: storage,
    document,
  });

  return attribute;
}

function storageHolding(value: string | null) {
  return {
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null),
  };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('which pages are signed-in pages', () => {
  it.each(SIGNED_IN_PATHS)('treats %s as signed in', (path) => {
    expect(isSignedInPath(path)).toBe(true);
  });

  it.each(PUBLIC_PATHS)('treats %s as public', (path) => {
    expect(isSignedInPath(path)).toBe(false);
  });
});

describe('reading a stored theme', () => {
  it('defaults to light when nothing is stored', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(parseTheme(null)).toBe('light');
    expect(parseTheme(undefined)).toBe('light');
  });

  it('defaults to light for a value it does not recognise', () => {
    expect(parseTheme('')).toBe('light');
    expect(parseTheme('purple')).toBe('light');
  });

  it.each(CHOICES)('keeps a stored %s', (choice) => {
    expect(parseTheme(choice)).toBe(choice);
  });
});

describe('the theme a page gets', () => {
  it.each(
    PUBLIC_PATHS.flatMap((path) => CHOICES.map((c) => [path, c] as const)),
  )('%s is light even when %s is stored', (path, choice) => {
    expect(themeForPath(path, choice)).toBe('light');
  });

  it.each(
    SIGNED_IN_PATHS.flatMap((path) => CHOICES.map((c) => [path, c] as const)),
  )('%s keeps the stored %s', (path, choice) => {
    expect(themeForPath(path, choice)).toBe(choice);
  });
});

describe('the inline script that runs before the first paint', () => {
  it.each(
    [...PUBLIC_PATHS, ...SIGNED_IN_PATHS].flatMap((path) =>
      [null, 'light', 'system', 'dark', 'purple'].map(
        (stored) => [path, stored] as const,
      ),
    ),
  )('sets what the policy gives for %s with %s stored', (path, stored) => {
    expect(runThemeScript(path, storageHolding(stored))).toBe(
      themeForPath(path, parseTheme(stored)),
    );
  });

  it('never paints a public page dark, even with dark stored', () => {
    expect(runThemeScript('/landing', storageHolding('dark'))).toBe('light');
    expect(runThemeScript('/login', storageHolding('system'))).toBe('light');
  });

  it('is light for a signed-in user who has not chosen', () => {
    expect(runThemeScript('/guest_lecturer', storageHolding(null))).toBe(
      'light',
    );
  });

  it('is light when storage refuses to be read', () => {
    const refusing = {
      getItem: () => {
        throw new Error('storage is disabled');
      },
    };

    expect(runThemeScript('/unit_coordinator/matches', refusing)).toBe('light');
    expect(runThemeScript('/landing', refusing)).toBe('light');
  });
});

describe('the stylesheet', () => {
  const css = readFileSync(join(FRONTEND_SRC, 'app/globals.css'), 'utf8');

  it('never turns dark merely because a page has no theme attribute', () => {
    expect(css).not.toContain(':not([data-theme');
  });

  it('follows the device only for an explicit system choice', () => {
    expect(css).toContain(
      '@media (prefers-color-scheme: dark) {\n  :root[data-theme="system"] {',
    );
  });
});

describe('the theme switch', () => {
  it('is used only inside the signed-in dashboard', () => {
    const importers = sourceFiles(FRONTEND_SRC)
      .filter((file) =>
        readFileSync(file, 'utf8').includes('theme/ThemeToggle'),
      )
      // Forward slashes, so the comparison also holds on Windows.
      .map((file) => relative(FRONTEND_SRC, file).split(sep).join('/'))
      .sort();

    expect(importers).toEqual(['components/dashboard/DashboardHeader.tsx']);
  });
});
