# Contributing

Thanks for helping out.

## Setup

```bash
npm install
npm test
```

## Before opening a PR

```bash
npm run lint
npm run type-check
npm test
npm run build
```

CI runs these against React 18 and 19.

## Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Public API changes need a README update in the same PR.
- New hooks need tests covering the loading, success, and error paths.
- Keep the package dependency-free. `react` stays the only peer dependency —
  an SDK that drags in a data-fetching library is a much harder sell.

## Reporting bugs

Include the `requestId` from the `HeadBoardError` — it maps to a server-side log entry.
