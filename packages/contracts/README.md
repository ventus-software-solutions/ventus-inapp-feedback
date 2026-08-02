# @ventus-software-solutions/feedback-contracts

```bash
npm install @ventus-software-solutions/feedback-contracts@beta
```

Shared domain types, validation helpers, workflow state machine, and the versioned
OpenAPI contract for Ventus In-App Feedback.

The workflow deliberately separates `resolved` from `closed`: a coding agent can
resolve with a reason and evidence when it has `feedback:resolve`, while closure
requires independent verification and `feedback:close`. Claims use expiring
leases and do not replace optimistic concurrency through the resource `version`.

Top-level states are `new`, `triaged`, `in_progress`, `resolved`, `closed`,
`rejected`, and `reopened`. Terminal dispositions such as `duplicate`, `wont_do`,
and `already_done` are resolution reasons, not additional states.

Built and maintained by
[Ventus Software Solutions GmbH](https://ventus.works/?utm_source=github&utm_medium=referral&utm_campaign=feedback-contracts).
