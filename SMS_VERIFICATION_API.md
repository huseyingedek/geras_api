# 📱 SMS DOĞRULAMA API DÖKÜMANTASYONU

## GENEL BAKIŞ

İşletme hesabı açılırken telefon numarası doğrulaması yapılır. 2 adımlı süreç:

1. **SMS Kodu Gönderme**: Telefon numarasına 6 haneli kod gönderilir
2. **Kod Doğrulama**: Kullanıcı kodu girer, sistem doğrular
3. **Demo Hesap Oluşturma**: Doğrulanmış telefon ile hesap açılır

---

## 📤 1. SMS DOĞRULAMA KODU GÖNDER

### Endpoint
```
POST /api/auth/send-verification-code
```

### Request Body
```json
{
  "phone": "+905551234567"
}
```

### Response (Başarılı)
```json
{
  "status": "success",
  "message": "Doğrulama kodu telefonunuza gönderildi",
  "data": {
    "phone": "+905551234567",
    "expiresAt": "2026-02-15T12:35:00.000Z",
    "code": "123456"  // Sadece development'ta görünür
  }
}
```

### Response (Hata)
```json
{
  "status": "error",
  "message": "Geçersiz telefon numarası formatı",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

### Telefon Numarası Formatları
- `+905551234567` (Uluslararası)
- `05551234567` (Ulusal)
- `5551234567` (0 olmadan)
- `905551234567` (Ülke kodu ile)

### Özellikler
- Kod **5 dakika** geçerlidir
- Aynı numara için yeni kod istenirse eski kod silinir
- Kod 6 haneli rakamlardan oluşur

---

## ✅ 2. SMS KODUNU DOĞRULA

### Endpoint
```
POST /api/auth/verify-code
```

### Request Body
```json
{
  "phone": "+905551234567",
  "code": "123456"
}
```

### Response (Başarılı)
```json
{
  "status": "success",
  "message": "Telefon numarası başarıyla doğrulandı",
  "data": {
    "phone": "+905551234567",
    "verified": true
  }
}
```

### Response (Hata - Geçersiz Kod)
```json
{
  "status": "error",
  "message": "Geçersiz doğrulama kodu",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

### Response (Hata - Süre Dolmuş)
```json
{
  "status": "error",
  "message": "Doğrulama kodu süresi dolmuş. Lütfen yeni kod isteyin",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

---

## 🎯 3. DEMO HESAP OLUŞTUR (SMS Doğrulamalı)

### Endpoint
```
POST /api/auth/create-demo
```

### Request Body
```json
{
  "businessName": "Güzellik Salonu X",
  "contactPerson": "Ahmet Yılmaz",
  "email": "info@salonx.com",
  "phone": "+905551234567",
  "businessType": "SESSION_BASED",
  "ownerUsername": "ahmet",
  "ownerEmail": "ahmet@example.com",
  "ownerPassword": "SecurePass123!",
  "ownerPhone": "+905551234567"
}
```

### Response (Başarılı)
```json
{
  "status": "success",
  "message": "Demo hesabınız başarıyla oluşturuldu. 2 gün boyunca tüm özellikleri deneyebilirsiniz",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "account": {
      "id": 42,
      "businessName": "Güzellik Salonu X",
      "subscriptionPlan": "DEMO",
      "demoExpiresAt": "2026-02-17T10:30:00.000Z",
      "demoStatus": "ACTIVE"
    },
    "owner": {
      "id": 123,
      "username": "ahmet",
      "email": "ahmet@example.com",
      "role": "OWNER"
    }
  }
}
```

### Response (Hata - Telefon Doğrulanmamış)
```json
{
  "status": "error",
  "message": "Telefon numarası doğrulanmamış. Lütfen önce SMS doğrulaması yapın",
  "code": "GENERAL_VALIDATION_ERROR"
}
```

---

## 🎨 FRONTEND IMPLEMENTASYON ÖRNEĞİ

### 1. SMS Gönderme Sayfası

```html
<form id="phoneForm">
  <label>Telefon Numarası:</label>
  <input 
    type="tel" 
    id="phone" 
    placeholder="+90 555 123 45 67"
    required
  />
  <button type="submit">Kod Gönder</button>
  <div id="phoneError" class="error"></div>
</form>

<div id="codeSection" style="display: none;">
  <label>Doğrulama Kodu:</label>
  <input 
    type="text" 
    id="code" 
    placeholder="6 haneli kod"
    maxlength="6"
    pattern="\d{6}"
    required
  />
  <button onclick="verifyCode()">Doğrula</button>
  <div id="codeError" class="error"></div>
  <p id="timer">Kalan süre: 5:00</p>
</div>
```

### 2. JavaScript Kodu

```javascript
const API_URL = 'http://localhost:5000/api/auth';
let currentPhone = '';
let expiresAt = null;

// 1. SMS Kodu Gönder
document.getElementById('phoneForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const phone = document.getElementById('phone').value.trim();
  const errorDiv = document.getElementById('phoneError');
  
  try {
    const response = await fetch(`${API_URL}/send-verification-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      currentPhone = phone;
      expiresAt = new Date(data.data.expiresAt);
      
      // Kod girişi bölümünü göster
      document.getElementById('codeSection').style.display = 'block';
      document.getElementById('phoneForm').style.display = 'none';
      
      // Geri sayımı başlat
      startTimer();
      
      // Development için (production'da kaldır!)
      if (data.data.code) {
        console.log('Doğrulama Kodu:', data.data.code);
      }
      
      alert('Doğrulama kodu telefonunuza gönderildi!');
    } else {
      errorDiv.textContent = data.message || 'Bir hata oluştu';
    }
  } catch (error) {
    errorDiv.textContent = 'Bağlantı hatası. Lütfen tekrar deneyin.';
    console.error(error);
  }
});

// 2. Kodu Doğrula
async function verifyCode() {
  const code = document.getElementById('code').value.trim();
  const errorDiv = document.getElementById('codeError');
  
  if (code.length !== 6) {
    errorDiv.textContent = 'Lütfen 6 haneli kodu girin';
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone: currentPhone,
        code: code
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      alert('Telefon numarası doğrulandı! ✅');
      // Demo hesap formuna yönlendir
      window.location.href = '/demo-signup?verified=true&phone=' + encodeURIComponent(currentPhone);
    } else {
      errorDiv.textContent = data.message || 'Geçersiz kod';
    }
  } catch (error) {
    errorDiv.textContent = 'Bağlantı hatası. Lütfen tekrar deneyin.';
    console.error(error);
  }
}

// 3. Geri Sayım Timer
function startTimer() {
  const timerDiv = document.getElementById('timer');
  
  const interval = setInterval(() => {
    const now = new Date();
    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    
    if (remaining <= 0) {
      clearInterval(interval);
      timerDiv.textContent = 'Kod süresi doldu. Yeni kod isteyin.';
      timerDiv.style.color = 'red';
      return;
    }
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerDiv.textContent = `Kalan süre: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// 4. Yeni Kod İste
function requestNewCode() {
  document.getElementById('codeSection').style.display = 'none';
  document.getElementById('phoneForm').style.display = 'block';
  document.getElementById('code').value = '';
}
```

### 3. Demo Hesap Formu (Doğrulama Sonrası)

```javascript
// URL'den doğrulanmış telefonu al
const urlParams = new URLSearchParams(window.location.search);
const verifiedPhone = urlParams.get('phone');
const isVerified = urlParams.get('verified') === 'true';

if (!isVerified || !verifiedPhone) {
  alert('Önce telefon doğrulaması yapmalısınız');
  window.location.href = '/verify-phone';
}

// Demo hesap oluştur
document.getElementById('demoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = {
    businessName: document.getElementById('businessName').value,
    contactPerson: document.getElementById('contactPerson').value,
    email: document.getElementById('email').value,
    phone: verifiedPhone, // Doğrulanmış telefon
    businessType: document.getElementById('businessType').value,
    ownerUsername: document.getElementById('ownerUsername').value,
    ownerEmail: document.getElementById('ownerEmail').value,
    ownerPassword: document.getElementById('ownerPassword').value,
    ownerPhone: verifiedPhone // Doğrulanmış telefon
  };
  
  try {
    const response = await fetch(`${API_URL}/create-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      // Token'ı kaydet
      localStorage.setItem('token', data.data.token);
      
      // Dashboard'a yönlendir
      alert('Demo hesabınız oluşturuldu! 2 gün süreyle tüm özellikleri deneyebilirsiniz.');
      window.location.href = '/dashboard';
    } else {
      alert(data.message || 'Hesap oluşturulamadı');
    }
  } catch (error) {
    alert('Bağlantı hatası. Lütfen tekrar deneyin.');
    console.error(error);
  }
});
```

---

## 🔐 GÜVENLİK ÖNEMLERİ

1. **Rate Limiting**: Her endpoint authLimiter ile korunmuştur
2. **Kod Süresi**: 5 dakika sonra otomatik olarak geçersiz olur
3. **Tek Kullanımlık**: Doğrulanmış kod tekrar kullanılamaz
4. **Telefon Validasyonu**: Numara formatı kontrol edilir
5. **Database Temizlik**: Eski kodlar otomatik silinir

---

## 📊 AKIŞ DİYAGRAMI

```
┌─────────────────┐
│ 1. Telefon Gir  │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 2. SMS Gönder   │  ← Backend: Code oluştur + SMS gönder
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 3. Kodu Gir     │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 4. Kod Doğrula  │  ← Backend: Code kontrol + verify
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 5. Demo Form    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 6. Hesap Oluştur│  ← Backend: Phone verified kontrol
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 7. Dashboard    │  ← 2 günlük demo başlar
└─────────────────┘
```

---

## 🧪 TEST SENARYOLARI

### 1. Başarılı Akış
```bash
# 1. SMS Gönder
curl -X POST http://localhost:5000/api/auth/send-verification-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567"}'

# 2. Kodu Doğrula
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567", "code": "123456"}'

# 3. Demo Hesap Oluştur
curl -X POST http://localhost:5000/api/auth/create-demo \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Salon",
    "contactPerson": "Test User",
    "email": "test@salon.com",
    "phone": "+905551234567",
    "ownerUsername": "testowner",
    "ownerEmail": "owner@test.com",
    "ownerPassword": "Test123!",
    "ownerPhone": "+905551234567"
  }'
```

### 2. Hata Senaryoları

**Geçersiz Telefon:**
```bash
curl -X POST http://localhost:5000/api/auth/send-verification-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "abc123"}'
# Hata: "Geçersiz telefon numarası formatı"
```

**Yanlış Kod:**
```bash
curl -X POST http://localhost:5000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+905551234567", "code": "999999"}'
# Hata: "Geçersiz doğrulama kodu"
```

**Doğrulanmamış Telefon ile Demo:**
```bash
curl -X POST http://localhost:5000/api/auth/create-demo \
  -H "Content-Type: application/json" \
  -d '{"ownerPhone": "+905559999999", ...}'
# Hata: "Telefon numarası doğrulanmamış"
```

---

## 📝 NOTLAR

1. **Development Modu**: .env'de `NODE_ENV=development` ise SMS kodu response'da görünür
2. **Production Modu**: Gerçek SMS servisi aktif olmalı (İletiBilgi credentials)
3. **Kod Temizliği**: Eski kodlar yeni kod istendiğinde otomatik silinir
4. **Telefon Format**: Backend otomatik olarak +90 formatına çevirir

---

## 🚀 HIZLI BAŞLANGIÇ

1. Migration çalıştır:
```bash
npx prisma db push
npx prisma generate
```

2. SMS servisini aktive et (.env):
```env
ILETIBILGI_ENABLED=true
ILETIBILGI_API_URL=your_api_url
ILETIBILGI_USERNAME=your_username
ILETIBILGI_PASSWORD=your_password
ILETIBILGI_SENDER=your_sender_name
```

3. Sunucuyu başlat:
```bash
npm run dev
```

4. Frontend'i test et: Yukarıdaki HTML/JS kodunu kullan

---

## ❓ SSS

**S: SMS gönderilmiyor, ne yapmalıyım?**  
C: .env dosyasında `ILETIBILGI_ENABLED=true` olduğundan ve credentials'ların doğru olduğundan emin olun.

**S: Kod süresi doldu, ne yapmalıyım?**  
C: "Yeni Kod İste" butonuyla yeni kod isteyin.

**S: Telefon numarası nasıl formatlanmalı?**  
C: +90, 0, veya direkt 5 ile başlayabilir. Backend otomatik düzenler.

**S: Demo hesap için SMS şart mı?**  
C: Evet, güvenlik için telefon doğrulaması zorunludur.
