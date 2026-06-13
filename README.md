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
  <img alt="kleinclaw-logo" src="assets/repo_logo2.png" width="480">
</p>

KleinClaw is an OpenClaw plugin for publishing "Inserate" on `kleinanzeigen.de`:
adding and deleting your own ads, managing the kleinanzeigen publishing process,
and related tasks around this more broadly. For non-German natives, "Inserate"
is the German word most people use for ads/listings on platforms resembling the
Ebay/marketplace style.

KleinClaw runs the bundled TypeScript `miniclaw` runtime through helper tools.
The plugin wrapper does not store `kleinanzeigen` credentials or expose full
credential-bearing config contents to the underlying OpenClaw agent.

Operation tools pass the configured local `miniclaw` config path to the runtime,
and `miniclaw` reads that config locally when it verifies or changes ad
listings. Browser helper tools inspect or edit only selected non-secret
`browser:` keys. Command output returned to OpenClaw is capped and redacted.

## What it adds

KleinClaw gives an OpenClaw agent a local miniclaw runtime for Kleinanzeigen
listing workflows. The browser session, account checks, and credential-bearing
config stay inside the local runtime. OpenClaw receives capped, redacted command
results: it **does not** receive credentials, cookies, or full config contents.

While the underlying `miniclaw` runtime can be used standalone, for example
directly from the CLI, most users should think in terms of workflows executed by
the OpenClaw agent, rather than individual helper names: the user expresses the
workflow, the agent drives the tools.

### Workflow

- Check setup, config wiring, and browser readiness before a live run.
- Discover listing folders inside configured `adRoots`.
- Draft inactive local ads from user-provided text and local image filenames.
- Verify one listing folder or the full miniclaw workspace before changes.
- Publish or republish, update, delete explicit IDs, download listings, and
  extend eligible ads after confirmation.
- Return capped, redacted outcomes so agents can report what happened without
  needing credentials, cookies, or full config contents.

A common approach is to have a directory, its path specified by `adRoots`, with
one sub-directory per item you want to sell. That folder holds its `.yaml`
config and images: together this defines a single Inserat or ad.

The primary operation tools are `kleinanzeigen_verify`, `kleinanzeigen_publish`,
`kleinanzeigen_update`, `kleinanzeigen_delete`, `kleinanzeigen_download`, and
`kleinanzeigen_extend`. Drafting, discovery, and browser helpers are available
for agent-led setup and preflight, but the bundled helper skill should choose
those details during normal use, meaning: your agent does the heavy lifting
while you provide images and loose descriptions of your Inserate/ads.

The tools are optional because they run a local command. By default all tools
require OpenClaw approval before they run. OpenClaw approvals and
`confirm: true` parameters are human review gates, not sandbox boundaries. Keep
`adRoots` limited to listing workspaces you intend the plugin to read or write.
Set `approvalMode` to `mutating` only for local checks where status and verify
should run without an approval route. Account-changing tools still require
`confirm: true`. Tool output is capped and redacted for configured paths, email
addresses, and credential-like lines.

The package also ships a `kleinanzeigen-helper-skill` under `skills/`. OpenClaw
loads plugin skills when the plugin is enabled, so agents get the longer
operating guide for safe discovery, drafting, browser checks, publish preflight,
and result interpretation without putting those instructions into every tool
description.

## Install

```bash
openclaw plugins install clawhub:kleinclaw
```

The plugin ships a built-in `kleinanzeigen-helper-skill`, so agents get workflow
guidance when the plugin is enabled. The same guidance is also published as the
standalone
[`kleinanzeigen-helper`](https://clawhub.ai/ilyazar/kleinanzeigen-helper) skill
from the [`ilyaZar/kleinanzeigen-helper` GitHub repo][helper-github] if you want
to install, inspect, or update the skill separately. The standalone skill adds
guidance only; the Kleinanzeigen publishing engine still comes from the
KleinClaw plugin.

[helper-github]: https://github.com/ilyaZar/kleinanzeigen-helper

The package includes the TypeScript `miniclaw` runtime engine for publishing.
Listing config, ad roots, and workspace mode are configured under the plugin
config below.

For local development:

```bash
openclaw plugins install -l /path/to/kleinclaw
openclaw plugins enable kleinclaw
```

Restart the Gateway after installing plugin code.

## Configure

OpenClaw keeps its settings in one active JSON config file. For normal local
installs that file is usually `~/.openclaw/openclaw.json`, but wrappers,
profiles, or services can point OpenClaw at a different file with
`OPENCLAW_CONFIG_PATH`. Check the exact file first:

```bash
openclaw config file
```

KleinClaw uses the usual OpenClaw plugin shape in that file. Plugin entries live
under `plugins.entries`, the entry name is the plugin id (`kleinclaw`), and the
plugin's own settings live under `plugins.entries.kleinclaw.config`.

There are two configs involved:

- The OpenClaw JSON config enables KleinClaw, exposes its tools, and tells the
  plugin where your local miniclaw workspace is.
- The miniclaw `config.yaml` stays separate. It contains the Kleinanzeigen-side
  settings that miniclaw reads locally when it verifies, publishes, updates, or
  downloads Inserate.

If your active OpenClaw config already contains `plugins` or `tools`, merge the
examples below into the existing JSON instead of replacing the whole file.

In your active OpenClaw config file, add or update this plugin block:

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

Plugin config fields:

- `enabled`: `true` loads the installed plugin.
- `configPath`: path to the local miniclaw `config.yaml`.
- `workingDirectory`: alternative to `configPath`; KleinClaw reads `config.yaml`
  from that directory. Use either `configPath` or `workingDirectory`.
- `adRoots`: directories where KleinClaw may discover, read, draft, or scope
  local ad folders. Keep this narrow.
- `workspaceMode`: `portable` or `xdg`. `portable` is the default and keeps
  miniclaw workspace files beside `config.yaml`; `xdg` uses user config/cache
  directories.
- `lang`: `de` or `en` for miniclaw display language.
- `timeoutMs`: maximum runtime for one miniclaw command, from `1000` to `600000`
  milliseconds.
- `maxOutputChars`: maximum sanitized stdout or stderr characters returned to
  the agent, from `0` to `20000`.
- `approvalMode`: `all` or `mutating`. `all` is the default and routes every
  KleinClaw tool through OpenClaw approval. `mutating` lets local checks such as
  status and verify run without approval, while account-changing tools still
  need approval and `confirm: true`.

Also expose the optional tools through OpenClaw tool policy. This is still the
same active OpenClaw config file, but now the block is top-level `tools`, next
to `plugins`:

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

Tool policy fields:

- `profile`: OpenClaw's built-in tool profile. Built-in values are `minimal`,
  `coding`, `messaging`, and `full`; `full` is shown here for a simple local
  first run.
- `alsoAllow`: extra tool groups or tool names to expose in normal agent
  sessions. `kleinclaw` means the tools from this plugin.
- `sandbox.tools.alsoAllow`: the same extra tool exposure for sandboxed
  sessions. Include this if your agents run through the sandbox tool gate.

You can allow individual tool names instead of `kleinclaw` when you want finer
control.

OpenClaw approval requests include the operation, selector, explicit ad IDs, and
ad paths relative to configured `adRoots`. Check those details before approving
mutating tools.

### Ad authoring

KleinClaw can help an agent draft new local ads without giving it broad access
to your home directory. The authoring tools are scoped to configured `adRoots`:

In your active OpenClaw config file, `adRoots` lives under
`plugins.entries.kleinclaw.config`:

```json
{
  "plugins": {
    "entries": {
      "kleinclaw": {
        "config": {
          "adRoots": ["/home/me/kleinanzeigen-ads"]
        }
      }
    }
  }
}
```

This smaller snippet shows only where `adRoots` belongs. Keep the rest of your
plugin config from the full block above.

Use `kleinanzeigen_ad_schema` before drafting. It returns the supported YAML
shape, title and description limits, enum values, image-glob rules, and a safe
draft workflow. The key miniclaw constraints are:

- `title`: 10 to 65 characters.
- `description`: at most 4000 characters.
- `category`: built-in category name, custom mapped name, or category ID.
- `images`: glob patterns relative to the ad config file.
- `priceType: "FIXED"` requires `price`; `GIVE_AWAY` must not set `price`.

Useful authoring tool fields:

- `directory`: target folder under `adRoots`; relative paths resolve under the
  first `adRoots` entry.
- `adDirectories`: existing ad folders under `adRoots`. Read and activate tools
  accept one; operation tools accept up to 20.
- `adConfigPaths`: exact ad YAML/JSON files under `adRoots`, as an alternative
  to `adDirectories`.
- `confirm`: must be `true` when a tool writes a draft or changes `active`.
- `includeContact`: `true` lets `kleinanzeigen_read_ad` return contact fields;
  default output redacts them.
- `fileName`: `ad.yaml` or `ad.yml`; drafts default to `ad.yaml`.
- `active`: `false` keeps an ad as a local draft; `true` makes it eligible for
  publish/update.
- `type`: `OFFER` or `WANTED`.
- `priceType`: `FIXED`, `NEGOTIABLE`, `GIVE_AWAY`, or `NOT_APPLICABLE`.
- `shippingType`: `PICKUP`, `SHIPPING`, or `NOT_APPLICABLE`.
- `images`: image glob patterns relative to the ad folder.

The package also ships a copyable inactive example at
`examples/sample-listing/ad.yaml`. It is not used automatically. Copy it into a
directory under your configured `adRoots`, adjust the text, category, price, and
image globs, then run scoped `kleinanzeigen_verify` before activating it.

Use `kleinanzeigen_images_list` on a selected folder to discover candidate image
filenames and dimensions:

Tool call JSON for `kleinanzeigen_images_list`; the agent sends this to the
tool, you do not paste it into `openclaw.json`:

```json
{
  "directory": "/home/me/kleinanzeigen-ads/examples/sample-listing",
  "maxDepth": 1
}
```

Use `kleinanzeigen_read_ad` only for explicit examples you want the agent to
see. It reads one selected ad file under `adRoots` and redacts `contact:` fields
unless `includeContact` is set to `true`:

Tool call JSON for `kleinanzeigen_read_ad`:

```json
{
  "adDirectories": ["/home/me/kleinanzeigen-ads/examples/sample-listing"]
}
```

Use `kleinanzeigen_draft_ad` to create a draft. Drafts default to
`active: false`, so they are not eligible for publishing until you deliberately
activate them:

Tool call JSON for `kleinanzeigen_draft_ad`:

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

Tool call JSON for `kleinanzeigen_set_ad_active`:

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

Useful browser tool fields:

- `browser`: `auto`, `chromium`, `google-chrome`, or `microsoft-edge`. `auto`
  clears `browser.binary_location` and lets miniclaw choose.
- `usePrivateWindow`: `true` or `false`; controls private/incognito browser
  launch.
- `profileMode`: for `kleinanzeigen_browser_configure`, use `workspace` or
  `system-default`. For `kleinanzeigen_browser_check`, `custom` is also allowed.
- `profileName`: optional browser profile folder name, such as `Default`; use
  this only with `profileMode: "system-default"`.
- `binaryLocation`: explicit browser executable path for
  `kleinanzeigen_browser_check`.
- `userDataDir`: custom browser user-data directory for
  `kleinanzeigen_browser_check` with `profileMode: "custom"`.
- `allowUnsupportedBrowser`: `true` lets browser checks try a browser miniclaw
  does not officially support.
- `confirm`: required by `kleinanzeigen_browser_configure`, because it edits the
  real miniclaw `browser:` config. Browser checks use a temporary config and do
  not require it.

Tool call JSON for `kleinanzeigen_browser_configure`; this edits the local
miniclaw `config.yaml`, not `openclaw.json`:

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
already open or locked. It can also set `profileName`:

Tool call JSON for `kleinanzeigen_browser_configure` using the browser's normal
local profile:

```json
{
  "browser": "google-chrome",
  "usePrivateWindow": false,
  "profileMode": "system-default",
  "profileName": "Default",
  "confirm": true
}
```

Use `browser: "auto"` to clear `browser.binary_location` and let miniclaw choose
its default Chromium, Chrome, or Edge executable.
`kleinanzeigen_browser_configure` edits only selected scalar keys under
`browser:` and still requires `confirm: true`. It does not persist custom
browser executable paths or custom profile directories from chat; edit those
directly in the local miniclaw config if you deliberately need them.

Brave is a Chromium-family browser and may work as a custom executable, but it
is not documented or auto-detected by miniclaw. KleinClaw reports it from
`kleinanzeigen_browser_status` when installed, but does not expose it as a
supported `browser` choice. To test it without changing the real config, use
`kleinanzeigen_browser_check` with an explicit `binaryLocation` and
`allowUnsupportedBrowser: true`:

Tool call JSON for `kleinanzeigen_browser_check`; this writes only a temporary
test config:

```json
{
  "binaryLocation": "/usr/bin/brave",
  "allowUnsupportedBrowser": true,
  "usePrivateWindow": true,
  "profileMode": "workspace"
}
```

Use `kleinanzeigen_browser_check` before changing the real config when you want
to test whether miniclaw diagnostics accept a proposed browser setup. The check
writes a temporary config and leaves the real miniclaw config unchanged:

Tool call JSON for another `kleinanzeigen_browser_check`:

```json
{
  "browser": "chromium",
  "usePrivateWindow": false,
  "profileMode": "workspace"
}
```

### Scoped operations

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

Tool call JSON for a scoped operation; the agent sends this to an operation
tool:

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

Operation tool fields:

- `confirm`: required for account-changing tools: publish, update, delete,
  download, and extend.
- `selector`: one selector string. Publish accepts `due`, `new`, `changed`, or
  `all`; update accepts `changed` or `all`; download accepts `new` or `all`;
  extend accepts `all`.
- `selectors`: publish-only list for combinations such as `["changed", "due"]`.
- `adIds`: explicit numeric Kleinanzeigen IDs. Required for delete.
- `adDirectories`: ad folders under `adRoots` used to scope the run.
- `adConfigPaths`: exact ad YAML/JSON files under `adRoots` used to scope the
  run.
- `keepOld`: publish-only `true`/`false`; keeps old ads during republication.

Do not mix selectors with explicit ad IDs.

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
want system-default profile behavior. If Kleinanzeigen asks for a normal account
check, handle it outside chat in a terminal/browser, and then come back to
`kleinanzeigen_verify`.

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
