# @ventus-software-solutions/feedback-mcp

Model Context Protocol adapter for the Ventus Feedback HTTP API. The server uses
the public typed API client and never reads the database directly.

Configure a least-privilege service or agent token and start the stdio server:

```bash
export VENTUS_FEEDBACK_API_URL=http://localhost:8080/v1
export VENTUS_FEEDBACK_API_TOKEN=replace-with-an-agent-token
npx @ventus-software-solutions/feedback-mcp
```

The tool surface covers search/get, triage metadata, expiring claims, comments,
evidence, resolution, rejection, reopening, closure, and audit events. Every
mutation requires the current feedback `version` and an `idempotencyKey` unique
to the intended action. Reuse that key only when retrying the exact same tool
call; changed input with the same key is rejected. Refresh the item after a
genuine version conflict. Agents should normally receive `feedback:read`, `feedback:triage`,
`feedback:comment`, and `feedback:resolve`. Keep `feedback:close` on an
independent verifier credential when human verification is required.

Never place the API token in an MCP configuration committed to source control.

## Agent workflow

1. Call `search_feedback`, then `get_feedback` for the selected stable ID.
2. Call `claim_feedback` with the current version before beginning work. The
   default lease is 900 seconds and the API accepts 60–86400 seconds.
3. Renew the lease before it expires during long work. Expired leases cease to
   block another agent; release a live lease explicitly when abandoning work.
4. Add progress or handoff context with `comment_feedback`. Add test/deployment
   proof with `add_feedback_evidence`.
5. Call `resolve_feedback` with a disposition, concise summary, and relevant
   commit, pull-request, issue, or deployment links.
6. Treat `resolved` as awaiting verification. Use a separate credential with
   `feedback:close` for `close_feedback`; ordinary agents should resolve but not
   close. Reopen with a concrete reason when verification fails or new evidence
   arrives.

All mutations require the current version and idempotency key. A transport retry
reuses both. On a genuine conflict, fetch the record again, reconcile the new
state, and create a new key only if a new mutation is still intended.

Built and maintained by
[Ventus Software Solutions GmbH](https://ventus.works/?utm_source=github&utm_medium=referral&utm_campaign=feedback-mcp).
