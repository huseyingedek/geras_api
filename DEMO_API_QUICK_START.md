# 🚀 DEMO API - HIZLI BAŞLANGIÇ

## Endpoint
```
POST https://your-api-url.com/api/auth/create-demo
```

## Minimal Örnek (Kopya-Yapıştır Hazır)

```javascript
const createDemo = async (businessName, username, email, password) => {
  const response = await fetch('https://your-api-url.com/api/auth/create-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: businessName,
      businessType: 'SESSION_BASED',
      ownerUsername: username,
      ownerEmail: email,
      ownerPassword: password
    })
  });
  
  const data = await response.json();
  
  if (response.ok) {
    localStorage.setItem('token', data.token);
    window.location.href = '/dashboard';
  } else {
    alert(data.error.message);
  }
};

// Kullanım
createDemo('Salon ABC', 'ahmet123', 'ahmet@example.com', 'sifre123');
```

## Zorunlu Alanlar (5 tane)
```
✅ businessName      → İşletme adı
✅ businessType      → "SESSION_BASED" veya "NON_SESSION_BASED"  
✅ ownerUsername     → Kullanıcı adı (min 3 karakter)
✅ ownerEmail        → Email
✅ ownerPassword     → Şifre (min 6 karakter)
```

## Opsiyonel Alanlar
```
⚪ contactPerson     → İletişim kişisi
⚪ email             → İşletme email
⚪ phone             → İşletme telefon
⚪ ownerPhone        → Kullanıcı telefon
```

## Response
```json
{
  "status": "success",
  "token": "eyJhbGc...",
  "data": {
    "user": {
      "id": 123,
      "username": "ahmet123",
      "email": "ahmet@example.com",
      "role": "OWNER",
      "accountId": 45
    }
  }
}
```

## Ne Yapmalı?
1. Token'ı kaydet → `localStorage.setItem('token', data.token)`
2. Dashboard'a yönlendir → `window.location.href = '/dashboard'`

## Detaylı Dökümantasyon
📄 `DEMO_API_FOR_FRONTEND.md`

---

**API URL:** Canlıda güncellenecek  
**Token Süresi:** 1 gün  
**Demo Süresi:** 2 gün
