# Contributing Guide

Welcome to the project! Please read this before writing any code or making any commits.
This document is the single source of truth for how we work together.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Workflow](#workflow)
- [Pull Requests](#pull-requests)
- [Automated Checks (Pre-commit & CI)](#automated-checks-pre-commit--ci)
- [Where Things Live](#where-things-live)
- [What Not To Do](#what-not-to-do)

---

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://21664322@bitbucket.org/curtincomputingprojects/bentley-sem-1-05.git
   cd bentley-sem-1-05
   ```

2. Always work from an up-to-date `develop` branch:
   ```bash
   git checkout develop
   git pull origin develop
   ```

3. Create your own branch before making any changes (see [Branch Naming](#branch-naming) below).

---

## Branch Naming

**Always branch off `develop`, never `main`.**

| Type    | Format               | Example                   |
|---------|----------------------|---------------------------|
| Feature | `feature/short-desc` | `feature/login-page`      |
| Bug fix | `fix/short-desc`     | `fix/auth-redirect`       |
| Chore   | `chore/short-desc`   | `chore/update-eslint`     |

Keep names short, lowercase, and use hyphens — no spaces or special characters.

```bash
# Example: creating a feature branch
git checkout develop
git pull origin develop
git checkout -b feature/guest-lecturer-form
```

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard.
This is automatically enforced — your commit will be rejected if the format is wrong.

**Format:**
```
type: short description in lowercase
```

| Type     | When to use                              |
|----------|------------------------------------------|
| `feat`   | Adding a new feature                     |
| `fix`    | Fixing a bug                             |
| `chore`  | Maintenance, config, dependency updates  |
| `docs`   | Documentation changes only               |
| `style`  | Formatting, no logic changes             |
| `test`   | Adding or updating tests                 |
| `refactor` | Code restructure, no feature change    |

**Examples:**
```
feat: add guest lecturer registration form
fix: correct redirect after Auth0 login
chore: update eslint config
docs: update contributing guide
```

**Rules:**
- Use lowercase only
- No period at the end
- Keep it under 72 characters
- Be descriptive enough that someone reading it later understands what changed

---

## Workflow

Follow these steps every time you work on something new:

```
1. Switch to develop and pull the latest changes
   git checkout develop
   git pull origin develop

2. Create your branch
   git checkout -b feature/your-feature-name

3. Make your changes and commit regularly
   git add .
   git commit -m "feat: describe what you did"

4. Push your branch to Bitbucket
   git push origin feature/your-feature-name

5. Open a Pull Request into develop on Bitbucket

6. Wait for at least 1 approval before merging

7. Delete your branch after it is merged
```

---

## Pull Requests

When opening a PR:

- **Title:** Use the same format as a commit message (e.g. `feat: add login page`)
- **Description:** Briefly explain what you changed and why
- **Target branch:** Always `develop` — never open a PR directly into `main`
- **Reviewers:** Assign Phu as reviewer on every PR
- **Do not merge your own PR** without at least 1 approval

A PR should be focused — one feature or fix per PR. Avoid bundling unrelated changes together.

---

## Automated Checks (Pre-commit & CI)

One automated check runs on your code, on your machine before a commit is even created.
Understanding what it does (and does not do) will save you time.

### Pre-commit hook (runs on your machine, instantly)

Every time you run `git commit`, a Husky hook automatically runs `lint-staged` against
**only the files you staged** (`git add`) — not your whole project. This does two things:

| Check         | What it does                                              | Applies to                          |
|---------------|-------------------------------------------------------------|--------------------------------------|
| **ESLint**    | Checks code quality/correctness, auto-fixes what it can     | Staged `.ts`/`.js` in `backend/`, staged `.ts`/`.tsx`/`.js`/`.jsx` in `frontend/` |
| **cspell**    | Checks spelling in code, comments, and docs                 | Staged `.ts`/`.tsx`/`.js`/`.jsx`/`.md`/`.json` anywhere in the repo |

**If it fails:** your commit is stopped — nothing gets committed. Read the terminal output,
it will tell you exactly which file and which rule failed. Fix the issue, `git add` the file
again, and re-run `git commit`.

**Do not use `git commit --no-verify` to skip this.** It bypasses the check entirely instead
of fixing the underlying problem.

---

## Where Things Live

One row per area of the codebase, so anyone picking up work knows where to look
without reading every directory first.

Add your row in the same pull request that adds the area. Describe what the code
does and where it is. Not who wrote it, not which ticket it came from: that is
what the commit history and the pull request are for.

| Area | Path |
|---|---|
| Rate limiting and HTTP security headers | `backend/src/main.ts`, `backend/src/app.module.ts` |
| Boot-time environment validation | `backend/src/config/` |
| Token verification and role guards | `backend/src/auth/` |
| Shared error codes and the response envelope | `backend/src/common/` |
| Local identity provider for development and tests | `tools/dev-idp/` |
| Rate limit tiers and reverse proxy trust | `backend/src/main.ts` |
| Content security policy and transport security headers | `backend/src/main.ts` |
| Request body size limit | `backend/src/main.ts` |

---

## What Not To Do

These will be blocked by branch protection rules, but please understand why they matter:

| ❌ Don't do this                        | ✅ Do this instead                        |
|-----------------------------------------|-------------------------------------------|
| Push directly to `main` or `develop`   | Always use a branch + PR                  |
| Merge your own PR without review        | Wait for at least 1 approval              |
| Commit secrets or `.env` files          | Use `.env.example` only, never real keys  |
| Use vague commit messages like `update` | Use Conventional Commits format           |
| Work directly on someone else's branch  | Create your own branch for your own work  |
| Use `git commit --no-verify` to skip checks | Fix the actual lint/spelling issue    |

---

## Questions?

If you are unsure about anything, ask before pushing. It is always easier to fix something
before it is in the codebase than after.