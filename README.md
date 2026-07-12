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

The tools are part of KleinClaw's normal public plugin surface and run the
bundled local command. Current OpenClaw runtimes may discover them through tool
search instead of sending every schema up front; that does not make them
optional or disabled. By default all shipped KleinClaw tools route through
OpenClaw approval before they run. Choosing **Always allow** once stores
`approvalMode: "none"` in the plugin config, including across restarts, until an
operator changes the mode. **Allow once** does not change it. OpenClaw approval
is a human review gate; `confirm: true` is a separate tool-level intent guard,
not another authenticated approval or a sandbox boundary. Keep `adRoots` limited
to listing workspaces you intend the plugin to read or write. Mutating tools
still require `confirm: true`. Tool output is capped and redacted for configured
paths, email addresses, and credential-like lines.

The package also ships a `kleinanzeigen-helper-skill` under `skills/`. OpenClaw
loads plugin skills when the plugin is enabled, so agents get the longer
operating guide for safe discovery, drafting, browser checks, publish preflight,
and result interpretation without putting those instructions into every tool
description.

## Install

KleinClaw requires OpenClaw 2026.6.5 or newer.

### Managed installs

```bash
openclaw plugins install clawhub:kleinclaw
```

Managed installs enable KleinClaw automatically. Restart or reload the Gateway
after installing plugin code.

### Linked source checkout

In a directory of your choice, run

```bash
git clone https://github.com/ilyaZar/kleinclaw
cd kleinclaw
npm ci --ignore-scripts
```

OpenClaw does not install dependencies for linked local paths. After installing
the checkout's locked dependencies, link and enable it:

```bash
openclaw plugins install -l "$PWD"
openclaw plugins enable kleinclaw
openclaw gateway restart
```

### First browser login

Log in to `kleinanzeigen.de` once through the browser profile used by miniclaw
on the machine running the plugin. This creates the local session state that
later browser runs reuse; see [Browser settings](#browser-settings).

For both install methods, tool exposure depends on the active profile and
sandbox policy, not the install source. See [Configure](#configure) for the
conditional grants. Those steps use `openclaw config file`, so they also work on
the remaining inferior platforms :)

### Built-in skill

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
Start with the local ad files below. OpenClaw's JSON configuration and the JSON
payloads exchanged with tools are documented later under
[OpenClaw and tool-call JSON](#openclaw-and-tool-call-json).

## Ad folders and on-disk YAML

KleinClaw normally stores one Inserat per directory. Each configured `adRoots`
entry is a parent directory that KleinClaw may inspect, with ads living
somewhere as a subdirectory. This means, the following can be a useful setup for
structuring your ads

```text
kleinanzeigen-ads/                  <- one configured adRoot
  gebrauchte-kompaktlautsprecher/   <- one ad directory
    ad.yaml                         <- the on-disk ad
    images/
      front.jpg
      back.jpg
```

**NOTE**:

- `adRoots` defines where KleinClaw may discover and access ads. It does not
  replace miniclaw's separate `config.yaml` or the `ad_files` selection in that
  file.
- an alternative structure is possible, whereby you could have

```text
    kleinanzeigen-ads/                  <- one configured adRoot
      ongoing/                          <- some subdirectory
        gebrauchte-kompaktlautsprecher/ <- one ad directory
          ad.yaml                       <- the on-disk ad
          images/
            front.jpg
            back.jpg
        gebrauchter-fernseher/          <- another ad directory
          ad.yml                        <- the on-disk ad
          front.jpg
          back.jpg
      stale/                          <- some subdirectory
        gebrauchtwagen/
          ...
```

This means nesting is possible, and the `images/` directory is not strictly
required.

**The internal `miniclaw` also needs one separate runtime configuration file.**
Put that `config.yaml` at a location of your choice, outside the individual ad
directories. In OpenClaw, set `plugins.entries.kleinclaw.config.configPath` to
its full path. Alternatively, set
`plugins.entries.kleinclaw.config.workingDirectory` to the directory that
contains `config.yaml`. The complete OpenClaw JSON configuration is shown later
under [OpenClaw JSON configuration](#openclaw-json-configuration).

The two kinds of YAML have separate jobs:

- `ad.yaml` or `ad.yml` describes one local ad. This is the normal on-disk ad
  format and uses YAML keys such as `price_type` and `shipping_type`.
- `config.yaml` holds runtime-wide Kleinanzeigen settings and selects ad files
  through `ad_files`.

OpenClaw configuration and tool calls use JSON internally. Their camel-case
fields, such as `priceType`, are tool arguments; they are not files to save
inside an ad directory. The JSON details are given further below.

The normal YAML shape looks like this:

```yaml
active: false
type: OFFER
title: "Gebrauchte Kompaktlautsprecher"
description: |
  Guter Zustand. Abholung bevorzugt.
category: Audio_und_Hifi
price: 25
price_type: NEGOTIABLE
shipping_type: PICKUP
sell_directly: false
images:
  - "images/*.{jpg,jpeg,png}"
```

The package ships a fuller copyable example at
`examples/sample-listing/ad.yaml`. It is inactive and is not used automatically.
Copy its directory under an `adRoots` entry, adjust the content and image globs,
then verify it before activation.

### YAML fields and validation

Use `kleinanzeigen_ad_schema` to obtain the current supported YAML shape,
limits, enum values, image rules, and safe draft workflow without changing a
file. The main rules include:

- `title`, `description`, and `category` are required.
- `title` must contain 10 to 65 characters; `description` may contain at most
  4000 characters.
- `active: false` keeps the file local-only; `active: true` makes it eligible
  for publish and update operations.
- `type` is `OFFER` or `WANTED`.
- `price_type` is `FIXED`, `NEGOTIABLE`, `GIVE_AWAY`, or `NOT_APPLICABLE`.
  `FIXED` requires `price`; `GIVE_AWAY` must not set `price`.
- `shipping_type` is `PICKUP`, `SHIPPING`, or `NOT_APPLICABLE`.
- `images` contains glob patterns relative to the ad directory.

`kleinanzeigen_draft_ad` validates its tool arguments and writes `ad.yaml` or
`ad.yml` for you. If you write YAML manually, run a scoped
`kleinanzeigen_verify` before activation or publication. Miniclaw loads the file
and validates required values, limits, enum relationships, category and image
handling. Treat the schema returned by `kleinanzeigen_ad_schema` as the field
contract rather than relying on unspecified extra keys.

### Ad authoring

KleinClaw can help an agent draft local ads without giving it broad access to
your home directory. The authoring tools are scoped to configured `adRoots`.

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

Use `kleinanzeigen_images_list` to discover candidate image filenames and
dimensions. Use `kleinanzeigen_read_ad` only for explicit ads you want the agent
to see; contact fields remain redacted unless `includeContact` is true. Use
`kleinanzeigen_draft_ad` to write an inactive draft, then use
`kleinanzeigen_set_ad_active` to change only its top-level `active:` value.
Copyable JSON payloads for these tools are grouped under
[Authoring tool-call JSON](#authoring-tool-call-json).

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
`auto`, `chromium`, `google-chrome`, and `microsoft-edge`. Configured browser
profile names and profile directories are reported only as redacted
configured-state markers.

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

`profileMode: "workspace"` clears `browser.user_data_dir` and `profile_name`, so
the runtime uses its dedicated workspace browser profile. The `system-default`
mode points the config at the chosen browser's normal local profile root. That
can reuse local login state, but it can also fail if the same browser profile is
already open or locked. It can also set `profileName`.

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
`allowUnsupportedBrowser: true`.

Use `kleinanzeigen_browser_check` before changing the real config when you want
to test whether miniclaw diagnostics accept a proposed browser setup. The check
writes a temporary config and leaves the real miniclaw config unchanged. The
corresponding JSON payloads are grouped under
[Browser tool-call JSON](#browser-tool-call-json).

### Scoped operations

After publishing or updating, operation tools return a structured `outcome` with
success state, final `DONE:` counts, published or updated IDs when miniclaw
prints them, and selected ad config changes observed after miniclaw exits. This
lets agents distinguish a real failure from a successful browser run with noisy
process cleanup.

When the miniclaw config contains many ads, one invalid unrelated ad can make
the runtime reject the whole run before it applies `--ads` filtering. To operate
on one known source folder, configure `adRoots`, use `kleinanzeigen_list_ads` to
find the folder, then pass its relative `adDirectory` or `adPath` handle to
`adDirectories` or `adConfigPaths` on `kleinanzeigen_verify`,
`kleinanzeigen_publish`, or the other operation tools. A copyable payload is
under [Scoped-operation tool-call JSON](#scoped-operation-tool-call-json).

For publishing that one folder only, combine the scoped directory with
`selector: "all"` or an explicit `adIds` list plus `confirm: true`. The scoped
handles resolve under configured `adRoots`; absolute paths are accepted only
after the same containment check. KleinClaw passes those selected ad files as a
scoped runtime override, without writing a scoped copy of the full miniclaw
config.

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

## OpenClaw and tool-call JSON

The JSON in this section configures OpenClaw or represents arguments exchanged
between an agent and a tool. It is not the on-disk ad format. Do not save these
payloads as `ad.yaml`; use the YAML shape documented above for local ads.

### OpenClaw JSON configuration

OpenClaw keeps its settings in one active JSON config file. For normal local
installs that file is usually `~/.openclaw/openclaw.json`, but wrappers,
profiles, or services can point OpenClaw at a different file with
`OPENCLAW_CONFIG_PATH`. Check the exact file first:

```bash
openclaw config file
```

Plugin entries live under `plugins.entries`, and KleinClaw's settings live under
`plugins.entries.kleinclaw.config`. Merge this block into an existing config
instead of replacing the whole file:

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
- `configPath`: path to the separate miniclaw `config.yaml`.
- `workingDirectory`: alternative to `configPath`; KleinClaw reads `config.yaml`
  from that directory. Use one or the other.
- `adRoots`: parent directories containing the individual ad directories and
  their `ad.yaml` or `ad.yml` files. Keep this list narrow.
- `workspaceMode`: `portable` or `xdg`. `portable` is the default and keeps
  miniclaw workspace files beside `config.yaml`; `xdg` uses user config/cache
  directories.
- `lang`: `de` or `en` for miniclaw display language.
- `timeoutMs`: maximum runtime for one miniclaw command, from `1000` to `600000`
  milliseconds.
- `maxOutputChars`: maximum sanitized stdout or stderr characters returned to
  the agent, from `0` to `20000`.
- `approvalMode`: `all`, `mutating`, or `none`. `all` is the default; `mutating`
  asks only for side-effect tools. Choosing **Always allow** stores `none` while
  preserving tool-level `confirm: true` gates.

The `full` tool profile exposes KleinClaw without a separate tool grant. The
`coding` profile needs an additive plugin grant. Sandboxed agents need the same
grant at the sandbox layer:

```json
{
  "tools": {
    "profile": "coding",
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
  `coding`, `messaging`, and `full`; `coding` is shown here with its required
  additive plugin grant.
- `alsoAllow`: extra tool groups or tool names to expose in normal agent
  sessions. `kleinclaw` means the tools from this plugin.
- `sandbox.tools.alsoAllow`: the same extra tool exposure for sandboxed
  sessions. Include this if your agents run through the sandbox tool gate.

Do not set `allow` and `alsoAllow` in the same policy scope. If a scope already
uses `allow`, add `kleinclaw` there instead. The sandbox grant controls tool
exposure; native KleinClaw code still runs host-side in the Gateway.

OpenClaw approval requests show the operation, selector, explicit ad IDs, and ad
paths relative to configured `adRoots`. Check those details before approving
mutating tools.

### Authoring tool-call JSON

These payloads are generated by an agent and passed to KleinClaw tools. They use
JSON and camel-case tool fields; KleinClaw translates validated draft arguments
into on-disk YAML.

List image candidates:

```json
{
  "directory": "/home/me/kleinanzeigen-ads/examples/sample-listing",
  "maxDepth": 1
}
```

Read one ad with contact fields redacted:

```json
{
  "adDirectories": ["/home/me/kleinanzeigen-ads/examples/sample-listing"]
}
```

Create an inactive `ad.yaml` with `kleinanzeigen_draft_ad`:

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

Change only the top-level YAML `active:` value with
`kleinanzeigen_set_ad_active`:

```json
{
  "confirm": true,
  "adDirectories": ["/home/me/kleinanzeigen-ads/examples/sample-listing"],
  "active": true
}
```

### Browser tool-call JSON

`kleinanzeigen_browser_configure` edits selected keys in miniclaw's real
`config.yaml` after confirmation:

```json
{
  "browser": "chromium",
  "usePrivateWindow": true,
  "profileMode": "workspace",
  "confirm": true
}
```

To use the browser's normal local profile:

```json
{
  "browser": "google-chrome",
  "usePrivateWindow": false,
  "profileMode": "system-default",
  "profileName": "Default",
  "confirm": true
}
```

`kleinanzeigen_browser_check` writes only a temporary test config. For an
unsupported custom executable:

```json
{
  "binaryLocation": "/usr/bin/brave",
  "allowUnsupportedBrowser": true,
  "usePrivateWindow": true,
  "profileMode": "workspace"
}
```

To check a supported browser without changing the real config:

```json
{
  "browser": "chromium",
  "usePrivateWindow": false,
  "profileMode": "workspace"
}
```

### Scoped-operation tool-call JSON

The agent can pass a relative ad-directory handle to verify, publish, or other
operation tools without creating a second config file:

```json
{
  "adDirectories": ["examples/sample-listing"]
}
```

## Security Architecture

KleinClaw is designed so the OpenClaw agent can ask for listing work without
receiving your full local Kleinanzeigen setup. The agent-facing OpenClaw context
sees tool schemas, approval prompts when enabled, relative ad handles, and
capped redacted results. It does not receive Kleinanzeigen passwords, cookies,
browser profile paths, absolute ad roots, scoped runtime override paths, or the
full miniclaw config.

The local KleinClaw plugin is the boundary layer. It resolves relative handles
under configured `adRoots`, passes scoped ad-file overrides when needed, and
runs the bundled `miniclaw` runtime on your machine. `miniclaw` reads local ad
files and config locally, then drives the browser session for publish,
republish, update, delete, download, and extend operations.

The figure below shows that local files and browser/account state stay outside
the agent context. The mental model can be expressed in four layers, as given by
I-IV, with the arrows showing the interaction between the runtime layers.

```text
+-----------------------+                      +-------------------------------+
|   I. Local machine    |                      | II. agent-facing context     |
+-----------------------+                      +-------------------------------+
| adRoots/              |                      | sees relative handles only   |
|   sample-listing/     |                      | sees capped redacted output  |
|     ad.yaml           |                      | does not see full config     |
|     photos/*.jpg      |                      | does not see credentials     |
|                       |                      +--------+-------+--------------+
| miniclaw config.yaml  |                               |       ^
| credentials/cookies   |                               |       |
| browser/session state |                   tool calls/ |       | processed/
+---------+-------------+                   approvals   |       | redacted info
          ^                                             v       |
          | list / read / draft          +----------------------+-----------+
          | activate / scoped verify     | III. KleinClaw plugin & miniclaw |
          |                              +----------------------------------+
          |                              | local runtime boundary           |
          |                              | resolves handles under adRoots   |
          +------------------------------| passes scoped ad-file overrides  |
                                         | runs browser-backed operations   |
                                         +----------------------------------+
                                                        |
                                                        | browser automation:
                                                        | publish / republish
                                                        | update / delete / download
                                                        v
                                         +--------------+-----------------+
                                         | IV. browser @ kleinanzeigen.de |
                                         +--------------+-----------------+
                                         |                                |
                                         | account checks stay local      |
                                         +--------------------------------+
```

## Troubleshooting

If an agent sees the KleinClaw skill but no callable `kleinanzeigen_*` tools,
inspect the runtime first, then the affected fresh session:

```bash
openclaw plugins inspect kleinclaw --runtime --json
```

Use `/tools verbose` in that session. Under the `coding` profile, grant the
plugin ID once. If sandboxing is active, add the same sandbox-layer grant:

```json
{
  "tools": {
    "alsoAllow": ["kleinclaw"],
    "sandbox": { "tools": { "alsoAllow": ["kleinclaw"] } }
  }
}
```

Restart or reload the Gateway, start a new session, then verify with
`openclaw sandbox explain --json` and a `kleinanzeigen_status` smoke test.

At the first prompt, choose **Allow once** to keep the current mode. Choose
**Always allow** to trust all KleinClaw tools. **Always allow** stores `none`
and survives Gateway restarts. It does not broaden `adRoots` or remove
`confirm: true` from mutating tools. Operators can change the saved mode at any
time:

```bash
openclaw config set plugins.entries.kleinclaw.config.approvalMode all
openclaw config set plugins.entries.kleinclaw.config.approvalMode mutating
openclaw config set plugins.entries.kleinclaw.config.approvalMode none
```

See OpenClaw's plugin permission request guide for approval routing and decision
behavior:

<https://docs.openclaw.ai/plugins/plugin-permission-requests>

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

Unofficial helper; not affiliated with Kleinanzeigen. The user is responsible
for checking the terms of service of kleinanzeigen.de applicable at the time of
use. The developers assume no liability for any damages or legal consequences.
Use is at your own risk. Any unlawful use is strictly prohibited.
