---
type: architecture
title: Extension runtime
description: Runtime components, account boundaries and local data ownership.
status: stable
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
---

# Context

HBHR Team Leave is an independent Chrome Manifest V3 extension adding a read-only team timeline to the existing HBHR session. It has no service worker, backend, automatic shared-team synchronization, telemetry or remote executable code.

The [extension-choice decision](../decisions/0001-use-browser-extension-for-team-leave.md) explains why this approach was selected over native/vendor changes, external applications, userscripts and manual reporting.

# Responsibilities

| Component | Responsibility |
| --- | --- |
| [Manifest](../../public/manifest.json) | Chrome 120 minimum, storage permission, narrow app.hbhr.io content-script match, bundled icons |
| [Startup guard](../../public/transition.js) | Document-start masking during deep-link startup; fail open after ten seconds |
| [Content entry](../../src/content.tsx) | Header link, hash route, native-content restoration, account scope and theme/lifecycle reconciliation |
| [React UI](../../src/Widget.tsx) and [styles](../../src/widget.css) | Team editing, timeline, summaries, dialogs and native-style presentation |
| [Adapter](../../src/adapter.ts) | Bounded same-origin reads, directory/calendar validation and account-signal detection |
| [Domain](../../src/domain.ts) | Date-only ranges, unique-person daily approved/pending overlap |
| [Storage](../../src/storage.ts) | Local scoped workspaces, import validation and cross-tab subscriptions |

# Boundaries

The section lives on the HBHR origin at `/#hbhr-team-leave`; it is not a backend route or separate extension tab. The extension uses the browser's existing session for GET reads without extracting cookies or credentials. HBHR permissions remain authoritative.

The account boundary is a verified signed-in user ID, or a manually selected organization-and-account label when verification fails. No organization ID has been verified. Scope changes remount the UI and discard in-memory data; silent server-side switches without page changes require a reload.

Shadow DOM isolates styling, not information from the host page. Native main-content children are hidden with prior visibility preserved; header/navigation remain available. Ordinary home does not fetch directory/calendar data for the extension.

# Dependencies

React/ReactDOM, TypeScript and Vite produce a bundled IIFE. Vitest/Testing Library and Playwright test with synthetic data. The build workflow produces tested ZIP artifacts. A separate manually triggered release workflow publishes a tagged GitHub Release with a versioned store-ready ZIP, then commits the next patch version. Chrome Web Store publication remains manual. See [build runbook](../runbooks/builds.md).

# Trade-offs

Local storage avoids a new HR-data backend but does not centrally manage or automatically share teams. Import/export is a user-controlled copy. HBHR DOM and response contracts can change and require adapter updates. Date-only overlap cannot infer partial-day hours, schedules, capacity or holiday eligibility.

# Data Ownership

HBHR owns employee/leave records. The extension retains normalized directory/calendar data in memory and persists only team definitions/preferences under an account-scoped local-storage key. Browser/network caching is separate. Exported definitions contain employee IDs and source scope, not leave records; exports are not anonymous. The [public privacy page](../../store-assets/privacy.html) describes these practices for users.