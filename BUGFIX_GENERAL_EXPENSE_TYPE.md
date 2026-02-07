# 🐛 FIX: Gelir-Gider Raporunda "Diğer Giderler" Düzeltmesi

## Sorun
Database'de `general` tipinde giderler var ama API response'da `expenses.byType.other` değeri 0 dönüyordu.

## Neden
`reportController.js` içinde gider tipi gruplama yaparken:
- Sadece `staff` ve `vendor` tipleri doğru hesaplanıyordu
- `general` tipi doğrudan `expensesByType[expense.ExpenseType]` ile kaydediliyordu
- Ancak response formatında sadece `staff`, `vendor`, `other` gösterildiği için `general` görünmüyordu

## Çözüm
`general` tipindeki giderleri `other` kategorisine mapping yaptık:

```javascript
// Önceki Kod (HATALI)
if (expense.ExpenseType) {
  expensesByType[expense.ExpenseType] = (expensesByType[expense.ExpenseType] || 0) + amount;
}

// Yeni Kod (DÜZELTME)
if (expense.ExpenseType) {
  let expenseType = expense.ExpenseType;
  
  // "general" tipini "other" kategorisine map et
  if (expenseType === 'general') {
    expenseType = 'other';
  }
  
  // staff, vendor, other kategorilerine ata
  if (expenseType === 'staff' || expenseType === 'vendor' || expenseType === 'other') {
    expensesByType[expenseType] = (expensesByType[expenseType] || 0) + amount;
  } else {
    // Tanımlanmamış tipler de "other"a gitsin
    expensesByType.other += amount;
  }
} else {
  // ExpenseType null/undefined ise "other"a ata
  expensesByType.other += amount;
}
```

## Test Sonucu
✅ **Düzeltme Öncesi:**
```json
{
  "expenses": {
    "byType": {
      "staff": 13000,
      "vendor": 0,
      "other": 0  ❌ YANLIŞ
    }
  }
}
```

✅ **Düzeltme Sonrası:**
```json
{
  "expenses": {
    "byType": {
      "staff": 13000,
      "vendor": 0,
      "other": 9180  ✅ DOĞRU (general tipli giderler dahil)
    }
  }
}
```

## Ek İyileştirmeler
- ✅ Debug log'ları eklendi (console'da gider dağılımı görünüyor)
- ✅ Tanımlanmamış tüm gider tipleri `other` kategorisine yönlendiriliyor
- ✅ `null` veya `undefined` ExpenseType değerleri de `other` olarak işleniyor

## Etkilenen Endpoint
- `GET /api/reports/income-expense-summary`

## Tarih
2026-02-07

---

**Commit Message:**
```
fix: Map 'general' expense type to 'other' category in income-expense report

- general tipindeki giderler artık other kategorisinde görünüyor
- Undefined/null expense type'lar da other'a yönlendiriliyor
- Debug log'ları eklendi
```
