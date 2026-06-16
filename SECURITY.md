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

Ad handles returned by discovery tools are relative to configured `adRoots`.
Scoped tools resolve those handles locally and do not return absolute ad roots,
ad directories, miniclaw config paths, or scoped runtime override paths. Browser
status does not return configured profile names or profile directories.

Publish-error diagnostics intentionally avoid storing full ad configs, listing
titles, page URLs, screenshots, or page HTML. If local log-copy diagnostics are
enabled, copied logs can still contain sensitive runtime context and should stay
local. Login diagnostics are disabled by default; when explicitly enabled they
can write local screenshots, HTML, and log copies, and those artifacts should
stay local.

OpenClaw approvals and `confirm: true` parameters are human review gates, not
sandbox boundaries. Keep `adRoots` limited to listing workspaces you intend the
plugin to read or write. The shipped `approvalMode` default is `all`, which
routes every KleinClaw tool through OpenClaw approval. Set it to `mutating` or
`none` only for trusted local operator workflows.

Package install scripts are not used for this plugin. Installing the plugin
does not run setup commands.
