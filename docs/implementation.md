---
type: reference
title: Implementation reference
description: Implemented behaviour, validation and known limitations.
status: stable
---

# Facts

- Chrome Manifest V3, React/TypeScript, Vite IIFE content script; no service worker, backend, remote scripts or analytics.
- Only `storage` permission; content script matches `https://app.hbhr.io/*`. Team Leave navigation is added beside My Docs, with My Info fallback. The section mounts on authenticated `/`, `/home` and `/home/` only when `#hbhr-team-leave` is active.
- Shadow DOM section renders in the main content container with 24px top and 18px side gutters matching sibling pages, preserving HBHR header/navigation. Native content is temporarily hidden, not deleted. Browser history restores it, including prior visibility and page title. No extra Back to dashboard link. Ordinary home view makes no extension directory/calendar requests.
- This is an extension-owned client-side section on HBHR origin, not a registered HBHR server route or a separate `chrome-extension://` tab. Session and existing storage scopes remain unchanged.
- A small document-start script masks native main content before the dedicated route paints, leaving header/navigation visible. Main script releases the mask after mounting; ten-second fail-open timeout restores content if layout changes prevent mounting. Normal home clicks switch sections without reloading the document; modified clicks retain standard new-tab behaviour.
- Directory GET `/people-directory` parses `#user-profile` using headers. Retains ID, name, department, line manager and region only.
- Calendar GET `/home/get-calendar` sends `first_day`, `last_day` and repeated `user_id[]`; parses verified `calendar_data` and `only_text` fields. Filters membership locally as well.
- Inclusive date-only calculations, unique-person counts and disjoint approved/additional-pending sets. Public holidays are annotations, not people.
- Groups/preferences reside in scoped `chrome.storage.local`; directory and leave data remain in memory. Group import/export uses versioned JSON with preview, merge/replace and scope confirmation.
- Requests have a ten-second bound, cancellation and latest-response guards. Failed refreshes show explicit stale/error state.

# Constraints

- Partial-day capacity and working schedules cannot be inferred from the current payload.
- Organisation ID is not verified. Automatic account scope uses a unique explicit current-user signal, including the verified mileage-form script ID. Optional calendar-event identity must agree when present; the calendar script is absent from some freshly served dashboards. It uses HBHR origin plus verified user ID, not an assumed globally unique organisation identifier. Ambiguous/missing signals require explicit manual workspace selection.
- Manual workspace selection is intentionally not remembered across full page loads. Use distinct labels for distinct accounts.
- Account-switch detection responds to dashboard identity/DOM changes and page navigation. The extension cannot detect a silent server-side account switch that leaves the current page unchanged; reload after switching accounts.
- Directory completeness checks detect known server-pagination markers; arbitrary undocumented pagination changes may require adapter updates.
- Host page can observe rendered information; Shadow DOM is style isolation, not a privacy boundary.
- Cross-tab settings synchronise via Chrome storage events. Simultaneous edits use last-write-wins, not distributed merging.
- First release supports Chrome only. Browser policy may restrict installation.

# Validation

- Strict TypeScript checks and production build.
- 45 Vitest unit/component tests: parsing, requests, dates, overlaps, storage/imports, group editing, state handling, cancellation and optional-calendar account detection.
- Nineteen Playwright browser tests load the unmodified built Manifest V3 extension in isolated Chromium profiles: header navigation and fallback, active selection, hash routing, history/restoration, deep links, pre-paint masking/fail-open startup, same-document opening, native typography/spacing, persistence, mileage-only identity, calculations, stale authentication, remount/account change, dark/narrow layout, hostile strings and Axe accessibility.
- Dependency audit reports no known vulnerabilities at the implementation validation run.
- Real HBHR dashboard identity signals and directory structure verified read-only during implementation.
- Authenticated installation/manual acceptance in the user's Chrome profile requires the user to load the extension; this browser environment provides no extension-installation control. See [installation and verification](installation.md).

# Source of Truth

The repository specification describes intended scope. Runtime implementation and automated tests describe delivered behaviour. The authenticated HBHR application remains authoritative for employee records and leave approvals.