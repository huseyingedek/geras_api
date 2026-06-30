/**
 * ORTAK TARİH ARALIĞI ÇÖZÜMLEYİCİ
 * --------------------------------
 * Tüm raporlar (gelir-gider, referans, komisyon, gider, hizmet) bu fonksiyonu
 * kullanır. Böylece hepsi BİREBİR aynı gün sınırlarını üretir ve birbirleriyle
 * + satış listesi/dashboard ile uyuşur.
 *
 * Sunucu saati Türkiye (UTC+3) olduğu için yerel-gün sınırları kullanılır; bu,
 * uygulamanın geri kalanındaki (salesController.getDateRange, parseLocalDate,
 * dashboardController) mantıkla aynıdır. Türkiye'de DST olmadığından yerel gün
 * sınırları yıl boyunca tutarlıdır.
 *
 * Dönüş: { gte, lte, label, type }
 */

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Yerel (Türkiye) gün başlangıcı/sonu. m0 = 0-11 (JS ayı). Date taşması güvenli:
// gün 0 → önceki ayın son günü, gün -1 vb. doğru hesaplanır.
const dayStart = (y, m0, d) => new Date(y, m0, d, 0, 0, 0, 0);
const dayEnd   = (y, m0, d) => new Date(y, m0, d, 23, 59, 59, 999);

// Bir Date'in YEREL (Türkiye) gününü "YYYY-MM-DD" döndürür.
// Yanıttaki period.startDate/endDate için: toISOString() UTC'ye çevirip günü
// kaydırdığından (örn. 30 Haz → "2026-06-29") onun yerine bu kullanılır.
const ymdLocal = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// Farklı controller'lardaki dönem adlarını tek biçime indirger.
const normalizePeriod = (p) => {
  if (!p) return p;
  const map = {
    day: 'today',
    today: 'today',
    yesterday: 'yesterday',
    week: 'this_week', thisweek: 'this_week', this_week: 'this_week',
    lastweek: 'last_week', last_week: 'last_week',
    month: 'this_month', thismonth: 'this_month', this_month: 'this_month',
    lastmonth: 'last_month', last_month: 'last_month',
    last2months: 'last_2_months', last_2_months: 'last_2_months',
    thisyear: 'this_year', this_year: 'this_year'
  };
  return map[String(p).toLowerCase()] || p;
};

/**
 * @param {{ period?: string, startDate?: string, endDate?: string }} query
 * @returns {{ gte: Date, lte: Date, label: string, type: string }}
 */
export const resolveDateRange = ({ period, startDate, endDate } = {}) => {
  const withStrings = (r) => ({ ...r, startStr: ymdLocal(r.gte), endStr: ymdLocal(r.lte) });

  // 1) ÖZEL TARİH ARALIĞI — frontend Türkiye tarih stringi gönderir: "YYYY-MM-DD"
  if (startDate && endDate) {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const gte = dayStart(sy, sm - 1, sd);
    const lte = dayEnd(ey, em - 1, ed);
    const label = (sy === ey && sm === em)
      ? `${sd} - ${ed} ${MONTHS_TR[em - 1]} ${ey}`
      : `${sd} ${MONTHS_TR[sm - 1]} - ${ed} ${MONTHS_TR[em - 1]} ${ey}`;
    return withStrings({ gte, lte, label, type: 'custom' });
  }

  // 2) HAZIR DÖNEMLER — yerel (Türkiye) güne göre
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();   // 0-11
  const d = now.getDate();
  const dow = now.getDay();   // 0=Pazar
  const toMonday = dow === 0 ? 6 : dow - 1;

  let r;
  switch (normalizePeriod(period)) {
    case 'today':
      r = { gte: dayStart(y, m, d), lte: dayEnd(y, m, d), label: 'Bugün', type: 'today' }; break;
    case 'yesterday':
      r = { gte: dayStart(y, m, d - 1), lte: dayEnd(y, m, d - 1), label: 'Dün', type: 'yesterday' }; break;
    case 'this_week':
      r = { gte: dayStart(y, m, d - toMonday), lte: dayEnd(y, m, d), label: 'Bu Hafta', type: 'this_week' }; break;
    case 'last_week':
      r = { gte: dayStart(y, m, d - toMonday - 7), lte: dayEnd(y, m, d - toMonday - 1), label: 'Geçen Hafta', type: 'last_week' }; break;
    case 'this_month':
      r = { gte: dayStart(y, m, 1), lte: now, label: 'Bu Ay', type: 'this_month' }; break;
    case 'last_month':
      r = { gte: dayStart(y, m - 1, 1), lte: dayEnd(y, m, 0), label: 'Geçen Ay', type: 'last_month' }; break;
    case 'last_2_months':
      r = { gte: dayStart(y, m - 1, 1), lte: now, label: 'Son 2 Ay', type: 'last_2_months' }; break;
    case 'this_year':
      r = { gte: dayStart(y, 0, 1), lte: now, label: 'Bu Yıl', type: 'this_year' }; break;
    default:
      r = { gte: dayStart(y, m, 1), lte: now, label: 'Bu Ay', type: 'this_month' }; // Varsayılan: Bu Ay
  }
  return withStrings(r);
};

export default resolveDateRange;
