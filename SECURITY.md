# Security

Please report security issues privately by opening a GitHub security advisory
or by contacting the repository owner.

Do not include real Kleinanzeigen credentials, cookies, browser profile files,
or full bot configs in public issues.

## Scope

This plugin starts a local `kleinanzeigen-bot` command with fixed arguments. It
does not store credentials, read bot config contents, or call Kleinanzeigen
directly. Output returned to OpenClaw is redacted and capped, but local bot logs
and browser/session state remain outside this package.
