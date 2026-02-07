# 📊 GELİR-GİDER RAPOR SİSTEMİ

## Genel Bakış

Gelir-Gider rapor sistemi, işletmenizin finansal durumunu detaylı bir şekilde analiz etmenizi sağlar. Ay sonunda kasada ne kaldığını, kar/zarar durumunuzu kolayca görebilirsiniz.

---

## 🎯 Özellikler

### 1. **Gelir-Gider Özet Raporu**
- 💰 **Toplam Ciro (Gelir)**: Tamamlanan ödemelerin toplamı
- 💸 **Toplam Gider**: Tüm masrafların toplamı
- 📊 **Net Kar/Zarar**: Ciro - Gider
- 📈 **Kar Marjı %**: Kar/Zarar yüzdesi
- 🔍 **Detaylı Dökümler**: Gelir/gider kaynakları
- 📉 **Trend Analizi**: Önceki döneme göre karşılaştırma

### 2. **Detaylı Finansal Rapor**
- 📅 Günlük/haftalık/aylık kırılımlar
- 📈 Grafik ve chart'lar için hazır veri
- 🎨 Frontend entegrasyonu kolay

---

## 🚀 API Endpoint'leri

### Base URL
```
http://localhost:5000/api/reports
```

### 1. Gelir-Gider Özet Raporu

**Endpoint:**
```
GET /api/reports/income-expense-summary
```

**Yetki:** OWNER, ADMIN

**Query Parametreleri:**

| Parametre | Tip | Açıklama | Örnek |
|-----------|-----|----------|-------|
| `period` | string | Hazır periyot seçenekleri | `this_month` |
| `startDate` | string | Custom başlangıç (YYYY-MM-DD) | `2026-01-01` |
| `endDate` | string | Custom bitiş (YYYY-MM-DD) | `2026-01-31` |

**Period Seçenekleri:**
- `today` - Bugün
- `yesterday` - Dün
- `this_week` - Bu hafta
- `last_week` - Geçen hafta
- `this_month` - Bu ay ⭐ (en çok kullanılan)
- `last_month` - Geçen ay
- `this_year` - Bu yıl

---

## 📝 Kullanım Örnekleri

### Örnek 1: Bu Ayın Raporu
```bash
curl -X GET "http://localhost:5000/api/reports/income-expense-summary?period=this_month" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalIncome": 45000.00,
      "totalExpenses": 18000.00,
      "netProfit": 27000.00,
      "profitMargin": 60.00,
      "status": "profit",
      "formatted": {
        "totalIncome": "45.000,00 TL",
        "totalExpenses": "18.000,00 TL",
        "netProfit": "27.000,00 TL",
        "profitMargin": "%60,00"
      }
    },
    "income": {
      "total": 45000.00,
      "count": 87,
      "byPaymentMethod": {
        "cash": 25000.00,
        "creditCard": 15000.00,
        "transfer": 5000.00,
        "other": 0.00
      }
    },
    "expenses": {
      "total": 18000.00,
      "count": 23,
      "byType": {
        "staff": 12000.00,
        "vendor": 5000.00,
        "other": 1000.00
      },
      "byCategory": {
        "Maaşlar": 12000.00,
        "Malzeme": 4000.00,
        "Kira": 2000.00
      }
    },
    "trends": {
      "income": {
        "previous": 40000.00,
        "current": 45000.00,
        "change": 12.50,
        "direction": "up"
      },
      "profit": {
        "previous": 22000.00,
        "current": 27000.00,
        "change": 22.73,
        "direction": "up"
      }
    },
    "period": {
      "label": "Bu Ay",
      "type": "this_month",
      "startDate": "2026-02-01",
      "endDate": "2026-02-07"
    }
  }
}
```

### Örnek 2: Custom Tarih Aralığı (Ocak Ayı)
```bash
curl -X GET "http://localhost:5000/api/reports/income-expense-summary?startDate=2026-01-01&endDate=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Örnek 3: Geçen Ay (Ay Sonu Değerlendirmesi)
```bash
curl -X GET "http://localhost:5000/api/reports/income-expense-summary?period=last_month" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Detaylı Finansal Rapor (Timeline)

**Endpoint:**
```
GET /api/reports/detailed-financial
```

**Query Parametreleri:**

| Parametre | Tip | Açıklama | Varsayılan |
|-----------|-----|----------|------------|
| `period` | string | Periyot | - |
| `startDate` | string | Başlangıç | - |
| `endDate` | string | Bitiş | - |
| `groupBy` | string | Gruplama: day/week/month | `day` |

### Örnek: Günlük Kırılım (Bu Ay)
```bash
curl -X GET "http://localhost:5000/api/reports/detailed-financial?period=this_month&groupBy=day" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "timeline": [
      {
        "date": "2026-02-01",
        "income": 1500.00,
        "expenses": 500.00,
        "profit": 1000.00
      },
      {
        "date": "2026-02-02",
        "income": 2000.00,
        "expenses": 800.00,
        "profit": 1200.00
      }
    ],
    "groupBy": "day",
    "period": {
      "startDate": "2026-02-01",
      "endDate": "2026-02-07"
    }
  }
}
```

---

## 🎨 Frontend Kullanımı

### React Örneği

```javascript
// API çağrısı
const fetchIncomeExpenseSummary = async (period = 'this_month') => {
  const response = await fetch(
    `http://localhost:5000/api/reports/income-expense-summary?period=${period}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  return await response.json();
};

// Kullanım
const ReportDashboard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchIncomeExpenseSummary('this_month').then(setData);
  }, []);

  if (!data) return <div>Yükleniyor...</div>;

  const { summary } = data.data;

  return (
    <div className="report-card">
      <h2>Finansal Durum - {data.data.period.label}</h2>
      
      <div className="summary">
        <div className="metric">
          <label>Toplam Ciro</label>
          <span className="amount positive">
            {summary.formatted.totalIncome}
          </span>
        </div>

        <div className="metric">
          <label>Toplam Gider</label>
          <span className="amount negative">
            {summary.formatted.totalExpenses}
          </span>
        </div>

        <div className="metric">
          <label>Net {summary.status === 'profit' ? 'Kar' : 'Zarar'}</label>
          <span className={`amount ${summary.status === 'profit' ? 'positive' : 'negative'}`}>
            {summary.formatted.netProfit}
          </span>
        </div>

        <div className="metric">
          <label>Kar Marjı</label>
          <span className="percentage">
            {summary.formatted.profitMargin}
          </span>
        </div>
      </div>

      {/* Trend göstergeleri */}
      <div className="trends">
        <div className="trend">
          <span>Gelir Değişimi:</span>
          <span className={data.data.trends.income.direction === 'up' ? 'up' : 'down'}>
            {data.data.trends.income.direction === 'up' ? '↑' : '↓'} 
            %{Math.abs(data.data.trends.income.change).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};
```

---

## 🔐 Güvenlik

- ✅ Sadece **OWNER** ve **ADMIN** rolündeki kullanıcılar erişebilir
- ✅ JWT token zorunlu
- ✅ Account bazlı veri izolasyonu

---

## 📌 Notlar

1. **Gelir Hesaplama**: Sadece **COMPLETED** durumundaki ödemeler dahil edilir
2. **Gider Hesaplama**: Tüm giderler (ödenen/ödenmeyen) dahil edilir
3. **Tarih Formatı**: YYYY-MM-DD (örn: 2026-02-07)
4. **Para Birimi**: TRY (Türk Lirası)
5. **Timezone**: UTC (backend'de)

---

## ❓ Sık Sorulan Sorular

### Ay sonunda kasada ne kaldı?
```bash
GET /api/reports/income-expense-summary?period=this_month
```
Response'daki `summary.netProfit` değeri kasadaki durumu gösterir.

### Geçen ay ile karşılaştırma?
```bash
GET /api/reports/income-expense-summary?period=last_month
```
Response'daki `trends` objesi önceki döneme göre değişimi gösterir.

### Belirli bir tarih aralığı?
```bash
GET /api/reports/income-expense-summary?startDate=2026-01-15&endDate=2026-02-15
```

---

## 🐛 Hata Kodları

| Kod | Açıklama |
|-----|----------|
| 401 | Yetkisiz erişim (token geçersiz) |
| 403 | Yetki yok (OWNER/ADMIN değil) |
| 500 | Sunucu hatası |

---

## 📞 Destek

Herhangi bir sorun için backend loglarını kontrol edin:
```bash
npm run dev
```

Loglar konsola detaylı bilgi verir.
