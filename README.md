# 📋 ClipBoardPro

ClipBoardPro, panonuzu akıllıca yönetmenizi, sık kullandığınız içerikleri saklamanızı ve gelişmiş not defteri entegrasyonuyla üretkenliğinizi artırmanızı sağlayan premium, modern ve hafif bir masaüstü uygulamasıdır.

---

## ✨ Öne Çıkan Özellikler

*   **⚡ Akıllı Pano İzleme:** Metinleri, web adreslerini, kod bloklarını ve görselleri kopyalandığı anda otomatik algılar ve tiplerine göre kategorize eder.
*   **📌 Sabitleme & Favoriler:** Sık kullandığınız pano içeriklerini veya notlarınızı sabitleyebilir ya da favorilere ekleyerek hızlı erişim sağlayabilirsiniz.
*   **📝 Entegre Not Defteri (Notlarım):** Panodaki herhangi bir öğeyi tek tıkla nota dönüştürebilir, özel kategoriler/etiketler atayabilir ve notlarınızı düzenleyebilirsiniz.
*   **🔀 Notları Sürükle-Bırak Sıralama:** Sabitlediğiniz notları mouse ile sürükleyip bırakarak kendi öncelik sıranıza göre dilediğiniz gibi yerleştirebilirsiniz.
*   **🔍 Hızlı Arama (Ctrl + F):** Çok sayıda pano öğesi veya not arasından aradığınız içeriği anında bulmanızı sağlayan akıllı gerçek zamanlı filtreleme.
*   **📂 Kapsamlı Veri Yönetimi & Yedekleme:** Veritabanınızı tamamen dışa aktarabilirsiniz. Dışa aktarma işlemi panodaki tüm ekran görüntülerini ve görselleri (base64 olarak) kapsar ve verileriniz kayıpsız yedeklenir.
*   **🔒 Hassas Veri Koruması:** Kredi kartı numaraları, şifreler, özel anahtarlar (API key, token, SSH vb.) gibi hassas içerikleri otomatik tespit eder ve güvenliğiniz için maskeler.
*   **🎨 Premium Arayüz:** Modern glassmorphism efektleri, akıcı animasyonlar, karanlık (dark), aydınlık (light) ve sistem teması uyumluluğu.
*   **🛠️ Sistem Tepsisi (Tray) & Kısayollar:** Uygulamayı arka planda gizleyebilir, sistem tepsisinden yönetebilir ve `Ctrl + Shift + V` global kısayoluyla anında çağırabilirsiniz.

---

## 🛠️ Kullanılan Teknolojiler

*   **Çatı (Framework):** [Electron](https://www.electronjs.org/) (Masaüstü Entegrasyonu & IPC İletişimi)
*   **Arayüz (Frontend):** HTML5, Vanilla CSS3 (Custom Variables, Transitions), Javascript (ES6+)
*   **Veritabanı (Database):** SQLite (better-sqlite3) ile yerel, yüksek performanslı depolama
*   **Kütüphaneler:** Programatik ikonlar ve gelişmiş pano dinleyicisi altyapısı

---

## 🚀 Kurulum ve Çalıştırma

Projeyi yerel bilgisayarınızda çalıştırmak için aşağıdaki adımları takip edebilirsiniz.

### Gereksinimler
*   Bilgisayarınızda [Node.js](https://nodejs.org/) (v16 veya üzeri) yüklü olmalıdır.

### Adımlar

1.  **Bağımlılıkları Yükleyin:**
    ```bash
    npm install
    ```

2.  **Uygulamayı Geliştirici Modunda Başlatın:**
    ```bash
    npm run dev
    ```

3.  **Üretim Sürümü (Build) Oluşturun (İsteğe Bağlı):**
    ```bash
    npm run build
    ```

---

## 📦 Proje Dosya Yapısı

```text
ClipBoardPro/
├── assets/             # Tray ikonları ve uygulama görselleri
├── database/           # SQLite veritabanı şeması ve veri yönetim modülleri (db.js)
├── src/
│   ├── index.html      # Ana uygulama arayüz yapısı
│   ├── js/
│   │   ├── app.js      # Uygulama koordinasyonu ve genel arayüz yönetimi
│   │   ├── clipboard.js# Pano geçmişini yöneten panel modülü
│   │   ├── notes.js    # Not defteri ve akordiyon davranışları
│   │   ├── settings.js # Ayarlar, dışa/içe aktarım, veri taşıma mantığı
│   │   └── utils.js    # Yardımcı fonksiyonlar (toast, ikonlar, tarih)
│   └── styles/
│       ├── main.css    # Premium stiller ve arayüz yerleşimleri
│       └── themes.css  # Renk paletleri ve tema CSS değişkenleri
├── main.js             # Electron ana süreci (Lifecycle, IPC, Global Shortcut)
├── preload.js          # contextBridge güvenli IPC köprüsü
├── package.json        # Proje ayarları ve bağımlılık listesi
└── README.md           # Proje belgelendirmesi
```

---

## 👨‍💻 Geliştirici

*   **Maximus Decimus Meridius**
*   **GitHub:** [@MaximusPrime77](https://github.com/MaximusPrime77)
*   **E-posta:** b.maximus.prime@gmail.com
*   **Konum:** İstanbul

---

## 📄 Lisans

Bu proje kişisel kullanım ve açık kaynaklı geliştirme amacıyla hazırlanmıştır. Tüm hakları saklıdır.
