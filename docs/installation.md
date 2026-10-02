---
type: runbook
title: Installation and verification
description: Install the Chrome extension and verify it safely.
status: stable
---

# Preconditions

- Google Chrome 120 or newer, with permission to install unpacked extensions.
- An authorised HBHR account. This tool never requests your password.
- Built output in the repository's `dist` directory; alternatively extract `artifacts/hbhr-team-leave.zip`.
- Development uses Node 20.19+ and npm. Run `npm ci`, then `npm run check` to rebuild and test. Install the test browser with `npx playwright install chromium`; run `npm run test:e2e` for browser tests and `npm run package` for the ZIP.

# Steps

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the `dist` directory, or the directory containing the extracted manifest and content script.
4. Log into HBHR normally and reload the home dashboard.
5. Click **Team Leave** beside **My Docs / My Info**. It opens the extension-owned section while retaining HBHR header/navigation. Select **Manage teams**, create a group and select its employees.
6. Save the group. Browse the monthly timeline and adjust the warning threshold. Pending leave is optional.
7. Use **Refresh** to reload the directory and calendar. Import/export team definitions from **Manage teams**; keep exports private because member IDs identify employees.
8. After rebuilding an update, select **Reload** on the Chrome extension card and reload HBHR.
9. Use browser Back or HBHR's Home navigation to return to the native dashboard. Bookmark `https://app.hbhr.io/#hbhr-team-leave` to open the section directly.

# Verification

- Confirm employee names and a known single-day/multi-day leave against HBHR.
- Confirm pending leave differs from approved leave and holidays do not increase employee absence counts.
- Confirm My Info/My Docs links are unchanged, browser Back restores native controls, deep-link reload works, light/dark styling is readable and keyboard access works.
- Confirm saved groups survive reload and account changes never display another account's calendar.
- Inspect network requests: extension uses GET reads to people-directory and home/get-calendar only. No HR writes.
- The automated browser suite loads the exact built extension against synthetic pages. It does not replace authenticated manual verification in your Chrome profile.

# Rollback

Disable or remove **HBHR Team Leave** at `chrome://extensions`, then reload HBHR. The extension does not change HR records. Removing it deletes extension-local settings; export groups first if needed.

# Escalation

If the widget is absent, verify the extension is enabled, site access permits HBHR and you are on the home dashboard. If Chrome policy blocks installation, contact your browser administrator; do not bypass policy.

If authentication expires, log into HBHR and refresh. If account detection fails, supply a unique organisation-and-account workspace label. Never reuse a manual label between accounts.

If directory parsing fails after an HBHR update, stop using the displayed data as current. Report only the non-sensitive error, browser version and page route; do not attach passwords, cookies, HR payloads or employee screenshots.