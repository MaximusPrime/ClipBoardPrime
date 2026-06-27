# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-06-13

### ✨ Added — Pano Geçmişi

- **Gerçek Zamanlı Clipboard İzleme**: `setInterval` tabanlı polling sistemi (varsayılan 500ms, 200ms–5000ms arasında ayarlanabilir). Format listesi (`availableFormats`), metin, HTML ve görsel hash'i kıyaslanarak yalnızca gerçek değişiklikler kayıt altına alınır.
- **Otomatik İçerik Tipi Sınıflandırması**:
  - `text` — Düz metin
  - `url` — http/https/www ile başlayan bağlantılar
  - `email` — RFC geçerli e-posta formatı
  - `code` — JSON, HTML, CSS, SQL, JS/TS, Python, Go, Rust, PHP ve 15+ dil/komut kalıbını algılayan gelişmiş regex motoru
  - `html` — Zengin metin (Rich Text); hem HTML hem düz metin olarak panoya yazılır
  - `image` — Ekran görüntüsü ve kopyalanan görseller, benzersiz adlarla (`clip_<timestamp>_<hex>.png`) yerel diske kaydedilir; MD5 hash ile mükerrerleme önlenir
- **Akıllı Mükerrerleme Önleme**: Aynı içerik tekrar kopyalanırsa yeni kayıt oluşturulmaz; yalnızca `created_at` güncellenerek öğe listenin başına taşınır.
- **Sonsuz Kaydırma (Infinite Scroll)**: 50'şer öğe yükler; liste alt sınırına 50px yaklaşılınca otomatik sayfa çekimi tetiklenir.
- **Skeleton Yükleme Animasyonu**: İlk yüklemede titremesiz (flicker-free) iskelet ekran gösterilir; `replaceChildren()` ile DOM güncellemesi hiç titrememektedir.
- **Tarihsel Gruplama**: Bugün, Dün, Bu Hafta, Geçen Hafta ve aylık başlıklar altında kronolojik gruplama.
- **Filtre Sistemi**: Tümü, Metin, URL, E-posta, Kod, Görsel, Sabitlenmiş, Favoriler sekmeleri.
- **Anlık Arama**: Yazarken süzülen canlı arama; eşleşen kısımlar sarı `<mark>` vurgusuyla gösterilir.
- **Sabitleme & Favori**: Öğeler `is_pinned` veya `is_favorite` olarak işaretlenebilir. Sabitlenmiş öğeler geçmiş temizlemeden etkilenmez.
- **Aktif Pencereye Yapıştır**: `Enter` tuşu veya yapıştır butonu → uygulama kapanır → `mshta VBScript` ile önceki uygulamaya `Ctrl+V` gönderilir.
- **Nota Dönüştür**: Pano öğesinden tek tıkla Not Paneline not oluşturulur.
- **Görsel Önizleme & Modal**: Görsel öğeler liste kartında küçük önizleme ile gösterilir; tıklanınca büyük modal açılır.

### ✨ Added — Hassas Veri Koruma

- **Otomatik Maskeleme** (`is_sensitive = 1`):
  - Kredi/banka kartı numaraları (Visa, MC, Amex, Troy, 13–19 hane)
  - GitHub (`ghp_`, `github_pat_`), Google (`AIzaSy`), Slack (`xox*`), SendGrid (`SG.`) API anahtarları
  - JWT Token (`eyJ...` formatı)
  - Şifre eşleşmeleri (`password:`, `şifre=` anahtar kelimeleri)
  - PEM Private Key blokları
  - T.C. Kimlik Numarası (algoritma checksum doğrulamasıyla yanlış pozitifler filtrelenir)
- **Göster / Gizle Butonu**: Maskelenmiş içerik göz simgesine tıklanınca geçici olarak açılır.
- **Performans Optimizasyonu**: 10.000 karakterden uzun metinlerde tarama yalnızca ilk 10.000 karakterde yapılır.

### ✨ Added — Not Paneli

- **Tam CRUD**: Oluştur, oku, güncelle, sil. Modal tabanlı editör.
- **Kategori Sistemi**: Kullanıcı tanımlı kategoriler; her birinin özel SVG ikonu ve rengi vardır. Kategori silinirse notlar "Kategorisiz" olur.
- **Renk Etiketleri**: Her nota renkli etiket (charcoal, mavi, yeşil, sarı vb.) atanabilir.
- **Sabitleme**: Sabitlenmiş notlar listede her zaman üstte görünür.
- **Drag & Drop Sıralama**: Aynı gruptaki (sabitlenmiş ↔ sabitlenmiş) notlar sürükle-bırakla yeniden sıralanabilir. Arama veya filtreleme aktifken sürükleme devre dışıdır.
- **Detay Modalı**: Tam içerik okuma, kategori ve tarih bilgisi; modalden düzenleme ve kopyalama.
- **Arama Vurgulama**: Hem başlık hem içerik alanında eşleşen karakterler `<mark>` ile vurgulanır.
- **Akordeon**: Karta tıklanınca tam içerik açılır/kapanır.
- **Klavye Navigasyonu**: `↑`/`↓` ile kart gezinme, `Enter`/`Space` ile detay modalı açma.

### ✨ Added — Ayarlar & Sistem

- **Üç Tema**: Koyu (Obsidian), Açık (High Contrast), Sistem (otomatik OS takibi). Anlık geçiş, layout shift yok.
- **Özelleştirilebilir Global Kısayol**: Ayarlar ekranına odaklanıp kombinasyon basılınca otomatik kaydedilir. Eski kısayol kaldırılır, yenisi anında aktif olur.
- **Windows Başlangıç Entegrasyonu**: `app.setLoginItemSettings()` ile otomatik başlatma (Taşınabilir modda otomatik başlatma devre dışıdır).
- **Veri Konumu Taşıma**: Disk boş alan + yazma yetkisi kontrolü; WAL checkpoint ardından dosya kopyalama; bütünlük kontrolü; hata durumunda otomatik rollback ile eski konuma geri dönüş.
- **Dışa / İçe Aktarma (JSON)**:
  - Dışa aktarırken görseller base64 olarak eklenir.
  - İçe aktarırken şema doğrulaması, mükerrer kontrolü ve kategori ID haritalaması yapılır.
- **Yetim Görsel Temizleme**: Başlangıçta veritabanı kaydı olmayan görsel dosyaları diskten silinir.
- **Uygulama İstatistikleri**: Toplam, metin, HTML, görsel sayısı; bugün eklenenler; sabitlenmiş / favori sayısı; veritabanı boyutu ve konumu.

### ✨ Added — Teknik & Güvenlik Altyapısı

- **Electron Güvenlik Modeli**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Tüm IPC kanalları beyaz listeyle korunur.
- **Özel `local-file://` Protokolü**: Yerel görsel dosyaları Content Security Policy atlatmadan güvenle yüklenir.
- **SQLite WAL Modu**: Yüksek okuma/yazma performansı; `FOREIGN_KEYS ON`; 8MB cache; `Prepared Statements` ile SQL enjeksiyon koruması; tüm kritik alanlarda SQL indeksleri.
- **Tek Instance Kilidi**: Aynı anda yalnızca bir örnek çalışır; ikinci açılışta mevcut pencere öne getirilir.
- **Pencere Hafızası & Off-Screen Detection**: Boyut/konum SQLite'a kaydedilir; pencerenin ekran dışında kalmaması kontrol edilir.
- **Sistem Tepsisi**: Uygulama kapatılmadan tepsiye küçülür; ilk kapatmada balon bildirimi gösterilir.
- **Taşınabilir (Portable) Mod Desteği**: `PORTABLE_EXECUTABLE_DIR` tespiti ile verilerin doğrudan taşınabilir exe yanında `/data` klasöründe saklanması, sistemde iz bırakmama (zero-trace) prensibi, otomatik başlatma ve veri konumu değiştirme özelliklerinin kilitlenmesi.
- **Hata Yönetimi**: `uncaughtException` ve `unhandledRejection` yakalanır; `will-quit`'te kısayollar, watcher ve veritabanı temiz şekilde kapatılır.
- **Otomatik URL Migrasyonu**: Eski sürümlerde `text` olarak kaydedilmiş URL'ler başlangıçta `url` tipine dönüştürülür.
- **Kategori İkon Migrasyonu**: Eski emoji ikonları premium SVG isimleriyle değiştirilir.

### 🎨 Added — UI/UX

- **Çift Tıklama Kopyalama + 200ms Debounce**: Metin/URL/kod/e-posta kopyalama çift tıklamayla; görsel kopyalamadan muaf. 200ms debounce sayesinde çift tık sırasında kart boyutu değişmez.
- **Akıllı Genişlet/Daralt**: `requestAnimationFrame` × 2 ile hassas `scrollIntoView` + 0.8s `collapse-highlight` glow animasyonu.
- **Metin Seçimi Koruması**: Kart üzerinde metin seçili durumdayken tek tık daraltma tetiklenmez.
- **Aktif Buton Parlatma**: Sabitlenmiş/favori butonlar çerçevesiz, soft glow arka plan rengiyle aktif durumu gösterir.
- **`:has()` Opaklık Kontrolü**: Kart üzerine gelinmediğinde aktif butonlar `%80` opaklıkla görünür kalır.
- **Skeleton Ekran**: İlk yüklemede 5 adet animasyonlu iskelet kart gösterilir.
- **Toast Bildirimleri**: Başarı, uyarı, hata ve bilgi durumları için özel toast mesajları.
- **Focus Trap**: Açık modallarda klavye odağı modalın içinde tutulur (erişilebilirlik).
- **Özel Onay Modalı**: Silme ve taşıma işlemleri için native `dialog` yerine stilize onay modalı.
- **Sıfır Harici Bağımlılık**: Tüm arayüz Vanilla HTML5 + CSS3 + ES6+ ile inşa edilmiştir.

---

[1.0.0]: https://github.com/MaximusPrime77/ClipBoardPrime/releases/tag/v1.0.0
