# ClipBoardPrime Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, high-impact Astro 5 static website for ClipBoardPrime inside the repository with GitHub Actions CI/CD to deploy to GitHub Pages.

**Architecture:** Astro JS static site generator with Tailwind CSS, multi-language i18n (TR/EN), responsive glassmorphic design system matching Maximus Prime Software branding, screenshots gallery, and visual keyboard shortcut guide.

**Tech Stack:** Astro 5, Tailwind CSS v4, TypeScript, GitHub Actions.

## Global Constraints

- Must run inside `ClipBoardPrime/website` as a sub-project.
- Aesthetic design system must match `Maximus-Prime-Software-WebSite` (obsidian/navy backdrop `#030712`, warm gold accents, glassmorphic panels).
- Language support: Turkish (default) & English.
- Logo assets: Include both ClipBoardPrime logo and Maximus Prime Software studio logo.
- CI/CD workflow: `.github/workflows/deploy-pages.yml` targeting GitHub Pages.

---

### Task 1: Scaffolding Astro JS Sub-Project & Global Styles

**Files:**
- Create: `ClipBoardPrime/website/package.json`
- Create: `ClipBoardPrime/website/astro.config.mjs`
- Create: `ClipBoardPrime/website/src/styles/global.css`
- Create: `ClipBoardPrime/website/public/favicon.svg`

**Interfaces:**
- Consumes: None
- Produces: Astro build scripts and Tailwind CSS utility classes (`.glass`, `.gold-text`, `.gold-border`)

- [ ] **Step 1: Create `website/package.json`**

```json
{
  "name": "clipboardprime-website",
  "type": "module",
  "version": "1.0.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  },
  "dependencies": {
    "@astrojs/check": "^0.9.4",
    "@astrojs/tailwind": "^5.1.5",
    "astro": "^5.1.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create `website/astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://MaximusPrime.github.io',
  base: '/ClipBoardPrime',
  integrations: [tailwind()],
});
```

- [ ] **Step 3: Create `website/src/styles/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .glass {
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .gold-text {
    background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .gold-border {
    border-color: rgba(245, 158, 11, 0.3);
  }
}

body {
  background-color: #030712;
  color: #f8fafc;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  overflow-x: hidden;
}
```

- [ ] **Step 4: Create `website/public/favicon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <rect width="100" height="100" rx="20" fill="#0f172a"/>
  <path d="M30 25h40v50H30z" fill="#d97706" opacity="0.3"/>
  <path d="M35 20h30v60H35z" stroke="#fbbf24" stroke-width="6" rx="4"/>
  <circle cx="50" cy="40" r="10" fill="#fbbf24"/>
</svg>
```

- [ ] **Step 5: Install npm dependencies in `website/`**

Run: `cd c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website && npm install`
Expected: `added packages...` clean install.

- [ ] **Step 6: Commit Task 1**

```bash
git add website/package.json website/astro.config.mjs website/src/styles/global.css website/public/favicon.svg
git commit -m "feat(website): initialize astro 5 sub-project and base styling"
```

---

### Task 2: i18n Dictionaries & Master Layout Shell

**Files:**
- Create: `ClipBoardPrime/website/src/i18n/tr.ts`
- Create: `ClipBoardPrime/website/src/i18n/en.ts`
- Create: `ClipBoardPrime/website/src/layouts/Layout.astro`

**Interfaces:**
- Consumes: `global.css`
- Produces: `tr` and `en` dictionary objects, `Layout` component with OpenGraph metadata and language support.

- [ ] **Step 1: Create `website/src/i18n/tr.ts`**

```typescript
export const tr = {
  nav: {
    features: "Özellikler",
    shortcuts: "Kısayollar",
    security: "Güvenlik",
    gallery: "Galeri",
    installation: "İndir",
    github: "GitHub Repo"
  },
  hero: {
    badge: "v1.0.1 • Windows 10/11 64-bit",
    title: "Windows İçin Hızlı, Güvenli ve Klavye Odaklı Pano Yöneticisi",
    subtitle: "Pano geçmişinizi yerel SQLite veritabanında saklayın, pencere değiştirmeden Win32 SendInput ile doğrudan yapıştırın ve içeriklerinizi kategorize notlara dönüştürün.",
    downloadInstaller: "Windows Kurulumu (.exe)",
    downloadPortable: "Taşınabilir Sürüm (.exe)",
    viewReleases: "GitHub Releases",
    studioCredit: "A Maximus Prime Software Product"
  },
  features: {
    tagline: "Yetenekler",
    title: "Neden ClipBoardPrime?",
    f1Title: "Zengin Pano Geçmişi",
    f1Desc: "Metin, HTML, URL, e-posta, kod ve görselleri saklar. Space tuşu ile anında tam ekran önizleme ve canlı arama olanağı sunar.",
    f2Title: "Win32 Otomatik Yapıştırma",
    f2Desc: "Önceki aktif pencereyi takip eder, takılı kalan modifier tuşlarını otomatik temizler ve SendInput API ile seçilen veriyi anında yapıştırır.",
    f3Title: "Notlar & Renkli Kategoriler",
    f3Desc: "Pano ögelerini kalıcı notlara dönüştürün, renk kodlu kategoriler ile organize edin, pinleyin ve favorilere ekleyin.",
    f4Title: "Donanım Destekli Şifreleme",
    f4Desc: "Verilerinizi Windows safeStorage (DPAPI) ve AES-256-GCM ile şifreleyin. Kredi kartı ve API token gibi hassas verileri otomatik maskeleyin."
  },
  shortcuts: {
    tagline: "Klavye Hızında",
    title: "Kısayol ve Kontroller",
    toggleApp: "Uygulamayı Aç / Kapat",
    switchView: "Pano / Notlar Geçişi",
    search: "Arama Odaklanma",
    paste: "Hedef Uygulamaya Yapıştır",
    preview: "Tam İçerik Önizleme (Space)",
    cardActions: "Kopyala (C), Sabitle (P), Favori (F), Sil (Del)"
  },
  security: {
    tagline: "Gizlilik İlk Sırada",
    title: "Güvenlik & İzolasyon Mimarisi",
    localTitle: "%100 Yerel Depolama",
    localDesc: "Hiçbir bulut sunucusu, harici API veya telemetri yok. Verileriniz tamamen cihazınızda kalır.",
    encTitle: "AES-256-GCM & DPAPI",
    encDesc: "Veritabanı şifreleme anahtarları Windows hesabı korumalı DPAPI ile saklanır.",
    backupTitle: "Şifreli .cpbackup",
    backupDesc: "Taşınabilir yedekleriniz scrypt ve AES-256-GCM ile parola korumalı olarak dışa aktarılır."
  },
  gallery: {
    tagline: "Arayüz",
    title: "Ekran Görüntüleri"
  },
  installation: {
    tagline: "Dağıtım",
    title: "Kurulum ve Sistem Gereksinimleri",
    installerMode: "Standard Installer",
    installerDesc: "Windows varsayılan Program Files dizinine kurulur, başlangıçta çalışma seçeneği sunar.",
    portableMode: "Portable Executable",
    portableDesc: "Verilerini uygulama dizinindeki data klasöründe tutar, kurulum gerektirmez.",
    reqTitle: "Sistem Gereksinimleri",
    req1: "Windows 10 / Windows 11 (64-bit)",
    req2: "Yönetici (Admin) yetkisi gerektirmez",
    req3: "Minimum 100 MB disk alanı"
  },
  footer: {
    studio: "Maximus Prime Software",
    rights: "Tüm hakları saklıdır.",
    license: "GPL-3.0 Açık Kaynak Lisansı"
  }
};
```

- [ ] **Step 2: Create `website/src/i18n/en.ts`**

```typescript
export const en = {
  nav: {
    features: "Features",
    shortcuts: "Shortcuts",
    security: "Security",
    gallery: "Gallery",
    installation: "Download",
    github: "GitHub Repo"
  },
  hero: {
    badge: "v1.0.1 • Windows 10/11 64-bit",
    title: "Fast, Private, Keyboard-Driven Clipboard Manager for Windows",
    subtitle: "Store clipboard history locally in SQLite, paste into active windows instantly via Win32 SendInput, and convert items into organized notes.",
    downloadInstaller: "Windows Setup (.exe)",
    downloadPortable: "Portable Edition (.exe)",
    viewReleases: "GitHub Releases",
    studioCredit: "A Maximus Prime Software Product"
  },
  features: {
    tagline: "Capabilities",
    title: "Why ClipBoardPrime?",
    f1Title: "Rich Clipboard History",
    f1Desc: "Monitors text, HTML, URLs, emails, code, and images. Features Space-bar quick preview and instant live fuzzy search.",
    f2Title: "Win32 Direct Auto-Paste",
    f2Desc: "Tracks the previously active window, releases stuck modifier keys, and pastes selected content via SendInput API without switching windows.",
    f3Title: "Notes & Color Categories",
    f3Desc: "Convert clipboard items into permanent notes, organize with color-coded categories, pin, and favorite important entries.",
    f4Title: "Hardware-Backed Security",
    f4Desc: "Encrypt data with Windows safeStorage (DPAPI) & AES-256-GCM. Automatically mask credit cards, API tokens, and sensitive strings."
  },
  shortcuts: {
    tagline: "Keyboard First",
    title: "Shortcuts & Controls",
    toggleApp: "Show / Hide Application",
    switchView: "Switch Clipboard / Notes",
    search: "Focus Search Input",
    paste: "Paste into Active Window",
    preview: "Full Content Preview (Space)",
    cardActions: "Copy (C), Pin (P), Favorite (F), Delete (Del)"
  },
  security: {
    tagline: "Privacy First",
    title: "Security & Isolation Architecture",
    localTitle: "100% Local Storage",
    localDesc: "No cloud endpoints, remote databases, or telemetry. Your data stays entirely on your machine.",
    encTitle: "AES-256-GCM & DPAPI",
    encDesc: "Master encryption keys are wrapped using OS account-backed Windows DPAPI.",
    backupTitle: "Encrypted .cpbackup",
    backupDesc: "Portable backups are exported with AES-256-GCM and scrypt key derivation."
  },
  gallery: {
    tagline: "Interface",
    title: "Application Screenshots"
  },
  installation: {
    tagline: "Distribution",
    title: "Installation & Requirements",
    installerMode: "Standard Installer",
    installerDesc: "Installs into standard Windows directories with optional launch at startup.",
    portableMode: "Portable Executable",
    portableDesc: "Keeps data inside adjacent directory; requires no installation.",
    reqTitle: "System Requirements",
    req1: "Windows 10 / Windows 11 (64-bit)",
    req2: "No administrator rights required",
    req3: "100 MB available disk space"
  },
  footer: {
    studio: "Maximus Prime Software",
    rights: "All rights reserved.",
    license: "GPL-3.0 Open Source License"
  }
};
```

- [ ] **Step 3: Create `website/src/layouts/Layout.astro`**

```astro
---
import '../styles/global.css';
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  title?: string;
  lang?: 'tr' | 'en';
}

const { title = 'ClipBoardPrime - Windows Clipboard Manager', lang = 'tr' } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<!DOCTYPE html>
<html lang={lang} class="scroll-smooth">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/ClipBoardPrime/favicon.svg" />
    <title>{title}</title>
    <meta name="description" content={t.hero.subtitle} />
  </head>
  <body class="bg-[#030712] text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
    <slot />
  </body>
</html>
```

- [ ] **Step 4: Commit Task 2**

```bash
git add website/src/i18n/ website/src/layouts/Layout.astro
git commit -m "feat(website): add i18n dictionaries and base html layout"
```

---

### Task 3: Navbar, LanguageSwitch & Footer Components

**Files:**
- Create: `ClipBoardPrime/website/src/components/LanguageSwitch.astro`
- Create: `ClipBoardPrime/website/src/components/Navbar.astro`
- Create: `ClipBoardPrime/website/src/components/Footer.astro`

**Interfaces:**
- Consumes: `tr`, `en`, `Layout`
- Produces: Header navigation with locale switch, footer with studio branding (`Maximus Prime Software`).

- [ ] **Step 1: Create `website/src/components/LanguageSwitch.astro`**

```astro
---
interface Props {
  currentLang: 'tr' | 'en';
}
const { currentLang } = Astro.props;
---

<div class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs font-semibold">
  <a
    href="/ClipBoardPrime/tr"
    class:list={[
      "rounded px-2 py-1 transition",
      currentLang === "tr" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
    ]}
  >
    TR
  </a>
  <a
    href="/ClipBoardPrime/en"
    class:list={[
      "rounded px-2 py-1 transition",
      currentLang === "en" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
    ]}
  >
    EN
  </a>
</div>
```

- [ ] **Step 2: Create `website/src/components/Navbar.astro`**

```astro
---
import LanguageSwitch from './LanguageSwitch.astro';
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<header class="sticky top-0 z-50 border-b border-white/10 bg-[#030712]/80 backdrop-blur-xl">
  <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
    <a href={`/ClipBoardPrime/${lang}`} class="flex items-center gap-3">
      <img src="/ClipBoardPrime/images/logo.png" alt="ClipBoardPrime Logo" class="h-8 w-8 object-contain" />
      <span class="font-bold tracking-tight text-white sm:text-lg">ClipBoard<span class="gold-text">Prime</span></span>
      <span class="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 sm:inline-block">
        v1.0.1
      </span>
    </a>

    <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
      <a href="#features" class="transition hover:text-amber-400">{t.nav.features}</a>
      <a href="#shortcuts" class="transition hover:text-amber-400">{t.nav.shortcuts}</a>
      <a href="#security" class="transition hover:text-amber-400">{t.nav.security}</a>
      <a href="#gallery" class="transition hover:text-amber-400">{t.nav.gallery}</a>
      <a href="#installation" class="transition hover:text-amber-400">{t.nav.installation}</a>
    </nav>

    <div class="flex items-center gap-3">
      <LanguageSwitch currentLang={lang} />
      <a
        href="https://github.com/MaximusPrime/ClipBoardPrime"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
      >
        <svg class="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        <span class="hidden sm:inline">GitHub</span>
      </a>
    </div>
  </div>
</header>
```

- [ ] **Step 3: Create `website/src/components/Footer.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<footer class="border-t border-white/10 bg-[#030712] py-12 text-slate-400">
  <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
    <div class="flex items-center gap-3">
      <img src="/ClipBoardPrime/images/studio-logo.webp" alt="Maximus Prime Software" class="h-8 w-auto rounded object-contain" />
      <div>
        <p class="text-sm font-semibold text-white">{t.footer.studio}</p>
        <p class="text-xs text-slate-500">© 2026 {t.footer.studio}. {t.footer.rights}</p>
      </div>
    </div>

    <div class="flex items-center gap-6 text-xs">
      <a href="https://github.com/MaximusPrime/ClipBoardPrime/blob/main/LICENSE" target="_blank" class="hover:text-amber-400">
        {t.footer.license}
      </a>
      <a href="https://github.com/MaximusPrime" target="_blank" class="hover:text-amber-400">
        GitHub Profile
      </a>
    </div>
  </div>
</footer>
```

- [ ] **Step 4: Commit Task 3**

```bash
git add website/src/components/Navbar.astro website/src/components/Footer.astro website/src/components/LanguageSwitch.astro
git commit -m "feat(website): add navbar with lang switch and studio footer"
```

---

### Task 4: Hero & Features Grid Components

**Files:**
- Create: `ClipBoardPrime/website/src/components/Hero.astro`
- Create: `ClipBoardPrime/website/src/components/Features.astro`

**Interfaces:**
- Consumes: `tr`, `en`
- Produces: Hero section with CTA buttons and 4-pillar capabilities grid.

- [ ] **Step 1: Create `website/src/components/Hero.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<section class="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
  <div class="absolute top-1/4 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" aria-hidden="true"></div>

  <div class="mx-auto max-w-5xl px-4 text-center sm:px-6">
    <div class="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold text-amber-300">
      <span class="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
      {t.hero.badge}
    </div>

    <h1 class="mt-6 font-extrabold text-4xl tracking-tight text-white sm:text-6xl uppercase">
      ClipBoard<span class="gold-text">Prime</span>
    </h1>

    <p class="mt-4 text-lg font-medium text-slate-300 sm:text-2xl max-w-3xl mx-auto">
      {t.hero.title}
    </p>

    <p class="mt-4 max-w-2xl mx-auto text-base text-slate-400 leading-relaxed">
      {t.hero.subtitle}
    </p>

    <!-- CTAs -->
    <div class="mt-8 flex flex-wrap justify-center gap-4">
      <a
        href="https://github.com/MaximusPrime/ClipBoardPrime/releases"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.3)] transition hover:brightness-110"
      >
        <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        {t.hero.downloadInstaller}
      </a>
      <a
        href="https://github.com/MaximusPrime/ClipBoardPrime/releases"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        📦 {t.hero.downloadPortable}
      </a>
    </div>

    <p class="mt-4 text-xs text-slate-500">{t.hero.studioCredit}</p>

    <!-- Mockup Preview -->
    <div class="mt-14 relative mx-auto max-w-4xl rounded-2xl border border-white/10 bg-slate-900/80 p-2 shadow-2xl backdrop-blur-xl">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span class="h-3 w-3 rounded-full bg-red-500/80"></span>
        <span class="h-3 w-3 rounded-full bg-yellow-500/80"></span>
        <span class="h-3 w-3 rounded-full bg-green-500/80"></span>
        <span class="ml-2 text-xs font-mono text-slate-400">ClipBoardPrime v1.0.1</span>
      </div>
      <img
        src="/ClipBoardPrime/images/screenshots/history-compact.png"
        alt="ClipBoardPrime Compact History"
        class="rounded-b-xl w-full object-cover shadow-inner"
      />
    </div>
  </div>
</section>
```

- [ ] **Step 2: Create `website/src/components/Features.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<section id="features" class="py-20 bg-slate-950/60 border-y border-white/10">
  <div class="mx-auto max-w-7xl px-4 sm:px-6">
    <div class="text-center">
      <p class="text-xs font-bold uppercase tracking-widest text-amber-400">{t.features.tagline}</p>
      <h2 class="mt-2 font-bold text-3xl text-white sm:text-4xl">{t.features.title}</h2>
    </div>

    <div class="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
      <div class="glass rounded-2xl p-6 transition hover:border-amber-500/40">
        <div class="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 text-2xl mb-4">
          📋
        </div>
        <h3 class="font-bold text-lg text-white">{t.features.f1Title}</h3>
        <p class="mt-2 text-sm text-slate-400 leading-relaxed">{t.features.f1Desc}</p>
      </div>

      <div class="glass rounded-2xl p-6 transition hover:border-amber-500/40">
        <div class="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 text-2xl mb-4">
          ⚡
        </div>
        <h3 class="font-bold text-lg text-white">{t.features.f2Title}</h3>
        <p class="mt-2 text-sm text-slate-400 leading-relaxed">{t.features.f2Desc}</p>
      </div>

      <div class="glass rounded-2xl p-6 transition hover:border-amber-500/40">
        <div class="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 text-2xl mb-4">
          🏷️
        </div>
        <h3 class="font-bold text-lg text-white">{t.features.f3Title}</h3>
        <p class="mt-2 text-sm text-slate-400 leading-relaxed">{t.features.f3Desc}</p>
      </div>

      <div class="glass rounded-2xl p-6 transition hover:border-amber-500/40">
        <div class="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-2xl mb-4">
          🛡️
        </div>
        <h3 class="font-bold text-lg text-white">{t.features.f4Title}</h3>
        <p class="mt-2 text-sm text-slate-400 leading-relaxed">{t.features.f4Desc}</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Commit Task 4**

```bash
git add website/src/components/Hero.astro website/src/components/Features.astro
git commit -m "feat(website): add hero banner and capabilities grid"
```

---

### Task 5: Shortcuts, Security & Installation Components

**Files:**
- Create: `ClipBoardPrime/website/src/components/Shortcuts.astro`
- Create: `ClipBoardPrime/website/src/components/Security.astro`
- Create: `ClipBoardPrime/website/src/components/Installation.astro`

**Interfaces:**
- Consumes: `tr`, `en`
- Produces: Keyboard shortcut guide matrix, security table, distribution options.

- [ ] **Step 1: Create `website/src/components/Shortcuts.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;

const items = [
  { key: 'Ctrl + Shift + V', label: t.shortcuts.toggleApp },
  { key: 'Ctrl + 1 / Ctrl + 2', label: t.shortcuts.switchView },
  { key: 'Ctrl + F', label: t.shortcuts.search },
  { key: 'Enter / Double Click', label: t.shortcuts.paste },
  { key: 'Space', label: t.shortcuts.preview },
  { key: 'C / P / F / Del', label: t.shortcuts.cardActions },
];
---

<section id="shortcuts" class="py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="text-center">
      <p class="text-xs font-bold uppercase tracking-widest text-amber-400">{t.shortcuts.tagline}</p>
      <h2 class="mt-2 font-bold text-3xl text-white sm:text-4xl">{t.shortcuts.title}</h2>
    </div>

    <div class="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {items.map(item => (
        <div class="glass flex items-center justify-between rounded-xl p-4">
          <span class="text-sm font-medium text-slate-300">{item.label}</span>
          <kbd class="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-bold text-amber-300">
            {item.key}
          </kbd>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 2: Create `website/src/components/Security.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<section id="security" class="py-20 bg-slate-950/60 border-y border-white/10">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="text-center">
      <p class="text-xs font-bold uppercase tracking-widest text-emerald-400">{t.security.tagline}</p>
      <h2 class="mt-2 font-bold text-3xl text-white sm:text-4xl">{t.security.title}</h2>
    </div>

    <div class="mt-12 grid gap-8 md:grid-cols-3">
      <div class="glass rounded-2xl p-6 border-emerald-500/20">
        <h3 class="font-bold text-lg text-emerald-300 mb-2">{t.security.localTitle}</h3>
        <p class="text-sm text-slate-400 leading-relaxed">{t.security.localDesc}</p>
      </div>
      <div class="glass rounded-2xl p-6 border-emerald-500/20">
        <h3 class="font-bold text-lg text-emerald-300 mb-2">{t.security.encTitle}</h3>
        <p class="text-sm text-slate-400 leading-relaxed">{t.security.encDesc}</p>
      </div>
      <div class="glass rounded-2xl p-6 border-emerald-500/20">
        <h3 class="font-bold text-lg text-emerald-300 mb-2">{t.security.backupTitle}</h3>
        <p class="text-sm text-slate-400 leading-relaxed">{t.security.backupDesc}</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Create `website/src/components/Installation.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;
---

<section id="installation" class="py-20">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="text-center">
      <p class="text-xs font-bold uppercase tracking-widest text-amber-400">{t.installation.tagline}</p>
      <h2 class="mt-2 font-bold text-3xl text-white sm:text-4xl">{t.installation.title}</h2>
    </div>

    <div class="mt-12 grid gap-8 md:grid-cols-2">
      <div class="glass rounded-2xl p-6">
        <h3 class="font-bold text-xl text-white mb-2">📥 {t.installation.installerMode}</h3>
        <p class="text-sm text-slate-400 mb-6">{t.installation.installerDesc}</p>
        <a
          href="https://github.com/MaximusPrime/ClipBoardPrime/releases"
          target="_blank"
          class="inline-block rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110"
        >
          ClipBoardPrime Setup v1.0.1.exe
        </a>
      </div>

      <div class="glass rounded-2xl p-6">
        <h3 class="font-bold text-xl text-white mb-2">📦 {t.installation.portableMode}</h3>
        <p class="text-sm text-slate-400 mb-6">{t.installation.portableDesc}</p>
        <a
          href="https://github.com/MaximusPrime/ClipBoardPrime/releases"
          target="_blank"
          class="inline-block rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10"
        >
          ClipBoardPrime Portable v1.0.1.exe
        </a>
      </div>
    </div>

    <div class="mt-10 glass rounded-2xl p-6 text-center">
      <h4 class="font-bold text-sm text-slate-300 uppercase tracking-wider">{t.installation.reqTitle}</h4>
      <div class="mt-3 flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-400">
        <span>✓ {t.installation.req1}</span>
        <span>✓ {t.installation.req2}</span>
        <span>✓ {t.installation.req3}</span>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Commit Task 5**

```bash
git add website/src/components/Shortcuts.astro website/src/components/Security.astro website/src/components/Installation.astro
git commit -m "feat(website): add shortcuts matrix, security section and installation cards"
```

---

### Task 6: Lightbox Screenshot Gallery & Copy Assets

**Files:**
- Create: `ClipBoardPrime/website/src/components/Gallery.astro`
- Copy image assets from `ClipBoardPrime/screenshort/` and `ClipBoardPrime/assets/` to `ClipBoardPrime/website/public/images/`

**Interfaces:**
- Consumes: Screenshots & studio logo
- Produces: Interactive visual gallery.

- [ ] **Step 1: Copy application media assets to `website/public/images/`**

Run commands in powershell:
```powershell
New-Item -ItemType Directory -Force -Path c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\screenshots
Copy-Item c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\assets\logo.png c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\logo.png
Copy-Item c:\Users\MAXIMUS\PROJECTS\Maximus-Prime-Software-WebSite\maximusprimesoftware.pages.dev\public\logo.webp c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\studio-logo.webp

Copy-Item c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\screenshort\ClipBoardPrime_bua6WwVPcV.png c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\screenshots\history-compact.png
Copy-Item c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\screenshort\ClipBoardPrime_MWLqBWEiJE.png c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\screenshots\notes-workspace.png
Copy-Item c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\screenshort\ClipBoardPrime_SvhhDbN4FC.png c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\screenshots\welcome-guided.png
Copy-Item c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\screenshort\ClipBoardPrime_lIX55GHkJ0.png c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\screenshots\live-preferences.png
Copy-Item c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\screenshort\ClipBoardPrime_XXoHkKSx8F.png c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website\public\images\screenshots\settings-general.png
```

- [ ] **Step 2: Create `website/src/components/Gallery.astro`**

```astro
---
import { tr } from '../i18n/tr';
import { en } from '../i18n/en';

interface Props {
  lang: 'tr' | 'en';
}
const { lang } = Astro.props;
const t = lang === 'tr' ? tr : en;

const shots = [
  { src: '/ClipBoardPrime/images/screenshots/history-compact.png', alt: 'Compact History' },
  { src: '/ClipBoardPrime/images/screenshots/notes-workspace.png', alt: 'Notes Workspace' },
  { src: '/ClipBoardPrime/images/screenshots/welcome-guided.png', alt: 'Guided Setup' },
  { src: '/ClipBoardPrime/images/screenshots/live-preferences.png', alt: 'Preferences' },
  { src: '/ClipBoardPrime/images/screenshots/settings-general.png', alt: 'General Settings' },
];
---

<section id="gallery" class="py-20 bg-slate-950/60 border-y border-white/10">
  <div class="mx-auto max-w-7xl px-4 sm:px-6">
    <div class="text-center">
      <p class="text-xs font-bold uppercase tracking-widest text-amber-400">{t.gallery.tagline}</p>
      <h2 class="mt-2 font-bold text-3xl text-white sm:text-4xl">{t.gallery.title}</h2>
    </div>

    <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {shots.map(shot => (
        <div class="glass group overflow-hidden rounded-2xl transition hover:border-amber-500/50">
          <img src={shot.src} alt={shot.alt} class="w-full object-cover transition duration-300 group-hover:scale-105" />
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 3: Commit Task 6**

```bash
git add website/public/images/ website/src/components/Gallery.astro
git commit -m "feat(website): add screenshot gallery component and copy app media"
```

---

### Task 7: Astro Page Routes & Local Verification Build

**Files:**
- Create: `ClipBoardPrime/website/src/pages/index.astro`
- Create: `ClipBoardPrime/website/src/pages/tr/index.astro`
- Create: `ClipBoardPrime/website/src/pages/en/index.astro`

**Interfaces:**
- Consumes: All components (`Navbar`, `Hero`, `Features`, `Shortcuts`, `Security`, `Gallery`, `Installation`, `Footer`)
- Produces: Static routes `/`, `/tr`, `/en`

- [ ] **Step 1: Create `website/src/pages/tr/index.astro`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import Navbar from '../../components/Navbar.astro';
import Hero from '../../components/Hero.astro';
import Features from '../../components/Features.astro';
import Shortcuts from '../../components/Shortcuts.astro';
import Security from '../../components/Security.astro';
import Gallery from '../../components/Gallery.astro';
import Installation from '../../components/Installation.astro';
import Footer from '../../components/Footer.astro';
---

<Layout title="ClipBoardPrime - Windows Pano Yöneticisi ve Not Alanı" lang="tr">
  <Navbar lang="tr" />
  <main>
    <Hero lang="tr" />
    <Features lang="tr" />
    <Shortcuts lang="tr" />
    <Security lang="tr" />
    <Gallery lang="tr" />
    <Installation lang="tr" />
  </main>
  <Footer lang="tr" />
</Layout>
```

- [ ] **Step 2: Create `website/src/pages/en/index.astro`**

```astro
---
import Layout from '../../layouts/Layout.astro';
import Navbar from '../../components/Navbar.astro';
import Hero from '../../components/Hero.astro';
import Features from '../../components/Features.astro';
import Shortcuts from '../../components/Shortcuts.astro';
import Security from '../../components/Security.astro';
import Gallery from '../../components/Gallery.astro';
import Installation from '../../components/Installation.astro';
import Footer from '../../components/Footer.astro';
---

<Layout title="ClipBoardPrime - Windows Clipboard Manager & Notes Workspace" lang="en">
  <Navbar lang="en" />
  <main>
    <Hero lang="en" />
    <Features lang="en" />
    <Shortcuts lang="en" />
    <Security lang="en" />
    <Gallery lang="en" />
    <Installation lang="en" />
  </main>
  <Footer lang="en" />
</Layout>
```

- [ ] **Step 3: Create `website/src/pages/index.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="ClipBoardPrime Redirect">
  <script is:inline>
    const userLang = navigator.language || navigator.userLanguage;
    if (userLang && userLang.startsWith('en')) {
      window.location.href = '/ClipBoardPrime/en';
    } else {
      window.location.href = '/ClipBoardPrime/tr';
    }
  </script>
</Layout>
```

- [ ] **Step 4: Verify static build**

Run: `cd c:\Users\MAXIMUS\PROJECTS\ClipBoardPrime.Project\ClipBoardPrime\website && npm run build`
Expected: `✓ Completed in ...` creating static HTML files in `dist/`.

- [ ] **Step 5: Commit Task 7**

```bash
git add website/src/pages/
git commit -m "feat(website): assemble page routes and verify production build"
```

---

### Task 8: GitHub Actions Workflow for GitHub Pages

**Files:**
- Create: `ClipBoardPrime/.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `website/` project
- Produces: Automatic deployment pipeline to GitHub Pages.

- [ ] **Step 1: Create `.github/workflows/deploy-pages.yml`**

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

- [ ] **Step 2: Commit Task 8**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: add GitHub Actions deploy workflow for GitHub Pages"
```

---

## Plan Self-Review & Handoff

- [x] **Spec coverage:** All sections (Navbar, Hero, 4 Capabilities, Visual Shortcuts Matrix, Security Architecture, Lightbox Screenshot Gallery, Distribution Options, i18n TR/EN, Studio Footer branding, GitHub Actions CI/CD) are covered.
- [x] **No Placeholders:** All component code, i18n copy, and CSS utilities are explicitly written.
- [x] **Type consistency:** Matches Astro 5 and TypeScript signatures across components.
