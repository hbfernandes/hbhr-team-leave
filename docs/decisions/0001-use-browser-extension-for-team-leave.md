---
type: decision
title: Use a browser extension for team leave overlap
description: Choose a local Chrome extension over external applications, scripts and manual reporting for custom-team leave visibility.
status: accepted
created: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
---

# Context

The goal is to let an authorized HBHR user define arbitrary employee teams and see monthly approved/pending leave overlap, daily counts, warning days and dated public holidays. The view should remain close to the existing HR workflow without changing HR records or replacing the native calendar.

Read-only directory and calendar requests were verified through the existing authenticated HBHR session. The project does not have an established vendor feature-development agreement, a verified supported external API/OAuth integration, or a requirement for a central shared-team service. Those are constraints on this implementation, not claims that HBHR cannot provide such capabilities.

Key selection criteria are:

- Reuse the user's existing session and access permissions without collecting credentials.
- Support persistent custom teams and an interactive monthly timeline.
- Avoid introducing a server that stores or processes employees' leave records.
- Provide reproducible packaging, automated tests and a removable integration.
- Deliver independently of changes to the vendor's application.

# Decision

Implement an independent **Chrome Manifest V3 extension** with narrowly matched content scripts and local extension storage. Add a Team Leave navigation entry opening an extension-owned section on the HBHR origin. Fetch the directory/calendar using the signed-in session, calculate overlaps locally, retain HR responses in memory and persist only scoped team definitions/preferences.

Do not create a background service, copy session credentials, modify HR records or send HR data to a developer-operated backend. Team sharing remains explicit import/export rather than automatic synchronization. Support Chrome first, matching the agreed deployment scope.

This provides a persistent, testable UI in the user's existing workflow while avoiding a separate authentication integration or HR-data hosting service. It is a companion integration, not an official vendor feature or a way to expand HBHR permissions.

# Alternatives Considered

| Alternative | Advantages | Why not selected for this scope |
| --- | --- | --- |
| Native HBHR feature or vendor customization | Best long-term integration; could provide supported contracts, central management and no separate installation | Depends on vendor cooperation, supported customization and delivery schedule not established for this project. Prefer reconsidering if an equivalent supported feature becomes available |
| Standalone web application using a supported API | Independent UI, possible shared teams and broader browser reach | Requires a verified external API/authentication contract. An unrelated web origin cannot assume it can reuse HBHR session requests; cross-origin/session restrictions must be addressed. A backend would add hosting, access-control and sensitive-data obligations |
| Local desktop application or command-line reporting tool | Independent of injected page layout; suitable for batch reports | Needs a supported way to authenticate/read data or user-provided exports. Adds installation/runtime complexity and separates reporting from the existing HR workflow |
| Userscript through a script-manager extension | Quick prototype; can reuse page context and add custom controls | Requires a script-manager dependency and script distribution/update configuration. A dedicated extension provides its own scoped manifest, packaged UI and directly testable installation artifact; userscripts remain viable for a smaller personal-only solution |
| Bookmarklet or developer-console snippet | Minimal packaging; useful for one-off exploration | Manual execution on each page/session, possible page-policy restrictions and poor fit for persistent, versioned team editing and routine use |
| Spreadsheet/report from manual exports | No injected application UI; familiar ad hoc analysis | Repeated extraction and maintenance, stale snapshots and additional copies of employee data. Does not provide an up-to-date in-dashboard view through the existing session |
| Existing HBHR calendar/filter workflow only | No deployment or integration maintenance | Does not deliver this project's custom saved-team overlap UI as implemented. Could be sufficient if the user's requirements or available native features change |

Alternatives are design assessments, not evidence that every vendor integration or deployment route was tested or unavailable.

# Consequences

## Benefits

- Read-only data access remains within the user's existing HBHR workflow and permission boundary.
- No new HR-data backend, credential store or cloud synchronization service is required.
- Bundled code, synthetic tests and local packaging make behavior reproducible and reviewable.
- Disabling the extension removes the additional UI without changing HR records.

## Costs and limitations

- Users must install an extension; unpacked installation requires Developer mode, while store distribution requires publisher preparation and review. Organization policy may prohibit installation.
- HBHR DOM landmarks and response formats are integration dependencies, not a verified stable public API. Vendor changes can break navigation, identity detection or parsing and require maintenance.
- Chrome is the supported browser. The view operates while the HBHR page is open; no closed-browser monitoring or alerts are provided.
- Teams are local to the installation/account scope. No centrally managed membership or automatic sharing is provided; exports contain identifying account/member IDs.
- Shadow DOM is styling isolation, not a security boundary against the host page. Existing HBHR permissions still govern data access.
- The available payload supports date overlap, not exact partial-day hours, working schedules or staffing capacity.

Reconsider this choice if HBHR offers an equivalent native feature or supported integration, organizational browser policies prevent deployment, or central team administration/multi-browser access becomes a requirement. Current runtime details and operational procedures remain in the linked architecture, reference and runbooks rather than this rationale record.

# Related Documents

- [Runtime architecture](../architecture/extension.md)
- [Current implementation and limitations](../reference/implementation.md)
- [Installation and verification](../runbooks/installation.md)