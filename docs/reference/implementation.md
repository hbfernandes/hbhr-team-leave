---
type: reference
title: Implementation reference
description: Current UI behavior, HBHR contracts, storage limits and validation evidence.
status: stable
last_reviewed: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
---

# Facts

## Navigation and lifecycle

- Chrome Manifest V3; only `storage` permission. Two bundled content scripts match `https://app.hbhr.io/*`.
- Team Leave header link is added after My Docs, or My Info if My Docs is absent. It uses native active-state markup.
- Rendering requires `/`, `/home` or `/home/`, hash `#hbhr-team-leave` and the `.user-dashboard-grid` landmark. Other pages can have the header link without mounting the UI.
- The main-content section uses Shadow DOM and 24px top, 18px side and 60px bottom host padding. Native content is hidden, not removed; browser history restores visibility and title. No extra Back to dashboard link.
- Ordinary home makes no extension directory/calendar reads. Primary home clicks switch without a document reload; modified clicks retain normal link behavior.
- Document-start guard hides native main content during startup, retaining header/navigation. Mounting releases it; ten-second fail-open avoids permanently hiding a changed host layout.
- Team Leave mounts a verification shell first, then requests `GET /user/settings/profile` only while the section is active. Profile verification is cancellable, request-deduplicated during reconciliation and guarded against late responses. Authentication failures require sign-in; timeout/network/server failures offer Retry; missing/conflicting/unsupported company identity offers Retry plus explicit manual fallback. Directory/calendar requests begin only after verified or explicitly manual startup.
- DOM/theme/navigation reconciliation handles dashboard replacement and page lifecycle. It is not a background polling service. Section re-entry and restored-page lifecycle reverify; a silent server-side account switch without a page signal is not continuously monitored.

## Teams and display

- Create, edit, rename and delete teams; deletion asks for confirmation. One employee can belong to multiple teams.
- Text search is trimmed, case-insensitive **name-only** substring matching. Department, manager and region are separate exact filters combined with search.
- Matching selected employees appear first under **Selected members**, followed by a divider and **Other employees**. Filters also apply to selected employees; no hidden member is automatically removed. Missing saved IDs remain preserved with a warning; directory-only picker rows cannot individually remove unresolved IDs.
- Defaults: no selected team, pending off, warning threshold 3, expanded UI. Threshold accepts integers 1–1000. Selected team, pending, threshold and collapsed state persist; month selection does not.
- Monthly timeline supports previous/next month and Today. Initial month/Today derive from the current UTC date.
- The current UTC day's column has a stronger amber outline spanning its day header, member rows and daily summary, with a brighter border in dark theme. The header carries `aria-current="date"`. Highlight appears only in the displayed current month and updates on render; it does not change leave/holiday shading or intercept cell tooltips.
- Approved blocks show A; optional pending blocks show P. Approved takes precedence when both occur for a person/day. Leave-cell tooltip extracts only the leave type from the verified possessive description format; unrecognized descriptions are shown unchanged. Leave cells and summary cells use a help cursor.
- Daily summary always shows approved and additional pending counts, even when pending blocks are hidden. Each person counts once per date, and additional pending excludes people approved that same date. Whole-cell tooltip explains counts concisely and includes H when a holiday is present.
- **Show pending** changes pending-block visibility and includes additional pending in warning thresholds; it does not suppress pending summary counts.
- Monthly **Confirmed away** and **Additional pending** count distinct people appearing in each daily category across the month, not person-days. Someone approved on one day and pending on another can appear in both monthly totals; daily categories are disjoint, monthly totals need not be.
- Warning days list dates, counted members and names. Weekends and holiday columns use the same shading. Holidays show H, do not add absence counts and are listed below warnings chronologically with weekday/date; a multi-day holiday appears on each matching day of the selected month. Calendar validation notes are a separate final section.
- Refresh reloads directory/calendar, with last successful calendar refresh time, loading/error and explicit stale-result indicators. Stale calendar is only displayed for its matching team/month key.

## Verified HBHR contracts

| Read | Contract |
| --- | --- |
| Authenticated profile | GET `/user/settings/profile` with same-origin credentials, `Accept: text/html`, `cache: no-store`; final response must remain on the profile path and be HTML |
| Profile identity | Hidden `id` inputs from `/user/settings/profile/work-details/update` or `/user/settings/profile/personal-details/update` must agree; recognized `user-dbs-edit-form` Livewire `wire:snapshot` must provide matching positive numeric `user_id` and `company_id` |
| Directory | GET `/people-directory`; parse `#user-profile` using headers and profile IDs from `/people-directory/view/<id>` |
| Retained directory fields | ID, name, department, Line Manager and region; no retained email, phone, photo or notes |
| Calendar | GET `/home/get-calendar`; `first_day`, `last_day`, repeated `user_id[]`; query dates such as `Thu Oct 01 2026` |
| Calendar response | `{success:true, calendar_data:[...]}`; leave `user_id`, ID, start/end, approved/pending status, `only_text`; public-holiday records separate |
| Date handling | Inclusive date-only ranges; selected-member filtering locally as well as request filtering; empty team skips calendar request |
| Request safety | Ten-second timeout, cancellation/latest-response guards; authentication/malformed responses are errors, not no-leave results |

Automatic scope is `hbhr:company:<companyId>:user:<userId>` from the authenticated profile contract. Both IDs are required; the company marker is not assumed to be universal. Missing/ambiguous/unsupported profile identity blocks automatic loading and offers explicit manual scope `hbhr:manual:<label>`. Manual scope is cleared on full reload or leaving the eligible section. Profile HTML and unrelated fields are not persisted or logged.

## Storage and sharing

- Key prefix `hbhr:workspace:`; workspace schema version 1. Team fields: ID, name and member IDs. Preferences: selected team, pending, threshold, collapsed.
- Automatic keys use `hbhr:workspace:hbhr:company:<companyId>:user:<userId>`. Existing `hbhr:workspace:hbhr:user:<userId>` entries remain readable as ambiguous legacy workspaces. When the verified destination is missing, the UI explains the ambiguity before showing any legacy team details; explicit acceptance validates and copies the workspace, preserves the original key, rechecks the destination and never overwrites an existing destination. Refusal leaves the legacy key untouched. Invalid entries are distinguished from missing entries and reported without replacement.
- Limits: 100 teams, 1000 member IDs per team, 200-character team name, 256 KiB import text. Imports validate schemas/IDs and reject unsupported sensitive payload keys.
- Export JSON contains `version`, source `scope` and `groups`; it excludes preferences, directory details, leave records and credentials. Source user ID and employee member IDs are identifiers, not access tokens.
- Cross-account imports require explicit scope confirmation and are stored under the recipient's current scope. Existing user-only and manual export scopes remain readable; preview reports unresolved IDs and preserves them. Matching employee IDs do not prove cross-company compatibility. Share only with authorized colleagues in the same organization.
- Merge adds new team IDs; matching IDs use the incoming name and union member IDs. Replace requires confirmation and replaces all current teams. Imports do not continuously synchronize copies or grant HR access.
- Storage subscriptions synchronize tabs; simultaneous edits are last-write-wins, not distributed merging. Calendar/directory data are not persisted by the extension.

# Constraints

- Chrome only, subject to browser/organization installation policies.
- Partial-day hours, staffing capacity, work schedules and regional holiday eligibility are not inferred. Weekend hiding is not implemented.
- Live multi-account/permission configurations have not all been validated. The current company marker comes from the observed `user-dbs-edit-form` component; if another account does not expose it, automatic loading falls back safely rather than guessing. A server-side account switch that does not change the page is undetectable; re-enter the section or reload after changing accounts. Use different manual labels for different accounts only when explicit fallback is required.
- Known pagination markers are checked; undocumented directory/layout changes may require maintenance.
- The build workflow does not publish releases or change versions. The manually triggered release workflow tags the current three-part version, publishes a versioned GitHub Release ZIP and then commits the next patch version to `main`. No Web Store API publishing; version checks do not compare against previous store uploads. Repository policy must permit release tags and the bot's direct version commit.
- Public privacy-policy hosting, listing approval and safe reviewer account access are external owner/admin tasks; repository assets do not establish publication status.

# Validation

Current review uses strict TypeScript, production build, Vitest component/unit/asset tests and actual unmodified unpacked-extension Playwright tests in isolated Chromium profiles. Fixtures contain no real HR records. Coverage includes parsers, dates, overlap/storage/import handling, name search, selected-first ordering, holiday dates, concise tooltips/cursors/shading, account signals, navigation/history/startup masking, persistence, stale authentication, dark/narrow layout, hostile strings and Axe checks.

Synthetic tests cover strict profile parsing/request failures, asynchronous startup cancellation/deduplication/retry, company/account isolation, explicit legacy recovery, imports and UI regression behavior. These fixtures contain no real profile captures, identifiers or HR records. Automated results are dated in the implementation change and do not certify current live HBHR behavior, company-marker availability across account configurations or Chrome Web Store approval. Authenticated installation/acceptance remains an authorized-user task; follow [installation and verification](../runbooks/installation.md).

Automated fixtures do not certify current live HBHR behavior or imply Chrome Web Store approval. Authenticated installation/acceptance remains an authorized-user task; follow [installation and verification](../runbooks/installation.md).

# Source of Truth

- [Runtime architecture](../architecture/extension.md) links the implementing files.
- [Tests](../../tests/Widget.test.tsx), [adapter tests](../../tests/adapter.test.ts), [storage tests](../../tests/storage.test.ts), [domain tests](../../tests/domain.test.ts), [asset tests](../../tests/store-assets.test.ts) and [browser tests](../../tests/e2e/extension.spec.ts) provide executable evidence.
- [Build workflow](../../.github/workflows/build.yml) and [version check](../../scripts/check-version.mjs) define delivered build automation.
- [Release workflow](../../.github/workflows/release.yml), [patch updater](../../scripts/bump-patch.mjs) and [release-script tests](../../tests/release.test.mjs) define manual GitHub publishing and next-version preparation.
- HBHR itself remains authoritative for employee records and leave approvals.