# miniclaw

`miniclaw` is a TypeScript CLI for managing local Kleinanzeigen listing files
and running explicitly gated browser workflows.

It is supported both as a standalone package and as the runtime bundled with
KleinClaw. KleinClaw releases always contain their matching miniclaw build, so
KleinClaw users do not need to install another copy.

## Requirements and installation

Miniclaw requires Node.js 22 or newer.

```bash
npm install --global @ilyazar/miniclaw
miniclaw help
```

The installed executable remains named `miniclaw`.

## Getting started

Create and verify a local configuration:

```bash
miniclaw create-config --config ./config.yaml
miniclaw verify --config ./config.yaml
miniclaw diagnose --config ./config.yaml
```

Configuration, listing files, credentials, browser profiles, and session state
remain on the local machine. Do not commit or share real credentials, cookies,
or browser profiles.

Browser-backed commands are `publish`, `update`, `delete`, `download`, and
`extend`; all require the explicit `--allow-live-browser` gate. Publish,
update, delete, and extend can change live listings. Use `--ad-file <PATH>`
more than once to limit a command to selected listing files.

Run `miniclaw help` for the complete command and option reference.

## Structured output

Use `--output=json` for one versioned result document on stdout. Human progress
and error details remain on stderr.

```json
{
  "schemaVersion": 1,
  "command": "publish",
  "status": "succeeded",
  "counts": {
    "changed": 1,
    "failed": 0,
    "total": 1
  }
}
```

Status is `succeeded`, `no_op`, `partial_failure`, or `failed`. Counts can also
include `skipped`. Diagnostics contain a bounded `code`, `severity`, and
`message`, plus an optional `retryAfterSeconds`.

Machine consumers must use the structured status, not English output or the
exit code alone. Batch item failures retain the existing CLI exit behavior, so
`partial_failure` and `failed` can accompany exit code 0. Parse and runtime
errors use exit code 2, captcha uses 3, and a temporary IP-range block uses 4.
`diagnose` preserves its human CLI exit behavior and reports failed checks in
the structured status.

## Programmatic use

Both supported package entrypoints expose the same small runner:

- `@ilyazar/miniclaw`
- `@ilyazar/miniclaw/cli`

```ts
import { run } from "@ilyazar/miniclaw";

const exitCode = await run(["node", "miniclaw", "verify"]);
```

The package exports only `run(argv?)`. Configuration models, file helpers,
test-injection hooks, command parsers, browser controllers, orchestration
policies, and other implementation details are not public APIs.

Deep implementation imports are unsupported. The package remains pre-1.0, so
documented exports may still change in a minor release. Supported API changes
are recorded in the
[KleinClaw changelog](https://github.com/ilyaZar/kleinclaw/blob/main/CHANGELOG.md).

## Development and release

Builds and releases are controlled from the KleinClaw repository root so the
embedded and standalone artifacts stay aligned:

```bash
npm run verify
npm pack --dry-run --json --ignore-scripts ./miniclaw
```

Do not publish directly from an unbuilt `miniclaw/` checkout.

## Source and license

The package includes both TypeScript source and compiled JavaScript. Miniclaw is
licensed under AGPL-3.0-or-later. See `NOTICE` for source attribution and
modification history, and `LICENSE` for the complete license terms.
