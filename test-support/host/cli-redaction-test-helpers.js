import assert from "node:assert/strict";

export const SENTINEL_USER = "sentinel-user@example.invalid";
export const SENTINEL_PASSWORD = "sentinel-password-value";
export const SENTINEL_COOKIE = "sentinel-cookie-value";
export const SENTINEL_TOKEN = "sentinel-token-value";
export const SENTINEL_PROFILE_NAME = "Sentinel Profile";
export const SENTINEL_PROFILE_DIR = "profile-sentinel-path";

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assertJsonOmits(value, needles) {
  const text = JSON.stringify(value);
  for (const needle of needles) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(needle)));
  }
}

export function sentinelNeedles({ profilePath } = {}) {
  return [
    SENTINEL_USER,
    SENTINEL_PASSWORD,
    SENTINEL_COOKIE,
    SENTINEL_TOKEN,
    ...(profilePath ? [profilePath] : []),
    SENTINEL_PROFILE_DIR,
    SENTINEL_PROFILE_NAME,
  ];
}
