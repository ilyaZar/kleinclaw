# Changelog

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
