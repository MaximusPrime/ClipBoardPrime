# ClipBoardPrime GitHub Landing Page & Web Site Design Document

**Date:** 2026-07-22  
**Status:** Approved  
**Target Repository:** `MaximusPrime/ClipBoardPrime`  
**Location:** `ClipBoardPrime/website/`  
**Deployment Target:** GitHub Pages (`.github/workflows/deploy-pages.yml`)

---

## 1. Executive Summary

ClipBoardPrime is a fast, private, local-first, and keyboard-friendly clipboard manager for Windows. To provide a standalone, high-impact marketing and documentation portal for GitHub visitors and Windows users, we are building a dedicated Astro JS static website inside the `ClipBoardPrime` repository.

The design strictly matches the aesthetic standards of **Maximus Prime Software** (`Maximus-Prime-Software-WebSite`), featuring a deep dark obsidian/navy background, rich gold and steel blue gradients, glassmorphic UI elements, responsive mobile/desktop layouts, and full bilingual support (**Turkish** & **English**).

---

## 2. Technical Stack & Infrastructure

- **Framework:** Astro 5.x
- **Styling:** Tailwind CSS v4 + Custom Glassmorphism Utilities
- **Icons & Assets:** Optimized SVG icons, native PNG screenshots from `ClipBoardPrime/screenshort/`, SVG app branding from `ClipBoardPrime/assets/`
- **i18n:** Static multi-language routing (`/tr` for Turkish, `/en` for English, with automatic root redirect `/` matching browser locale or defaulting to Turkish)
- **CI/CD Deployment:** GitHub Actions (`.github/workflows/deploy-pages.yml`) building the site on push to `main` and deploying the `dist/` bundle to GitHub Pages.

---

## 3. Directory & File Architecture

```text
ClipBoardPrime/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml          # GitHub Actions deployment workflow
├── website/                          # Astro JS website sub-project
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── logo.png
│   │   └── screenshots/              # Web-optimized application screenshots
│   │       ├── history-compact.png
│   │       ├── notes-workspace.png
│   │       ├── welcome-guided.png
│   │       ├── live-preferences.png
│   │       └── settings-general.png
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.astro          # Glassy header with nav links, version badge & lang toggle
│   │   │   ├── Hero.astro            # Logo glow, headline, release download CTA buttons & hero mockup
│   │   │   ├── Features.astro        # 4 core capability pillars grid
│   │   │   ├── Shortcuts.astro       # Interactive visual keyboard shortcuts guide
│   │   │   ├── Security.astro        # Local-first security, DPAPI & AES-256 architecture table
│   │   │   ├── Gallery.astro         # High-res screenshot lightbox & preview grid
│   │   │   ├── Installation.astro    # Installer vs Portable distribution matrix & requirements
│   │   │   ├── LanguageSwitch.astro  # TR / EN language toggle button
│   │   │   └── Footer.astro          # Studio branding, GPL-3.0 license & social links
│   │   ├── i18n/
│   │   │   ├── tr.ts                 # Complete Turkish copy
│   │   │   └── en.ts                 # Complete English copy
│   │   ├── layouts/
│   │   │   └── Layout.astro          # Common HTML shell, SEO meta tags, OpenGraph, font imports
│   │   ├── pages/
│   │   │   ├── index.astro           # Root locale redirect / landing
│   │   │   ├── tr/
│   │   │   │   └── index.astro       # Turkish full landing page
│   │   │   └── en/
│   │   │       └── index.astro       # English full landing page
│   │   └── styles/
│   │       └── global.css            # Tailwind directives, gold text glow & glassmorphism
│   ├── astro.config.mjs
│   ├── tailwind.config.mjs
│   └── package.json
```

---

## 4. UI/UX Design System & Color Palette

- **Background:** Deep Obsidian & Navy (`bg-[#030712]`, gradient to `bg-[#0b132b]`)
- **Primary Text:** Crisp White (`#ffffff`) and Slate Steel (`#94a3b8`, `#cbd5e1`)
- **Accent Color:** Warm Gold Gradient (`from-amber-400 via-amber-500 to-amber-600`), text glow filters (`drop-shadow-[0_0_25px_rgba(245,158,11,0.3)]`)
- **Security Accent:** Emerald Green (`#22c55e`, `#10b981`) for zero-vulnerability and encryption metrics
- **Card Aesthetics:** Glassmorphism (`backdrop-blur-xl`, `border border-white/10`, `bg-white/[0.03]`, hover ring highlighting)
- **Typography:** `Inter` for general copy, `JetBrains Mono` / `ui-monospace` for keybindings (`<kbd>`) and code badges.

---

## 5. Detailed Page Content Sections

### 5.1 Sticky Glass Navbar
- App Logo + **ClipBoardPrime** title + `v1.0.1` version pill
- Navigation item anchors: `#features`, `#security`, `#shortcuts`, `#gallery`, `#installation`
- TR / EN locale switcher
- Direct GitHub Star & Repository link button

### 5.2 Hero Header
- Central glowing ClipBoardPrime emblem
- H1 Headline: *"Windows İçin Hızlı, Güvenli ve Klavye Odaklı Pano Yöneticisi"* / *"Fast, Private, Keyboard-Driven Clipboard Manager for Windows"*
- Subtitle highlighting SQLite local storage, Win32 `SendInput` zero-context-switch paste, and notes space.
- Primary CTA buttons:
  - 📥 **Windows Setup (.exe)**
  - 📦 **Portable Edition (.exe)**
  - 🐙 **GitHub Releases**
- Key Badges: `Windows 10/11 64-bit`, `100% Local First`, `AES-256-GCM Encrypted`, `Zero Cloud / Telemetry`
- Window Frame Container showing high-resolution compact clipboard preview.

### 5.3 Core Capabilities Grid (4 Pillars)
1. **Clipboard History & Rich Media:** Records text, HTML, URLs, emails, code blocks, images. Space-bar instant preview & live fuzzy search.
2. **Win32 Direct Paste Automation:** Target application window tracking, native `SendInput` hotkey execution, sticky modifier key release.
3. **Notes & Color Categories:** Turn clipboard entries into categorized notes. Pin, favorite, reorder, color-code.
4. **Hardware-Backed Security:** Windows `safeStorage` (DPAPI) + AES-256-GCM encryption for local data and sensitive item masking (credit cards, tokens, T.C. identity numbers).

### 5.4 Visual Keyboard Shortcuts Matrix
Styled `<kbd>` badges demonstrating:
- `Ctrl + Shift + V`: Toggle Clipboard Window
- `Ctrl + 1` / `Ctrl + 2`: Switch Clipboard / Notes
- `Ctrl + Shift + M`: Toggle Workspace
- `Space`: Instant Full Content Preview
- `Enter` / Double Click: Paste into Active Window
- `C` / `P` / `F` / `Del`: Copy / Pin / Favorite / Delete
- `N` / `E`: Save as Note / Edit Note

### 5.5 Security & Isolation Architecture
Table and diagram highlighting Electron sandbox isolation, IPC whitelist, local file protocol constraints, and scrypt-derived password-protected `.cpbackup` files.

### 5.6 Screenshot Lightbox Gallery
Interactive gallery showcasing:
1. Compact Clipboard History with Search & Filter
2. Organized Notes Workspace
3. Guided First-Run Setup
4. Live Personalization & Theme Controls
5. Application Settings Panel

### 5.7 Installation & System Requirements
Comparison table for Installer (`ClipBoardPrime Setup <version>.exe`) vs Portable (`ClipBoardPrime Portable <version>.exe`).

### 5.8 Footer
Copyright, GPL-3.0 License details, and link back to Maximus Prime Software studio ecosystem (`Maximus-Prime-Software-WebSite`).

---

## 6. GitHub Actions Workflow (.github/workflows/deploy-pages.yml)

```yaml
name: Deploy ClipBoardPrime Website to GitHub Pages

on:
  push:
    branches: ["main"]
    paths:
      - "website/**"
      - ".github/workflows/deploy-pages.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22.x
          cache: npm
          cache-dependency-path: website/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: website

      - name: Build site
        run: npm run build
        working-directory: website

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: website/dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## 7. Spec Self-Review Checklist

- [x] **Placeholder Scan:** No TBDs, TODOs, or missing specs.
- [x] **Internal Consistency:** Technical stack matches Astro 5 + Tailwind v4 + GitHub Pages.
- [x] **Scope Check:** Appropriately scoped single web application sub-project inside `ClipBoardPrime`.
- [x] **Ambiguity Check:** Explicit asset paths, layout sections, localization files, and CI/CD yaml provided.
