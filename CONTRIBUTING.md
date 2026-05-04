# Contributing to Scroblarr

Thanks for your interest in contributing. This document covers how to get set up and submit changes.

## Code of conduct

Be respectful and constructive. We want Scroblarr to be a welcoming project for everyone.

## Tools required

- A code editor with good TypeScript/JavaScript support (for example, VS Code).
- [Node.js](https://nodejs.org/) 18+ (20 LTS recommended; the repo has a [.node-version](.node-version) file).
- [pnpm](https://pnpm.io/cli/install).
- [Git](https://git-scm.com/downloads).

## Getting started

1. **Fork** the repository on GitHub and clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/scroblarr.git
   cd scroblarr
   ```

2. **Add the upstream remote (optional but recommended)** — This makes it easy to sync your fork with the main repo:

   ```bash
   git remote add upstream https://github.com/0xsysr3ll/scroblarr.git
   ```

3. **Base your work on `develop`** — Development happens on the `develop` branch only; `main` is for releases. After cloning, check out and track `develop`:

   ```bash
   git checkout develop
   git pull origin develop
   ```

4. **Install dependencies** (Node.js 18+ and pnpm 8+ required):

   ```bash
   pnpm install
   ```

5. **Create a branch** for your work (from `develop`):

   ```bash
   git checkout -b feature/your-feature
   # or
   git checkout -b fix/your-fix
   ```

   **Good branch names** describe the change:
   - `feat-sync-history-filter`
   - `fix-dashboard-timezone`
   - `docs-update-installation`

   **Avoid** overly generic names:
   - `bug`
   - `feature`
   - `docs`
   - `patch`

6. **Run the app** and confirm everything works:

   ```bash
   pnpm dev
   ```

   Backend: http://localhost:3000  
   Frontend dev server: http://localhost:5173 (or use backend only; it serves the built app)

   Alternatively, you can use Docker (see `README.md` for compose examples) if you prefer not to install Node.js and pnpm directly on your machine.

7. **Keep your branch up to date** — Periodically rebase your branch on the latest `develop`:

   ```bash
   git fetch upstream
   git checkout develop
   git pull upstream develop
   git checkout your-branch-name
   git rebase develop
   ```

## Development workflow

### Running services

- `pnpm dev` — Runs backend and frontend together (backend serves frontend in dev too when built)
- `pnpm dev:backend` — Backend only (port 3000)
- `pnpm dev:frontend` — Frontend only (port 5173)
- `pnpm dev:docs` — Docusaurus docs site (port 3001)

### Code quality

A **pre-commit hook** (Husky + lint-staged) runs on every commit: it formats and lints only the files you staged. If it fails, fix the reported issues and commit again (or run `pnpm check` to validate the whole repo). To skip the hook: `git commit --no-verify`.

Before pushing, run:

```bash
pnpm check
```

This runs:

- **Lint** — ESLint across backend, frontend, and shared
- **Format check** — Prettier (no trailing changes)
- **Type check** — TypeScript in all packages

**Fix issues automatically:**

```bash
pnpm format      # Format all files with Prettier
pnpm lint:fix    # ESLint --fix in all packages
```

**Per-package:**

```bash
pnpm --filter '@scroblarr/backend' lint:fix
pnpm --filter '@scroblarr/frontend' lint:fix
```

### Project structure

- `packages/backend` — Express API, webhooks, sync service, TypeORM
- `packages/frontend` — React app (Vite, Tailwind)
- `packages/shared` — Shared types and utilities
- `website/` — Docusaurus documentation

See the [Architecture](https://0xsysr3ll.github.io/scroblarr/docs/architecture) doc for more detail.

### Database

- **Development:** SQLite is used by default; DB file is created under `data/`.
- **Migrations:** From repo root, run migrations with:
  ```bash
  pnpm --filter '@scroblarr/backend' migration:run
  ```
- **PostgreSQL:** Set `POSTGRES_*` env vars if you prefer PostgreSQL locally.

### Documentation

- User-facing docs live in `website/docs/` (Docusaurus).
- The **REST API** section of the docs site is generated from `packages/backend/openapi.yaml` when you run `pnpm build:docs` or `pnpm --filter '@scroblarr/website' gen-api-docs` (output is under `website/docs/api/` and is gitignored). After changing the OpenAPI spec, run a docs build locally to confirm it still generates and compiles.
- If you change setup, config, or behavior, update the relevant doc and/or `README.md`.

### UI text style

When adding or updating UI text (labels, tooltips, messages), please:

1. Be concise and clear; prefer simple language.
2. Use correct capitalization for proper nouns (for example, Plex, Jellyfin, PostgreSQL).
3. Title-case headings, button text, and form labels where it matches existing UI.
4. Make validation errors and dropdown labels grammatically correct and free of spelling mistakes.
5. Ensure toast/notification messages are complete sentences and end with punctuation.

## Submitting changes

1. **Keep changes focused** — One logical change per branch (one feature or one fix).

2. **Use conventional commits** — All commit messages in this repo use the conventional format so the changelog (git-cliff) stays consistent:

   ```
   <type>(<scope>): <description>
   ```

   Examples:
   - `feat(frontend): add filter by source in sync history`
   - `fix(backend): correct UTC week start in dashboard stats`
   - `docs: update Docker Compose example`
   - `chore: initial commit`

   Common types: `feat`, `fix`, `docs`, `refactor`, `style`, `test`, `chore`. Scope and body are optional. See [Conventional Commits](https://www.conventionalcommits.org). To use the project's commit template: `git config commit.template .gitmessage` (from repo root).

3. **Push your branch** and open a **Pull Request against `develop`** on the main repo (development happens on `develop` only; `main` is for releases).

4. **PR description** — Briefly describe what you changed and why. Reference any issue (e.g. `Fixes #123`).

5. **CI** — Ensure `pnpm check` (and any other checks) pass. Address review feedback if requested.

## Reporting issues

- **Bug reports:** Include steps to reproduce, expected vs actual behavior, and your environment (OS, Node version, Docker vs manual, etc.).
- **Feature ideas:** Open an issue and describe the use case; discussion is welcome before coding.

## Questions

- Check the [documentation](https://0xsysr3ll.github.io/scroblarr/docs) and [Troubleshooting](https://0xsysr3ll.github.io/scroblarr/docs/troubleshooting) first.
- Open a [GitHub Discussion](https://github.com/0xsysr3ll/scroblarr/discussions) or an issue if something is unclear.

Thank you for contributing.
