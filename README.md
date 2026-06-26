<div align="center">

# 📋 ClipBoard Pro

**Masaüstünüz için ultra hızlı, akıllı ve güvenli bir pano yöneticisi**

[![Electron](https://img.shields.io/badge/Electron-v33-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![License](https://img.shields.io/badge/Lisans-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Developer](https://img.shields.io/badge/Geliştirici-MaximusPrime77-f97316?style=for-the-badge&logo=github)](https://github.com/MaximusPrime77)

</div>

---

## 🌟 Proje Hakkında

**ClipBoard Pro**, sadece bir pano geçmişi uygulaması değildir. Arka planda sessizce çalışarak kopyaladığınız her metni, URL'yi, kodu, e-postayı ve görseli yerel bir SQLite veritabanında güvenle depolar. Tek bir global kısayolla (`Ctrl+Shift+V`) anında erişebileceğiniz bu uygulama; sınırsız geçmiş, akıllı içerik algılama, not sistemi ve hassas veri maskeleme gibi güçlü özelliklerle donatılmıştır.

---

##   Özellikler

### 🗂️ Pano Geçmiş Yönetimi
- **Sınırsız Geçmiş**: Tüm kopyalama geçmişi yerel SQLite veritabanında tutulur. `Ayarlar → Genel` kısmından maksimum kayıt sayısı belirlenebilir; `0` = sınırsız.
- **Anlık İçerik Algılama**: Her yeni kopyalama anında aşağıdaki türlere otomatik olarak sınıflandırılır:
  - 📄 **Metin** — Düz metin
  - 🔗 **URL** — `http://`, `https://` veya `www.` ile başlayan bağlantılar
  - 📧 **E-posta** — Geçerli e-posta adresi formatı
  - 💻 **Kod** — JSON, HTML, CSS, SQL, JS/TS, Python, Rust, Go, PHP ve 15+ dil/komut satırı formatlarını algılayan gelişmiş regex motoru
  - 🖼️ **Görsel** — Ekran görüntüsü veya kopyalanan görseller PNG olarak yerel diske kaydedilir

### 🔒 Hassas Veri Koruma (Otomatik Maskeleme & AES-256-GCM Şifreleme)
- **Güçlü Şifreleme (AES-256-GCM)**: Hassas veri olarak algılanan veya kullanıcı tarafından işaretlenen içerikler veritabanında (`clipboard-pro.db`) düz metin olarak değil, cihaza özel üretilen benzersiz şifreleme anahtarı ile **AES-256-GCM** algoritması kullanılarak şifrelenmiş halde saklanır.
- **Güvenli Anahtar Depolama**: Şifreleme anahtarı uygulamanın güvenli yerel kullanıcı dizinindeki `config.json` dosyasında saklanır.
- **Otomatik Maskeleme**: Kopyalanan içerik otomatik olarak aşağıdaki kalıplar için taranır, veritabanına şifreli yazılır ve arayüzde `••••••••••••` şeklinde maskelenir:
  - **Kredi/Banka Kartı Numaraları** (Visa, Mastercard, Amex, Troy dahil 13–19 hane)
  - **API Anahtarları** (Google `AIzaSy`, GitHub `ghp_/github_pat_`, Slack `xox*`, SendGrid `SG.` formatları)
  - **JWT Tokenları** (`eyJ...` formatı)
  - **Şifre Eşleşmeleri** (`password:`, `şifre=` gibi anahtar kelimeler)
  - **PEM Private Key** (`-----BEGIN PRIVATE KEY-----`)
  - **T.C. Kimlik Numarası** (Checksum doğrulamasıyla yanlış pozitifler engellenir)
- Maskelenmiş içerik, göz simgesine tıklanarak geçici olarak görünür hale getirilebilir.

### 🎨 Akıllı Çift Tıklama ile Kopyalama
- **Metin / URL / E-posta / Kod**: Karta **çift tıklanınca** panoya kopyalanır. Tek tıklama kartı genişletir/daraltır.
- **Görseller**: Çift tıklamada kopyalama çalışmaz; görsel büyük modal'da açılır.
- **200ms Debounce**: Çift tıklama sırasında kartın boyutu değişmez (layout shift yok); kopyalama hiçbir aksama olmadan gerçekleşir.
- **Metin Seçimi Koruması**: Üzerinde metin seçiliyken tek tık daraltma tetiklenmez.

### 📌 Sabitleme & Favori Sistemi
- Her öğe tek tıkla **sabitlenebilir** (listede her zaman üstte kalır) veya **favorilere eklenebilir**.
- **Filtreler**: `Tümü`, `Metin`, `URL`, `Kod`, `E-posta`, `Görsel`, `Sabitlenmiş`, `Favoriler`
- Sabitlenmiş öğeler, geçmiş temizleme işleminden etkilenmez.

### ♾️ Sonsuz Kaydırma (Infinite Scroll)
- Liste 50'şer öğe yükler; listenin alt kısmına 50px mesafeye gelindiğinde otomatik olarak bir sonraki sayfa çekilir.
- İlk yüklemede animasyonlu **skeleton** ekranı ile titreme (flicker) önlenir.
- `replaceChildren()` API'si kullanılarak DOM yenileme titremesi ortadan kaldırılmıştır.

### 🗓️ Tarihsel Gruplama
- Arama veya özel filtre aktif değilken öğeler; **Bugün**, **Dün**, **Bu Hafta**, **Geçen Hafta** ve **[Ay Adı]** başlıkları altında otomatik gruplanır.

### 🔍 Anlık Arama & Vurgulama
- Yazıldığı anda eşleşmeleri filtreleyen gerçek zamanlı arama.
- Eşleşen karakterler `<mark>` ile **sarı vurgu** olarak gösterilir.

### 📐 Genişlet / Daralt (Uzun Metinler)
- 120 karakterden uzun metinler veya çok satırlı içerikler varsayılan olarak kırpılmış gösterilir.
- Kartın alt-orta köşesindeki **chevron (▼) okuna** tıklanarak tam içerik genişletilir.
- Kart daraltıldığında:
  - `requestAnimationFrame` × 2 senkronizasyonu ile tarayıcı yeni boyutu hesapladıktan sonra `scrollIntoView` çağrılır.
  - `smooth` kaydırmayla kart görüş alanında tutulur.
  - 0.8 saniyelik yumuşak mavi **parlama (collapse-highlight glow)** efektiyle göz yönlendirilir.

### ⚡ Aktif Pencereye Yapıştır
- **Yapıştır** butonu veya `Enter` tuşuna basınca uygulama gizlenir ve içerik `mshta VBScript` aracılığıyla önceki aktif uygulamaya (`Ctrl+V`) otomatik gönderilir.

### 📎 Panoya Kopyala → Nota Dönüştür
- Her pano öğesi yanındaki **📄 Not Olarak Kaydet** butonuyla Not Paneline doğrudan not olarak aktarılabilir.

---

## 📝 Not Paneli

Uygulamanın ikinci modülü; bağımsız, tam özellikli bir not alma sistemidir.

### ✏️ Not Düzenleme
- Modal tabanlı editör: Başlık, içerik, kategori ve renk seçimi.
- Yeni not oluştururken aktif kategori filtresi otomatik seçilir.

### 🏷️ Kategori Sistemi
- Notlar kullanıcı tanımlı kategorilere atanabilir.
- Her kategorinin özel **rengi** ve **SVG ikonu** (folder, briefcase, code, user vb.) vardır.
- Kategori silindiğinde bağlı notlar kaybolmaz; "Kategorisiz" olarak güncellenir.
- Kategori filtresi ile notlar anlık filtrelenebilir.
- Başlık ve içerik boyunca **arama vurgulama** desteklenir.

### 🎨 Renk Etiketi
- Her nota renk etiketi (charcoal, mavi, yeşil, sarı vb.) atanabilir; kartlarda soldaki renkli çizgi olarak gösterilir.

### 📌 Sabitleme & Sıralama
- Notlar sabitlenebilir; sabitlenenler listenin üstünde ayrı grupta yer alır.
- **Sürükle-Bırak (Drag & Drop)** ile not sıralaması değiştirilebilir.
  - Sıralama yalnızca aynı gruptaki (sabitlenmiş↔sabitlenmiş, sıradan↔sıradan) notlar arasında geçerlidir.
  - Arama veya kategori filtresi aktifken sürükleme devre dışıdır.

### 🔎 Detay Modalı
- Notların tam içeriğini, kategorisini ve güncelleme tarihini gösteren büyük görüntüleme modalı.
- Modal içinden doğrudan düzenleme veya kopyalama yapılabilir.

### ⌨️ Klavye Navigasyonu
- `↑` / `↓` ile not kartları arasında gezinme.
- `Enter` veya `Space` ile detay modalını açma.

---

## ⚙️ Ayarlar

### 🎨 Tema
| Seçenek | Açıklama |
|:--|:--|
| **Koyu (Obsidian)** | Varsayılan; göz yormayan derin koyu renk paleti |
| **Açık** | Yüksek kontrastlı beyaz tema |
| **Sistem** | İşletim sistemi tercihini otomatik takip eder (`prefers-color-scheme`) |

- Tema değişikliği **anlık** (layout shift veya sayfa yenilemesi olmadan) uygulanır.
- `window.matchMedia` ile sistem teması değiştiğinde uygulama otomatik güncellenir.

### ⏱️ Clipboard İzleme Aralığı
- 200ms – 5000ms arasında özelleştirilebilir polling aralığı.
- Ayar kaydedilince watcher yeniden başlatılarak anlık devreye girer.

### 🛡️ Hassas Veri Algılama
- Tek bir toggle ile etkinleştirilir/devre dışı bırakılır.

### 🚀 Windows ile Birlikte Başlat

Uygulama, sistem başlangıcında otomatik olarak çalışacak şekilde yapılandırılabilir:
- **Windows Kayıt Defteri (Registry) Entegrasyonu**: Windows Başlangıç ayarı, doğrudan Windows Registry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) manipüle edilerek gerçekleştirilir.
- **Ayarlar Paneli**: Kullanıcılar bu özelliği arayüzdeki ayarlar menüsünden diledikleri zaman aktif veya pasif hale getirebilirler.

### ⌨️ Global Kısayol (Özelleştirilebilir)
- Odaklanılınca klavyeye basmak yeterli; kombinasyon otomatik okunur ve kaydedilir.
- `Ctrl`, `Alt`, `Shift`, `Meta` + herhangi bir tuş kombinasyonu desteklenir.
- Kayıt sonrası eski kısayol kaldırılır, yenisi anında aktif olur.

### 💾 Veri Yönetimi
| İşlev | Açıklama |
|:--|:--|
| **Veri Konumu Değiştir** | Veritabanı başka bir klasöre taşınır. Disk boş alan + yazma yetkisi kontrolü yapılır; hata durumunda otomatik rollback mevcuttur |
| **Veriyi Dışa Aktar** | Tüm pano geçmişi, notlar, kategoriler ve ayarlar tek bir JSON dosyasına aktarılır. Görseller **base64** olarak dahil edilir |
| **Veriyi İçe Aktar** | JSON yedek dosyası şema doğrulamasından geçirilir; mükerrer kayıtlar atlanır, kategoriler otomatik eşleştirilir |

---

## 🖥️ Uygulama Altyapısı

### 🔒 Güvenlik Mimarisi
- **Context Isolation** ve **Sandbox** açık, `nodeIntegration` kapalıdır.
- `contextBridge` üzerinden `preload.js`'te beyaz listeli IPC kanalları aracılığıyla işlem köprüsü kurulur.
- İzin verilmeyen kanallara yapılan çağrılar hata fırlatır.
- Görsel dosyaları özel `local-file://` protokolü üzerinden CSP atlatmadan güvenle yüklenir.

### 📦 Tek Instance Kilidi
- İkinci bir uygulama açılmaya çalışıldığında mevcut pencere öne getirilir (`requestSingleInstanceLock`).

### 🗂️ Sistem Tepsisi (System Tray)
- Pencere kapatıldığında arka planda çalışmaya devam eder, sistem tepsisinde ikonla görünür.
- İlk kapatmada **balon bildirimi** ile kullanıcı bilgilendirilir (yalnızca bir kez).
- Tepsi menüsünden: Göster, Ayarlar, Çıkış.

### 🪟 Pencere Hafızası
- Pencere boyut ve konumu SQLite'a yazılır; yeniden açılışta tam olarak geri yüklenir.
- Pencerenin görünür monitörlerin dışında kalmaması için **off-screen detection** kontrolü mevcuttur.

### ♻️ Yetim Görsel Temizleme
- Uygulama başlangıcında veritabanında kaydı olmayan görsel dosyaları diskten otomatik silinir.

### 🗄️ Veritabanı Performansı
- `WAL` (Write-Ahead Logging) modu aktif → eş zamanlı okuma/yazma performansı yüksek.
- `SYNCHRONOUS = NORMAL` ve `8MB cache` ile optimize edilmiştir.
- Tüm sorgular `Prepared Statement` kullanır → SQL enjeksiyonuna karşı güvenli.
- Tarih, tür, pin ve favori alanlarına **SQL indeksleri** tanımlıdır.

---

## 📐 Veritabanı Şeması

```mermaid
erDiagram
    CLIPBOARD_HISTORY {
        INTEGER id PK
        TEXT content
        TEXT content_type "text | url | email | code | image | html"
        TEXT preview
        TEXT image_path "PNG görsel dosya yolu"
        INTEGER is_pinned "0 | 1"
        INTEGER is_favorite "0 | 1"
        INTEGER is_sensitive "0 | 1"
        TEXT source_app
        INTEGER char_count
        DATETIME created_at
    }
    NOTES {
        INTEGER id PK
        TEXT title
        TEXT content
        INTEGER category_id FK
        TEXT color "renk etiketi"
        INTEGER is_pinned "0 | 1"
        INTEGER sort_order "drag-drop sırası"
        DATETIME created_at
        DATETIME updated_at
    }
    CATEGORIES {
        INTEGER id PK
        TEXT name UNIQUE
        TEXT color
        TEXT icon "svg ikon adı"
        INTEGER sort_order
    }
    SETTINGS {
        TEXT key PK
        TEXT value
    }
    NOTES ||--o{ CATEGORIES : "category_id"
```

---

## ⌨️ Klavye Kısayolları

| Kısayol | Ekran | Açıklama |
|:--|:--|:--|
| `Ctrl+Shift+V` *(özelleştirilebilir)* | Global | Paneli göster / gizle |
| `Çift Tık` | Pano Listesi | Öğeyi panoya kopyala (görseller hariç) |
| `Tek Tık` | Uzun Kart | Kartı genişlet / daralt |
| `Enter` | Pano Listesi | Öğeyi aktif pencereye yapıştır (görsel ise aç) |
| `Space` | Pano Listesi | Öğeyi panoya kopyala (görsel ise aç) |
| `↑ / ↓` | Pano & Not Listesi | Öğeler arasında klavye ile gezin |
| `Escape` | Modallar | Açık modalı kapat |
| `Enter / Space` | Not Listesi | Notun detay modalını aç |

---

## 🚀 Geliştirici Kurulumu

### Gereksinimler
- [Node.js](https://nodejs.org/) (v18 veya üzeri)
- npm

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/MaximusPrime77/ClipBoardPro.git
cd ClipBoardPro
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

> [!IMPORTANT]
> Bu projede yerel C++ bağlantısı olan `better-sqlite3` modülü kullanılmaktadır. Electron sürümü değiştirildiğinde veya veritabanı hatası alındığında şu komutla yeniden derleyin:
> ```bash
> npm run rebuild
> ```

### 3. Geliştirme Modunda Çalıştırın
```bash
npm run dev
```
Geliştirme modunda DevTools otomatik olarak açılır ve veriler `%AppData%/clipboard-pro-app-dev` konumuna yazılır.

---

## 📦 Derleme (Build)

Uygulamayı `.exe` olarak derlemek için `electron-builder` kullanılmaktadır:

```bash
npm run build
```

`dist/` klasöründe standart kurulum paketi oluşur:

| Çıktı | Açıklama |
|:--|:--|
| `ClipBoardPro Setup.exe` | Standart Windows kurulum paketi (NSIS) |

---

## 🤝 Katkıda Bulunma

Projeye katkıda bulunmak ister misiniz? Lütfen önce [CONTRIBUTING.md](CONTRIBUTING.md) dosyasını inceleyin.

- 🐛 Hata bildirin → [GitHub Issues](https://github.com/MaximusPrime77/ClipBoardPro/issues)
- ✨ Özellik önerin → [GitHub Issues](https://github.com/MaximusPrime77/ClipBoardPro/issues)
- 🔧 Kod katkısı → [Pull Request](https://github.com/MaximusPrime77/ClipBoardPro/pulls)

---

## 📄 Lisans

Bu proje **MIT Lisansı** altında dağıtılmaktadır. Ayrıntılar için [LICENSE](LICENSE) dosyasına bakın.

---

## 📧 İletişim

<div align="center">

**Maximus Decimus Meridius**

[![GitHub](https://img.shields.io/badge/GitHub-MaximusPrime77-181717?style=for-the-badge&logo=github)](https://github.com/MaximusPrime77)
[![Email](https://img.shields.io/badge/Email-b.maximus.prime%40gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:b.maximus.prime@gmail.com)
[![Project](https://img.shields.io/badge/Proje-ClipBoardPro-2563eb?style=for-the-badge&logo=github)](https://github.com/MaximusPrime77/ClipBoardPro)

</div>
