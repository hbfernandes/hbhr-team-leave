---
type: runbook
title: Installation and verification
description: Install, update or distribute the Chrome extension through unpacked files or an unlisted store listing, and verify it safely.
status: stable
last_reviewed: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
sources: [{ id: store-publish, resource: "https://developer.chrome.com/docs/webstore/publish" }, { id: store-images, resource: "https://developer.chrome.com/docs/webstore/images" }, { id: store-distribution, resource: "https://developer.chrome.com/docs/webstore/cws-dashboard-distribution" }, { id: store-review, resource: "https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions" }, { id: pages, resource: "https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site" }]
---

# Preconditions

- Google Chrome 120 or newer, with organizational permission to install the extension.
- An authorized HBHR account; the extension never asks for your password.
- For unpacked installation, a built `dist` directory or extracted extension ZIP. Development requires Node 20.19+ or an appropriate supported newer Node; CI uses Node 22. Run `npm ci`, `npm run check`, `npx playwright install chromium`, `npm run test:e2e` and `npm run package` as needed. See [builds/versioning](builds.md).
- Store installation requires an approved, available listing URL supplied by the publisher; this repository does not establish that a listing is live.

# Steps

## Install and use

1. Choose installation method:
   - **Unpacked:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist` or the extracted directory containing manifest/scripts/icons. Chrome cannot load the ZIP directly.
   - **Unlisted Chrome Web Store:** obtain the approved listing URL from the publisher, open it and choose **Add to Chrome**. Developer mode is unnecessary; the listing is not discoverable through store search, so keep the direct URL. Anyone with the URL can install: unlisted visibility is not company-only access control. HBHR authentication and existing account permissions still govern HR access.[^store-distribution] Follow organization policy if installation is blocked.
2. Sign into HBHR normally and reload its home dashboard. Click **Team Leave** beside My Docs (My Info fallback).
3. On first use, choose **Create your first team**, name it, select employees and save. Later use **Manage teams** for editing. Name search and separate metadata filters narrow the picker; matching selected members appear first.
4. Browse months, optionally enable **Show pending**, and set **Warn at**. Read daily counts as approved/additional pending, not a combined multi-digit number. Review dated holidays below warning days. See [behavior reference](../reference/implementation.md).
5. Use **Refresh** to reload directory/calendar. Import/export definitions through Manage teams; exports include identifying member IDs and source scope. Share only with authorized colleagues in the same company.
6. For unpacked updates, rebuild/replace the installed files, select **Reload** on the extension card and reload HBHR. Store-installed copies update through Chrome after approved publication; reload an already-open HBHR page to load updated content scripts.
7. When migrating from unpacked to store, export teams first, disable the old copy, install the new copy and import definitions. Installation IDs/storage normally differ; do not run both copies simultaneously.
8. Use browser Back or HBHR Home navigation to return to native content. Bookmark `https://app.hbhr.io/#hbhr-team-leave` for direct access.

## Prepare an unlisted store listing (publisher only)

These steps are conditional guidance, not confirmation of a live listing. Public policy hosting, a monitored support contact, authorized synthetic reviewer access and store approval remain external prerequisites. Unlisted distribution simplifies installation and updates, but still requires store review.

1. Confirm a registered/verified publisher account and company permission to distribute an independent HBHR companion extension. Do not imply official endorsement or use vendor logos without permission.
2. Generate visuals with `npm run store:assets`, or review existing verified assets. The [generator](../../scripts/store-assets.mjs) uses original artwork, an isolated temporary Chromium profile and intercepted local HTTP fixtures—not real HR logins or network payloads. Review the [128px icon](../../public/icon-128.png), [440×280 promo](../../store-assets/promo-440x280.png), [1280×800 calendar](../../store-assets/screenshot-calendar-1280x800.png) and [1280×800 editor](../../store-assets/screenshot-team-editor-1280x800.png). Screenshots use fictional data in a minimal synthetic host shell, marked demo/independent. Keep PNGs in source control; never substitute real employee screenshots.[^store-images]
3. Review and publicly host the [privacy policy](../../store-assets/privacy.html) over HTTPS. For GitHub Pages, use repository **Settings → Pages → Deploy from a branch**, select `main` and root `/`.[^pages] The expected URL with that configuration is `https://hbfernandes.github.io/hbhr-team-leave/store-assets/privacy.html`; verify deployment and anonymous access before using it. A GitHub source-file view is not the rendered policy. A separate policy-only repository is also valid. The build workflow does not configure Pages. Confirm a monitored publisher support contact.
4. Build/test/package locally or obtain a tested CI ZIP through [builds/versioning](builds.md). Upload only the extension ZIP, not the source tree or employee exports. Icons are bundled; listing visuals and privacy policy are separate assets. For updates, increase the version and use the existing store item.
5. Manually create/update the item in the [developer dashboard](https://chrome.google.com/webstore/devconsole), upload the ZIP and visuals, and complete listing/privacy/support details.[^store-publish] Use the listing and privacy guidance below after confirming accuracy. CI does not upload or publish.
6. Set **Distribution → Visibility → Unlisted** and verify it before submission. Share its direct URL only with intended colleagues, but do not treat that URL as an authorization boundary.[^store-distribution]
7. Arrange dedicated, company-approved reviewer access with synthetic data on **https://app.hbhr.io/**; unrelated staging origins do not match the extension. Provide access/MFA instructions directly in the private **Test instructions** field.[^store-review] Never put personal credentials, production employee data or secrets in this repository, chat or public listing. Resolve missing safe access with the company administrator before submitting.
8. Submit manually for review, optionally defer publication, and share the approved URL after publication. Verify normal installation without Developer mode. Follow the migration steps above when replacing unpacked copies.

### Listing and privacy guidance

**Name:** HBHR Team Leave

**Short description:** Local, read-only team leave timelines and overlap summaries inside your HBHR dashboard.

**Full description:**

> See monthly leave overlap for employee teams you choose in your HBHR dashboard.
>
> • Create and manage locally saved teams from the employee directory.
> • View approved leave and optionally pending requests in a daily timeline.
> • Highlight days when leave overlap reaches your chosen threshold.
> • See public holidays with their dates.
> • Export and import team definitions for authorized sharing with colleagues.
>
> Requires an existing account at app.hbhr.io. Uses your current session and permissions. Read-only: does not modify HR records or calculate partial-day hours or staffing capacity. Team definitions and preferences stay in Chrome's local extension storage. No advertising, analytics or developer-operated data collection service.
>
> Independent companion extension; not affiliated with or endorsed by HealthBoxHR. Screenshots use fictional employees and leave records.

Declare privacy handling accurately against current dashboard category definitions:

- **Single purpose:** Monthly leave overlap for locally saved teams inside the signed-in user's HBHR dashboard.
- **Storage:** Team names, employee IDs, account scope and preferences stay in Chrome local extension storage.
- **Site access:** Content scripts read directory/calendar through the existing session and render Team Leave; no HR writes.
- **Remote code:** None; requests retrieve HR data, not executable code.
- **Data handling:** Directory information and leave dates/status/descriptions are processed locally; descriptions may contain sensitive personal information. Exports include source scope and member IDs, not leave records or credentials. No automatic transfer to publisher/analytics.

No external collection server does not mean no personal-data processing. Do not indiscriminately mark every category absent; consult the [data reference](../reference/implementation.md#storage-and-sharing) and policy.

### Private reviewer workflow

1. Sign into the authorized synthetic-data account on app.hbhr.io. Provide access/MFA steps privately; avoid inaccessible production SSO dependencies.
2. Click **Team Leave** beside My Docs/My Info and create a team with specified test employees.
3. Navigate to the seeded month specified privately, enable **Show pending** and adjust **Warn at**.
4. Check approved/pending cells, summary tooltips, warning days and dated holidays.
5. Use **Manage teams** to verify selected-first ordering, name search, metadata filters and optional export/import preview.
6. Confirm no HR records changed. The offline asset generator is not reviewer access; reviewers need an authorized account on the matched origin.

# Verification

- Compare selected employees and single-day/multi-day/cross-month leave against native HBHR.
- Verify Show pending affects blocks/warnings but pending summary counts remain visible; holidays do not add absence counts.
- Check native navigation, Back/Forward restoration, deep links, light/dark appearance and keyboard dialogs.
- Confirm teams survive reload. After an account switch reload the page; confirm identity/scope before using saved teams. Silent server-side switches are not detected automatically.
- Inspect extension-originated data reads: only GET directory/calendar requests, no HR writes. Native HBHR makes its own requests independently.
- Synthetic tests do not replace authenticated acceptance in the user's Chrome profile.
- For store distribution, check image dimensions/manifest icons, packaged icons, anonymous policy access, operational support contact and authorized synthetic reviewer access. Run build/test/documentation checks and verify Unlisted visibility before submitting.
- After approval, test installation through the direct listing URL without Developer mode and disable unpacked duplicates.

# Rollback

Disable/remove HBHR Team Leave at `chrome://extensions`, then reload HBHR. HR records are unchanged. Export definitions before uninstalling if needed; uninstall removes extension-local settings but not exports saved elsewhere.

For publishers, keep the listing draft or cancel pending review when needed. Unpublishing does not remove installed copies. Repair published issues with a higher-version update through the same store item.

# Escalation

If missing, check extension/site access, eligible home route/hash and dashboard layout. For identity failure enter a distinct organization-and-account label; manual selection is not remembered after reload or leaving the section. If auth expires sign in again and Refresh. For host changes, stop treating stale data as current and report only non-sensitive errors, browser version and route. Never include passwords, cookies, HR payloads or employee screenshots. Browser-policy restrictions require the administrator; do not bypass them.

The publisher resolves hosting, support contact and store review; the company administrator authorizes synthetic reviewer access, distribution and branding. Do not widen permissions or disclose real HR credentials to bypass review problems.

[^store-publish]: Chrome Web Store publishing workflow.
[^store-images]: Chrome Web Store image requirements.
[^store-distribution]: Store visibility settings.
[^store-review]: Private reviewer instructions.
[^pages]: GitHub Pages publishing-source configuration.