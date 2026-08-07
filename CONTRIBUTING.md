# Contributing to vacti

Thanks for your interest in improving vacti. This is a standard fork-and-pull-request project.

## Workflow

1. **Fork** the repository and clone your fork.
2. **Branch** from an up-to-date `main` (e.g. `feat/scan-diff-export`).
3. Make focused changes with tests.
4. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat(recon): ...`, `fix(reports): ...`). commitlint enforces this.
5. Run the checks locally (see below), then **open a pull request** against `main` with a clear
   description of what changed and why.

## Local setup

```bash
npm ci
cp .env.example .env   # fill secrets
npm run dev            # or: make up
```

See [`docs/how-to/setup-development-environment.md`](docs/how-to/setup-development-environment.md)
for the full environment guide.

## Before you push

```bash
npm run typecheck
npm run lint
npm run test:quick          # unit
npm run test:integration    # integration (needs Postgres)
npm run e2e                 # Playwright e2e
```

Git hooks run a lint/format/commit-message check automatically. Please do not bypass them with
`--no-verify` except for genuine emergencies.

## Standards

- Prettier `printWidth: 120`; ESLint clean; markdownlint clean.
- No em dashes in code, docs, or generated output (use a hyphen or colon).
- Add tests at the right tier: unit (`test:quick`), integration (`test:integration`), or e2e
  (`e2e`). See [`docs/how-to/run-tests.md`](docs/how-to/run-tests.md).
- Keep within the [feature scope](docs/planning/02-FEATURE-PARITY-CHECKLIST.md). Out-of-scope items
  (bug-bounty sync, screenshots, extra scanners, Ruby, etc.) are rejected - see
  [ROADMAP.md](ROADMAP.md).

## Reporting bugs and requesting features

Open an issue with reproduction steps (for bugs) or a clear use case (for features). For
security-sensitive reports, follow [`SECURITY.md`](SECURITY.md) instead of filing a public issue.
</content>
