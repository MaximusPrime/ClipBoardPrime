# ClipBoardPrime v1.0.4

**ClipBoardPrime v1.0.4** is a reliability-focused update that makes everyday clipboard work safer, more predictable, and more comfortable.

ClipBoardPrime remains a fast, private, local-first clipboard manager for Windows: it keeps supported clipboard history in a local SQLite database, brings it back with a customizable global shortcut, pastes into the application you were using, and turns important clips into organized notes. This release strengthens the moments that matter most—pasting into the right place, reopening exactly where you left off, and finding settings without friction.

---

## What is new in v1.0.4

### Safer paste into the active window

- **Verified target and focus:** Before sending `Ctrl + V`, ClipBoardPrime checks that the remembered target window still exists and confirms that Windows has actually focused it.
- **Fail-safe cancellation:** If the target closes, becomes invalid, or cannot receive focus, no simulated keyboard input is sent.
- **Serialized operations:** Rapid paste requests are queued so one request cannot replace another request's clipboard content mid-operation.
- **Visible recovery:** When a paste fails after ClipBoardPrime has hidden itself, the application returns so the error remains visible and actionable.
- **Successful-use tracking:** Clipboard item activity is updated only after native input has been accepted successfully.
- **Safer native path:** The fragile shell-based `mshta/SendKeys` fallback has been removed. Native input failures now stop safely instead of risking input in the wrong window.

### Window behavior that remembers you

- **Always on Top:** A new persistent toggle in General settings keeps ClipBoardPrime above other windows whenever you want a clipboard companion close at hand.
- **Complete state memory:** The application now remembers normal window size, position, and maximized state.
- **Reliable shutdown save:** The latest window bounds are written immediately when the application exits, closing the final debounce timing gap.
- **Cursor mode isolation:** Opening beside the mouse cursor is treated as a temporary placement and no longer overwrites the user's remembered normal position.
- **Monitor-aware first launch and recovery:** Initial placement and off-screen recovery respect the real Windows work area, including multi-monitor offsets and taskbar space.

### Settings that are easier to understand

- Everyday preferences such as startup views, search reset behavior, card quick actions, Space behavior, and click/double-click interactions now live under **General > Interaction**.
- Technical and higher-impact controls are clearly separated into **Security and Privileges**, **History and Retention**, and **Clipboard Engine** groups.
- New labels are fully localized in Turkish, English, Simplified Chinese, and Brazilian Portuguese.

### Quality and confidence

- Automated coverage increased from 60 to **64 passing tests**.
- The real Electron E2E suite now validates actual window-bound persistence, temporary cursor positioning, maximized-state persistence, off-screen recovery, workspace transitions, onboarding, and renderer reload.
- Win32/Koffi native window-handle addressing was verified on Windows.
- JavaScript syntax checks, localization completeness, IPC contracts, database behavior, encryption tests, and patch-integrity checks all pass.

---

## Why this update matters

Clipboard tools handle content that is often important and sometimes sensitive. v1.0.4 focuses on confidence: when you choose Paste, the application verifies the destination; when you reopen it, the window returns in the state you expect; and when you customize behavior, the relevant options are easier to find.

The result is a small but meaningful release that makes ClipBoardPrime feel calmer, safer, and more polished throughout the day.

## Core experience

- Local SQLite clipboard history for text, rich HTML, URLs, email addresses, code, and images.
- Fast search, filters, date grouping, pinned items, favorites, and compact previews.
- Native Windows paste automation with strict target verification.
- Integrated Notes workspace with categories, ordering, pinning, favorites, and clipboard-to-note conversion.
- AES-256-GCM protection for detected sensitive content and password-protected `.cpbackup` exports.
- Dark, light, and system themes with Turkish, English, Simplified Chinese, and Brazilian Portuguese interfaces.
- Setup and portable editions for Windows 10 and Windows 11 (64-bit).

## Downloads

Choose the package that fits your workflow:

1. **`ClipBoardPrime.Setup.Recommended.1.0.4.exe`** — recommended installation with standard Windows integration and installation-directory support.
2. **`ClipBoardPrime.Portable.1.0.4.exe`** — self-contained portable edition that stores application data in the adjacent `data` directory.

Administrator privileges are not required for normal use. Optional administrator mode remains available only when pasting into applications that themselves run elevated.

Thank you for trying ClipBoardPrime. Feedback, issue reports, stars, documentation improvements, and pull requests are always welcome in the [GitHub repository](https://github.com/MaximusPrime/ClipBoardPrime).
