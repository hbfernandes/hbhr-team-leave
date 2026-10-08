---
type: decision
title: Scope workspaces by authenticated company and user identity
description: Use strict authenticated profile evidence for automatic workspace isolation and explicit recovery for ambiguous legacy data.
status: accepted
created: 2026-10-08
generated: { by: github-copilot, at: "2026-10-08T00:00:00Z" }
---

# Context

The earlier implementation inferred the signed-in user from dashboard scripts and stored teams under a user-only key. User IDs are not established as globally unique across HBHR organizations, while a company marker was observed only inside an account-specific authenticated profile component. Treating either signal as universal could load another organization's saved teams.

The profile endpoint is authenticated HTML rather than a documented identity API. The extension must use only explicit identity fields, avoid profile-data retention and keep ordinary dashboard startup free of identity and HR-data requests. Existing user-only workspaces have no company provenance and cannot be silently assigned to a new company scope.

# Decision

Use `GET /user/settings/profile` with same-origin credentials and `Accept: text/html` as the automatic identity source. Parse the response off-page. Accept hidden `id` fields only from the recognized work-details and personal-details update forms, and accept `user_id` plus `company_id` only from the recognized `user-dbs-edit-form` Livewire snapshot. Require positive numeric IDs, agreement across all recognized evidence and the resulting scope `hbhr:company:<companyId>:user:<userId>`.

Resolve identity asynchronously only when Team Leave is active. Show a verification shell while the request runs; abort and generation-guard requests on exit, retry and teardown. Authentication failures require sign-in. Network, timeout and server failures offer Retry. Missing, conflicting or unsupported company evidence blocks automatic loading and offers Retry plus an explicit manual label. Manual labels remain user-managed and never silently replace an active automatic or manual scope.

When the verified destination is missing and the user-only legacy key exists, show an ambiguity explanation without legacy team details. Copy validated legacy data only after explicit confirmation, recheck the destination immediately before writing, preserve the source key and make repeated recovery idempotent. Existing destinations win; invalid entries remain untouched and are reported. Chrome storage has no compare-and-swap, so simultaneous recovery can still race and is documented as a residual limitation.

# Alternatives Considered

| Alternative | Why not selected |
| --- | --- |
| Dashboard-script detection | Signals are page-layout dependent, provide no verified company identity and can become stale or ambiguous. |
| User-only automatic scope | A matching user ID does not establish company ownership. It risks cross-company workspace exposure. |
| Company-only scope | Multiple users in one company need separate saved teams and preferences. |
| Manual labels for every account | Avoids inference but makes normal use unnecessarily user-managed and cannot provide verified automatic separation. |
| Automatic legacy migration | User-only entries lack organization provenance and could be assigned to the wrong company. |
| New backend or OAuth identity API | No supported contract is available for this extension, and a service would add credential, HR-data and deployment obligations. |

# Consequences

- Automatic workspaces separate the same user ID across verified companies without changing workspace or export schema version 1.
- Profile HTML, Livewire payloads, names and unrelated fields are discarded after the two IDs are extracted; no cookies or tokens are read.
- Existing user-only and manual exports remain importable with explicit scope confirmation; imports save under the recipient's current scope.
- Legacy recovery preserves rollback source data but does not automatically copy later company-scoped edits back to the old key.
- Account-specific company-marker availability remains the largest live-contract risk. Synthetic tests cover the observed structure, but authorized validation across permissions and accounts remains outstanding.

# Related Documents

- [Runtime architecture](../architecture/extension.md)
- [Implementation reference](../reference/implementation.md)
- [Installation and verification](../runbooks/installation.md)
- [Authenticated account identity specification](../../.vscode/specs/authenticated-account-identity.md)