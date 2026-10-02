---
type: runbook
title: Chrome Web Store setup
description: Prepare an unlisted store listing, privacy disclosures, assets and safe reviewer access.
status: stable
last_reviewed: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
sources: [{ id: store-publish, resource: "https://developer.chrome.com/docs/webstore/publish" }, { id: store-images, resource: "https://developer.chrome.com/docs/webstore/images" }, { id: store-distribution, resource: "https://developer.chrome.com/docs/webstore/cws-dashboard-distribution" }, { id: store-review, resource: "https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions" }, { id: store-privacy, resource: "https://developer.chrome.com/docs/webstore/cws-dashboard-privacy" }, { id: pages, resource: "https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site" }]
---

# Preconditions

- Registered/verified publisher account and company permission to distribute an independent HBHR companion extension. Do not imply official endorsement or use vendor logos without permission.
- Public HTTPS privacy policy and monitored publisher support contact.
- Company-approved reviewer account with synthetic data on **https://app.hbhr.io/**. Unrelated staging origins do not match the extension.
- Tested extension ZIP from a GitHub Release or local packaging; see [builds/versioning](builds.md).

This runbook provides setup guidance, not confirmation that hosting, reviewer access or store approval is complete.

# Steps

1. Generate visuals with `npm run store:assets`, or review existing verified assets. The [generator](../../scripts/store-assets.mjs) uses original artwork, an isolated temporary Chromium profile and intercepted local HTTP fixtures—not real HR logins or payloads. Review the [128px icon](../../public/icon-128.png), [440×280 promo](../../store-assets/promo-440x280.png), [1280×800 calendar](../../store-assets/screenshot-calendar-1280x800.png) and [1280×800 editor](../../store-assets/screenshot-team-editor-1280x800.png). Keep PNGs in source control; never substitute real employee screenshots.[^store-images]
2. Review the [privacy policy source](../../store-assets/privacy.html) and verify anonymous access to https://hbfernandes.github.io/hbhr-team-leave/store-assets/privacy.html. For branch-based GitHub Pages hosting, use **Settings → Pages → Deploy from a branch**, select `main` and root `/`.[^pages] A GitHub source-file view is not the rendered policy. A separate policy-only repository is also valid; the build workflow does not configure Pages. Confirm an operational support contact.
3. Download **hbhr-team-leave-<version>.zip** directly from a tested GitHub Release. This asset is ready to upload: manifest/scripts/icons are at ZIP root. Do not upload GitHub's source-code archives. For build artifacts, extract the Actions wrapper ZIP once and upload the inner extension ZIP. Upload neither source trees nor employee exports. Later store uploads require a higher version and the same store item.
4. Create/update the item in the [developer dashboard](https://chrome.google.com/webstore/devconsole), upload the ZIP and visuals, and complete listing/support details using the copy below after confirming accuracy.[^store-publish] GitHub release creation does not submit to the store.
5. Complete the Privacy tab using the field answers below. Check current category definitions and ensure disclosures match the actual package and privacy policy.[^store-privacy]
6. Set **Distribution → Visibility → Unlisted** and verify before submission. Anyone with its URL can install; this is not company-only access control. Existing HBHR authentication and account permissions still govern HR access.[^store-distribution]
7. Provide dedicated synthetic-account access/MFA instructions in the private **Test instructions** field, with the reviewer workflow below.[^store-review] Never put credentials in the repository, chat or public listing. Do not use personal credentials or production employee data. Resolve missing safe access with the company administrator before submitting.
8. Submit manually for review, optionally defer publication, then share the approved listing URL. Verify installation without Developer mode; follow [installation and migration](installation.md) and disable unpacked duplicates.

## Listing fields

**Name:** HBHR Team Leave

**Category:** Productivity. If the dashboard offers a subcategory, choose **Workflow & Planning**.

**Short description:**

> Local, read-only team leave timelines and overlap summaries inside your HBHR dashboard.

**Full description:**

> HBHR Team Leave adds a monthly team leave view to your existing HBHR dashboard, helping you spot overlapping absences for employees you select.
>
> • Create and manage locally saved teams from the employee directory.
> • Search employees by name and filter by department, manager or region.
> • View approved leave and optionally pending requests in a daily timeline.
> • Highlight days when overlapping leave reaches your chosen threshold.
> • See dated public holidays separately from employee absences.
> • Export and import team definitions for authorized sharing with colleagues.
>
> Requires an existing account at app.hbhr.io. Uses your current signed-in session and permissions.
>
> Read-only: does not create or modify HR records. Shows daily leave overlap, not partial-day hours or staffing capacity.
>
> Team definitions and preferences remain in Chrome’s local extension storage. Directory and leave data are processed locally. No advertising, analytics or developer-operated data collection service.
>
> Independent companion extension; not affiliated with or endorsed by HealthBoxHR. Screenshots show fictional employees and leave records.

## Privacy fields

### Single purpose description

> Display monthly leave timelines and overlapping absences for employee teams selected by the user within their signed-in HBHR dashboard. The extension is read-only and uses the user's existing HBHR access permissions.

### Storage justification

> The storage permission saves user-created team names, employee member IDs, account-scoping identifiers and display preferences in Chrome's local extension storage. This preserves teams and settings across page reloads and browser restarts. Directory and leave records are not persisted by the extension. No Chrome sync storage is used.

### Host permission justification

> Access is restricted to https://app.hbhr.io/* so the extension can add Team Leave navigation and render its timeline within HBHR. It reads the employee directory and calendar through same-origin GET requests using the user's existing signed-in session. Access is needed to select team members, display approved/pending leave and calculate daily overlap. The extension does not modify HR records, extract credentials or access unrelated websites.

### Remote code

Select **No, I am not using remote code**. All extension JavaScript is bundled. Fetching HBHR HTML/JSON data is not remote-code execution. Leave remote-code justification empty.[^store-privacy]

### Data usage

Recommended selections for the current implementation:

| Category | Select? | Reason |
| --- | --- | --- |
| Personally identifiable information | Yes | Employee names, employee IDs and account identifier |
| Health information | Yes | Leave types/descriptions can reveal sickness or other health-related absences |
| Financial and payment information | No | Not used |
| Authentication information | No | Existing session used without extracting passwords, cookies or tokens |
| Personal communications | No | Not used |
| Location | Yes | Employee region read for filtering |
| Web history | No | No browsing-history collection |
| User activity | No | No activity tracking or interaction logging |
| Website content | Yes | Directory and calendar content read and processed |

These selections disclose local processing, not transmission to the publisher. No backend does not mean no personal-data processing. Reassess when behavior changes; consult the [implementation reference](../reference/implementation.md#storage-and-sharing) and current dashboard definitions.

### Certifications

Check all three only if the publisher can truthfully attest:

- Data is not sold or transferred to third parties outside approved uses.
- Data is not used or transferred for purposes unrelated to the extension's single purpose.
- Data is not used or transferred to determine creditworthiness or for lending purposes.

### Privacy policy URL

https://hbfernandes.github.io/hbhr-team-leave/store-assets/privacy.html

Verify anonymous access and consistency with these disclosures before submission.

## Private reviewer workflow

1. Sign into the authorized synthetic-data account on app.hbhr.io. Supply access/MFA steps privately; avoid inaccessible production SSO dependencies.
2. Click **Team Leave** beside My Docs/My Info and create a team with specified test employees.
3. Navigate to the seeded month specified privately, enable **Show pending** and adjust **Warn at**.
4. Check approved/pending cells, summary tooltips, warning days and dated holidays.
5. Use **Manage teams** to verify selected-first ordering, name search, metadata filters and optional export/import preview.
6. Confirm no HR records changed. The offline asset generator is not reviewer access; reviewers need an authorized account on the matched origin.

# Verification

- Build/test/documentation checks pass; asset dimensions/manifest icons are valid and ZIP contains all icons and a root manifest.
- No real HR data appears in images; policy works anonymously and support contact is operational.
- Listing copy and Privacy tab match actual behavior, including sensitive leave descriptions and local processing.
- Reviewer access is authorized and restricted to synthetic data; Unlisted visibility is selected before submission.
- After approval, test direct-link installation without Developer mode and disable unpacked duplicates.

# Rollback

Keep the listing draft or cancel pending review when needed. Unpublishing does not remove installed copies. Repair published issues with a higher-version update through the same item; changing GitHub Releases does not undo store publication. See [installation rollback](installation.md#rollback) for installed copies.

# Escalation

The publisher resolves hosting, support contact and store review; the company administrator authorizes synthetic reviewer access, distribution and branding. Do not widen permissions or disclose real HR credentials to bypass review problems. Repository administrators handle release-workflow policy failures through [builds/versioning](builds.md).

[^store-publish]: Chrome Web Store publishing workflow.
[^store-images]: Chrome Web Store image requirements.
[^store-distribution]: Store visibility settings.
[^store-review]: Private reviewer instructions.
[^store-privacy]: Chrome Web Store Privacy tab guidance.
[^pages]: GitHub Pages publishing-source configuration.