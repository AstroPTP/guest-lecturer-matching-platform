<!--
Title: use the commit message format, e.g. "feat: add login page".
Target branch: develop. Never open a pull request into main.
Reviewer: assign Phu.
See CONTRIBUTING.md for the full workflow.
-->

## What changed

<!-- Briefly explain what you changed. -->

## Why

<!-- The problem this solves. Link the issue, e.g. "Closes #12". -->

## How to test

<!-- Steps a reviewer can follow to check that it works, including which role to sign in as. -->

1.

## Checklist

- [ ] The target branch is `develop`
- [ ] The title follows Conventional Commits (`type: short description in lowercase`)
- [ ] This pull request covers one feature or fix only
- [ ] `npm run lint` passes in every app I changed
- [ ] Backend tests pass (`npm run test` and `npm run test:e2e` in `backend/`), if I changed the backend
- [ ] I added a row to **Where Things Live** in `CONTRIBUTING.md`, if I added a new area
- [ ] No secrets or `.env` files are committed
- [ ] Database changes include a Prisma migration, if I changed the schema
