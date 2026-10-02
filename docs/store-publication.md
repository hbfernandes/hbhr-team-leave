---
type: runbook
title: Unlisted Chrome Web Store publication
description: Prepare store assets, privacy disclosures and safe reviewer access for unlisted distribution.
status: draft
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
sources:
  - id: store-publish
    resource: https://developer.chrome.com/docs/webstore/publish
  - id: store-images
    resource: https://developer.chrome.com/docs/webstore/images
  - id: store-distribution
    resource: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
  - id: store-review
    resource: https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
---

# Preconditions

- A registered Chrome Web Store publisher account with required verification completed.
- Authorization to distribute an independent HBHR companion extension. Do not imply official endorsement or use vendor logos without permission.
- A publicly accessible host for the [privacy policy](../store-assets/privacy.html) and a real publisher support contact.
- Company-approved reviewer access on **https://app.hbhr.io/** using synthetic data. The extension only matches that origin; an unrelated staging host will not work.
- A local Node.js installation, dependencies and Playwright Chromium for asset generation and tests.

The asset preparation is local. No publisher account, hosting provider or reviewer credentials are embedded in the repository. Publishing and reviewer account provisioning require the owner/administrator.

# Steps

1. Generate original icons, promotional artwork and actual-extension screenshots with `npm run store:assets`. The script uses an isolated temporary browser profile, intercepts HTTP requests locally and uses fictional employees. It does not connect to the real HR service. Close any real HR screenshots before choosing listing images.
2. Review these deliverables:
   - [128px store icon](../public/icon-128.png), plus 16/32/48px browser icons declared in [the manifest](../public/manifest.json).
   - [440×280 promotional image](../store-assets/promo-440x280.png).
   - [1280×800 calendar screenshot](../store-assets/screenshot-calendar-1280x800.png).
   - [1280×800 team-editor screenshot](../store-assets/screenshot-team-editor-1280x800.png).
   - [Standalone privacy-policy page](../store-assets/privacy.html); review its text and supply an operational support contact in the listing.
   These sizes follow the Chrome Web Store image requirements.[^store-images] The host shell is a minimal synthetic demonstration; the extension UI is the production bundle, not an illustration. Screenshots explicitly label the fictional data and independent status. Generated PNGs should be retained in the repository.
3. Publish the policy page to a company-approved static host over HTTPS. No script, external stylesheet, analytics or login is needed. Verify the final URL anonymously before entering it in the store. Hosting is not performed by this repository.
4. Run `npm run check`, `npm run test:e2e` and `npm run package`. Upload [the resulting ZIP](../artifacts/hbhr-team-leave.zip), not the source tree or team exports. Icons are included; store images and policy are separate listing assets and are not bundled in the extension.
5. Create the store item and complete the listing using the copy below. Add the support contact, privacy-policy URL and images. The publisher owns and must confirm the accuracy of all declarations.[^store-publish]
6. Set **Distribution → Visibility → Unlisted**. Anyone with the URL can install; this is not a company access restriction.[^store-distribution]
7. Arrange a dedicated company-approved review account with synthetic employees/leave records and supply access details directly in the private **Test instructions** field. Never use a personal HR login, production employee data, credentials in source control or credentials in public listing copy.[^store-review] If safe reviewer access cannot be provided, stop and resolve that with the administrator before submission.
8. Submit for review, optionally choosing deferred publication. After approval, share the store URL. Export local teams before migrating from unpacked to store installation, disable the old copy, install the store copy and import definitions; extension IDs and storage usually differ.

## Listing copy

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

## Privacy field explanations

- **Single purpose:** Display monthly employee leave overlap for locally saved teams within the signed-in user's HBHR dashboard.
- **Storage justification:** Save team names, employee member IDs, an account-scoping identifier and display preferences in Chrome's local extension storage.
- **Site access justification:** Content scripts run only on app.hbhr.io to add the Team Leave section and read employee directory/calendar data through the existing signed-in session. They do not modify HR records.
- **Remote code:** No. The extension executes only bundled code; it fetches HR data, not executable code.
- **Data practices:** Directory identity/workplace information and leave dates, approval status and descriptions are processed locally. Descriptions can contain sensitive personal information. Team definitions and account scope are persisted locally; exports can be shared manually. No automatic transfer to the publisher or third-party analytics.

Do not mark every data category absent merely because there is no developer server. Read the current dashboard definitions: local handling still processes personal information, leave descriptions may include health-related information, and use of an existing session is distinct from copying authentication secrets. The final selections must match the publisher's actual practices and the current form.

## Reviewer instructions

Enter the following workflow in the private review field, alongside administrator-approved credentials supplied **outside this repository**:

1. Sign in to https://app.hbhr.io/ using the provided synthetic-data test account. Explain any required access steps; avoid a production SSO dependency reviewers cannot satisfy.
2. Click **Team Leave** beside My Docs/My Info in the top navigation.
3. Click **Create your first team**, enter a team name, select test employees and save.
4. Navigate to a month with seeded test approved/pending leave and public holidays. State the seeded month and employee names in the private instructions.
5. Check **Show pending** and adjust **Warn at** to exercise summary/warning days. Hover a leave cell and a daily summary cell to see details.
6. Open **Manage teams** to verify selected-first member ordering and name search. Optionally export definitions and preview their import using Merge.
7. Confirm the host HR records are unchanged. The extension provides no HR editing controls.

The offline screenshot generator is **not** a reviewer-access solution; reviewers installing the extension need authorized access to the real matched domain with safe test data.

# Verification

- Icon PNGs have their declared sizes and the ZIP includes every manifest-referenced icon.
- Both listing screenshots are 1280×800; promo is 440×280. No real account, employee or leave data appears.
- The policy URL works without sign-in and is accessible from the listing; support contact is monitored.
- Review credentials are dedicated, authorized, and allow the documented workflow without access to production HR data.
- All component, browser and documentation validation checks pass before uploading.
- After publication, verify normal Chrome installation without Developer mode and disable any unpacked duplicate.

# Rollback

Before submission, keep the item as draft. While pending, cancel review if changes are needed. If published, stop distribution/unpublish through the dashboard if necessary and advise users to disable the extension. To fix an installed release, publish a corrected package with a higher version to the same item; do not assume unpublishing removes installed copies. Preserve/export local teams before uninstalling or changing installation IDs.

# Escalation

The publisher must resolve support contact and public hosting. The company HBHR administrator must approve safe reviewer access and branding/distribution. For review rejection, address the stated issue through the dashboard; do not widen permissions or include real HR credentials to bypass access problems.

[^store-publish]: Chrome Web Store publishing workflow.
[^store-images]: Chrome Web Store image requirements.
[^store-distribution]: Chrome Web Store visibility settings.
[^store-review]: Chrome Web Store private reviewer instructions.