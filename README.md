# HBHR Team Leave

Independent Chrome extension that adds team leave timelines and overlap summaries to [HBHR](https://app.hbhr.io/).

Uses your existing session and permissions. Read-only: no HR writes or backend service. Teams and preferences stay in local extension storage. Requires Chrome 120 or newer and an authorized HBHR account.

When Team Leave opens, it requests the authenticated `/user/settings/profile` page with the existing same-origin session. It extracts only the signed-in user ID from recognized profile forms and the company ID from the recognized account component, then scopes automatic storage as `hbhr:company:<companyId>:user:<userId>`. The profile HTML is parsed off-page, discarded after verification and never logged or stored. Ordinary dashboard views make no identity, directory or calendar request.

If HBHR does not provide a verifiable company marker, or returns an unsupported/conflicting profile, the extension blocks automatic workspace loading and offers Retry first. Manual labels are an explicit secondary fallback and are user-managed account separation. An expired session requires sign-in; it is never bypassed by manual naming. Existing user-only workspaces are preserved and shown for explicit recovery only; recovery copies them to the verified company scope without deleting or overwriting the original key.

## Documentation

- [Documentation index](docs/index.md) — Architecture, reference and decisions.
- [Installation and verification](docs/runbooks/installation.md) — Unpacked installation, unlisted store distribution and updates.
- [Builds and versioning](docs/runbooks/builds.md) — Development checks, packaging and CI.
- [Privacy notice](https://hbfernandes.github.io/hbhr-team-leave/store-assets/privacy.html) — Data handling, local storage and sharing.

Not affiliated with or endorsed by HealthBoxHR.