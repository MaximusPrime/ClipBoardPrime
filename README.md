<div align="center">

  <img src="assets/logo.png" alt="ClipBoardPrime Logo" width="112" height="112">

  # ClipBoardPrime

  **An ultra-fast, intelligent, and highly secure clipboard manager for your desktop.**

  [![Electron](https://img.shields.io/badge/Electron-v33-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
  [![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
  [![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
  [![Developer](https://img.shields.io/badge/Developer-MaximusPrime77-f97316?style=for-the-badge&logo=github)](https://github.com/MaximusPrime77)

</div>

---

## 🌟 Overview

**ClipBoardPrime** is a premium, lightweight desktop clipboard companion. Operating silently in the system tray, it monitors and securely archives your copied texts, URLs, code snippets, emails, and images into a highly optimized, encrypted local SQLite database. 

With a customizable global hotkey (`Ctrl + Shift + V`), the panel slides into focus instantly, allowing you to search, filter, preview, organize, and directly paste any historical clipboard item back into your active window.

---

## 📸 Screenshots Showcase

Here is a look at the ClipBoardPrime interface in action:

<div align="center">
  <table>
    <tr>
      <td width="50%" align="center">
        <b>Main Clipboard History Panel</b><br/>
        <img src="screenshort/2026-07-01-11-29-03-4bd8.png" alt="ClipBoardPrime History Panel" width="100%">
      </td>
      <td width="50%" align="center">
        <b>Notes & Categories Manager</b><br/>
        <img src="screenshort/2026-07-01-11-29-32-65a0.png" alt="ClipBoardPrime Notes Management" width="100%">
      </td>
    </tr>
    <tr>
      <td width="50%" align="center">
        <b>Settings & Shortcut Customization</b><br/>
        <img src="screenshort/2026-07-01-11-29-41-0b8b.png" alt="ClipBoardPrime Settings Configuration" width="100%">
      </td>
      <td width="50%" align="center">
        <b>Compact View & Tray Integration</b><br/>
        <img src="screenshort/2026-07-01-11-28-33-b1af.png" alt="ClipBoardPrime Compact Mode" width="100%">
      </td>
    </tr>
  </table>
</div>

---

## ✨ Key Features

### 🗂️ Advanced Clipboard Archiving
*   **Infinite Clipboard History:** Keep track of everything you copy. Maximum log limits can be customized under `Settings → General` (set to `0` for unlimited history).
*   **Smart Content Detection:** Incoming clipboard events are automatically parsed, categorized, and tagged:
    *   📄 **Text:** Plain text entries.
    *   🔗 **URL:** Links starting with `http://`, `https://`, or `www.`
    *   📧 **Email:** Valid email address structures.
    *   💻 **Code:** Dynamic regex matching identifies functions, tags, imports, and variables across 15+ programming and markup languages (JS/TS, Python, C++, HTML, SQL, etc.).
    *   🖼️ **Image:** Images or screenshots copied to your clipboard are compressed and saved directly as PNGs on disk.

### 🔒 Enterprise-Grade Local Security (AES-256-GCM)
*   **Encrypted Storage:** Sensitive contents (such as bank cards or tokens) are encrypted on-the-fly using the **AES-256-GCM** algorithm prior to database serialization.
*   **Auto-Masking Engine:** The app monitors your clipboard and automatically masks + encrypts sensitive matches in real-time, including:
    *   **Credit/Debit Cards:** Visa, Mastercard, American Express, Troy (13-19 digits).
    *   **API Credentials:** Google (`AIzaSy`), GitHub tokens (`ghp_`, `github_pat_`), Slack secrets (`xox*`), SendGrid keys (`SG.`).
    *   **JSON Web Tokens (JWT):** Strings starting with `eyJ...`
    *   **System Credentials:** Key-value pairs containing keywords like `password:`, `şifre=`, etc.
    *   **PEM Private Keys:** Cryptographic blocks starting with `-----BEGIN PRIVATE KEY-----`.
    *   **National ID Numbers:** Turkish T.C. Identification Numbers (validated with checksum verification to prevent false positives).
*   **Temporary Reveal:** Click the eye/eye-off icon to toggle visibility of masked text.

### ⚡ Native Paste-to-Active-Window
*   **Instant Simulation:** Select any card and click the dedicated **Paste** button, double-click the item, or press **Enter**. The application will instantly yield focus, bring the previous application to the foreground, and type the content natively using the Windows `SendInput` API.
*   **State Cleansing:** Releases any stuck modifier keys (Ctrl, Shift, Alt, Win) from the OS input stream before typing, preventing key conflicts.
*   **Dynamic Focus Tracking:** If you switch to another target application while ClipBoardPrime is open, the app automatically tracks your active window focus, ensuring pasting goes to the right place.

### 📌 Organization & Categorization
*   **Pinning & Favorites:** Pin important clips to keep them at the top of your feed, or star them for quick filtering. Pinned clips are protected from bulk history clearing.
*   **Smart Date Grouping:** Natural timeline categories such as **Today**, **Yesterday**, **This Week**, **Last Week**, and **[Month Name]**.
*   **Live Search with Highlighting:** Instant full-text search. Matched characters are highlighted in yellow using HTML `<mark>` tags.

### ✏️ Built-in Notes Board
*   **Quick Note Creation:** Copy a clipboard card directly into a new note with a single click.
*   **Category Tags & Styling:** Group notes into categories with custom SVG icons (folder, briefcase, user, code, etc.) and color-coded labels.
*   **Drag-and-Drop Reordering:** Change the sequence of your notes using drag-and-drop.
*   **Detailed Viewer Modal:** View and edit full notes in a dedicated layout.

---

## ⌨️ Global Shortcuts

| Shortcut | Context | Description |
|:---|:---|:---|
| `Ctrl + Shift + V` *(customizable)* | System-Wide | Show / Hide the Clipboard Panel |
| `Double Click` | Clipboard List | Paste item to active window (excluding images) |
| `Single Click` | Long Text Cards | Expand / Collapse card with smooth scroll and highlight |
| `Enter` | Clipboard List | Paste item to active window / Open full view |
| `Space` | Clipboard List | Copy item back to system clipboard |
| `↑ / ↓` Arrow Keys | General | Navigate between list items |
| `Escape` | Modals | Close the active modal |

---

## 🚀 Installation & Developer Setup

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   npm

### 1. Clone the Repository
```bash
git clone https://github.com/MaximusPrime77/ClipBoardPrime.git
cd ClipBoardPrime
```

### 2. Install Dependencies
```bash
npm install
```

> [!IMPORTANT]
> This project uses the `better-sqlite3` module, which contains native C++ bindings. If you switch Electron versions or encounter binary issues, rebuild the native modules using:
> ```bash
> npm run rebuild
> ```

### 3. Run in Development Mode
```bash
npm run dev
```
In development mode, Electron DevTools will open automatically, and persistent app data will be stored under the `%AppData%/clipboard-prime-app-dev` directory.

---

## 📦 Building & Packaging

To compile and package the app for distribution:

```bash
npm run build
```

This generates two output files inside the `dist/` directory:

| Build Output | Description |
|:---|:---|
| `ClipBoardPrime Setup.exe` | Standard Windows NSIS installer |
| `ClipBoardPrime Portable.exe` | Lightweight, portable version. All database files and configurations are kept in the `/data` folder adjacent to the executable |

---

## 🛡️ Database & Performance
*   **SQLite WAL Mode:** Utilizes Write-Ahead Logging for high-concurrency read/write operations.
*   **SQL Indexes:** Custom indexes defined on timestamp, type, pin, and favorite fields for lightning-fast querying.
*   **Prepared Statements:** All SQLite queries are prepared, eliminating the risk of SQL injection.
*   **Window State Memory:** Remembers window dimensions, position, and active monitor configurations.

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0**. For more details, see the [LICENSE](LICENSE) file.

---

## 📧 Contact & Support

**Maximus Decimus Meridius**

*   **GitHub:** [MaximusPrime77](https://github.com/MaximusPrime77)
*   **Email:** [b.maximus.prime@gmail.com](mailto:b.maximus.prime@gmail.com)
*   **Project Repository:** [ClipBoardPrime](https://github.com/MaximusPrime77/ClipBoardPrime)
