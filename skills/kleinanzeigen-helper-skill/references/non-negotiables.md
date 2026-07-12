## Non-negotiables

- Use only the Kleinanzeigen plugin tools for operations.
- Do not use `exec`, browser automation, direct HTTP requests, or shell commands
  for Kleinanzeigen work.
- Do not ask for, read, print, summarize, store, inspect, or infer Kleinanzeigen
  usernames, passwords, SMS or 2FA codes, cookies, browser profiles, session
  data, or credential-bearing config files.
- Do not ask the user to paste `config.yaml`, browser settings, cookies, logs,
  or credential-like snippets.
- Keep `adRoots` narrow. Do not broaden `adRoots` or change `approvalMode` on
  the user's behalf. Only an operator config change or the user's OpenClaw
  **Always allow** choice may change the mode.
- KleinClaw tool approval depends on local OpenClaw configuration. Mutating
  tools always require explicit user confirmation through their `confirm`
  parameter.
