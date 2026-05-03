# Kleinanzeigen Helper

OpenClaw plugin for running a local `kleinanzeigen-bot` setup through typed
tools. It does not store Kleinanzeigen credentials and it does not read the bot
config. The bot stays installed and configured on the user's machine; this
plugin just passes narrow commands to it and redacts the output before returning
it to OpenClaw.

This is an unofficial helper. It is not affiliated with Kleinanzeigen.

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

```bash
openclaw plugins install clawhub:kleinanzeigen-helper
```

Install and set up `kleinanzeigen-bot` separately first, then point this plugin
at that local executable and config.

For local development:

```bash
openclaw plugins install -l /path/to/kleinanzeigen-helper-plugin
openclaw plugins enable kleinanzeigen-helper
```

Restart the Gateway after installing plugin code.

## Configure

Add the plugin config under `plugins.entries.kleinanzeigen-helper.config`.
Either `configPath` or `workingDirectory` must be set.

```json
{
  "plugins": {
    "entries": {
      "kleinanzeigen-helper": {
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
  --source-repo ilyaZar/kleinanzeigen-helper-plugin \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "$(git branch --show-current)"
```
