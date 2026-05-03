# KleinClaw

<p align="center">
  <a href="https://github.com/ilyaZar/kleinclaw/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ilyaZar/kleinclaw/ci.yml?branch=main&style=flat-square&logo=github&logoColor=white&label=CI&labelColor=2a7e3b&color=1b5e2a"></a>
  <a href="https://codecov.io/gh/ilyaZar/kleinclaw"><img alt="coverage" src="https://img.shields.io/codecov/c/github/ilyaZar/kleinclaw/main?style=flat-square&logo=codecov&logoColor=white&labelColor=6b3fa0&color=4b2d73"></a>
  <a href="https://github.com/ilyaZar/kleinclaw/blob/main/package.json"><img alt="version" src="https://img.shields.io/github/package-json/v/ilyaZar/kleinclaw?style=flat-square&label=version&labelColor=4a999d&color=346c6e"></a>
  <a href="https://docs.openclaw.ai/tools/clawhub"><img alt="OpenClaw code plugin" src="docs/badges/openclaw-code-plugin.svg"></a>
  <a href="https://nodejs.org"><img alt="JavaScript Node 22+" src="https://img.shields.io/badge/JavaScript-Node%2022%2B-264a6e?style=flat-square&logo=javascript&logoColor=111827&labelColor=f7df1e"></a>
  <a href="https://github.com/ilyaZar/kleinclaw/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/ilyaZar/kleinclaw?style=flat-square&labelColor=629944&color=446a30"></a>
</p>

KleinClaw is an OpenClaw plugin for running a local
[`kleinanzeigen-bot`][kleinanzeigen-bot] setup through typed Kleinanzeigen
helper tools. It does not store Kleinanzeigen credentials and it does not read
the bot config. The bot stays installed and configured on the user's machine;
this plugin just passes narrow commands to it and redacts the output before
returning it to your OpenClaw agent.

## What it adds

- `kleinanzeigen_status`: checks local bot availability and config wiring.
- `kleinanzeigen_verify`: checks the configured local bot setup.
- `kleinanzeigen_publish`: publishes or republishes selected ads.
- `kleinanzeigen_update`: updates changed or selected ads.
- `kleinanzeigen_delete`: deletes explicit ad IDs.
- `kleinanzeigen_download`: downloads selected ads into the bot workspace.
- `kleinanzeigen_extend`: extends eligible selected ads.

The tools are optional because they run a local command. All tools require
OpenClaw approval before they run. Account-changing tools also require
`confirm: true`. Tool output is capped and redacted for configured paths, email
addresses, and credential-like lines.

## Install

### Kleinanzeigen tool

Install and set up [`kleinanzeigen-bot`][kleinanzeigen-bot] separately first,
then point this plugin at that local executable and config.

[kleinanzeigen-bot]:
  https://github.com/Second-Hand-Friends/kleinanzeigen-bot#installation

### This plugin

```bash
openclaw plugins install clawhub:kleinclaw
```

Installing this plugin does not download or install the upstream bot. For a
source checkout, point `cliPath` at a small executable wrapper script instead of
putting a shell command such as `pdm run app` there.

For local development:

```bash
openclaw plugins install -l /path/to/kleinclaw
openclaw plugins enable kleinclaw
```

Restart the Gateway after installing plugin code.

## Configure

Add the plugin config under `plugins.entries.kleinclaw.config`. Either
`configPath` or `workingDirectory` must be set. `workspaceMode` defaults to
`portable`. Set it to `xdg` only when your local bot setup already uses user
directories.

```json
{
  "plugins": {
    "entries": {
      "kleinclaw": {
        "enabled": true,
        "config": {
          "cliPath": "kleinanzeigen-bot",
          "configPath": "/home/me/kleinanzeigen-bot/config.yaml",
          "workspaceMode": "portable",
          "lang": "de",
          "timeoutMs": 120000,
          "maxOutputChars": 6000
        }
      }
    }
  }
}
```

For publishing combinations, pass `selectors` as a list such as
`["changed", "due"]`. Do not mix selectors with explicit ad IDs.

## Notes

The local bot owns browser/session behavior. If Kleinanzeigen asks for a normal
account check, run the bot directly in a terminal/browser, handle it there, and
then come back to `kleinanzeigen_verify`. **This plugin does not work around
those checks.**

**Keep passwords, cookies, browser profile data, and full bot config files out
of chat**. Fix bot auth and account state locally, then run
`kleinanzeigen_verify` again.

## Development

```bash
npm test
npm pack --dry-run --json --ignore-scripts
npx clawhub package publish . --dry-run --json \
  --source-repo ilyaZar/kleinclaw \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "$(git branch --show-current)"
```

## Disclaimer

Unofficial helper; not affiliated with Kleinanzeigen.
