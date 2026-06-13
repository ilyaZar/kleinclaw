# KleinClaw Local Notes

This repo is the OpenClaw plugin package for KleinClaw. It registers typed tools
backed by the embedded TypeScript `miniclaw` runtime. Do not add code that
installs external automation dependencies, reads the full config, stores
Kleinanzeigen credentials, or tries to work around account checks.

## For repeated OpenClaw testin

```bash
openclaw plugins install -l \
  /home/iz/Dropbox/projects/openclaw/own-plugins/kleinclaw
openclaw plugins enable kleinclaw
```

Configure it under `plugins.entries.kleinclaw.config`. Use `configPath` or
`workingDirectory` for the miniclaw workspace, and keep real credentials,
cookies, browser profiles, and full config files out of chat and commits.

## Useful dev checks at important checkpoint

```bash
npm test
npm run package:check
npm run coverage
npm pack --dry-run --json --ignore-scripts
npx --yes clawhub package validate .
npx --yes clawhub package publish . --dry-run --json \
  --source-repo ilyaZar/kleinclaw \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "$(git branch --show-current)"
```

**Before publishing, inspect the package file list from `npm pack`.**
