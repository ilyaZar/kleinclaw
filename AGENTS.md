# KleinClaw Local Notes

This repo is the OpenClaw plugin package for KleinClaw. It registers typed
tools that call a separately installed `kleinanzeigen-bot` executable. Do not
add code that installs the upstream bot, reads its full config, stores
Kleinanzeigen credentials, or tries to work around account checks.

For local OpenClaw testing:

```bash
openclaw plugins install -l /home/iz/Dropbox/projects/openclaw/own-plugins/kleinclaw
openclaw plugins enable kleinclaw
```

Configure it under `plugins.entries.kleinclaw.config`. Point `cliPath` at the
local bot executable or a small wrapper script. Use `configPath` or
`workingDirectory` for the bot workspace, and keep real credentials, cookies,
browser profiles, and full bot configs out of chat and commits.

Useful dev checks:

```bash
npm test
npm run coverage
npm pack --dry-run --json --ignore-scripts
npx --yes clawhub package publish . --dry-run --json \
  --source-repo ilyaZar/kleinclaw \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "$(git branch --show-current)"
```

Before publishing, inspect the package file list from `npm pack`. This
`AGENTS.md` file is for local agent guidance and should stay out of the
published package unless that is changed deliberately.
