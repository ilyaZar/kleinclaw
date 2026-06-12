# Security

Please report security issues privately by opening a GitHub security advisory
or by contacting the repository owner.

Do not include real Kleinanzeigen credentials, cookies, browser profile files,
or full miniclaw configs in public issues.

## Scope

This plugin starts the bundled TypeScript `miniclaw` runtime with fixed
arguments. It does not store credentials, read full config contents, or call
Kleinanzeigen from automated tests. Output returned to OpenClaw is redacted and
capped, but local runtime logs and browser/session state remain outside this
package. If an account step needs hands-on work, handle that outside OpenClaw
and then run the plugin again.

Package install scripts are not used for this plugin. Installing the plugin
does not run setup commands.
