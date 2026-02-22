import { chatWithGemini, isGeminiActive } from '../utils/geminiService.js';
import { SYSTEM_KNOWLEDGE, QUICK_INTENTS, sanitizeAIResponse } from '../utils/chatKnowledge.js';
import AppError from '../utils/AppError.js';
import ErrorCodes from '../utils/errorCodes.js';

// ──────────────────────────────────────────────
//  Oturum hafızası (in-memory, process başına)
//  Her sessionId için son 10 mesaj tutulur.
// ──────────────────────────────────────────────
const sessions = new Map();
const SESSION_TTL_MS   = 30 * 60 * 1000; // 30 dakika
const MAX_HISTORY      = 10;             // çift (5 kullanıcı + 5 model)
const MAX_MSG_LENGTH   = 500;            // karakter limiti

// Eski oturumları periyodik temizle (bellek sızıntısı önlemi)
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions.entries()) {
    if (session.lastActivity < cutoff) sessions.delete(id);
  }
}, 10 * 60 * 1000); // 10 dakikada bir

// ──────────────────────────────────────────────
//  Güvenlik: hassas konular engellensin
// ──────────────────────────────────────────────
const BLOCKED_TOPICS = [
  'şifre', 'password', 'api key', 'token', 'veritabanı bağlantısı',
  'connection string', 'env', 'gizli anahtar', 'jwt secret',
  'database url', 'db_url', 'sql injection'
];

const isSensitiveQuery = (message) => {
  const lower = message.toLowerCase();
  return BLOCKED_TOPICS.some(topic => lower.includes(topic));
};

// ──────────────────────────────────────────────
//  Kural tabanlı hızlı yanıtlar
// ──────────────────────────────────────────────
const getQuickReply = (message) => {
  const lower = message.toLowerCase();
  for (const intent of QUICK_INTENTS) {
    if (intent.keywords.some(k => lower.includes(k))) {
      return intent.reply;
    }
  }
  return null;
};

// ──────────────────────────────────────────────
//  Sistem prompt'u oluştur
// ──────────────────────────────────────────────
const buildSystemPrompt = (user) => {
  const roleTr  = user.role === 'OWNER' ? 'Salon Sahibi' : 'Personel';
  const now     = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return `
Sen GERAS Salon Yönetim Sistemi'nin yapay zekâ destekli asistanısın.
Şu an ${user.username} (${roleTr}) ile konuşuyorsun.
Bugünün tarihi: ${now}

## GÖREVIN
- GERAS sisteminin nasıl kullanılacağını açıklamak
- Kullanıcının sorularını net ve kısa yanıtlamak
- Gerektiğinde ilgili sistem sayfasına yönlendirmek

## KESİN KURALLAR (ASLA ÇIĞNAMA)
1. Şifre, API key, token, veritabanı bağlantısı gibi güvenlik bilgilerini ASLA paylaşma
2. GERAS sistemi dışındaki konularda "Sadece GERAS ile ilgili konularda yardımcı olabilirim" de
3. Başka kullanıcıların verilerine erişim sağlayamazsın
4. Yanıtların TÜRKÇE olsun
5. Yanıtların kısa ve öz olsun (maksimum 4-5 cümle)
6. Gerektiğinde kullanıcıyı doğru sistem sayfasına yönlendir
7. ASLA İngilizce teknik terim kullanma: "STAFF" değil "personel", "OWNER" değil "salon sahibi/yönetici", "SCHEDULED" değil "planlandı", "COMPLETED" değil "tamamlandı", "PENDING" değil "bekliyor", "CASH" değil "nakit" de
8. Adım adım yönlendirme yaparken menü yolunu şu formatta göster: **Menü > Alt Menü > Buton** (örn: **Sol Menü > Satışlar > Taksit Planı Oluştur**)

## SİSTEM BİLGİSİ
${SYSTEM_KNOWLEDGE}

## YÖNLENDIRME KILAVUZU
Randevu sorusu   → /randevular sayfasına yönlendir
Satış sorusu     → /satislar sayfasına yönlendir
Müşteri sorusu   → /musteriler sayfasına yönlendir
Personel sorusu  → /personel sayfasına yönlendir
Rapor sorusu     → /raporlar sayfasına yönlendir
Hizmet sorusu    → /hizmetler sayfasına yönlendir
Taksit sorusu    → İlgili satışın detay sayfasına
`.trim();
};

// ──────────────────────────────────────────────
//  Ana chat endpoint
// ──────────────────────────────────────────────

/**
 * POST /api/chat
 * Body: { message: string, sessionId?: string }
 */
export const sendMessage = async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    const user = req.user;

    // ── Validasyon ──
    if (!message || !message.trim()) {
      return next(new AppError('Mesaj boş olamaz', 400, ErrorCodes.GENERAL_VALIDATION_ERROR));
    }

    const trimmed = message.trim().slice(0, MAX_MSG_LENGTH);

    // ── Güvenlik kontrolü ──
    if (isSensitiveQuery(trimmed)) {
      return res.json({
        success: true,
        reply: 'Bu konuda size yardımcı olamam. Güvenlik bilgileri sistem yöneticisi ile paylaşılmalıdır.',
        source: 'security_filter',
        sessionId: sessionId || null
      });
    }

    // ── Hızlı kural yanıtı ──
    const quickReply = getQuickReply(trimmed);
    if (quickReply) {
      return res.json({
        success: true,
        reply: quickReply,
        source: 'rule',
        sessionId: sessionId || null
      });
    }

    // ── AI hazır mı? ──
    if (!isGeminiActive()) {
      return res.json({
        success: true,
        reply: 'AI asistan şu an yapılandırılmamış. Lütfen sistem yöneticinizle iletişime geçin.',
        source: 'unavailable',
        sessionId: sessionId || null
      });
    }

    // ── Oturum geçmişini al / oluştur ──
    const sid = sessionId || `${user.id}_${Date.now()}`;

    if (!sessions.has(sid)) {
      sessions.set(sid, { history: [], lastActivity: Date.now() });
    }

    const session = sessions.get(sid);
    session.lastActivity = Date.now();

    // ── Gemini ile yanıt üret ──
    const systemPrompt = buildSystemPrompt(user);
    const result = await chatWithGemini(systemPrompt, session.history, trimmed);

    if (!result.success) {
      return res.json({
        success: false,
        reply: result.error || 'Bir hata oluştu. Lütfen tekrar deneyin.',
        source: result.rateLimited ? 'rate_limited' : 'ai_error',
        sessionId: sid
      });
    }

    const aiReply = sanitizeAIResponse(result.text);

    // ── Geçmişe ekle (son MAX_HISTORY mesaj) ──
    session.history.push({ role: 'user',  parts: [{ text: trimmed  }] });
    session.history.push({ role: 'model', parts: [{ text: aiReply  }] });

    if (session.history.length > MAX_HISTORY) {
      session.history = session.history.slice(-MAX_HISTORY);
    }

    return res.json({
      success: true,
      reply: aiReply,
      source: 'ai',
      sessionId: sid
    });

  } catch (err) {
    console.error('Chat hatası:', err);
    next(new AppError('Mesaj işlenemedi', 500, ErrorCodes.GENERAL_SERVER_ERROR));
  }
};

/**
 * DELETE /api/chat/session
 * Konuşma geçmişini sıfırla
 */
export const clearSession = async (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
  }
  res.json({ success: true, message: 'Konuşma sıfırlandı' });
};

/**
 * GET /api/chat/status
 * AI servis durumu
 */
export const getChatStatus = async (req, res) => {
  res.json({
    success: true,
    data: {
      aiEnabled: isGeminiActive(),
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      activeSessions: sessions.size
    }
  });
};
