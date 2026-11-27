# Changelog

## Unreleased

- miniclaw: package links point at its own public repository,
  `ilyaZar/miniclaw`
- miniclaw: ads are due for republication on the day the interval is reached,
  `update-content-hash` stores the hash the change detection computes, image
  uploads that reuse slots of not-quite-removed images are counted, and the
  browser opens desktop-sized unless you set its window size
- miniclaw: download redesigned (Astro) ad pages from their embedded island
  data (images, price, shipping, seller name, creation date, attributes), read
  missing category dimensions from the anonymous ad page, drop the
  `seller_badges_s` tracking attribute, and keep a download batch going when
  one ad cannot be read
- give you time to solve a captcha or a device verification during live runs:
  without a terminal, miniclaw now polls the browser for up to
  `manualActionTimeoutSeconds` (default 300, new plugin setting and
  `--manual-action-timeout`) instead of stopping at once; live runs get that
  wait on top of `timeoutMs`
- miniclaw: recognize both SMS verification screens (code request and code
  sent) and a captcha after the password step; the code is always typed by
  you in the browser
- miniclaw: click the visible Auth0 submit, wait for an identifier-step captcha
  token before submitting, read the login marker even when the redesigned
  header is hidden on narrow windows, and treat stale page nodes as a miss
- miniclaw: after submit, decline either upsell ("Ohne Top-Anzeige weiter" or
  "Ohne Hochschieben weiter"), accept the update success page for the
  submitted ad, recover the ID when the publish success page shows none, and
  stop without retry on form validation errors
- miniclaw: shipping dialog variants (size pane shown directly, behind
  "Andere Versandmethoden", or nested), tick wanted carriers before unticking
  defaults, PRO "Versand" combobox; individual shipping (`shipping_costs`
  without `shipping_options`) now fails clearly because the site dropped it
- miniclaw: select button-combobox attributes on the redesigned form (pointer
  open, portal listboxes, React/attribute/text matching), fall back from hidden
  `attributeMap` inputs to their combobox, and find the condition dialog
  trigger by its label
- miniclaw: select categories in the redesigned "Kategorie wählen" dialog,
  using the site's own category labels with bundled names as fallback; the
  classic picker no longer reloads the category page
- ci: keep the `miniclaw/` subtree and `ilyaZar/miniclaw` in sync in both
  directions
- miniclaw: build, test, and CI on its own (own tsconfig, scripts, lockfile,
  and tests under `miniclaw/`) so it can live as a standalone repository
- miniclaw: extend handles the redesigned choice dialog, selects only the free
  "Nur verlängern" option, and reports success only after the page confirms it
- miniclaw: delete removes exactly the ad's own ID; title matching applies only
  to ads without an ID and skips ambiguous titles
- miniclaw: read the CSRF token from the redesigned manage-ads page, open the
  overview on its first unfiltered page, keep paging when an ad is not on the
  current page, and raise the overview and published-ads page caps to 200
- build against OpenClaw 2026.11.10 and document its capability consent step
  for linked installs
- persist an explicit **Always allow** choice in the existing `approvalMode`
- keep approval descriptions within the supported OpenClaw request limit
- package miniclaw as the standalone `@ilyazar/miniclaw` CLI package with
  complete license, attribution, source, and installed-bin checks
- narrow miniclaw 0.2's programmatic API to the non-injectable CLI runner
- build and test the generated host and miniclaw artifacts before packaging
- remove KleinClaw and miniclaw's inert language settings and verbosity options,
  and remove the local-only update checker
- document miniclaw's repeatable ad-file option
- remove unreachable browser, diagnostics, and host YAML rendering helpers

## 0.2.2

- make the readme easier to follow for first-time KleinClaw users
- explain where OpenClaw plugin config and tool policy snippets belong
- document common config fields and allowed values near their examples
- publish a matching GitHub and Clawhub release after the 0.2.1 Clawhub-only
  release drift

## 0.2.1

- make live listing and browser automation impact explicit in published metadata
  and helper guidance
- require plugin approval routing by removing the no-approval mode
- restrict persistent browser configuration to supported browser/profile choices
- keep publish-error diagnostics sparse and avoid storing ad payloads or page
  captures

## 0.2.0

### Changed

- replace the external `kleinanzeigen-bot` command dependency with the embedded
  TypeScript `miniclaw` runtime
- keep the browser automation model inside the package with CDP-style Chromium
  control, local browser profile handling, and the existing KleinClaw approval
  gates
- make embedded miniclaw defaults use miniclaw app names and local schema hints
- switch package metadata to AGPL-3.0-or-later for the embedded derived code

### Removed

- remove the old `cliPath`/external executable configuration surface from the
  OpenClaw plugin config
- remove unused embedded miniclaw resource files from the published package
- avoid Python, Playwright, and upstream bot package dependencies in the
  ClawHub package

### Verified

- package checks assert that the npm lockfile, packed runtime files, generated
  default config, and plugin config schema no longer expose the stale external
  runtime surface
- VM release testing proved the packaged branch can run, publish, and delete
  through embedded miniclaw from an isolated Omarchy guest

## 0.1.6

- add a concise troubleshooting section for sandboxed routed agents
- align package and OpenClaw plugin metadata for the next ClawHub release

## 0.1.5

- document sandbox tool-policy exposure for routed agents
- align package and OpenClaw plugin metadata for the next ClawHub release

## 0.1.4

- render readme images on package pages
- keep unused image assets out of the package

## 0.1.3

- ship the helper skill inside the plugin package
- verify packaged files before publishing

## 0.1.2

- delegate local command execution to the OpenClaw runtime command helper

## 0.1.1

- require OpenClaw 2026.5.3 beta or newer for ClawHub npm-pack installs

## 0.1.0

Initial KleinClaw package.

- registers typed OpenClaw tools for a local Kleinanzeigen helper workflow
- keeps credentials and full config contents outside the plugin
- scopes ad reads, drafts, and operations to configured ad roots
- defaults drafts to inactive and blocks scoped publish for inactive ads
- adds approval prompts, confirm flags, output caps, and redaction
- includes browser status/config/check helpers for browser settings
