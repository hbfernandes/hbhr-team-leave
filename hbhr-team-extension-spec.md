# Implementation plan: HBHR Team Leave extension

**Goal:** add read-only **Team Leave** section opened by a button beside **My Info / My Docs**. The extension owns the section's content, with custom groups, person-by-person timeline and daily overlap warnings. Existing HBHR calendar stays unchanged.

**Defaults confirmed on 2026-10-02. Implementation delivered; automated validation complete. Authenticated Chrome installation/manual acceptance remains user-assisted.**

## 1. Proposed scope

### First release

- Chrome-only extension using Manifest V3.
- Team Leave header button opens a dedicated extension-rendered section at `/#hbhr-team-leave`.
- Create, rename, edit and delete custom groups.
- Search/select employees; narrow picker by department, manager or region.
- Employees may belong to multiple groups.
- Monthly timeline, previous/next month and “Today”.
- Approved leave shown by default; optional pending overlay.
- Daily unique-person absence counts.
- Configurable warning threshold, e.g. **3 or more people away**.
- Refresh data; show last successful refresh time.
- Collapsible widget; remember selected group and preferences.
- Import/export group definitions.
- Light/dark appearance, keyboard accessibility.

### Outside first release

- Creating or editing HBHR leave.
- Shared server, central group administration or automatic cloud sync.
- Alerts when browser/HBHR is closed.
- Exact half-day/hour capacity calculations.
- Automatically inferring working schedules or regional holiday eligibility.
- Edge/Firefox/Safari support and packaging.
- Replacing HBHR’s calendar or modifying native dashboard settings.

## 2. Architecture

**Proposed stack:** TypeScript, React, Vite, Vitest, Testing Library and Playwright.

Bundle everything locally. No runtime CDN, analytics or backend.

| Component | Responsibility |
|---|---|
| Content-script entry | Add header navigation, route section, mount/unmount UI and restore native dashboard |
| HBHR adapter | Fetch directory/calendar; validate and normalize responses |
| Group repository | Versioned extension-local storage |
| Overlap engine | Pure date/filter/count calculations |
| Widget UI | Team picker, timeline, summaries, settings |
| Test fixtures | Synthetic directory HTML and calendar JSON |

**No background service worker initially.** Extension-rendered section remains on HBHR origin, can fetch through logged-in session and use extension storage directly.

Keep adapter and calculation engine independent from React; easier testing and future browser support.

## 3. Dashboard integration

### Mounting

- Run content script only on HBHR origin.
- Insert Team Leave link beside My Docs, or My Info when My Docs is absent, using native button styling.
- Mount section on `/` and `/home` only when `#hbhr-team-leave` is active and authenticated dashboard landmarks exist.
- Render full-width section in the main content container, temporarily hide native dashboard content and preserve its original visibility for restoration.
- Browser Back restores native content; reload/deep links reopen the section. No extra Back to dashboard link.
- No directory/calendar requests or dashboard card on ordinary hashless home page.
- Unique mount marker prevents duplicate widgets.
- Shadow DOM isolates styling.
- Match surrounding spacing, typography and theme without copying HBHR JavaScript.

### Lifecycle

- Handle normal page loads plus dashboard content replacement.
- Scoped, debounced `MutationObserver` where necessary.
- Unmount when leaving the section; cancel requests and restore native content and page title.
- If main content container disappears, use conservative fallback at the dashboard's parent.
- If no safe container exists, do not modify arbitrary page areas; report integration unavailable.

### Layout

Navigation: **My Info · My Docs · Team Leave**, with matching native span/badge button markup for alignment. Section gutters match sibling pages: 24px top and 18px sides.

Section header: **Team Leave · group selector · Manage teams · Refresh · Collapse**

Toolbar: month navigation, pending toggle, warning threshold.

Body:
- Sticky employee-name column.
- Daily columns; leave blocks distinguished by status.
- Summary row showing **confirmed / additional pending** people.
- Warning-day list with date, count and affected names.

Horizontal scrolling on smaller screens. No fixed positioning over existing dashboard controls.

## 4. Authentication and data access

### Session handling

- Use same-origin requests with session credentials.
- No passwords, session-cookie extraction or token persistence.
- Prefer verified authenticated GET calendar endpoint.
- Detect redirects/login HTML, permission failures and malformed responses.
- Session expiry displays **“Log into HBHR, then refresh.”**
- Never turn authentication errors into “no leave”.

### Directory adapter

Fetch people-directory HTML and parse detached document using `DOMParser`.

Extract only:
- Employee ID from profile URL.
- Display name.
- Department, manager and region where available.

Do not collect email, phone, employee number, photographs or notes.

Use header-aware column mapping, not only hard-coded column positions. Deduplicate by employee ID.

Validate table structure and completeness. Current directory contains all 86 rows; future server pagination must be detected rather than silently treating first page as complete.

### Calendar adapter

- Build date-range query and repeated `user_id[]` parameters.
- Request only selected group members.
- Empty group makes **no calendar request**—avoids accidentally fetching everyone.
- Validate response envelope and event fields.
- Filter selected IDs locally too, even if server ignores filter.
- Accept approved/pending leave; separate public holidays.
- Ignore unsupported event types with non-sensitive diagnostic.
- Cancel obsolete requests on rapid group/month changes.
- Prevent older response overwriting newer selection.
- Bound requests; refresh manually and when group/month changes.

Leave data stays in memory. Show stale/error state after failed refresh, never silently present cached results as current.

## 5. Groups and persistence

### Stored model

- Storage schema version.
- Account/organisation scope.
- Groups: generated group ID, name and employee-ID list.
- Preferences: selected group, pending visibility, warning threshold, collapsed state.
- Minimal member labels if needed for missing-member warnings.

No persistent calendar records by default.

### Account isolation

Before storing real groups, verify reliable account/organisation identifier available in authenticated page.

- Scope groups to verified identity.
- Clear in-memory HR data when identity changes.
- If reliable automatic identity unavailable, require explicit workspace selection; do not silently reuse groups across accounts.
- Do not assume employee IDs are globally unique across organisations.

### Group management

- Validate names and deduplicate member IDs.
- Show group member count.
- Flag saved employees absent from refreshed directory; preserve membership until user removes it.
- Confirm group deletion.
- Handle multiple open HBHR tabs through storage-change events.

### Import/export

Export versioned group definitions—not leave data or credentials.

Import:
- Validate schema, size and IDs.
- Preview merge/replace actions.
- Report unresolved employees.
- Reject incompatible account scope unless explicitly reviewed.
- Confirm replacement; no silent overwrite.

## 6. Date and overlap rules

Use **date-only values**, not browser-local timestamp conversion.

- Start/end inclusive, as verified against HBHR leave table.
- Clip events to visible month.
- Support same-day leave, leap years and year-crossing ranges.
- Count unique employees per date—not records.
- Approved count contains people with approved leave.
- Additional pending count excludes anyone already approved that day.
- Threshold applies to confirmed absences by default.
- Pending-inclusive warning mode explicitly labelled.
- Public holidays never count as employees absent.
- Weekends visually shaded; optional hiding changes display, not assumed schedules.
- Missing or invalid dates excluded with visible data-quality warning.

**Limitation shown in widget:** daily leave overlap, not exact staffing capacity. Current endpoint lacks verified partial-day and working-pattern information.

Public holidays can appear as separate neutral annotations, labelled as returned by HBHR; no automatic regional attribution.

## 7. Security and privacy

- Restrict extension scope to HBHR; use only required permissions.
- Expected initial permission: extension storage plus narrowly matched content script. Add host permissions only if implementation requires them.
- No broad browsing access, cookie permission, remote code or telemetry.
- Render all HBHR/imported strings as text; never inject supplied HTML.
- Validate imported objects and URLs.
- No HR payloads in console logs or error reports.
- Keep secrets and real employee data out of source control and test fixtures.
- Shadow DOM provides style isolation—not privacy isolation from host page.
- Extension adds no access beyond logged-in account permissions.

## 8. Tests to create

### Unit tests — Vitest

| Area | Required cases |
|---|---|
| Directory parsing | Valid table; reordered columns; missing optional metadata; malformed profile links; duplicate IDs; accented names; empty directory |
| Directory integrity | Missing table; unexpected headers; login HTML; detected incomplete/server-paginated results |
| Calendar validation | Valid envelope; `success: false`; missing fields; unknown types/statuses; malformed dates |
| Requests | Correct range and array parameters; empty group skips request; local membership filtering |
| Date handling | Inclusive end; same-day leave; month/year boundaries; leap day; spanning range; consistent results across time zones/DST |
| Overlaps | Multiple people overlap; duplicate records; same person with several records; approved/pending union; threshold boundary |
| Holidays | Separate annotations; never counted as personal leave |
| Storage | Group CRUD; schema migration; invalid stored data; account separation; missing members |
| Import/export | Round trip; merge/replace; oversized input; malformed JSON; duplicates; scope mismatch; incompatible version |
| Safety | HTML/script-like names treated as text; hostile imported values rejected |

### Component tests — Testing Library

- First-run empty state and “Create group”.
- Search/filter/select people.
- Create/edit/delete validation.
- Missing-member warning.
- Group and month switching.
- Approved/pending display and counts.
- Threshold updates.
- Loading, empty, failed and stale-data states.
- Session-expiry recovery.
- Collapse/preferences persistence.
- Modal keyboard navigation, focus restoration and accessible labels.
- Import preview and replacement confirmation.

### Adapter/lifecycle integration tests

- Mock directory + calendar → correct rendered team.
- Failed directory fetch does not erase saved groups.
- Rapid selection changes cancel requests; newest result wins.
- Logout/account switch clears displayed data.
- Cross-tab group edits propagate.
- Unmount releases observers/listeners and aborts requests.

### Browser tests — Playwright

Load unpacked extension into persistent Chromium context against **synthetic HBHR pages**, with requests intercepted. No real login required in CI.

Verify:
- Header button beside My Docs, with My Info fallback; existing native links unchanged.
- Mount on `/` and `/home` only with section hash, not login/directory or hashless home pages.
- Correct main-content placement; native calendar retained but hidden until returning to dashboard.
- Deep-link reload and browser Back/Forward restore expected content.
- No duplicate after dashboard DOM replacement.
- Groups survive page reload.
- Timeline and warnings match fixtures.
- Session expiry, malformed response and network error.
- Shadow DOM style isolation.
- Hostile label cannot execute script.
- Light/dark layouts; narrow viewport scrolling.
- Keyboard navigation and automated accessibility checks.

### Manual authenticated acceptance

After automated suite passes:
- Install locally in Google Chrome.
- Verify selected employees and dates against native HBHR.
- Confirm single-day and cross-month leave.
- Confirm approved/pending behaviour.
- Confirm original dashboard controls remain functional.
- Exercise logout/login and theme changes.
- Inspect network: directory/calendar reads only; no HR write requests.
- Confirm uninstall/disable leaves HBHR unchanged.

## 9. Delivery phases

| Phase | Deliverable | Completion gate |
|---|---|---|
| **1. Contract verification** | Confirm account identity, directory completeness and mounting/theme selectors | Findings documented; synthetic fixtures defined |
| **2. Foundation** | Extension scaffold, strict typing, build/lint/test setup | Unpacked extension loads; no unnecessary permissions |
| **3. Data and calculations** | Adapters, storage, date/overlap engine | Unit and integration tests pass |
| **4. Embedded UI** | Widget, team editor, timeline and summaries | Component tests pass; accessible core workflow |
| **5. Resilience** | Session/error handling, imports, lifecycle and account isolation | Edge-case and browser tests pass |
| **6. Acceptance/package** | Live read-only verification, installable build and instructions | Manual checks pass; reproducible package |

## 10. Confirmed defaults

Confirmed on 2026-10-02:

1. **Browser:** Chrome only for now.
2. **Placement:** dedicated extension-rendered section opened beside My Info / My Docs (revised on 2026-10-02).
3. **View:** monthly team timeline.
4. **Warnings:** approved leave only; pending optional.
5. **Storage:** local groups/preferences; leave records memory-only.
6. **Sharing:** manual group import/export, no backend.
7. **Holidays:** separate labelled annotations.
8. **Precision:** date overlap only until partial-day data verified.

Account identification remains a contract-verification requirement, not an assumed capability.