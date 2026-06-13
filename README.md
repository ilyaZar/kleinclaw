# KleinClaw

<p align="center">
  <a href="https://github.com/ilyaZar/kleinclaw/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ilyaZar/kleinclaw/ci.yml?branch=main&style=flat-square&logo=github&logoColor=white&label=CI&labelColor=2a7e3b&color=1b5e2a"></a>
  <a href="https://codecov.io/gh/ilyaZar/kleinclaw"><img alt="coverage" src="https://img.shields.io/codecov/c/github/ilyaZar/kleinclaw/main?style=flat-square&logo=codecov&logoColor=white&labelColor=6b3fa0&color=4b2d73"></a>
  <a href="https://github.com/ilyaZar/kleinclaw/blob/main/package.json"><img alt="version" src="https://img.shields.io/github/package-json/v/ilyaZar/kleinclaw?style=flat-square&label=version&labelColor=4a999d&color=346c6e"></a>
  <a href="https://docs.openclaw.ai/tools/clawhub"><img alt="OpenClaw code plugin" src="https://img.shields.io/badge/OpenClaw-code%20plugin-b83232?style=flat-square&labelColor=111111"></a>
  <a href="https://nodejs.org"><img alt="TypeScript Node 22+" src="https://img.shields.io/badge/TypeScript-Node%2022%2B-264a6e?style=flat-square&logo=typescript&logoColor=ffffff&labelColor=3178c6"></a>
  <a href="https://github.com/ilyaZar/kleinclaw/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/ilyaZar/kleinclaw?style=flat-square&labelColor=629944&color=446a30"></a>
</p>

<p align="center">
  <img alt="kleinclaw-logo" src="assets/repo_logo2.png" width="240">
</p>

KleinClaw is an OpenClaw plugin for running the bundled TypeScript `miniclaw`
runtime through typed Kleinanzeigen helper tools. The plugin wrapper does not
store Kleinanzeigen credentials or return full config contents to OpenClaw.

Operation tools pass the configured local `miniclaw` config path to the runtime,
and `miniclaw` reads that config locally when it verifies or changes ad
listings. Browser helper tools inspect or edit only selected non-secret
`browser:` keys. Command output returned to OpenClaw is capped and redacted.

## What it adds

KleinClaw gives an OpenClaw agent a local miniclaw runtime for Kleinanzeigen
listing workflows. The browser session, account checks, and credential-bearing
config stay inside the local runtime. OpenClaw receives capped, redacted command
results rather than credentials, cookies, or full config contents. Most users
should think in terms of workflows rather than individual helper names:

- Check setup, config wiring, and browser readiness before a live run.
- Discover listing folders inside configured `adRoots`.
- Draft inactive local ads from user-provided text and local image filenames.
- Verify one listing folder or the full miniclaw workspace before changes.
- Publish or republish, update, delete explicit IDs, download listings, and
  extend eligible ads after confirmation.
- Return capped, redacted outcomes so agents can report what happened without
  needing credentials, cookies, or full config contents.

The primary operation tools are `kleinanzeigen_verify`, `kleinanzeigen_publish`,
`kleinanzeigen_update`, `kleinanzeigen_delete`, `kleinanzeigen_download`, and
`kleinanzeigen_extend`. Drafting, discovery, and browser helpers are available
for agent-led setup and preflight, but the bundled helper skill should choose
those details during normal use.

The tools are optional because they run a local command. By default all tools
require OpenClaw approval before they run. OpenClaw approvals and
`confirm: true` parameters are human review gates, not sandbox boundaries. Keep
`adRoots` limited to listing workspaces you intend the plugin to read or write.
Set `approvalMode` to `mutating` only for local checks where status and verify
should run without an approval route. Set it to `none` only for local TUI/dev
sessions where no OpenClaw approval UI is connected. Account-changing tools
still require `confirm: true`. Tool output is capped and redacted for configured
paths, email addresses, and credential-like lines.

The package also ships a `kleinanzeigen-helper-skill` under `skills/`. OpenClaw
loads plugin skills when the plugin is enabled, so agents get the longer
operating guide for safe discovery, drafting, browser checks, publish preflight,
and result interpretation without putting those instructions into every tool
description.

## Install

```bash
openclaw plugins install clawhub:kleinclaw
```

The package includes the TypeScript `miniclaw` runtime. Configure the path to
your local miniclaw config or workspace.

For local development:

```bash
openclaw plugins install -l /path/to/kleinclaw
openclaw plugins enable kleinclaw
```

Restart the Gateway after installing plugin code.

## Configure

Add the plugin config under `plugins.entries.kleinclaw.config`. Either
`configPath` or `workingDirectory` must be set. `workspaceMode` defaults to
`portable`. Set it to `xdg` only when your miniclaw workspace already uses user
directories.

```json
{
  "plugins": {
    "entries": {
      "kleinclaw": {
        "enabled": true,
        "config": {
          "configPath": "/home/me/kleinanzeigen/config.yaml",
          "adRoots": ["/home/me/kleinanzeigen-ads"],
          "workspaceMode": "portable",
          "lang": "de",
          "timeoutMs": 120000,
          "maxOutputChars": 6000,
          "approvalMode": "all"
        }
      }
    }
  }
}
```

Also expose the optional tools through OpenClaw tool policy. Include `kleinclaw`
in `tools.alsoAllow` and, for sandboxed sessions, in
`tools.sandbox.tools.alsoAllow`. You can include individual tool names instead
when you need finer control. For a minimal KleinClaw-only dev agent:

```json
{
  "tools": {
    "profile": "full",
    "alsoAllow": ["kleinclaw"],
    "sandbox": {
      "tools": {
        "alsoAllow": ["kleinclaw"]
      }
    }
  }
}
```

OpenClaw approval requests include the operation, selector, explicit ad IDs, and
ad paths relative to configured `adRoots`. Check those details before approving
mutating tools.

### Ad authoring

KleinClaw can help an agent draft new local ads without giving it broad access
to your home directory. The authoring tools are scoped to configured `adRoots`:

```json
{
  "adRoots": ["/home/me/kleinanzeigen-ads"]
}
```

Use `kleinanzeigen_ad_schema` before drafting. It returns the supported YAML
shape, title and description limits, enum values, image-glob rules, and a safe
draft workflow. The key miniclaw constraints are:

- `title`: 10 to 65 characters.
- `description`: at most 4000 characters.
- `category`: built-in category name, custom mapped name, or category ID.
- `images`: glob patterns relative to the ad config file.
- `priceType: "FIXED"` requires `price`; `GIVE_AWAY` must not set `price`.

Use `kleinanzeigen_images_list` on a selected folder to discover candidate image
filenames and dimensions:

```json
{
  "directory": "/home/me/kleinanzeigen-ads/examples/sample-listing",
  "maxDepth": 1
}
```

Use `kleinanzeigen_read_ad` only for explicit examples you want the agent to
see. It reads one selected ad file under `adRoots` and redacts `contact:` fields
unless `includeContact` is set to `true`:

```json
{
  "adDirectories": ["/home/me/kleinanzeigen-ads/examples/sample-listing"]
}
```

Use `kleinanzeigen_draft_ad` to create a draft. Drafts default to
`active: false`, so they are not eligible for publishing until you deliberately
activate them:

```json
{
  "confirm": true,
  "directory": "/home/me/kleinanzeigen-ads/examples/sample-listing",
  "title": "Gebrauchte Kompaktlautsprecher",
  "description": "Guter Zustand. Abholung bevorzugt.",
  "category": "Elektronik > Audio",
  "price": 25,
  "priceType": "NEGOTIABLE",
  "shippingType": "PICKUP",
  "images": ["listing_*.{jpg,png}"]
}
```

Use `kleinanzeigen_set_ad_active` to activate exactly one selected YAML ad
config before publishing. The tool only changes the top-level `active:` value:

```json
{
  "confirm": true,
  "adDirectories": ["/home/me/kleinanzeigen-ads/examples/sample-listing"],
  "active": true
}
```

Recommended loop:

1. List images with `kleinanzeigen_images_list`.
2. Create a draft with `kleinanzeigen_draft_ad`.
3. Run scoped `kleinanzeigen_verify` on that draft directory.
4. Re-read the ad with `kleinanzeigen_read_ad` before publishing.
5. If `active` is not `true`, use `kleinanzeigen_set_ad_active`.
6. Run scoped `kleinanzeigen_verify` again.
7. Publish with `kleinanzeigen_publish` scoped to the same directory.

For scoped publish calls, KleinClaw checks the selected ad file before running
miniclaw. If the selected ad is not `active: true`, the tool returns a preflight
diagnostic instead of running a publish command that miniclaw would skip.

### Browser settings

Use `kleinanzeigen_browser_status` before publishing when browser state matters.
It reports the configured `browser:` values, the effective browser miniclaw will
try, and locally detected Chromium, Brave, Chrome, and Edge binaries. The
supported `browser` choices intentionally match embedded miniclaw support:
`auto`, `chromium`, `google-chrome`, and `microsoft-edge`.

```json
{
  "browser": "chromium",
  "usePrivateWindow": true,
  "profileMode": "workspace",
  "confirm": true
}
```

`profileMode: "workspace"` clears `browser.user_data_dir` and `profile_name`, so
the runtime uses its dedicated workspace browser profile. The `system-default`
mode points the config at the chosen browser's normal local profile root. That
can reuse local login state, but it can also fail if the same browser profile is
already open or locked. The `custom` mode requires `userDataDir` and can also
set `profileName`:

```json
{
  "browser": "google-chrome",
  "usePrivateWindow": false,
  "profileMode": "custom",
  "userDataDir": "/home/me/.config/google-chrome",
  "profileName": "Default",
  "confirm": true
}
```

Use `browser: "auto"` to clear `browser.binary_location` and let miniclaw choose
its default Chromium, Chrome, or Edge executable.
`kleinanzeigen_browser_configure` edits only selected scalar keys under
`browser:` and still requires `confirm: true`.

Brave is a Chromium-family browser and may work as a custom executable, but it
is not documented or auto-detected by miniclaw. KleinClaw reports it from
`kleinanzeigen_browser_status` when installed, but does not expose it as a
supported `browser` choice. To try it anyway, use an explicit `binaryLocation`
and set `allowUnsupportedBrowser: true`:

```json
{
  "binaryLocation": "/usr/bin/brave",
  "allowUnsupportedBrowser": true,
  "usePrivateWindow": true,
  "profileMode": "workspace",
  "confirm": true
}
```

Use `kleinanzeigen_browser_check` before changing the real config when you want
to test whether miniclaw diagnostics accept a proposed browser setup. The check
writes a temporary config and leaves the real miniclaw config unchanged:

```json
{
  "browser": "chromium",
  "usePrivateWindow": false,
  "profileMode": "workspace"
}
```

After publishing or updating, operation tools return a structured `outcome` with
success state, final `DONE:` counts, published or updated IDs when miniclaw
prints them, and selected ad config changes observed after miniclaw exits. This
lets agents distinguish a real failure from a successful browser run with noisy
process cleanup.

When the miniclaw config contains many ads, one invalid unrelated ad can make
the runtime reject the whole run before it applies `--ads` filtering. To operate
on one known source folder, configure `adRoots`, use `kleinanzeigen_list_ads` to
find the folder, then pass `adDirectories` or `adConfigPaths` to
`kleinanzeigen_verify`, `kleinanzeigen_publish`, or the other operation tools:

```json
{
  "adDirectories": ["/home/me/kleinanzeigen-ads/examples/sample-listing"]
}
```

For publishing that one folder only, combine the scoped directory with
`selector: "all"` or an explicit `adIds` list plus `confirm: true`. The scoped
paths must be inside `adRoots`; KleinClaw writes a temporary miniclaw config
with only those ad files and deletes it after the run.

When miniclaw reports validation failures, KleinClaw returns structured
`diagnostics` and `nextActions` alongside the sanitized stdout/stderr. For
example, a full verify blocked by an unrelated overlong title can point the
agent at the failing ad and suggest either fixing it or using a scoped operation
for the intended listing.

For publishing combinations, pass `selectors` as a list such as
`["changed", "due"]`. Do not mix selectors with explicit ad IDs.

## Troubleshooting

If a routed agent sees the KleinClaw skill but no callable `kleinanzeigen_*`
tools, check sandbox tool policy. A Gateway log like `sandbox tools.allow`
removing `kleinanzeigen_status` means the plugin loaded, but the sandbox gate
hid its tools from that session.

```json
{
  "tools": {
    "alsoAllow": ["kleinclaw"],
    "sandbox": { "tools": { "alsoAllow": ["kleinclaw"] } }
  }
}
```

Restart or reload Gateway, then verify with `openclaw sandbox explain --json`
and a `kleinanzeigen_status` smoke test.

## Notes

The embedded runtime still owns browser automation and account checks. KleinClaw
can select the browser binary, private-window flag, and profile config, but it
does not work around Kleinanzeigen checks. Browser profile modes can reuse local
login state, so use the workspace profile by default unless you deliberately
want system-default or custom profile behavior. If Kleinanzeigen asks for a
normal account check, handle it outside chat in a terminal/browser, and then
come back to `kleinanzeigen_verify`.

**Keep passwords, cookies, browser profile data, and full miniclaw config files
out of chat**. The runtime handles auth and listing work locally through your
configured workspace. Fix auth and account state locally, then run
`kleinanzeigen_verify` again.

## Development

```bash
npm test
npm run package:check
npm pack --dry-run --json --ignore-scripts
npx clawhub package publish . --dry-run --json \
  --source-repo ilyaZar/kleinclaw \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "$(git branch --show-current)"
```

## Disclaimer

Unofficial helper; not affiliated with Kleinanzeigen.
