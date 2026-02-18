// 🎯 GERAS SYSTEM - SUBSCRIPTION PLAN ÖZELLİKLERİ
// Frontend'de paket kontrolü için kullanılır

/**
 * Abonelik Paketleri ve Özellikleri
 */

export const SUBSCRIPTION_PLANS = {
  DEMO: {
    id: 'DEMO',
    name: 'Demo',
    displayName: '🎁 Demo (30 Gün)',
    price: 0,
    duration: '30 gün',
    features: {
      accounts: 'unlimited',
      staff: 'unlimited',
      clients: 'unlimited',
      appointments: 'unlimited',
      services: 'unlimited',
      reports: {
        basic: true,
        advanced: true,
        export: true,
        custom: true
      },
      sms: 50,
      permissions: true,
      referenceTracking: true,
      expenseManagement: true,
      multipleLocations: true,
      financialReports: true,
      sessionTracking: true,
      apiAccess: true,
      prioritySupport: false,
      customization: false,
      branchReporting: true
    },
    limits: {
      maxStaff: null,
      maxClients: null,
      maxAppointmentsPerMonth: null,
      maxServices: null
    }
  },

  STARTER: {
    id: 'STARTER',
    name: 'Başlangıç',
    displayName: '🚀 Başlangıç Paketi',
    price: 799,
    currency: 'TRY',
    duration: 'aylık',
    features: {
      accounts: 1,
      staff: 2,
      clients: 100,
      appointments: 'unlimited',
      services: 'unlimited',
      reports: {
        basic: true,
        advanced: false,
        export: false
      },
      sms: 50, // Aylık dahil SMS
      permissions: false, // Personel yetkilendirme yok
      referenceTracking: false,
      expenseManagement: false,
      multipleLocations: false,
      financialReports: false
    },
    limits: {
      maxStaff: 2,
      maxClients: 100,
      maxAppointmentsPerMonth: null, // Sınırsız
      maxServices: null // Sınırsız
    }
  },

  PROFESSIONAL: {
    id: 'PROFESSIONAL',
    name: 'Profesyonel',
    displayName: '⭐ Profesyonel Paket',
    price: 1299,
    currency: 'TRY',
    duration: 'aylık',
    popular: true, // En popüler paket
    features: {
      accounts: 1,
      staff: 5,
      clients: 'unlimited',
      appointments: 'unlimited',
      services: 'unlimited',
      reports: {
        basic: true,
        advanced: true,
        export: true // Excel/PDF
      },
      sms: 200, // Aylık dahil SMS
      permissions: true, // ✅ Personel yetkilendirme
      referenceTracking: true, // ✅ Referans kaynağı takibi
      expenseManagement: true, // ✅ Gelir-Gider yönetimi
      multipleLocations: false,
      financialReports: true, // ✅ Detaylı finansal raporlar
      sessionTracking: true // ✅ Seans bazlı hizmetler
    },
    limits: {
      maxStaff: 5,
      maxClients: null, // Sınırsız
      maxAppointmentsPerMonth: null,
      maxServices: null
    }
  },

  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    displayName: '💎 Premium Paket',
    price: 2199,
    currency: 'TRY',
    duration: 'aylık',
    features: {
      accounts: 'unlimited', // Çoklu şube
      staff: 'unlimited',
      clients: 'unlimited',
      appointments: 'unlimited',
      services: 'unlimited',
      reports: {
        basic: true,
        advanced: true,
        export: true,
        custom: true // Özel raporlar
      },
      sms: 500, // Aylık dahil SMS
      permissions: true,
      referenceTracking: true,
      expenseManagement: true,
      multipleLocations: true, // ✅ Çoklu şube yönetimi
      financialReports: true,
      sessionTracking: true,
      apiAccess: true, // ✅ API erişimi
      prioritySupport: true, // ✅ Öncelikli destek
      customization: true, // ✅ Özel geliştirme talepleri
      branchReporting: true // ✅ Şube bazlı raporlama
    },
    limits: {
      maxStaff: null, // Sınırsız
      maxClients: null,
      maxAppointmentsPerMonth: null,
      maxServices: null,
      maxLocations: null // Sınırsız şube
    }
  }
};

/**
 * Paket karşılaştırma tablosu
 */
export const FEATURE_COMPARISON = [
  {
    category: 'Temel Özellikler',
    features: [
      { name: 'İşletme Hesabı', demo: 'Sınırsız', starter: '1', professional: '1', premium: 'Sınırsız' },
      { name: 'Personel Sayısı', demo: 'Sınırsız', starter: '2', professional: '5', premium: 'Sınırsız' },
      { name: 'Müşteri Sayısı', demo: 'Sınırsız', starter: '100', professional: 'Sınırsız', premium: 'Sınırsız' },
      { name: 'Randevu Sayısı', demo: 'Sınırsız', starter: 'Sınırsız', professional: 'Sınırsız', premium: 'Sınırsız' },
      { name: 'Dahil SMS', demo: '50', starter: '50', professional: '200', premium: '500' }
    ]
  },
  {
    category: 'Yönetim Özellikleri',
    features: [
      { name: 'Randevu Yönetimi', demo: true, starter: true, professional: true, premium: true },
      { name: 'Müşteri Yönetimi', demo: true, starter: true, professional: true, premium: true },
      { name: 'Satış Takibi', demo: true, starter: true, professional: true, premium: true },
      { name: 'Personel Yetkilendirme', demo: true, starter: false, professional: true, premium: true },
      { name: 'Gelir-Gider Yönetimi', demo: true, starter: false, professional: true, premium: true },
      { name: 'Referans Takibi', demo: true, starter: false, professional: true, premium: true }
    ]
  },
  {
    category: 'Raporlama',
    features: [
      { name: 'Temel Dashboard', demo: true, starter: true, professional: true, premium: true },
      { name: 'Gelişmiş Raporlar', demo: true, starter: false, professional: true, premium: true },
      { name: 'Excel/PDF Export', demo: true, starter: false, professional: true, premium: true },
      { name: 'Özel Raporlar', demo: true, starter: false, professional: false, premium: true },
      { name: 'Şube Raporları', demo: true, starter: false, professional: false, premium: true }
    ]
  },
  {
    category: 'İleri Özellikler',
    features: [
      { name: 'Çoklu Şube Yönetimi', demo: true, starter: false, professional: false, premium: true },
      { name: 'API Erişimi', demo: true, starter: false, professional: false, premium: true },
      { name: 'Öncelikli Destek', demo: false, starter: false, professional: false, premium: true },
      { name: 'Özel Geliştirme', demo: false, starter: false, professional: false, premium: true }
    ]
  }
];

/**
 * Kullanıcının pakete göre özellik erişimi kontrolü
 * @param {string} plan - Kullanıcının subscription planı
 * @param {string} feature - Kontrol edilecek özellik
 * @returns {boolean} - Erişim var mı?
 */
export const hasFeature = (plan, feature) => {
  if (!plan || !SUBSCRIPTION_PLANS[plan]) {
    return false;
  }

  const planFeatures = SUBSCRIPTION_PLANS[plan].features;
  
  // Nested feature kontrolü (örn: "reports.advanced")
  if (feature.includes('.')) {
    const [parent, child] = feature.split('.');
    return planFeatures[parent]?.[child] === true;
  }

  return planFeatures[feature] === true || planFeatures[feature] === 'unlimited';
};

/**
 * Kullanıcının limiti kontrolü
 * @param {string} plan - Kullanıcının subscription planı
 * @param {string} limitType - Limit tipi (maxStaff, maxClients, vb.)
 * @param {number} currentValue - Mevcut değer
 * @returns {boolean} - Limit aşıldı mı?
 */
export const checkLimit = (plan, limitType, currentValue) => {
  if (!plan || !SUBSCRIPTION_PLANS[plan]) {
    return false; // Limit yok varsayalım
  }

  const limit = SUBSCRIPTION_PLANS[plan].limits[limitType];
  
  // Sınırsız ise
  if (limit === null || limit === undefined) {
    return true; // Limit yok, devam edebilir
  }

  return currentValue < limit;
};

/**
 * Paket yükseltme önerisi
 * @param {string} currentPlan - Mevcut plan
 * @returns {string|null} - Önerilen üst paket
 */
export const suggestUpgrade = (currentPlan) => {
  const planOrder = ['DEMO', 'STARTER', 'PROFESSIONAL', 'PREMIUM'];
  const currentIndex = planOrder.indexOf(currentPlan);
  
  if (currentIndex === -1 || currentIndex === planOrder.length - 1) {
    return null; // En üst pakette
  }

  return planOrder[currentIndex + 1];
};

/**
 * Paket fiyat karşılaştırması
 * @param {string} plan - Plan ID
 * @returns {object} - Fiyat detayları
 */
export const getPlanPricing = (plan) => {
  if (!SUBSCRIPTION_PLANS[plan]) {
    return null;
  }

  const planData = SUBSCRIPTION_PLANS[plan];
  
  return {
    monthly: planData.price,
    yearly: planData.price * 10, // 2 ay hediye
    currency: planData.currency || 'TRY',
    discount: planData.price > 0 ? Math.round((2 / 12) * 100) : 0 // %17 yıllık indirim
  };
};

/**
 * Frontend'de özellik gösterimi için
 */
export const PLAN_COLORS = {
  DEMO: '#95a5a6',
  STARTER: '#3498db',
  PROFESSIONAL: '#9b59b6',
  PREMIUM: '#e74c3c'
};

export const PLAN_ICONS = {
  DEMO: '🎁',
  STARTER: '🚀',
  PROFESSIONAL: '⭐',
  PREMIUM: '💎'
};

export default {
  SUBSCRIPTION_PLANS,
  FEATURE_COMPARISON,
  hasFeature,
  checkLimit,
  suggestUpgrade,
  getPlanPricing,
  PLAN_COLORS,
  PLAN_ICONS
};
