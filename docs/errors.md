# Errors and recovery

## MCP error shape

Success is one MCP text content block whose `text` is JSON. On failure, the connector sets `isError: true` and returns a safe code, for example:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "{\"error\":{\"code\":\"CREATOR_SETUP_REQUIRED\"}}"
    }
  ]
}
```

After parsing `content[0].text`, the error is `{"error":{"code":"CREATOR_SETUP_REQUIRED"}}`. For `OUTCOME_UNKNOWN` and `PRIVATE_STORAGE_UNAVAILABLE`, the parsed error also includes `recovery: "original-only"` and the instruction `Retain the original key and journal. Do not resend or generate a replacement key.` Error results do not expose a credential or private server response text.

## Safe error codes

| Code | Meaning and next step |
| --- | --- |
| `TOOL_NOT_FOUND` | The tool name is not one of the 12 current names. List tools again. |
| `INVALID_INPUT` | Arguments, schema, IDs, digests, projection shape, or a response-derived input failed validation. Re-read the current data and correct the call. |
| `CREATOR_SETUP_REQUIRED` | A creator tool was called without a configured creator client and journal. Public discovery does not need setup. |
| `AUTH_REQUIRED`, `FORBIDDEN` | The hosted service rejected authentication or scope/target authority. The owner must review the actual grant; do not put a credential into a prompt. |
| `NOT_FOUND` | The requested service, storefront, or owned record was not found. Re-check the ID or slug. |
| `UNSUPPORTED_VERSION` | The hosted creator response version is not supported by this connector. Stop and review compatibility. |
| `CONFLICT`, `SLUG_CONFLICT`, `STALE_VERSION` | The requested change conflicts with state, slug, or observed version. Read current state before deciding on a new deliberate operation. |
| `SERVICE_NOT_APPROVED`, `SERVICE_PROJECTION_CHANGED`, `STOREFRONT_SELECTION_CHANGED` | The selected service or publication no longer matches the validated projection. Re-read inventory or storefront; do not silently substitute another service. |
| `LIMIT_REACHED`, `BODY_TOO_LARGE` | The hosted or local size/count limit was reached. Reduce the deliberate input within the documented limits. |
| `RATE_LIMITED` | Request was rate limited. Wait and re-read; do not repeat an uncertain mutation with a new key. |
| `PUBLIC_READ_UNAVAILABLE` | A public read did not return a valid successful response. This is not an empty inventory. |
| `INVALID_RESPONSE` | An unexpected, malformed, oversized, or uncorrelated response was refused. Do not infer success or payment. |
| `REQUEST_ABORTED`, `STORAGE_UNAVAILABLE`, `HASH_UNAVAILABLE` | A requested operation could not be completed or validated. For a mutation, inspect whether `OUTCOME_UNKNOWN` was returned before any retry decision. |
| `PRIVATE_STORAGE_UNAVAILABLE` | During a running server, the original journal is inaccessible or fails its ownership, permissions, path, or link checks. Preserve it and repair access; do not reset it to force a mutation. |
| `ORIGINAL_MISMATCH` | The saved original, key, request digest, or returned result did not match. Stop and reconcile the original. |
| `OUTCOME_UNKNOWN` | A dispatched mutation may have committed. Keep the original key and journal; use original-only recovery. |

The runner recognizes only these safe codes; unexpected internal error text is reduced to `INVALID_INPUT`. An MCP error code alone does not prove whether a paid checkout occurred in the browser.

## Mutation recovery sequence

1. Keep the original idempotency key and private journal. Never paste either credential or journal contents into a chat.
2. Call `voidpay_creator_recover` with the original operation and key, or repeat the **same** call with the same payload. Neither path resends the mutation.
3. If `result` is `null`, the outcome remains unresolved. Do not create a replacement key or restart the payment workflow. Reconcile the original with the authenticated owner and hosted service.
4. For an interrupted paid checkout, use `voidpay_checkout_recovery_link` in the original buyer browser. Creator journal recovery and paid checkout recovery are separate.

The setup file must be user-owned, mode `0600`, and a regular file with one link. If it fails these checks, the CLI exits **before connecting the MCP server** with a generic setup message on stderr; there is no MCP error envelope. The journal directory must be user-owned, mode `0700`; journal files use `0600`. Symlinked paths are refused. This storage qualification applies to Unix hosts; Windows behavior is not qualified by this release.
