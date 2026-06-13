# Security

Please report security issues privately by opening a GitHub security advisory
or by contacting the repository owner.

Do not include real Kleinanzeigen credentials, cookies, browser profile files,
or full miniclaw configs in public issues.

## Scope

This plugin registers OpenClaw tools that start the bundled TypeScript
`miniclaw` runtime with fixed arguments. The plugin wrapper does not store
credentials or return full config contents to OpenClaw. Runtime operations pass
the configured local config path to miniclaw, so miniclaw reads that config
locally when it verifies or changes listings. Browser status and configure
tools inspect or edit only selected `browser:` settings.

Output returned to OpenClaw is redacted and capped. Local runtime logs,
temporary configs, diagnostics, browser profiles, and browser/session state
remain on the local machine and should be treated as sensitive. If an account
step needs hands-on work, handle that outside OpenClaw and then run the plugin
again.

OpenClaw approvals and `confirm: true` parameters are human review gates, not
sandbox boundaries. Keep `adRoots` limited to listing workspaces you intend the
plugin to read or write. Keep `approvalMode` at `all` unless local read-only
checks should run without an approval route.

Package install scripts are not used for this plugin. Installing the plugin
does not run setup commands.
