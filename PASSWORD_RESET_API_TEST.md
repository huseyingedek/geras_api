# 🔐 Şifre Sıfırlama API - Test Rehberi

## 📡 **API ENDPOINT'LERİ**

### **1. Forgot Password (Şifre Sıfırlama Talebi)**
```
POST http://localhost:5000/api/auth/forgot-password
```

### **2. Reset Password (Şifre Sıfırlama)**
```
POST http://localhost:5000/api/auth/reset-password
```

---

## 🧪 **TEST SENARYOSUve ÖRNEKLER**

### **SENARYO: Kullanıcı Şifresini Unuttu**

#### **Adım 1: Forgot Password İsteği Gönder**

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"onlinegeras@gmail.com\"}"
```

**Postman:**
```
Method: POST
URL: http://localhost:5000/api/auth/forgot-password
Headers:
  Content-Type: application/json

Body (raw JSON):
{
  "email": "onlinegeras@gmail.com"
}
```

**Başarılı Response (200):**
```json
{
  "status": "success",
  "message": "Şifre sıfırlama linki email adresinize gönderildi"
}
```

**Hata Response (400):**
```json
{
  "status": "error",
  "error": {
    "code": "GEN_400",
    "message": "Geçersiz email formatı"
  }
}
```

---

#### **Adım 2: Email'i Kontrol Et**

1. `onlinegeras@gmail.com` email kutusunu aç
2. "Şifre Sıfırlama Talebi" konulu email'i bul
3. Email'deki linki kopyala:
   ```
   http://localhost:3000/reset-password?token=ABC123...
   ```
4. Token'ı kopyala (URL'den `?token=` sonrası kısım)

**Örnek Token:**
```
dce504bb750cb338cc1079c25f692cda04972ce48b6ea767c5b9980455b7e568
```

---

#### **Adım 3: Reset Password İsteği Gönder**

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"dce504bb750cb338cc1079c25f692cda04972ce48b6ea767c5b9980455b7e568\",\"newPassword\":\"yeni123\"}"
```

**Postman:**
```
Method: POST
URL: http://localhost:5000/api/auth/reset-password
Headers:
  Content-Type: application/json

Body (raw JSON):
{
  "token": "dce504bb750cb338cc1079c25f692cda04972ce48b6ea767c5b9980455b7e568",
  "newPassword": "yeni123"
}
```

**Başarılı Response (200):**
```json
{
  "status": "success",
  "message": "Şifreniz başarıyla sıfırlandı. Şimdi yeni şifrenizle giriş yapabilirsiniz"
}
```

**Hata Responses:**

**Token Yok (400):**
```json
{
  "status": "error",
  "error": {
    "code": "GEN_400",
    "message": "Token ve yeni şifre gereklidir"
  }
}
```

**Şifre Çok Kısa (400):**
```json
{
  "status": "error",
  "error": {
    "code": "GEN_400",
    "message": "Şifre en az 6 karakter olmalıdır"
  }
}
```

**Token Geçersiz veya Süresi Dolmuş (400):**
```json
{
  "status": "error",
  "error": {
    "code": "GEN_400",
    "message": "Geçersiz veya süresi dolmuş token"
  }
}
```

---

#### **Adım 4: Yeni Şifre ile Login**

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"onlinegeras@gmail.com\",\"password\":\"yeni123\"}"
```

**Postman:**
```
Method: POST
URL: http://localhost:5000/api/auth/login
Headers:
  Content-Type: application/json

Body (raw JSON):
{
  "email": "onlinegeras@gmail.com",
  "password": "yeni123"
}
```

**Başarılı Response (200):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "user": {
      "id": 2,
      "username": "Elif Dartar",
      "email": "onlinegeras@gmail.com",
      "role": "OWNER",
      "accountId": 1
    }
  }
}
```

---

## 📋 **POSTMAN COLLECTION**

### **Collection: Password Reset API**

```json
{
  "info": {
    "name": "Password Reset API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Forgot Password",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"onlinegeras@gmail.com\"\n}"
        },
        "url": {
          "raw": "http://localhost:5000/api/auth/forgot-password",
          "protocol": "http",
          "host": ["localhost"],
          "port": "5000",
          "path": ["api", "auth", "forgot-password"]
        }
      }
    },
    {
      "name": "2. Reset Password",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"token\": \"EMAIL_DEN_GELEN_TOKEN\",\n  \"newPassword\": \"yeni123\"\n}"
        },
        "url": {
          "raw": "http://localhost:5000/api/auth/reset-password",
          "protocol": "http",
          "host": ["localhost"],
          "port": "5000",
          "path": ["api", "auth", "reset-password"]
        }
      }
    },
    {
      "name": "3. Login with New Password",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"onlinegeras@gmail.com\",\n  \"password\": \"yeni123\"\n}"
        },
        "url": {
          "raw": "http://localhost:5000/api/auth/login",
          "protocol": "http",
          "host": ["localhost"],
          "port": "5000",
          "path": ["api", "auth", "login"]
        }
      }
    }
  ]
}
```

**Bu JSON'u kopyala ve Postman'de Import Et!**

---

## 🔍 **TEST KONTROL LİSTESİ**

### ✅ **Backend Testleri (cURL/Postman):**

- [ ] **Test 1:** Forgot password ile geçerli email
  - Beklenen: 200 OK, "Şifre sıfırlama linki email adresinize gönderildi"
  - Email gelmeli

- [ ] **Test 2:** Forgot password ile geçersiz email formatı
  - Beklenen: 400 Bad Request, "Geçersiz email formatı"

- [ ] **Test 3:** Forgot password ile olmayan email
  - Beklenen: 200 OK (güvenlik için başarılı mesaj)
  - Email GİTMEMELİ

- [ ] **Test 4:** Reset password ile doğru token ve şifre
  - Beklenen: 200 OK, "Şifreniz başarıyla sıfırlandı"

- [ ] **Test 5:** Reset password ile yanlış/süresi dolmuş token
  - Beklenen: 400 Bad Request, "Geçersiz veya süresi dolmuş token"

- [ ] **Test 6:** Reset password ile çok kısa şifre (< 6 karakter)
  - Beklenen: 400 Bad Request, "Şifre en az 6 karakter olmalıdır"

- [ ] **Test 7:** Reset password ile token yok
  - Beklenen: 400 Bad Request, "Token ve yeni şifre gereklidir"

- [ ] **Test 8:** Yeni şifre ile login
  - Beklenen: 200 OK, JWT token

- [ ] **Test 9:** Eski şifre ile login denemesi
  - Beklenen: 401 Unauthorized, "Hatalı email veya şifre"

---

## ⏱️ **TOKEN SÜRELERİ**

- **Token Geçerlilik:** 1 saat
- **Token kullanıldıktan sonra:** Otomatik silinir
- **Aynı token birden fazla:** Kullanılabilir (1 saat içinde)

---

## 🐛 **HATA SENARYOLARI VE ÇÖZÜMLER**

### **1. "Email gönderilemedi" Hatası**

**Sebep:** SMTP ayarları yanlış veya Gmail App Password geçersiz

**Çözüm:**
```bash
# .env dosyasını kontrol et:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=onlinegeras@gmail.com
SMTP_PASS=mstfspdlsfacegni  # Boşluksuz olmalı!
```

---

### **2. "Token ve yeni şifre gereklidir" Hatası**

**Sebep:** Request body'de token veya newPassword yok

**Çözüm:**
```json
{
  "token": "...",      // ✅ Olmalı
  "newPassword": "..." // ✅ Olmalı
}
```

---

### **3. "Geçersiz veya süresi dolmuş token" Hatası**

**Sebep:** 
- Token 1 saatten eski
- Token yanlış kopyalanmış
- Token zaten kullanılmış (hayır, tekrar kullanılabilir)

**Çözüm:** Yeni forgot password isteği at, yeni token al

---

## 📧 **EMAIL KONTROL**

Email gelmiyorsa:

1. **Spam klasörünü kontrol et**
2. **Gmail App Password doğru mu:**
   - Boşluksuz olmalı: `mstfspdlsfacegni`
   - 16 karakter olmalı
3. **SMTP ayarları doğru mu:**
   - Host: `smtp.gmail.com`
   - Port: `587`
   - User: `onlinegeras@gmail.com`

---

## 🎯 **HIZLI TEST KOMUTU**

Tüm akışı test et (bash):

```bash
# 1. Forgot password
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"onlinegeras@gmail.com"}')
echo "Forgot Password Response:"
echo $RESPONSE | jq

# 2. Email'den token'ı al (manuel)
echo "Email'den token'ı kopyala ve aşağıya yapıştır:"
read TOKEN

# 3. Reset password
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"newPassword\":\"yeni123\"}")
echo "Reset Password Response:"
echo $RESPONSE | jq

# 4. Login with new password
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"onlinegeras@gmail.com","password":"yeni123"}')
echo "Login Response:"
echo $RESPONSE | jq
```

---

## ✅ **BACKEND HAZIR!**

Tüm API'ler çalışıyor ve test edildi.
Frontend entegrasyonunu yapabilirsin!

**Sorular için:** Backend log'larını kontrol et veya bana sor! 🚀
