---
summary: "Hosted backend install registration and bearer-token authentication runbook for WindieOS REST and websocket traffic."
read_when:
  - When changing install registration, install-token storage, hosted REST auth, or websocket identity behavior.
  - When debugging 401 responses, websocket policy-violation closes, or user_id/install_id mismatches.
title: "Hosted Backend Auth"
---

# Hosted Backend Auth

WindieOS uses no-login install registration for hosted backend access. A desktop install registers once, receives a server-owned `user_id`, `install_id`, and `install_token`, then authenticates hosted REST and websocket traffic with a bearer token.

The hosted path must not trust renderer-provided `user_id` ownership. When install auth is required, backend identity comes from the authenticated install token.

For implementation steps that cross install auth, runs keys, provider keys, OAuth state, sidecar remote-client auth, or secret logging, read [Credential and Token Change Workflow](../security/credential_token_change_workflow.md) before editing.

## Runtime Pieces

| Piece | Owns | Files |
| --- | --- | --- |
| Install record storage | SQLite-backed install table, token hashing, generated `user_id` and `install_id` | `backend/src/api/auth/service.py` |
| Registration route | `POST /api/install/register` | `backend/src/api/auth/router.py` |
| REST auth middleware | Bearer-token enforcement for `/api/*` except registration | `backend/src/api/auth/http_middleware.py` |
| WebSocket auth | Handshake bearer-token validation and claimed-user mismatch handling | `backend/src/api/routes/websocket/connection.py` |
| Auth context | Request-scoped authenticated install identity | `backend/src/api/auth/context.py` |
| Backend config | `install_auth_enabled`, install auth database path | `backend/src/core/config/models.py`, `backend/src/core/config/app_config.py` |

## Registration Contract

Request:

```http
POST /api/install/register
Content-Type: application/json
```

```json
{
  "operating_system": "darwin"
}
```

Response:

```json
{
  "success": true,
  "user_id": "user_<uuid>",
  "install_id": "install_<uuid>",
  "install_token": "wnd_install_<secret>"
}
```

Important behavior:

- `operating_system` is optional and normalized to a non-empty string or `null`.
- Tokens are returned only at registration time.
- The backend stores only the SHA-256 token hash.
- The install table records `created_at`, `last_seen_at`, and optional operating system.
- `last_seen_at` updates on successful token authentication.

## REST Auth Contract

Authenticated REST requests must include:

```http
Authorization: Bearer <install_token>
```

Middleware behavior:

- Applies only to paths starting with `/api/`.
- Skips `/api/install/register`.
- Returns `503` when install auth is enabled but the install auth service is unavailable.
- Returns `401` for missing or invalid bearer tokens.
- Sets request identity on `request.state.install_identity` and auth context for downstream handlers.

Debug routing:

- Missing header: frontend token propagation or SDK client auth bug.
- Invalid header: stale/incorrect install token, reset local app identity, or wrong backend auth database.
- `503`: backend container startup or install-auth service wiring bug.

## WebSocket Auth Contract

The websocket still receives a handshake message containing a client-side `user_id`, but when install auth is required:

1. Backend extracts `Authorization: Bearer <install_token>` from websocket headers.
2. Backend authenticates the token through `InstallAuthService`.
3. Backend uses the authenticated `user_id` and `install_id`.
4. If the claimed handshake `user_id` differs, backend logs a mismatch and ignores the claim.
5. Failed auth closes the socket with policy-violation semantics.

Likely failure signals:

- close code `1008`: handshake validation, JSON parse, missing token, invalid token, or install-auth service failure
- log line with `Handshake user_id mismatch ignored`: frontend had a stale local user id but auth succeeded
- log line with `Handshake successful (user_id=..., install_id=...)`: backend accepted server-owned identity

## Identity Invariants

- The install token is the credential.
- The backend owns the authenticated `user_id`.
- Client-provided `user_id` is compatibility input, not ownership proof on the hosted-auth path.
- Session cleanup must respect active connection counts and only end a user session after the final connection closes.
- Same-user multi-device policy belongs in backend session/runtime hardening, not renderer state.

## Database Notes

The install auth database path comes from backend config. The service creates the parent directory and this table if missing:

```sql
CREATE TABLE installs (
  install_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  operating_system TEXT
);
```

Do not migrate this table casually in feature work. If a schema change is needed, add a real migration path and tests for existing installs.

## Development and Test Checklist

When changing hosted auth:

1. Test registration accepts optional OS and rejects unexpected fields.
2. Test REST middleware allows registration without a token.
3. Test REST middleware rejects missing/invalid tokens and accepts valid tokens.
4. Test websocket auth derives `user_id` from token, not the handshake claim.
5. Test mismatch logging/behavior without rejecting a valid token.
6. Test final-connection cleanup does not kill another active connection for the same user.
7. Update SDK/frontend clients if auth header shape changes.

## Related Docs

- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Credential and Token Change Workflow](../security/credential_token_change_workflow.md)
- [Security](security.md)
- [Multi-User Runtime Hardening](multi_user_runtime_hardening.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
