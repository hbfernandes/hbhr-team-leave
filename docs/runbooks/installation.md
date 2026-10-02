---
type: runbook
title: Installation and verification
description: Install or update the Chrome extension and verify it safely.
status: stable
last_reviewed: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
sources: [{ id: store-distribution, resource: "https://developer.chrome.com/docs/webstore/cws-dashboard-distribution" }]
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

Publisher setup, listing copy, privacy disclosures and reviewer instructions are in [Chrome Web Store setup](store-setup.md).

# Verification

- Compare selected employees and single-day/multi-day/cross-month leave against native HBHR.
- Verify Show pending affects blocks/warnings but pending summary counts remain visible; holidays do not add absence counts.
- Check native navigation, Back/Forward restoration, deep links, light/dark appearance and keyboard dialogs.
- Confirm teams survive reload. After an account switch reload the page; confirm identity/scope before using saved teams. Silent server-side switches are not detected automatically.
- Inspect extension-originated data reads: only GET directory/calendar requests, no HR writes. Native HBHR makes its own requests independently.
- Synthetic tests do not replace authenticated acceptance in the user's Chrome profile.
- For store installations, confirm the direct listing URL installs without Developer mode and disable unpacked duplicates.

# Rollback

Disable/remove HBHR Team Leave at `chrome://extensions`, then reload HBHR. HR records are unchanged. Export definitions before uninstalling if needed; uninstall removes extension-local settings but not exports saved elsewhere.

# Escalation

If missing, check extension/site access, eligible home route/hash and dashboard layout. For identity failure enter a distinct organization-and-account label; manual selection is not remembered after reload or leaving the section. If auth expires sign in again and Refresh. For host changes, stop treating stale data as current and report only non-sensitive errors, browser version and route. Never include passwords, cookies, HR payloads or employee screenshots. Browser-policy restrictions require the administrator; do not bypass them.

[^store-distribution]: Store visibility settings.