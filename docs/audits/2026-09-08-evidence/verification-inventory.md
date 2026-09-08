# Verification inventory — 2026-09-08

## Scope and safety

- Repository audited: `/Users/lenquanhone/Projects/pholio-app`.
- Read-only inventory/version inspection plus the requested client test command.
- No client build, dependency install, backend test, server/database start, `.env` read, product edit, commit, or external write was performed.
- Landing-site package data was read from the sibling repository at `../pholio-site` (`/Users/lenquanhone/Projects/pholio-site`).
- Counts below are filesystem inventories at audit time. Source/test counts use `rg --files`; test files means filenames ending in `.test.*` or `.spec.*`.

## Client test result

Command:

```text
npm run --prefix client test
```

Result: exit code `0` (passed).

```text
> client@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/lenquanhone/Projects/pholio-app/client

 Test Files  89 passed (89)
      Tests  932 passed (932)
   Start at  16:49:15
   Duration  37.00s (transform 7.69s, setup 18.91s, import 32.13s, tests 73.80s, environment 98.72s)
```

The run also emitted jsdom/Node informational warnings (`Window's scrollTo()`, navigation not implemented, and experimental localStorage warning); none caused failures.

## Filesystem inventory

| Scope | Count | Definition |
| --- | ---: | --- |
| Backend route files | 73 | `src/**/routes/**/*.js` |
| Backend JavaScript source files | 381 | `src/**/*.js`, excluding test paths and `.test.js`/`.spec.js` names |
| Client source files | 570 | `client/src/**/*.{js,jsx,ts,tsx}` |
| Migration files | 231 | `migrations/**/*.js` |
| Test files | 380 | Repository files whose names end in `.test.*` or `.spec.*` |
| Netlify function files | 4 | All files under `netlify/functions/` (includes its `package.json`) |

For additional context, the backend contains 426 JavaScript files total, of which 45 match the test-file/path exclusion; the client contains 89 test files under `client/src`.

## Lockfile-resolved package versions

All three lockfiles use `lockfileVersion: 3`.

| Package area | Package | Manifest range | Resolved version | Node engine requirement |
| --- | --- | --- | --- | --- |
| Root | `express` | `4.22.2` | `4.22.2` | `>= 0.10.0` |
| Root | `puppeteer` | `^25.3.0` | `25.3.0` | `>=22.12.0` |
| Root | `@sparticuz/chromium` | `^149.0.0` | `149.0.0` | `^22.17.0 || >=24.0.0` |
| Client | `react` | `^19.2.4` | `19.2.4` | `>=0.10.0` |
| Client | `react-dom` | `^19.2.4` | `19.2.4` | not declared in lock entry |
| Client | `vite` | `^7.3.6` | `7.3.6` | `^20.19.0 || >=22.12.0` |
| Landing (`../pholio-site`) | `next` | `^16.1.6` | `16.3.0` | `>=20.9.0` |
| Landing (`../pholio-site`) | `react` | `^19.2.4` | `19.2.8` | `>=0.10.0` |
| Landing (`../pholio-site`) | `react-dom` | `^19.2.4` | `19.2.8` | not declared in lock entry |

The root and client manifests do not declare an `engines` field. The root manifest reports Express `4.22.2` in both manifest and lockfile; this is the package evidence captured here.

## Follow-up evidence

### Landing-site `npm audit`

Command run from `/Users/lenquanhone/Projects/pholio-site` (no fixes):

```text
npm audit --json --registry=https://registry.npmjs.org
```

The command exited `1`, because the audit reported one vulnerability. Audit counts: `info 0`, `low 0`, `moderate 0`, `high 1`, `critical 0`, `total 1`. Dependency totals: `prod 24`, `dev 385`, `optional 88`, `peer 0`, `peerOptional 0`, `total 446`. Advisory package name: `nanoid`.

### Cross-repo legal version

- `pholio-site/lib/legal-constants.ts`: `CURRENT_LEGAL_VERSION = "2026-07-18"`
- `pholio-app/src/shared/lib/legal-versions.js`: `CURRENT_LEGAL_VERSION = "2026-07-18"`
- Comparison: exact values match.

### Netlify function clarification

The inventory count of 4 files under `netlify/functions/` includes `package.json`. There are 3 executable function files: `cleanup-application-drafts.js`, `discover-reindex.js`, and `server.js`.
