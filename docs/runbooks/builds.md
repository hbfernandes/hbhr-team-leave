---
type: runbook
title: GitHub Actions builds and versioning
description: Build tested packages, publish manual GitHub releases and prepare the next patch version.
status: stable
last_reviewed: 2026-10-02
generated: { by: github-copilot, at: "2026-10-02T00:00:00Z" }
---

# Preconditions

- GitHub Actions enabled and [build workflow](../../.github/workflows/build.yml) committed/pushed. Local files alone do not activate remote CI.
- For releases, the [release workflow](../../.github/workflows/release.yml) must be on `main`. Its `GITHUB_TOKEN` needs contents-write permission and repository rules must allow its tag creation and direct version-bump commit to `main`. The workflow does not bypass branch protection; resolve policy with the repository administrator before running.
- No OAuth credentials, Web Store secrets or publishing environment are required.
- Store updates use the existing store item and a version greater than the prior uploaded version; the publisher verifies that externally.

# Steps

## Development builds

1. Commit and push to `main`, open/update a PR, or use **Actions → Build and test → Run workflow**. CI uses Node 22, `npm ci`, version checks, release-script tests, unit/component/asset tests, synthetic Chromium browser tests and packaging. This workflow remains read-only and creates no tags/releases/version commits.
2. For a build artifact, download **hbhr-team-leave-package** and extract GitHub's wrapper ZIP once to obtain the actual extension ZIP. Do not upload the wrapper to the store. Artifacts remain available for 14 days; failed browser reports for 7 days.

## Manual GitHub release

1. Confirm the current `main` version is the version to release. Releases require three numeric parts, such as `0.1.0`; all four version fields in [manifest](../../public/manifest.json), [package](../../package.json) and [lockfile](../../package-lock.json) must match. For a minor/major change, edit those fields and commit before running. Normal patches use the version prepared by the previous release.
2. Choose **Actions → Release → Run workflow**, selecting **main**. Other branches are skipped. No push or tag automatically triggers this workflow. Release runs are serialized; avoid changing `main` while a release is running.
3. The workflow checks version consistency, availability of `v<version>` and validity of the next patch; runs script, unit/component and browser tests; and packages the tested code. It verifies `main` still matches the tested commit before tagging.
4. The workflow pushes `v<version>` for the tested commit and creates a GitHub Release with generated notes and **hbhr-team-leave-<version>.zip** as a release asset. Download that asset directly from **Releases → Assets**. It is ready to upload: manifest/scripts/icons are at ZIP root, with no nested artifact wrapper. Do not use GitHub's automatically generated source-code archives.
5. After creating the release, the workflow increments patch and commits/pushes the updated manifest, npm package and both lockfile root versions to `main`. Example: release `v0.1.0` contains version `0.1.0`; the next commit prepares `0.1.1`. The released tag/ZIP are not changed. Patch overflow at Chrome's 65535 limit fails preflight; choose a valid next minor/major version explicitly instead.
6. Upload the versioned release asset manually to the existing Chrome Web Store item, verify version/listing/visibility and submit for review. Follow [unlisted store preparation](installation.md#prepare-an-unlisted-store-listing-publisher-only). No workflow uploads or publishes to the store.
7. Pull `main` before continuing development to obtain the next-version commit. GitHub-token pushes normally do not trigger another push workflow; the release run already tests the released code and validates bumped metadata. After store approval Chrome updates installations automatically; unpacked installations need rebuild/reload.

Local verification remains `node scripts/check-version.mjs`, `node --test tests/release.test.mjs`, `npm run check`, `npm run test:e2e` and `npm run package`. Local packaging keeps the unversioned filename; only the release workflow renames the downloadable asset. Version checks do not query the store or establish that the upload version is greater than the previous store version.

# Verification

- CI steps succeed, metadata matches and package includes scripts, manifest and all declared icons.
- No real HR account/data are used in CI; no publishing secrets are needed.
- Release asset filename and root manifest version match the tag; the tag points at tested code, and `main` has the next patch in all version fields.
- The uploaded store version is higher than previous upload; the publisher verifies that externally.
- Store submission occurs only through manual dashboard actions.

# Rollback

Cancel a build without affecting installed copies. Cancel a bad pending store review in the dashboard; fix a published release with a corrected higher version, not a version decrement. Removing an artifact does not undo store publication.

Release/tag creation and the following version commit are separate operations. A failed run may already have pushed a tag, created a release or published its asset. Inspect its completed steps before retrying: duplicate tags are deliberately rejected. If tag creation succeeded but release creation failed, recover the release against that same tested tag and package, then prepare the next patch. If the release exists but the bump push failed, keep the release unchanged and update all version fields to the documented next patch through the normal approved commit/PR process. Never force-push over concurrent work or move a published release tag.

# Escalation

Repository admin handles Actions permissions/build failures; publisher handles store version/review problems. If credentials were configured for the removed store automation, delete unused secrets/variables and revoke unused OAuth access externally; source removal does not revoke credentials.