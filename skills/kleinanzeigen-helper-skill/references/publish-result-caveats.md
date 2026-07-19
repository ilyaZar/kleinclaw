## Publish Result Caveats

- Treat the structured `outcome` as authoritative. Do not infer success from
  human log text, a changed local ad file, or partial browser output.
- A timeout, malformed protocol result, or successful status paired with a
  nonzero exit fails closed.
- A `partial_failure` or `failed` status can include useful changed and failed
  counts. Report both without presenting the operation as successful.
- For `needsUserAction`, tell the user to complete the account check in an
  interactive browser run before retrying. Stop automatic retries for an
  `ip_range_blocked` diagnostic.
- Treat `Approval timed out` as an OpenClaw/tool approval timing issue, not as a
  Kleinanzeigen runtime failure. Retry only after the user confirms again.
