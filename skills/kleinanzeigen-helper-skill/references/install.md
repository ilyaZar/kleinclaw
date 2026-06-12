## Prerequisites / Install

- Install [KleinClaw](https://clawhub.ai/plugins/kleinclaw), then enable it:

  ```bash
  openclaw plugins install clawhub:kleinclaw
  openclaw plugins enable kleinclaw
  openclaw gateway restart
  ```

- Configure KleinClaw under `plugins.entries.kleinclaw.config` with
  `configPath` or `workingDirectory`. The plugin bundles the `miniclaw`
  runtime, so no separate executable path is required.
- Keep Kleinanzeigen credentials, browser profiles, cookies, and full config
  files out of chat.
