# 🤝 ClipBoard Pro Katkı Sağlama Rehberi (Contributing Guide)

Öncelikle, **ClipBoard Pro**'ya katkıda bulunmayı düşündüğünüz için teşekkür ederiz! Bu proje açık kaynaklı bir topluluk projesidir ve sizin gibi geliştiricilerin katkılarıyla daha da gelişmektedir.

Bu rehber, projeye katkı sağlarken uymanız gereken kuralları, iş akışını ve kod standartlarını açıklamaktadır.

---

## 📌 İçindekiler
1. [Nasıl Katkıda Bulunabilirsiniz?](#-nasıl-katkıda-bulunabilirsiniz)
2. [Hata Bildirimi (Bug Report)](#-hata-bildirimi-bug-report)
3. [Yeni Özellik Önerileri (Feature Request)](#-yeni-özellik-önerileri-feature-request)
4. [Kod Katkısı ve Geliştirme İş Akışı](#-kod-katkısı-ve-geliştirme-iş-akışı)
5. [Kodlama Standartları](#-kodlama-standartları)
6. [Pull Request (PR) Gönderme Kuralları](#-pull-request-pr-gönderme-kuralları)
7. [İletişim ve Destek](#-iletişim-ve-destek)

---

## 💡 Nasıl Katkıda Bulunabilirsiniz?

Projeye birçok farklı şekilde katkıda bulunabilirsiniz:
*   Karşılaştığınız hataları rapor ederek.
*   Yeni özellikler ve iyileştirmeler önererek.
*   Dokümantasyonu güncelleyerek veya Türkçe/İngilizce çevirileri iyileştirerek.
*   Kod yazarak, hataları gidererek veya yeni özellikler ekleyerek.

---

## 🐛 Hata Bildirimi (Bug Report)

Bir hata bulduysanız, lütfen GitHub Issues sekmesini kullanarak bildirin. Hata bildirimi yaparken şu adımları takip etmeniz çözümü hızlandıracaktır:
1.  **Mevcut Sorunları Arayın**: Aynı hatanın daha önce bildirilip bildirilmediğini kontrol edin.
2.  **Açıklayıcı Bir Başlık Kullanın**: Hatanın ne olduğunu özetleyen net bir başlık yazın.
3.  **Detayları Paylaşın**:
    *   İşletim sistemi sürümü (örn: Windows 11 Pro 23H2).
    *   Uygulamanın sürümü (örn: v1.0.0).
    *   Hatanın gerçekleşmesi için izlenen adımlar (Reproduce Steps).
    *   Beklenen davranış ve gerçekleşen hata.
    *   Varsa ekran görüntüleri veya konsol hata çıktıları (F12 DevTools logları).

---

## 🚀 Yeni Özellik Önerileri (Feature Request)

Uygulamada olmasını istediğiniz bir özellik varsa, bunu yine GitHub Issues üzerinden önerebilirsiniz. Öneri yaparken şunları belirtmeye özen gösterin:
*   Önerilen özelliğin amacı ve kullanıcıya sağlayacağı fayda.
*   Özelliğin nasıl çalışmasını hayal ettiğiniz (varsa arayüz/tasarım fikirleri).
*   Alternatif çözümler veya geçici iş çözümleri.

---

## 🛠️ Kod Katkısı ve Geliştirme İş Akışı

Kod yazarak katkıda bulunmak istiyorsanız, lütfen aşağıdaki adımları takip edin:

### 1. Depoyu Çatallayın (Fork) ve Yerel Olarak Klonlayın
Projeyi kendi GitHub hesabınıza forklayın ve ardından yerel bilgisayarınıza klonlayın:
```bash
git clone https://github.com/KULLANICI_ADINIZ/ClipBoardPrime.git
cd ClipBoardPrime
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

> [!IMPORTANT]
> Projede yerel C++ modülü olan `better-sqlite3` kullanılmaktadır. Eğer veritabanı bağlantı hatası alırsanız, yerel derleme araçlarını kullanarak modülü tekrar derleyin:
> ```bash
> npm run rebuild
> ```

### 3. Yeni Bir Dal (Branch) Oluşturun
Çalışacağınız konuyla ilgili anlamlı bir dal ismi seçin (örn: `feature/custom-themes` veya `fix/copy-error`):
```bash
git checkout -b feature/ozellik-adi
```

### 4. Geliştirme Yapın ve Test Edin
Değişikliklerinizi yapın ve yerel olarak test etmek için uygulamayı çalıştırın:
```bash
npm run dev
```

---

## 🎨 Kodlama Standartları

Kod kalitesini korumak için lütfen aşağıdaki kurallara dikkat edin:

*   **Javascript**: ES6+ standartlarına uygun, temiz ve okunabilir kod yazın. Modüler yapıları ve asenkron operasyonları (`async/await`) tercih edin.
*   **CSS**: Vanilla CSS kullanıyoruz. Arayüzün responsive ve modern olmasına, layout shift oluşturmayacak şekilde düzenlenmesine özen gösterin.
*   **Değişken ve Fonksiyon İsimleri**: Anlamlı, camelCase formatında isimlendirmeler kullanın (örn: `copyToClipboard`, `handleCardCollapse`).
*   **Yorum Satırları**: Karmaşık mantıksal işlemleri açıklayan kısa ve öz yorum satırları ekleyin. Mevcut kodun yapısını bozacak gereksiz yorumlardan kaçının.
*   **Veritabanı işlemleri**: SQLite sorgularında performans ve SQL enjeksiyonu güvenliğine (Prepared Statements) dikkat edin.

---

## 🚀 Pull Request (PR) Gönderme Kuralları

Değişikliklerinizi tamamladıktan sonra ana depoya bir Pull Request (PR) gönderin. PR gönderirken:

1.  Kodunuzu en güncel `main` dalı ile senkronize edin (`git pull origin main`).
2.  Değişikliklerinizi mantıklı commit mesajları ile taahhüt edin (örn: `feat: add custom theme support` veya `fix: resolved double click copy bug`).
3.  PR gönderirken otomatik açılan **Pull Request Şablonunu** eksiksiz doldurun.
4.  PR'ınızın sadece tek bir amaca veya özelliğe odaklandığından emin olun. Büyük ve karmaşık PR'lar yerine küçük, parça parça PR'lar daha hızlı incelenir ve onaylanır.

---

## 📧 İletişim ve Destek

Sorularınız veya işbirliği önerileriniz için aşağıdaki kanallardan bize ulaşabilirsiniz:

*   **Proje Yöneticisi**: Maximus Decimus Meridius ([MaximusPrime77](https://github.com/MaximusPrime77))
*   **E-posta**: [b.maximus.prime@gmail.com](mailto:b.maximus.prime@gmail.com)
*   **Depo Bağlantısı**: [https://github.com/MaximusPrime77/ClipBoardPrime](https://github.com/MaximusPrime77/ClipBoardPrime)
