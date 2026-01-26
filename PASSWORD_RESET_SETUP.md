# 🔐 Şifre Sıfırlama Sistemi Kurulum Rehberi

## 📋 Yapılan Değişiklikler

### 1. **Veritabanı Güncelleme**
- `Users` tablosuna şifre sıfırlama alanları eklendi:
  - `PasswordResetToken`: Şifre sıfırlama token'ı (hash'lenmiş)
  - `PasswordResetExpires`: Token'ın geçerlilik süresi

### 2. **Yeni Dosyalar**
- `src/utils/emailService.js`: Email gönderme servisi
- `prisma/migrations/add_password_reset_fields.sql`: Migration dosyası
- `PASSWORD_RESET_SETUP.md`: Bu dosya

### 3. **Güncellenen Dosyalar**
- `prisma/schema.prisma`: User model'ine yeni alanlar eklendi
- `src/controllers/authController.js`: Forgot/Reset password fonksiyonları eklendi
- `src/routes/authRoutes.js`: Yeni endpoint'ler eklendi

---

## 🚀 Kurulum Adımları

### 1️⃣ **Gerekli Paketleri Yükle**

```bash
npm install nodemailer
```

### 2️⃣ **Veritabanını Güncelle**

**Seçenek A: SQL Migration (Önerilen - Canlı DB için güvenli)**
```bash
npx prisma db execute --stdin < prisma/migrations/add_password_reset_fields.sql
```

**Seçenek B: Prisma Generate**
```bash
npx prisma generate
```

### 3️⃣ **Environment Variables Ekle**

`.env` dosyana şu satırları ekle:

```env
# Email Ayarları (Gmail örneği)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Frontend URL (şifre sıfırlama linki için)
FRONTEND_URL=http://localhost:3000

# Uygulama Adı
APP_NAME=GERAS SYSTEM
```

#### ⚙️ Gmail App Password Nasıl Alınır?

1. Google hesabınıza girin: https://myaccount.google.com/
2. "Security" > "2-Step Verification" aktif et
3. "App passwords" > Yeni uygulama şifresi oluştur
4. Oluşturulan şifreyi `EMAIL_PASSWORD` olarak kullan

---

## 📡 API Endpoint'leri

### 1. **Şifre Sıfırlama Talebi**

```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Şifre sıfırlama linki email adresinize gönderildi"
}
```

---

### 2. **Şifre Sıfırlama (Token ile)**

```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "a1b2c3d4e5f6...",
  "newPassword": "yeni-sifre-123"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Şifreniz başarıyla sıfırlandı. Şimdi yeni şifrenizle giriş yapabilirsiniz"
}
```

---

## 🎨 Frontend Entegrasyonu

### Login Sayfasında Şifre Sıfırlama Linki

```jsx
<form>
  <input type="email" placeholder="Email" />
  <input type="password" placeholder="Şifre" />
  <button type="submit">Giriş Yap</button>
  
  <a href="/forgot-password">Şifremi Unuttum</a>
</form>
```

### Forgot Password Sayfası

```jsx
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      setMessage(data.message);
      
    } catch (error) {
      setMessage('Bir hata oluştu');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <h2>Şifremi Unuttum</h2>
      <input 
        type="email" 
        placeholder="Email adresiniz"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit">Sıfırlama Linki Gönder</button>
      {message && <p>{message}</p>}
    </form>
  );
};
```

### Reset Password Sayfası

```jsx
const ResetPassword = () => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  
  useEffect(() => {
    // URL'den token'ı al
    const urlParams = new URLSearchParams(window.location.search);
    setToken(urlParams.get('token'));
  }, []);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setMessage('Şifreler eşleşmiyor');
      return;
    }
    
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setMessage('Şifreniz sıfırlandı! Giriş sayfasına yönlendiriliyorsunuz...');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setMessage(data.message);
      }
      
    } catch (error) {
      setMessage('Bir hata oluştu');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <h2>Yeni Şifre Oluştur</h2>
      <input 
        type="password" 
        placeholder="Yeni Şifre"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <input 
        type="password" 
        placeholder="Yeni Şifre (Tekrar)"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      <button type="submit">Şifremi Sıfırla</button>
      {message && <p>{message}</p>}
    </form>
  );
};
```

---

## 🔒 Güvenlik Özellikleri

### ✅ Uygulanan Güvenlik Önlemleri:

1. **Token Güvenliği:**
   - Crypto ile güvenli rastgele token oluşturma
   - Token SHA256 ile hash'lenerek saklanır
   - Token 1 saat sonra otomatik expire olur

2. **Enumeration Attack Koruması:**
   - Email bulunamasa bile "başarılı" mesajı döner
   - Saldırganlar hangi email'lerin kayıtlı olduğunu anlayamaz

3. **Rate Limiting:**
   - `authLimiter` middleware ile spam koruması
   - Aşırı istek engellenir

4. **Input Validasyonu:**
   - Email format kontrolü
   - Şifre uzunluk kontrolü (min 6 karakter)
   - Token geçerlilik kontrolü

5. **Database Güvenliği:**
   - Token'lar hash'li saklanır
   - Süre dolmuş token'lar kullanılamaz

---

## 🧪 Test Etme

### 1. Email Servisini Test Et

```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 2. Email'i Kontrol Et
- Gelen kutunuza bakın
- Spam klasörünü kontrol edin

### 3. Linke Tıklayın veya Token ile Test Edin

```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"BURAYA_TOKEN_GELECEK","newPassword":"yeni-sifre-123"}'
```

---

## 🐛 Sorun Giderme

### Email Gitmiyor?
1. `.env` dosyasındaki email ayarlarını kontrol et
2. Gmail kullanıyorsan "App Password" kullandığından emin ol
3. Firewall/Antivirus port 587'yi engelliyor olabilir
4. Console loglarını kontrol et

### Token Geçersiz Hatası?
1. Token'ın süresi 1 saat, dolmuş olabilir
2. Token doğru kopyalandı mı kontrol et
3. URL'de token tam olarak gelmiş mi bak

### Server Başlamıyor?
1. `npm install nodemailer` yaptığından emin ol
2. Prisma generate çalıştır: `npx prisma generate`
3. Migration'ı uygula

---

## 📧 Email Servisi Alternatifleri

### Gmail Yerine Başka Servisler:

**SendGrid:**
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
```

**Mailgun:**
```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=postmaster@your-domain.com
EMAIL_PASSWORD=your-mailgun-password
```

**AWS SES:**
```env
EMAIL_HOST=email-smtp.eu-west-1.amazonaws.com
EMAIL_PORT=587
EMAIL_USER=your-ses-smtp-username
EMAIL_PASSWORD=your-ses-smtp-password
```

---

## ✅ Kurulum Checklist

- [ ] `npm install nodemailer` yaptım
- [ ] `.env` dosyasına email ayarlarını ekledim
- [ ] Migration'ı çalıştırdım
- [ ] `npx prisma generate` yaptım
- [ ] Server'ı restart ettim
- [ ] Email servisi çalışıyor
- [ ] Forgot password endpoint test ettim
- [ ] Reset password endpoint test ettim
- [ ] Frontend entegrasyonunu yaptım

---

**Hazır! Artık kullanıcılar şifrelerini sıfırlayabilir! 🎉**
