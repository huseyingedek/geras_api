# 🎁 DEMO HESAP OLUŞTURMA API - FRONTEND ENTEGRASYON REHBERİ

## 📡 API ENDPOINT

```
POST https://your-api-url.com/api/auth/create-demo
```

**Not:** Token gerektirmez (Public endpoint)

---

## 📝 REQUEST BODY

### Required (Zorunlu) Alanlar:

```javascript
{
  "businessName": "string",          // İşletme adı (zorunlu)
  "businessType": "string",          // "SESSION_BASED" veya "NON_SESSION_BASED"
  "ownerUsername": "string",         // Kullanıcı adı (zorunlu, min 3 karakter)
  "ownerEmail": "string",            // Email (zorunlu, geçerli email)
  "ownerPassword": "string"          // Şifre (zorunlu, min 6 karakter)
}
```

### Optional (Opsiyonel) Alanlar:

```javascript
{
  "contactPerson": "string",         // İletişim kişisi (opsiyonel)
  "email": "string",                 // İşletme email (opsiyonel)
  "phone": "string",                 // İşletme telefon (opsiyonel)
  "ownerPhone": "string"             // Kullanıcı telefon (opsiyonel)
}
```

---

## 💻 ÖRNEK REQUEST (JavaScript/Fetch)

```javascript
const createDemoAccount = async (formData) => {
  try {
    const response = await fetch('https://your-api-url.com/api/auth/create-demo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Zorunlu alanlar
        businessName: formData.businessName,
        businessType: formData.businessType || 'SESSION_BASED',
        ownerUsername: formData.ownerUsername,
        ownerEmail: formData.ownerEmail,
        ownerPassword: formData.ownerPassword,
        
        // Opsiyonel alanlar
        contactPerson: formData.contactPerson || null,
        email: formData.businessEmail || null,
        phone: formData.businessPhone || null,
        ownerPhone: formData.ownerPhone || null
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Başarılı
      return {
        success: true,
        token: data.token,
        user: data.data.user
      };
    } else {
      // Hata
      return {
        success: false,
        error: data.error || { message: 'Bir hata oluştu' }
      };
    }
  } catch (error) {
    return {
      success: false,
      error: { message: 'Sunucu ile bağlantı kurulamadı' }
    };
  }
};
```

---

## ✅ BAŞARILI RESPONSE (200 OK)

```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTIzLCJpYXQiOjE2NDI1ODk...",
  "data": {
    "user": {
      "id": 123,
      "username": "ahmetyilmaz",
      "email": "ahmet@example.com",
      "phone": "+90 532 999 88 77",
      "role": "OWNER",
      "accountId": 45
    }
  }
}
```

**Yapılacaklar:**
1. `token` değerini `localStorage` veya `sessionStorage`'a kaydet
2. `user` bilgisini state'e kaydet
3. Kullanıcıyı dashboard'a yönlendir

---

## ❌ HATA RESPONSE'LARI

### 1. Validasyon Hatası (400 Bad Request)

```json
{
  "status": "error",
  "error": {
    "code": "GENERAL_VALIDATION_ERROR",
    "message": "İşletme adı gereklidir"
  },
  "timestamp": "2026-02-15T10:30:00.000Z"
}
```

### 2. Email Zaten Kullanılıyor (400 Bad Request)

```json
{
  "status": "error",
  "error": {
    "code": "DB_DUPLICATE_ENTRY",
    "message": "Bu email adresi zaten kullanılmaktadır"
  }
}
```

### 3. Kullanıcı Email Zaten Var (400 Bad Request)

```json
{
  "status": "error",
  "error": {
    "code": "USER_ALREADY_EXISTS",
    "message": "Bu kullanıcı email adresi zaten kullanılmaktadır"
  }
}
```

---

## 🎨 REACT ÖRNEK KULLANIM

```javascript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function DemoSignupForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    businessName: '',
    businessType: 'SESSION_BASED',
    contactPerson: '',
    businessEmail: '',
    businessPhone: '',
    ownerUsername: '',
    ownerEmail: '',
    ownerPassword: '',
    ownerPhone: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('https://your-api-url.com/api/auth/create-demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          businessName: formData.businessName,
          businessType: formData.businessType,
          contactPerson: formData.contactPerson || null,
          email: formData.businessEmail || null,
          phone: formData.businessPhone || null,
          ownerUsername: formData.ownerUsername,
          ownerEmail: formData.ownerEmail,
          ownerPassword: formData.ownerPassword,
          ownerPhone: formData.ownerPhone || null
        })
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Token'ı kaydet
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        
        // Success mesajı
        alert('🎉 Demo hesabınız oluşturuldu! 2 gün boyunca tüm özellikleri kullanabilirsiniz.');
        
        // Dashboard'a yönlendir
        navigate('/dashboard');
      } else {
        // Hata mesajını göster
        setError(data.error?.message || 'Bir hata oluştu');
      }
    } catch (err) {
      setError('Sunucu ile bağlantı kurulamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}
      
      {/* İşletme Bilgileri */}
      <h3>İşletme Bilgileri</h3>
      
      <input
        type="text"
        placeholder="İşletme Adı *"
        value={formData.businessName}
        onChange={(e) => setFormData({...formData, businessName: e.target.value})}
        required
      />
      
      <select
        value={formData.businessType}
        onChange={(e) => setFormData({...formData, businessType: e.target.value})}
      >
        <option value="SESSION_BASED">Seanslı (Lazer, Masaj vb.)</option>
        <option value="NON_SESSION_BASED">Seansız (Kuaför, Berber)</option>
      </select>
      
      <input
        type="text"
        placeholder="İletişim Kişisi"
        value={formData.contactPerson}
        onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
      />
      
      <input
        type="email"
        placeholder="İşletme Email"
        value={formData.businessEmail}
        onChange={(e) => setFormData({...formData, businessEmail: e.target.value})}
      />
      
      <input
        type="tel"
        placeholder="İşletme Telefon"
        value={formData.businessPhone}
        onChange={(e) => setFormData({...formData, businessPhone: e.target.value})}
      />
      
      {/* Hesap Sahibi Bilgileri */}
      <h3>Hesap Sahibi Bilgileri</h3>
      
      <input
        type="text"
        placeholder="Kullanıcı Adı *"
        value={formData.ownerUsername}
        onChange={(e) => setFormData({...formData, ownerUsername: e.target.value})}
        minLength={3}
        required
      />
      
      <input
        type="email"
        placeholder="Email *"
        value={formData.ownerEmail}
        onChange={(e) => setFormData({...formData, ownerEmail: e.target.value})}
        required
      />
      
      <input
        type="password"
        placeholder="Şifre (min 6 karakter) *"
        value={formData.ownerPassword}
        onChange={(e) => setFormData({...formData, ownerPassword: e.target.value})}
        minLength={6}
        required
      />
      
      <input
        type="tel"
        placeholder="Telefon"
        value={formData.ownerPhone}
        onChange={(e) => setFormData({...formData, ownerPhone: e.target.value})}
      />
      
      <button type="submit" disabled={loading}>
        {loading ? 'Oluşturuluyor...' : '🎉 2 Günlük Ücretsiz Demo\'yu Başlat'}
      </button>
    </form>
  );
}

export default DemoSignupForm;
```

---

## 🎨 AXIOS ÖRNEK

```javascript
import axios from 'axios';

const API_URL = 'https://your-api-url.com/api';

export const createDemoAccount = async (formData) => {
  try {
    const response = await axios.post(`${API_URL}/auth/create-demo`, {
      businessName: formData.businessName,
      businessType: formData.businessType || 'SESSION_BASED',
      contactPerson: formData.contactPerson || null,
      email: formData.businessEmail || null,
      phone: formData.businessPhone || null,
      ownerUsername: formData.ownerUsername,
      ownerEmail: formData.ownerEmail,
      ownerPassword: formData.ownerPassword,
      ownerPhone: formData.ownerPhone || null
    });

    // Token'ı kaydet
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.data.user));

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || { message: 'Bir hata oluştu' }
    };
  }
};
```

---

## ⚙️ VALIDASYON KURALLARI

### İşletme Adı (businessName)
- ✅ Zorunlu
- ✅ Min 1 karakter

### İşletme Tipi (businessType)
- ✅ `SESSION_BASED` veya `NON_SESSION_BASED`
- ✅ Varsayılan: `SESSION_BASED`

### Kullanıcı Adı (ownerUsername)
- ✅ Zorunlu
- ✅ Min 3 karakter

### Email (ownerEmail)
- ✅ Zorunlu
- ✅ Geçerli email formatı
- ✅ Unique (başka kullanıcıda olmamalı)

### Şifre (ownerPassword)
- ✅ Zorunlu
- ✅ Min 6 karakter

### Telefon (phone, ownerPhone)
- ⚪ Opsiyonel
- ✅ Sadece rakam, +, -, boşluk, parantez içerebilir
- ✅ 10-15 rakam arası

---

## 🔐 TOKEN KULLANIMI

Demo hesap oluşturulduktan sonra dönen token'ı kullan:

```javascript
// Token'ı header'a ekle
const makeAuthenticatedRequest = async (endpoint) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`https://your-api-url.com/api${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.json();
};

// Örnek: Kullanıcı bilgilerini al
const getUserInfo = async () => {
  const data = await makeAuthenticatedRequest('/auth/me');
  console.log('User:', data.data.user);
  console.log('Account:', data.data.account);
};
```

---

## ⏰ DEMO SÜRESİ

- **Demo Süresi:** 2 gün (48 saat)
- **Başlangıç:** Hesap oluşturma anı
- **Bitiş:** 2 gün sonra otomatik
- **Durum:** `demoExpiresAt` alanında gösterilir

```javascript
// Kalan süreyi hesapla
const calculateRemainingTime = (demoExpiresAt) => {
  const now = new Date();
  const expires = new Date(demoExpiresAt);
  const diff = expires - now;
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return {
    hours,
    minutes,
    expired: diff <= 0
  };
};
```

---

## 🚨 HATA YÖNETİMİ

```javascript
const handleError = (error) => {
  const errorMessages = {
    'GENERAL_VALIDATION_ERROR': 'Lütfen tüm zorunlu alanları doldurun',
    'DB_DUPLICATE_ENTRY': 'Bu email adresi zaten kullanılıyor',
    'USER_ALREADY_EXISTS': 'Bu kullanıcı zaten kayıtlı',
    'GENERAL_SERVER_ERROR': 'Sunucu hatası. Lütfen daha sonra tekrar deneyin'
  };

  return errorMessages[error.code] || error.message || 'Bir hata oluştu';
};

// Kullanım
const errorMessage = handleError(data.error);
alert(errorMessage);
```

---

## 📋 CHECKLIST

Frontend developer için kontrol listesi:

- [ ] API URL doğru ayarlandı mı?
- [ ] Tüm zorunlu alanlar forma eklendi mi?
- [ ] Email validasyonu yapılıyor mu?
- [ ] Şifre min 6 karakter kontrolü var mı?
- [ ] Loading state gösteriliyor mu?
- [ ] Hata mesajları gösteriliyor mu?
- [ ] Token localStorage'a kaydediliyor mu?
- [ ] Başarılı kayıtta dashboard'a yönlendiriliyor mu?
- [ ] businessType seçimi var mı?
- [ ] Telefon formatı validasyonu yapılıyor mu? (opsiyonel ama önerilen)

---

## 🎁 BONUS: Form Validation Helper

```javascript
export const validateDemoForm = (formData) => {
  const errors = {};

  // İşletme adı
  if (!formData.businessName || formData.businessName.trim().length === 0) {
    errors.businessName = 'İşletme adı zorunludur';
  }

  // Kullanıcı adı
  if (!formData.ownerUsername || formData.ownerUsername.trim().length < 3) {
    errors.ownerUsername = 'Kullanıcı adı en az 3 karakter olmalıdır';
  }

  // Email
  if (!formData.ownerEmail) {
    errors.ownerEmail = 'Email zorunludur';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) {
    errors.ownerEmail = 'Geçerli bir email adresi giriniz';
  }

  // Şifre
  if (!formData.ownerPassword || formData.ownerPassword.length < 6) {
    errors.ownerPassword = 'Şifre en az 6 karakter olmalıdır';
  }

  // Telefon (opsiyonel ama geçerli olmalı)
  if (formData.businessPhone && !/^[0-9\s\-\+\(\)]+$/.test(formData.businessPhone)) {
    errors.businessPhone = 'Geçersiz telefon formatı';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Kullanım
const { isValid, errors } = validateDemoForm(formData);
if (!isValid) {
  setFormErrors(errors);
  return;
}
```

---

## 📞 DESTEK

Sorun olursa:
- Backend Developer: [senin adın]
- API Dokümantasyonu: `DEMO_ACCOUNT_API_DOCUMENTATION.md`
- Postman Collection: `DEMO_POSTMAN_COLLECTION.json`

---

**Hazırlanma Tarihi:** 15 Şubat 2026  
**API Versiyonu:** 2.0  
**Durum:** ✅ Production Hazır
