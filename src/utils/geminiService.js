import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const GEMINI_MODEL    = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const CHAT_ENABLED    = (process.env.CHAT_ENABLED || 'true').toLowerCase() === 'true';

let genAI = null;

if (GEMINI_API_KEY && GEMINI_API_KEY !== 'buraya_gemini_api_key_gir' && CHAT_ENABLED) {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('✅ Gemini AI servisi aktif');
  } catch (err) {
    console.error('❌ Gemini AI başlatılamadı:', err.message);
  }
} else {
  console.warn('⚠️ Gemini AI pasif — GEMINI_API_KEY eksik veya CHAT_ENABLED=false');
}

/**
 * Tek seferlik mesaj gönder (geçmiş olmadan)
 */
export const askGemini = async (systemPrompt, userMessage) => {
  if (!genAI) {
    return {
      success: false,
      error: 'AI servisi şu an aktif değil. Lütfen daha sonra tekrar deneyin.'
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.7,
      }
    });

    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Kullanıcı sorusu: ${userMessage}` }
    ]);

    const text = result.response.text();
    return { success: true, text };
  } catch (err) {
    console.error('Gemini API hatası:', err.message);
    return { success: false, error: 'AI şu an yanıt veremiyor.' };
  }
};

/**
 * Konuşma geçmişiyle mesaj gönder (çok turlu sohbet)
 * history: [{ role: 'user'|'model', parts: [{ text }] }]
 */
export const chatWithGemini = async (systemPrompt, history, userMessage) => {
  if (!genAI) {
    return {
      success: false,
      error: 'AI servisi şu an aktif değil. Lütfen daha sonra tekrar deneyin.'
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.6,
      }
    });

    const chat = model.startChat({ history });

    const result = await chat.sendMessage(userMessage);
    const text   = result.response.text();

    return { success: true, text };
  } catch (err) {
    console.error('Gemini chat hatası:', err.message);

    // 429 kota aşımı — kullanıcıya anlamlı mesaj döndür
    if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many Requests')) {
      return {
        success: false,
        rateLimited: true,
        error: 'AI asistan şu an yoğun. Lütfen birkaç saniye bekleyip tekrar deneyin.'
      };
    }

    return { success: false, error: 'AI şu an yanıt veremiyor. Lütfen tekrar deneyin.' };
  }
};

export const isGeminiActive = () => genAI !== null;
