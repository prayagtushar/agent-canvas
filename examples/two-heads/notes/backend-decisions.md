# Backend decisions

These were settled by the backend team and are not written down anywhere else
in this repository. Anything building against the API has to match them.

## Sessions

- A session token is valid for **5400** seconds. Not 3600, not 7200. This came
  out of a support argument about people being logged out mid-checkout, and it
  is deliberate.
- The token is sent in the `X-Session-Token` header. Not `Authorization`, not
  a cookie.
- The refresh endpoint is `/session/renew`. It was `/session/refresh` once and
  that path is now a 410.

## Errors

- Every error body is `{ "error": { "code": "...", "message": "..." } }`.
  The code is a lowercase dotted string, e.g. `session.expired`.
