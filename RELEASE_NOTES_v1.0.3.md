# ClipBoardPrime v1.0.3

We are pleased to announce **ClipBoardPrime v1.0.3**, a security, localization, and release-quality update for our fast, private, and keyboard-driven Windows clipboard manager.

ClipBoardPrime monitors your clipboard in the background, stores supported history securely in a local SQLite database, and lets you search, organize, preview, and paste content instantly with the global shortcut (`Ctrl + Shift + V` by default).

---

## New in v1.0.3

### Brazilian Portuguese (pt-BR) support

- **Complete localization:** Brazilian Portuguese is now available throughout Settings, first-run onboarding, clipboard actions, system tray menus, notifications, and dynamic interface content.
- **Community contribution:** Special thanks to [@jntnlima](https://github.com/jntnlima) for contributing the original Brazilian Portuguese translation in [pull request #2](https://github.com/MaximusPrime/ClipBoardPrime/pull/2).
- **Translation coverage:** Automated localization contracts verify that all supported languages contain every interface key and required interpolation placeholder.

### More reliable language handling

- **Safe preference persistence:** The application changes the active language only after the new preference has been saved successfully.
- **Automatic recovery:** If saving fails, the language selector returns to the previously active language instead of leaving the interface in a temporary inconsistent state.
- **Consistent fallback:** Missing translation keys now fall back exclusively to English, preventing mixed Turkish, Chinese, Portuguese, and English interface text.

### Security and dependency maintenance

- Updated **Electron to 43.2.0** and **Koffi to 3.1.2**.
- Patched the complete desktop build dependency tree, including the archive-expansion advisory affecting packaging tools.
- Upgraded the project website from **Astro 5 to Astro 7** and from **Tailwind CSS 3 to Tailwind CSS 4** to resolve current Astro, esbuild, Sharp/libvips, and XSS advisories.
- Both the desktop application and website now report **zero known npm vulnerabilities**.

### Website and release engineering

- Replaced string-based inline lightbox handlers with structured `data-*` attributes and safe event listeners.
- Added Brazilian Portuguese to the website language feature description.
- Changed GitHub Pages dependency installation from `npm install` to deterministic `npm ci`.
- Removed generated Astro cache files and obsolete development patch artifacts from source control.
- Standardized installer filenames for clear Recommended and Portable distribution choices.

### Quality assurance

- Expanded the automated test suite from 58 to **60 passing tests**.
- Added regression coverage for English-only localization fallback and failed language-setting persistence.
- Verified JavaScript syntax, database and encryption behavior, localization completeness, IPC contracts, window recovery, and keyboard interactions.
- Passed the isolated Electron E2E workflow covering onboarding, live theme changes, modal blur protection, compact/notes workspace state, bounds recovery, and renderer reload.
- Passed Astro diagnostics with **0 errors, 0 warnings, and 0 hints**.
- Verified Windows x64 packaging and native `better-sqlite3` rebuilding with Electron 43.2.0.

---

## Improvements included from v1.0.2

### System tray localization

- Fixed hardcoded first-minimize notification text.
- Added localized tray balloon content across English, Turkish, Simplified Chinese, and Brazilian Portuguese.

### Note editor maximize mode

- Added a dedicated expand/restore control for comfortable editing of long notes.
- Improved flexible vertical sizing for the note editor.

### Batch selection and deletion

- Added multi-select mode with checkboxes.
- Added range selection with `Shift + Click` and select-all with `Ctrl + A`.
- Added atomic batch deletion from the SQLite database and associated disk storage.

### Date grouping and infinite scrolling

- Corrected SQLite local datetime parsing.
- Prevented duplicate date group headings during paginated history loading.

---

## Core features

### Intelligent clipboard archiving

- Automatically recognizes plain text, links, email addresses, code snippets, rich HTML, and images.
- Stores copied images as local PNG files.
- Detects duplicates and promotes reused entries instead of creating unnecessary copies.
- Offers fast full-text search, filters, date grouping, match highlighting, favorites, and pinned items.
- Provides compact cards with instant `Space` quick preview and complete selectable detail views.

### Privacy and local security

- Stores application data locally without requiring an account, cloud service, telemetry endpoint, or remote database.
- Encrypts detected sensitive clipboard content locally with AES-256-GCM.
- Automatically masks supported credentials, tokens, payment-card numbers, and national identity patterns.
- Excludes sensitive content from the full-text search index.
- Supports password-protected encrypted `.cpbackup` exports.

### Native paste-to-active-window

- Paste into the previously active Windows application using the native Win32 `SendInput` API.
- Paste with the primary action, `Enter`, or double-click according to your interaction preferences.
- Releases stuck modifier keys before sending `Ctrl + V` to reduce shortcut conflicts.

### Notes and organization

- Convert clipboard entries into notes with one action.
- Create, edit, delete, pin, favorite, search, and reorder notes.
- Organize notes using color-coded categories and icons.
- Switch instantly between Clipboard and Notes in a shared, resizable workspace.

### Personalization and system integration

- Dark, light, and system themes.
- Turkish, English, Simplified Chinese, and Brazilian Portuguese interfaces.
- Customizable global shortcuts and optional Windows startup launch.
- Configurable polling, history retention, content-type retention, action visibility, data location, and startup views.

---

## Distribution packages

Two Windows x64 packages are provided:

1. **`ClipBoardPrime.Setup.Recommended.1.0.3.exe`** — the recommended Windows installer with standard installation-directory support.
2. **`ClipBoardPrime.Portable.1.0.3.exe`** — a self-contained portable build that keeps its database and configuration in a local `data` directory beside the executable.

Windows 10 or Windows 11 (64-bit) is required. Administrator privileges are optional and are not required for normal use.

---

## Contribution and feedback

Bug reports, feature proposals, documentation improvements, and pull requests are welcome in the [ClipBoardPrime repository](https://github.com/MaximusPrime/ClipBoardPrime).

If ClipBoardPrime is useful to you, consider starring the repository and sharing your feedback.
