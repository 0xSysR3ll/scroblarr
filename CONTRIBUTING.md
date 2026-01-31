# Contributing to Scroblarr

Thanks for your interest in contributing. This document covers how to get set up and submit changes.

## Code of conduct

Be respectful and constructive. We want Scroblarr to be a welcoming project for everyone.

## Getting started

1. **Fork** the repository on GitHub and clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/scroblarr.git
   cd scroblarr
   ```

2. **Base your work on `develop`** — Development happens on the `develop` branch only; `main` is for releases. After cloning, check out and track `develop`:

   ```bash
   git checkout develop
   git pull origin develop
   ```

3. **Install dependencies** (Node.js 18+ and pnpm 8+ required):

   ```bash
   pnpm install
   ```

4. **Create a branch** for your work (from `develop`):

   ```bash
   git checkout -b feature/your-feature
   # or
   git checkout -b fix/your-fix
   ```

5. **Run the app** and confirm everything works:
   ```bash
   pnpm dev
   ```
   Backend: http://localhost:3000  
   Frontend dev server: http://localhost:5173 (or use backend only; it serves the built app)

## Development workflow

### Running services

- `pnpm dev` — Runs backend and frontend together (backend serves frontend in dev too when built)
- `pnpm dev:backend` — Backend only (port 3000)
- `pnpm dev:frontend` — Frontend only (port 5173)
- `pnpm dev:docs` — Docusaurus docs site (port 3001)

### Code quality

Before committing, run:

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
- If you change setup, config, or behavior, update the relevant doc and/or `README.md`.

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

   Common types: `feat`, `fix`, `docs`, `refactor`, `style`, `test`, `chore`. Scope and body are optional. See [Conventional Commits](https://www.conventionalcommits.org). To use the project’s commit template: `git config commit.template .gitmessage` (from repo root).

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
