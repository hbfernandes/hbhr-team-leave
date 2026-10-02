---
type: runbook
title: GitHub Actions builds and versioning
description: Build tested packages, increment versions and upload releases manually.
status: stable
last_reviewed: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
---

# Preconditions

- GitHub Actions enabled and [build workflow](../../.github/workflows/build.yml) committed/pushed. Local files alone do not activate remote CI.
- No OAuth credentials, Web Store secrets or publishing environment are required.
- Store updates use the existing store item and a version greater than the prior uploaded version; the publisher verifies that externally.

# Steps

1. When preparing a release, choose a numeric Chrome version, such as `0.1.1` for fixes or `0.2.0` for features. Ordinary development commits may keep the same version.
2. Update [manifest version](../../public/manifest.json), [npm package version](../../package.json), and both root version entries in [lockfile](../../package-lock.json). `npm version patch --no-git-tag-version` or `npm version minor --no-git-tag-version` updates npm metadata only; manually set the manifest to match. No automatic Git tag/commit/release is created by this procedure.
3. Run `node scripts/check-version.mjs` to check numeric format and matching metadata. It does not compare Git history or query the store for version increases. Run `npm run check`, `npm run test:e2e` and `npm run package` for local verification/package.
4. Commit and push to `main`, open/update a PR, or use **Actions → Build and test → Run workflow**. CI uses Node 22, `npm ci`, version check, unit/component/asset tests, synthetic Chromium browser tests and packaging. The workflow has read-only repository permissions.
5. Open a successful run, download **hbhr-team-leave-package** under Artifacts and extract GitHub's wrapper ZIP to obtain the actual extension ZIP. Download packages remain available for 14 days; failed browser reports for 7 days.
6. Upload the inner extension ZIP manually to the existing Chrome Web Store item, verify version/listing/visibility and submit for review. Follow [unlisted store preparation](installation.md#prepare-an-unlisted-store-listing-publisher-only). CI never uploads or publishes to the store and does not create GitHub Releases or tags.
7. After approval Chrome updates store installations automatically. Unpacked installations need a manual rebuild/reload; see [installation](installation.md).

# Verification

- CI steps succeed, metadata matches and package includes scripts, manifest and all declared icons.
- No real HR account/data are used in CI; no publishing secrets are needed.
- The uploaded store version is higher than previous upload; changing version is the publisher's explicit action.
- Store submission occurs only through manual dashboard actions.

# Rollback

Cancel a build without affecting installed copies. Cancel a bad pending store review in the dashboard; fix a published release with a corrected higher version, not a version decrement. Removing an artifact does not undo store publication.

# Escalation

Repository admin handles Actions permissions/build failures; publisher handles store version/review problems. If credentials were configured for the removed store automation, delete unused secrets/variables and revoke unused OAuth access externally; source removal does not revoke credentials.