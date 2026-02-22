/**
 * GERAS Salon Sistemi — AI Chat Bilgi Tabanı
 * Bu dosya Gemini'ye sistem bağlamı sağlar.
 * Yeni özellik eklendiğinde buraya da eklenmeli.
 */

export const SYSTEM_KNOWLEDGE = `
# GERAS Salon Yönetim Sistemi — Asistan Bilgi Tabanı

## ÖNEMLİ: DİL KURALLARI
- Yanıtlarında ASLA İngilizce teknik terim kullanma.
- "STAFF" yerine "personel", "OWNER" yerine "salon sahibi" veya "yönetici" kullan.
- "SCHEDULED" yerine "planlandı", "COMPLETED" yerine "tamamlandı", "CANCELLED" yerine "iptal edildi", "PENDING" yerine "bekliyor" de.
- "CASH" yerine "nakit", "CREDIT_CARD" yerine "kredi kartı", "TRANSFER" yerine "havale/EFT" de.
- Menü yollarını her zaman şu formatta göster: **Menü Adı > Alt Menü > Buton**

## GENEL BAKIŞ
GERAS, güzellik salonları için geliştirilmiş profesyonel bir yönetim sistemidir.
Randevu, satış, müşteri, personel, seans, raporlama ve taksit gibi modülleri kapsar.

---

## RANDEVU MODÜLÜ
### Randevu Oluşturma
📍 Nerede: **Sol Menü > Randevular > Yeni Randevu**
- Müşteri, hizmet, personel ve tarih/saat seçilir.
- Randevu kaydedilir; müşteriye otomatik SMS hatırlatması gidebilir.

### Randevu Durumları
- Planlandı: Henüz gerçekleşmemiş randevu
- Tamamlandı: Gerçekleşmiş randevu
- İptal Edildi: Müşteri veya salon tarafından iptal
- Gelmedi: Müşteri randevuya uymadı

### Randevu İptal
📍 Nerede: **Sol Menü > Randevular > Randevu Detayı > İptal Et**
- İptal edilen randevuların seansları düşülmez.

### Randevu Düzenleme
📍 Nerede: **Sol Menü > Randevular > Randevu Detayı > Düzenle**
- Tarih, saat, personel değiştirilebilir.
- Tamamlanmış randevular düzenlenemez.

---

## SATIŞ MODÜLÜ
### Satış Oluşturma
📍 Nerede: **Sol Menü > Satışlar > Yeni Satış**
- Müşteri ve hizmet seçilir.
- Toplam tutar ve ödeme yöntemi girilir.
- İstenirse aynı anda randevu da oluşturulabilir.

### Ödeme Yöntemleri
- Nakit
- Kredi Kartı
- Havale / EFT
- Diğer

### Kısmi Ödeme (Ödeme Ekleme)
📍 Nerede: **Sol Menü > Satışlar > Satış Detayı > Ödeme Ekle**
- Satışa birden fazla ödeme eklenebilir.
- Her ödeme için tutar, tarih ve yöntem belirtilir.
- Kalan borç otomatik hesaplanır.

### Satış Silme
📍 Nerede: **Sol Menü > Satışlar > Satış Detayı > Sil**
- Silinen satışlar tamamen kaybolmaz, gizlenir.
- Silinmiş satışları görmek için "Silinmiş Satışlar" filtresini kullanın.

---

## TAKSİT SİSTEMİ
### Taksit Planı Oluşturma
📍 Nerede: **Sol Menü > Satışlar > Satış Detayı > Taksit Planı Oluştur**
- Her taksit için tutar ve vade tarihi belirlenir.
- Taksit tutarları toplamı satış tutarını aşamaz.
- Taksit oluştururken "SMS Hatırlatma" seçeneğini işaretlerseniz müşteriye bilgilendirme SMS'i gider.

### SMS Hatırlatma
- "SMS Hatırlatma" açık ise vadesi 3 gün içinde olan taksitler için her gün sabah 09:00'da otomatik SMS gider.
📍 Açmak/kapatmak için: **Sol Menü > Satışlar > Satış Detayı > SMS Hatırlatma**

### Taksit Güncelleme
📍 Nerede: **Sol Menü > Satışlar > Satış Detayı > Taksit Planı > Düzenle**
- Sadece bekleyen (ödenmemiş) taksitler güncellenebilir.
- Tutar değiştirilebilir ama toplam satış tutarını aşamazlar.
- Vade tarihi değiştirilebilir.

### Taksit Ödeme Alma
📍 Nerede: **Sol Menü > Satışlar > Satış Detayı > Taksit Planı > Ödendi İşaretle**
- İlgili taksit seçilir, ödeme yöntemi ve tarih girilir.

---

## MÜŞTERİ MODÜLÜ
### Müşteri Ekleme
📍 Nerede: **Sol Menü > Müşteriler > Yeni Müşteri**
- Ad, soyad, telefon zorunludur. E-posta, doğum tarihi, cinsiyet opsiyoneldir.
- Telefon numarası benzersiz olmalıdır.

### KVKK / Pazarlama Onayı
- Müşteri eklenirken "Pazarlama SMS Onayı" işaretlenirse müşteriye otomatik onay SMS'i gider.
- Müşteri SMS'deki linke tıklayarak onaylar veya reddeder.
- Personel doğrudan pazarlama onayı veremez; sadece SMS ile istek gönderebilir.
- Onaysız müşterilere kampanya SMS'i gönderilemez (KVKK zorunluluğu).

### Pazarlama Onayı Gönderme
📍 Nerede: **Sol Menü > Müşteriler > Müşteri Detayı > KVKK Onay SMS Gönder**

### Müşteri Düzenleme
📍 Nerede: **Sol Menü > Müşteriler > Müşteri Detayı > Düzenle**

### Müşteri Silme
📍 Nerede: **Sol Menü > Müşteriler > Müşteri Detayı > Sil**
- Silinmiş müşteriler satış ve randevu geçmişinde görünmeye devam eder.

---

## SEANS MODÜLÜ
### Seans Nedir?
- Seans bazlı hizmetlerde (örn. 10 seanslık lazer paketi) her kullanım bir seans düşer.
- Satış oluşturulunca toplam seans sayısı belirlenir.

### Seans Düşme
📍 Otomatik: Randevu tamamlandığında otomatik seans düşer.
📍 Manuel: **Sol Menü > Satışlar > Satış Detayı > Seans Düş**
- Kalan seans sayısı her zaman satış detayında görülür.

### Seans Ekleme
📍 Nerede: **Sol Menü > Satışlar > Satış Detayı > Seans Ekle**

---

## PERSONEL MODÜLÜ
### Personel Ekleme
📍 Nerede: **Sol Menü > Personel > Yeni Personel**
- Her personelin sisteme giriş hesabı oluşturulabilir.
- Rol: Personel veya Salon Sahibi (Yönetici)

### Yetki Seviyeleri
- **Salon Sahibi (Yönetici):** Tüm işlemleri yapabilir, raporları görür, ayarları değiştirebilir.
- **Personel:** Randevu, satış, müşteri işlemleri yapabilir. Raporlar ve ayarlar kısıtlıdır.

### Personel Yetki Düzenleme
📍 Nerede: **Sol Menü > Personel > Personel Detayı > Yetkiler**

### Çalışma Saatleri
📍 Nerede: **Sol Menü > Personel > Personel Detayı > Çalışma Saatleri**

---

## RAPORLAR MODÜLÜ
### Mevcut Raporlar
📍 Nerede: **Sol Menü > Raporlar**

1. **Gelir-Gider Raporu:** Belirli dönem için toplam gelir ve gider özeti.
   - **Sol Menü > Raporlar > Gelir-Gider Raporu**
2. **Referans Performans Raporu:** Hangi kanaldan kaç müşteri geldiği ve gelirleri.
   - **Sol Menü > Raporlar > Referans Performans**
3. **Müşteri Sadakat Analiz Raporu:** Müşterileri sıcaklık seviyesine göre sınıflandırır (sıcak/ılık/soğuk/kayıp). Kampanya önerileri içerir.
   - **Sol Menü > Raporlar > Müşteri Sadakat Analizi**

### Tarih Filtreleme
- Raporlarda bugün, dün, bu hafta, bu ay veya özel tarih aralığı seçilebilir.

---

## HİZMETLER MODÜLÜ
### Hizmet Ekleme
📍 Nerede: **Sol Menü > Hizmetler > Yeni Hizmet**
- Fiyat, süre, seans bazlı olup olmadığı belirlenir.
- Seans bazlı işaretlenirse kaç seans olduğu belirtilir.

### Hizmet Güncelleme
📍 Nerede: **Sol Menü > Hizmetler > Hizmet Detayı > Düzenle**
- Fiyat ve detaylar istediğiniz zaman güncellenebilir.
- Aktif satışlardaki tutarları etkilemez.

---

## GİDER MODÜLÜ
📍 Nerede: **Sol Menü > Giderler > Yeni Gider**
- Salon giderlerini (kira, malzeme, personel maaşı vb.) kayıt altına alın.
- Giderler Gelir-Gider raporuna yansır.

---

## İŞLETME AYARLARI
📍 Nerede: **Sol Menü > Ayarlar > İşletme Bilgileri**
- İşletme adı, adres, telefon, e-posta güncellenebilir.

### Profil Güncelleme
📍 Nerede: **Sol Menü > Ayarlar > Profil Bilgileri** veya sağ üst köşedeki profil ikonu

---

## ABONELIK VE PLAN
### Demo Hesap
- Demo hesap 30 gün geçerlidir.
- Demo süresince tüm özellikler kullanılabilir.
- Süre dolunca hesap askıya alınır; yükseltme için yönetici ile iletişime geçin.

### Plan Limitleri
- Her planın maksimum personel, müşteri, hizmet ve aylık randevu limiti vardır.
- Limit dolduğunda uyarı alırsınız.

---

## SIKÇA SORULAN SORULAR

S: Müşteri telefon numarasını değiştirebilir miyim?
C: Evet. **Sol Menü > Müşteriler > Müşteri Detayı > Düzenle** yolunu izleyin.

S: Silinmiş bir satışı geri alabilirim?
C: Silinen satışlar tamamen kaybolmaz. **Sol Menü > Satışlar** sayfasında "Silinmiş Satışları Göster" filtresini açarak görebilirsiniz.

S: Randevu hatırlatma SMS'i nasıl çalışır?
C: Sistem her gün belirli saatte yaklaşan randevular için müşterilere otomatik SMS gönderir. Ek bir işlem yapmanıza gerek yoktur.

S: Bir müşteriye nasıl kampanya SMS'i gönderebilirim?
C: **Sol Menü > Raporlar > Müşteri Sadakat Analizi** sayfasından "Kampanya Gönder" butonu kullanılabilir. Sadece pazarlama onayı vermiş müşterilere SMS gönderilebilir.

S: Taksit planı nasıl oluştururum?
C: **Sol Menü > Satışlar > Satış Detayı > Taksit Planı Oluştur** yolunu izleyin. Her taksit için tutar ve vade tarihi girin; toplam, satış tutarını aşmamalıdır.

S: Şifremi unuttum?
C: Giriş ekranındaki "Şifremi Unuttum" bağlantısını kullanabilirsiniz. Kayıtlı e-postanıza sıfırlama bağlantısı gönderilecektir.

S: Raporları dışa aktarabilir miyim?
C: Raporlar ekranından PDF veya Excel olarak indirme yapılabilir.

S: Birden fazla şubem olabilir mi?
C: Her şube için ayrı hesap oluşturulması gerekir. Çoklu şube yönetimi gelecek sürümlerde planlanmaktadır.

S: Yeni personel nasıl eklerim?
C: **Sol Menü > Personel > Yeni Personel** yolunu izleyin. Personele giriş hesabı açmak için kullanıcı adı ve şifre belirleyin.

S: Personelin yetkilerini nasıl kısıtlarım?
C: **Sol Menü > Personel > Personel Detayı > Yetkiler** sayfasından hangi modülleri görebileceğini ve hangi işlemleri yapabileceğini tek tek ayarlayabilirsiniz.
`;

/**
 * Kural tabanlı intent tespiti — DB veya AI'ya gitmeden önce hızlı yanıt
 */
export const QUICK_INTENTS = [
  {
    keywords: ['merhaba', 'selam', 'günaydın', 'iyi günler', 'nasılsın', 'hey'],
    reply: 'Merhaba! Ben GERAS Asistanı\'yım. Salon yönetim sisteminizle ilgili sorularınızda size yardımcı olabilirim. Ne öğrenmek istersiniz?'
  },
  {
    keywords: ['teşekkür', 'sağ ol', 'eyvallah', 'tamam anladım', 'oldu'],
    reply: 'Rica ederim! Başka bir sorunuz olursa buradayım.'
  },
  {
    keywords: ['görüşürüz', 'hoşça kal', 'bay bay', 'kapatıyorum'],
    reply: 'Görüşmek üzere! İyi çalışmalar dilerim.'
  }
];

/**
 * Güvenlik filtresi — AI yanıtından hassas bilgi temizle
 */
export const SECURITY_BLOCKED_PATTERNS = [
  /şifre\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /api[_\s]?key\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /bearer\s+[a-zA-Z0-9._-]+/gi,
];

export const sanitizeAIResponse = (text) => {
  let sanitized = text;
  SECURITY_BLOCKED_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[GİZLİ BİLGİ]');
  });
  return sanitized;
};
