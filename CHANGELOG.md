# Changelog

## Unreleased

- embed the built miniclaw runtime and TypeScript source for the local runtime
  migration
- make embedded miniclaw defaults use miniclaw app names and local schema hints
- remove unused embedded miniclaw resource files from the published package
- switch package metadata to AGPL-3.0-or-later for the embedded derived code

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
