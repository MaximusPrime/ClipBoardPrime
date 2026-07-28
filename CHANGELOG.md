# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2026-07-28

### Highlights

- **Verified-target native paste:** ClipBoardPrime now confirms that the remembered Windows target still exists and truly owns focus before sending any keyboard input. Rapid paste requests are serialized to prevent clipboard contents from crossing between operations.
- **Fail-safe paste behavior:** Removed the shell-based `mshta/SendKeys` fallback. If native input or target focus cannot be verified, paste is safely cancelled, the application is restored when needed, and the user receives a visible error.
- **Always on Top:** Added a persistent toggle under General settings to keep ClipBoardPrime above other windows when desired.
- **Complete window memory:** Normal bounds, monitor-safe position, and maximized state are now restored reliably. Final bounds are flushed on exit, while cursor-adjacent opening no longer overwrites the user's remembered position.
- **Clearer settings organization:** Everyday interaction preferences now live under General > Interaction, while advanced controls are grouped into Security and Privileges, History and Retention, and Clipboard Engine.

### Quality assurance

- Expanded the automated regression suite from 60 to **64 passing tests**.
- Extended the real Electron E2E workflow to verify bounds persistence, cursor-position isolation, maximized-state persistence, off-screen recovery, workspace switching, and renderer reload.
- Verified JavaScript syntax, all localization contracts, Win32/Koffi window-handle behavior, and clean patch integrity.
- Updated application, documentation, website copy, download links, and release metadata for `v1.0.4`.

## [1.0.3] - 2026-07-26

### Highlights

- **Brazilian Portuguese completed:** Integrated the community `pt-BR` translation across settings, onboarding, clipboard actions, system tray menus, documentation, and localization contract tests.
- **Reliable language persistence:** The interface now changes language only after the preference is saved successfully; failed saves restore the previous selection instead of creating a temporary inconsistent state.
- **Predictable localization fallback:** Missing translations now fall back exclusively to English, preventing mixed-language interfaces.
- **Security maintenance:** Updated Electron to 43.2.0 and Koffi to 3.1.2, patched the complete desktop and website dependency trees, and verified both with zero known npm vulnerabilities.
- **Website platform upgrade:** Migrated the project website from Astro 5/Tailwind 3 to Astro 7/Tailwind 4, replaced inline lightbox handlers with safe event listeners, and made CI installs reproducible with `npm ci`.

### Quality and release engineering

- Expanded the automated suite from 58 to 60 tests with regressions for localization fallback and failed language persistence.
- Verified JavaScript syntax, all 60 automated tests, the isolated Electron E2E workflow, Astro diagnostics, desktop packaging, and website production builds.
- Standardized Windows artifacts as `ClipBoardPrime.Setup.Recommended.1.0.3.exe` and `ClipBoardPrime.Portable.1.0.3.exe`.
- Removed obsolete development patch files and generated Astro cache files from source control.

## [1.0.2] - 2026-07-24

### Highlights

- **Tray Balloon Notification Localization (Issue #1)**: Fixed hardcoded notification text when minimizing to tray for the first time. Added dynamic i18n support across Turkish, English, and Chinese locale files.
- **Note Editor Maximize Mode**: Added full-screen expand button to the note editor modal for large text editing with flexible vertical layout.
- **Batch Item Selection & Deletion**: Added multi-select mode with checkboxes, range selection (Shift+Click), select all (Ctrl+A), and atomic batch deletion from SQLite database and disk storage.
- **Date Grouping Fixes**: Resolved SQLite local datetime string parsing and prevented duplicate group headers during infinite scroll loading.

---

## [1.0.1] - 2026-07-17

### Highlights

- **New Compact Workspace:** Removed dual/wide panel mode. Clipboard and Notes now share a unified, user-resizable window size and switch instantly via top navigation controls.
- **Faster Content Preview:** Clipboard and note cards are displayed as concise, readable summaries. Press `Space` or click **View More** to open a centered, full selectable text/image preview.
- **Keyboard-Driven Focus:** Hovering over cards automatically focuses them; `Space`, arrow keys, `Home`, `End`, and quick card action hotkeys function immediately without extra clicks.
- **Redesigned First-Run Setup:** Added a 3-step onboarding flow with live preview for selecting language, dark/light/system theme, launch screen preference, window position, and Windows startup behavior.

### Added

- Keyboard hotkeys `Ctrl+1`, `Ctrl+2`, and `Ctrl+Shift+M` for direct switching between Clipboard and Notes workspaces.
- Hotkey `Ctrl+F` to focus search in active screen; `Home` and `End` support for navigating card lists.
- Card action hotkeys: `C`, `P`, `F`, `N`, `Delete` on clipboard cards; `C`, `E`, `P`, `F`, `Delete` on note cards.
- Shared, persistent window size and position memory for Clipboard and Notes; added a reset option in Settings to restore default compact dimensions.
- Monitor boundary safety recovery logic that pulls the window back into the active viewport if moved off-screen.
- Startup filter preferences for Clipboard, Notes category groups, and initial workspace selection.
- Customization toggles to show/hide and reorder clipboard card action buttons.
- Retention rules by content type, automatic deletion protection for favorites, and advanced content filters.
- Password-protected encrypted `.cpbackup` exports, legacy JSON import detection, and secure onboarding data import.
- Comprehensive English, Turkish, and Simplified Chinese localized descriptions in Settings and Setup.

### Changed

- Compacted Clipboard and Note card heights for higher information density and improved readability.
- Replaced lengthy note accordions with centered detail preview modals; updated toggle arrows with subtle smooth animations.
- Shifted dark theme to a deeper obsidian tone; enhanced light theme contrast for panels, cards, inputs, hover states, borders, and content type badges.
- Streamlined Settings workspace to fit compact layout; clarified explanations for data storage location, window behavior, quick preview, and hotkeys.
- Updated backup documentation to match true application behavior: new exports create encrypted `.cpbackup` files, and imports merge missing records without overwriting local data.
- Removed outdated "zero footprint" claim from portable data description to reflect actual local storage behavior.
- Upgraded runtime to Electron `43.1.1`, `better-sqlite3 12.11.1`, and compatible packaging toolchain.

### Fixed

- Resolved window size creep issue where toggling between Clipboard and Notes caused incremental height growth.
- Fixed window boundary snapping flickering during dragging when interacting with Windows Snap boundaries.
- Corrected centered alignment for clipboard quick preview modal inside compact viewport.
- Prevented premature window closure when selecting or highlighting text inside quick preview modal.
- Fixed focus ring rendering delay when switching back to Clipboard view.
- Resolved text overflow for long database path strings on Settings > Data panel.
- Fixed inconsistent focus state on hidden panels when toggling views via keyboard hotkeys.
- Prevented loss of customized global shortcut on invalid save; added validation, rollback, and reserved Windows shortcut protection.
- Fixed race condition causing window blur to hide the application into system tray while modal dialogs were open.
- Fixed missing application state initialization during renderer reload.

### Security and Data Integrity

- Encrypted sensitive clipboard contents with AES-256-GCM; duplicate detection uses HMAC hashes without exposing raw content.
- Reinforced Electron sandbox isolation, context isolation, strict IPC input validation, external URL restrictions, and default permission denials.
- Offloaded backup file creation and maintenance tasks to non-blocking database background workers.
- Enforced strict path boundary validation and content-type verification for local image protocols.
- Audited production and development dependencies: **0 vulnerabilities** via `npm audit`.

### Quality Assurance

- Expanded automated test coverage to **54 regression tests**.
- Integrated real Electron E2E test suite verifying onboarding, live theme switching, modal shielding, workspace switching, shared window bounds, off-screen recovery, and renderer reloads.
- Verified Windows Setup installer and Portable executable using native SQLite smoke tests inside final production builds.
- Stripped unnecessary native build artifacts from release packages to minimize distribution size and attack surface.

---

## [1.0.0] - 2026-06-13

### Added — Clipboard History

- **Real-Time Clipboard Monitoring:** `setInterval` polling system (default 500ms, adjustable from 200ms to 5000ms). Evaluates `availableFormats`, text, HTML, and image hashes to capture genuine content changes.
- **Automatic Content Type Classification:**
  - `text` — Plain text
  - `url` — Links starting with http/https/www
  - `email` — RFC-valid email address format
  - `code` — Advanced regex engine detecting JSON, HTML, CSS, SQL, JS/TS, Python, Go, Rust, PHP, and 15+ language patterns
  - `html` — Rich text; saved with both HTML and plain text representations
  - `image` — Screenshots and copied images saved as local PNGs (`clip_<timestamp>_<hex>.png`); duplicate images prevented via MD5 hash check
- **Smart Duplicate Management:** Re-copied content moves existing entry to the top of the history list instead of creating duplicate records.
- **Infinite Scrolling:** Paginated history list loading 50 items per page; triggers automatic fetch when within 50px of bottom threshold.
- **Flicker-Free Skeleton Loading:** Smooth skeleton placeholders during initial load with DOM updates via `replaceChildren()`.
- **Date Grouping:** Chronological grouping under Today, Yesterday, This Week, Last Week, and Month headers.
- **Content Filter System:** Tabs for All, Text, URL, Email, Code, Image, Pinned, and Favorites.
- **Live Search:** Instant fuzzy search while typing; matching query text highlighted with amber `<mark>` tags.
- **Pin & Favorite Items:** Mark entries with `is_pinned` or `is_favorite`. Pinned items are preserved when clearing general history.
- **Active Window Paste Automation:** `Enter` key or Paste button hides application window and injects `Ctrl+V` into target window using native Win32 `SendInput` API.
- **Convert to Note:** One-click conversion from clipboard card to permanent Note workspace item.
- **Image Preview Modal:** Compact image thumbnail previews on cards; click to expand full-sized preview dialog.

### Added — Sensitive Data Shielding

- **Automatic Masking (`is_sensitive = 1`):**
  - Credit and debit card numbers (Visa, MasterCard, Amex, Troy, 13–19 digits)
  - API keys for GitHub (`ghp_`, `github_pat_`), Google (`AIzaSy`), Slack (`xox*`), SendGrid (`SG.`)
  - JWT Tokens (`eyJ...` format)
  - Turkish Identity Numbers (TCKN) with checksum validation
