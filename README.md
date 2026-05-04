# KleinClaw

<p align="center">
  <a href="https://github.com/ilyaZar/kleinclaw/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ilyaZar/kleinclaw/ci.yml?branch=main&style=flat-square&logo=github&logoColor=white&label=CI&labelColor=2a7e3b&color=1b5e2a"></a>
  <a href="https://codecov.io/gh/ilyaZar/kleinclaw"><img alt="coverage" src="https://img.shields.io/codecov/c/github/ilyaZar/kleinclaw/main?style=flat-square&logo=codecov&logoColor=white&labelColor=6b3fa0&color=4b2d73"></a>
  <a href="https://github.com/ilyaZar/kleinclaw/blob/main/package.json"><img alt="version" src="https://img.shields.io/github/package-json/v/ilyaZar/kleinclaw?style=flat-square&label=version&labelColor=4a999d&color=346c6e"></a>
  <a href="https://docs.openclaw.ai/tools/clawhub"><img alt="OpenClaw code plugin" src="docs/badges/openclaw-code-plugin.svg"></a>
  <a href="https://nodejs.org"><img alt="JavaScript Node 22+" src="https://img.shields.io/badge/JavaScript-Node%2022%2B-264a6e?style=flat-square&logo=javascript&logoColor=111827&labelColor=f7df1e"></a>
  <a href="https://github.com/ilyaZar/kleinclaw/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/ilyaZar/kleinclaw?style=flat-square&labelColor=629944&color=446a30"></a>
</p>

<p align="center">
  <img alt="KleinClaw logo" src="assets/repo_logo2.png" width="240">
</p>

KleinClaw is an OpenClaw plugin for running a local
[`kleinanzeigen-bot`][kleinanzeigen-bot] setup through typed Kleinanzeigen
helper tools. It does not store Kleinanzeigen credentials and it does not read
the full bot config. Browser tools read and write only the non-secret
`browser:` section. The bot stays installed and configured on the user's
machine; this plugin just passes narrow commands to it and redacts the output
before returning it to your OpenClaw agent.

## What it adds

- `kleinanzeigen_status`: checks local bot availability and config wiring.
- `kleinanzeigen_list_ads`: lists local ad folders under trusted `adRoots`.
- `kleinanzeigen_ad_schema`: explains the safe ad YAML shape and limits.
- `kleinanzeigen_read_ad`: reads one selected ad config under `adRoots`, with
  contact fields redacted by default.
- `kleinanzeigen_images_list`: inventories local image files under one trusted
  directory.
- `kleinanzeigen_browser_status`: shows selected browser settings and locally
  detected browser binaries.
- `kleinanzeigen_browser_check`: runs the bot browser diagnostics against the
  current or proposed browser settings.
- `kleinanzeigen_browser_configure`: changes the bot browser binary, private
  window flag, or browser profile settings.
- `kleinanzeigen_draft_ad`: writes a safe inactive `ad.yaml` draft under
  `adRoots`.
- `kleinanzeigen_set_ad_active`: flips one YAML ad draft between inactive and
  publishable.
- `kleinanzeigen_verify`: checks the configured local bot setup.
- `kleinanzeigen_publish`: publishes or republishes selected ads.
- `kleinanzeigen_update`: updates changed or selected ads.
- `kleinanzeigen_delete`: deletes explicit ad IDs.
- `kleinanzeigen_download`: downloads selected ads into the bot workspace.
- `kleinanzeigen_extend`: extends eligible selected ads.

The tools are optional because they run a local command. By default all tools
require OpenClaw approval before they run. Set `approvalMode` to `mutating` only
for local checks where status and verify should run without an approval route.
Set it to `none` only for local TUI/dev sessions where no OpenClaw approval UI
is connected. Account-changing tools still require `confirm: true`. Tool output
is capped and redacted for configured paths, email addresses, and
credential-like lines.

## Install

### Kleinanzeigen tool

Install and set up [`kleinanzeigen-bot`][kleinanzeigen-bot] separately first,
then point this plugin at that local executable and config.

[kleinanzeigen-bot]:
  https://github.com/Second-Hand-Friends/kleinanzeigen-bot#installation

### This plugin

```bash
openclaw plugins install clawhub:kleinclaw
```

Installing this plugin does not download or install the upstream bot. For a
source checkout, point `cliPath` at a small executable wrapper script instead of
putting a shell command such as `pdm run app` there.

For local development:

```bash
openclaw plugins install -l /path/to/kleinclaw
openclaw plugins enable kleinclaw
```

Restart the Gateway after installing plugin code.

## Configure

Add the plugin config under `plugins.entries.kleinclaw.config`. Either
`configPath` or `workingDirectory` must be set. `workspaceMode` defaults to
`portable`. Set it to `xdg` only when your local bot setup already uses user
directories.

```json
{
  "plugins": {
    "entries": {
      "kleinclaw": {
        "enabled": true,
        "config": {
          "cliPath": "kleinanzeigen-bot",
          "configPath": "/home/me/kleinanzeigen-bot/config.yaml",
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
in the explicit allowlist, or include the individual tool names if you need
finer control. For a minimal KleinClaw-only dev agent:

```json
{
  "tools": {
    "profile": "full",
    "allow": ["session_status", "kleinclaw"]
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
draft workflow. The key bot constraints are:

- `title`: 10 to 65 characters.
- `description`: at most 4000 characters.
- `category`: built-in category name, custom mapped name, or category ID.
- `images`: glob patterns relative to the ad config file.
- `priceType: "FIXED"` requires `price`; `GIVE_AWAY` must not set `price`.

Use `kleinanzeigen_images_list` on a selected folder to discover candidate
image filenames and dimensions:

```json
{
  "directory": "/home/me/kleinanzeigen-ads/ONGOING/boxen",
  "maxDepth": 1
}
```

Use `kleinanzeigen_read_ad` only for explicit examples you want the agent to
see. It reads one selected ad file under `adRoots` and redacts `contact:` fields
unless `includeContact` is set to `true`:

```json
{
  "adDirectories": ["/home/me/kleinanzeigen-ads/ONGOING/example"]
}
```

Use `kleinanzeigen_draft_ad` to create a draft. Drafts default to
`active: false`, so they are not eligible for publishing until you deliberately
activate them:

```json
{
  "confirm": true,
  "directory": "/home/me/kleinanzeigen-ads/ONGOING/boxen",
  "title": "Boxen von Kenwood",
  "description": "Guter Zustand. Abholung bevorzugt.",
  "category": "Elektronik > Audio",
  "price": 25,
  "priceType": "NEGOTIABLE",
  "shippingType": "PICKUP",
  "images": ["boxen_*.{jpg,png}"]
}
```

Use `kleinanzeigen_set_ad_active` to activate exactly one selected YAML ad
config before publishing. The tool only changes the top-level `active:` value:

```json
{
  "confirm": true,
  "adDirectories": ["/home/me/kleinanzeigen-ads/ONGOING/boxen"],
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
the bot. If the selected ad is not `active: true`, the tool returns a preflight
diagnostic instead of running a publish command that the bot would skip.

### Browser settings

Use `kleinanzeigen_browser_status` before publishing when browser state matters.
It reports the configured `browser:` values, the effective browser the bot will
try, and locally detected Chromium, Brave, Chrome, and Edge binaries. The
supported `browser` choices intentionally match `kleinanzeigen-bot` support:
`auto`, `chromium`, `google-chrome`, and `microsoft-edge`.

```json
{
  "browser": "chromium",
  "usePrivateWindow": true,
  "profileMode": "bot",
  "confirm": true
}
```

`profileMode: "bot"` clears `browser.user_data_dir` and `profile_name`, so the
bot uses its dedicated workspace browser profile. The `system-default` mode
points the config at the chosen browser's normal local profile root. That can
reuse local login state, but it can also fail if the same browser profile is
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

Use `browser: "auto"` to clear `browser.binary_location` and let
`kleinanzeigen-bot` choose its default Chromium, Chrome, or Edge executable.
`kleinanzeigen_browser_configure` edits only selected scalar keys under
`browser:` and still requires `confirm: true`.

Brave is a Chromium-family browser and may work as a custom executable, but it
is not documented or auto-detected by `kleinanzeigen-bot`. KleinClaw reports it
from `kleinanzeigen_browser_status` when installed, but does not expose it as a
supported `browser` choice. To try it anyway, use an explicit `binaryLocation`
and set `allowUnsupportedBrowser: true`:

```json
{
  "binaryLocation": "/usr/bin/brave",
  "allowUnsupportedBrowser": true,
  "usePrivateWindow": true,
  "profileMode": "bot",
  "confirm": true
}
```

Use `kleinanzeigen_browser_check` before changing the real config when you want
to test whether the bot diagnostics accept a proposed browser setup. The check
writes a temporary config and leaves the real bot config unchanged:

```json
{
  "browser": "chromium",
  "usePrivateWindow": false,
  "profileMode": "bot"
}
```

After publishing or updating, operation tools return a structured `outcome`
with success state, final `DONE:` counts, published or updated IDs when the bot
prints them, and selected ad config changes observed after the bot exits. This
lets agents distinguish a real failure from a successful browser run with noisy
process cleanup.

When the bot config contains many ads, one invalid unrelated ad can make the
bot reject the whole run before it applies `--ads` filtering. To operate on one
known source folder, configure `adRoots`, use `kleinanzeigen_list_ads` to find
the folder, then pass `adDirectories` or `adConfigPaths` to
`kleinanzeigen_verify`, `kleinanzeigen_publish`, or the other operation tools:

```json
{
  "adDirectories": ["/home/me/kleinanzeigen-ads/ONGOING/boxen"]
}
```

For publishing that one folder only, combine the scoped directory with
`selector: "all"` or an explicit `adIds` list plus `confirm: true`. The scoped
paths must be inside `adRoots`; KleinClaw writes a temporary bot config with
only those ad files and deletes it after the run.

When the bot reports validation failures, KleinClaw returns structured
`diagnostics` and `nextActions` alongside the sanitized stdout/stderr. For
example, a full verify blocked by an unrelated overlong title can point the
agent at the failing ad and suggest either fixing it or using a scoped operation
for the intended listing.

If your agent runs with OpenClaw sandboxing enabled, also allow the plugin group
through sandbox tool policy. OpenClaw applies sandbox policy after the normal
tool allowlist, so omitting this can make the agent say that the KleinClaw tools
are not available even though the plugin loaded.

```json
{
  "tools": {
    "sandbox": {
      "tools": {
        "alsoAllow": ["kleinclaw"]
      }
    }
  }
}
```

For publishing combinations, pass `selectors` as a list such as
`["changed", "due"]`. Do not mix selectors with explicit ad IDs.

## Notes

The local bot still owns browser automation and account checks. KleinClaw can
select the browser binary, private-window flag, and profile config, but it does
not work around Kleinanzeigen checks. If Kleinanzeigen asks for a normal account
check, run the bot directly in a terminal/browser, handle it there, and then
come back to `kleinanzeigen_verify`.

**Keep passwords, cookies, browser profile data, and full bot config files out
of chat**. The intermediate CLI tools, the `kleinclaw` plugin plus the
`kleinanzeigen-bot`, handle the work without your agent ever having to know the
location of your kleinanzeigen credentials, thus: fix bot auth and account state
locally, then run `kleinanzeigen_verify` again.

## Development

```bash
npm test
npm pack --dry-run --json --ignore-scripts
npx clawhub package publish . --dry-run --json \
  --source-repo ilyaZar/kleinclaw \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "$(git branch --show-current)"
```

## Disclaimer

Unofficial helper; not affiliated with Kleinanzeigen.
