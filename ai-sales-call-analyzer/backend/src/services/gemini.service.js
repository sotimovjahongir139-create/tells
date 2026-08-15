const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const env = require('../config/env');
const { analysisResultSchema } = require('../lib/analysisSchema');

// @google/genai ships as ESM; a dynamic import from this CommonJS file avoids
// the require()/ESM interop bug in its published "require" entry point.
let aiPromise;
async function getClient() {
  if (!aiPromise) {
    aiPromise = import('@google/genai').then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: env.geminiApiKey })
    );
  }
  return aiPromise;
}

const ANALYSIS_PROMPT = `
Sen tajribali sotuv menejerlarini baholovchi sun'iy intellekt tahlilchisisan.
Senga bitta sotuv qo'ng'irog'ining audio yozuvi beriladi. Sotuvchining ismi: Sotuvchi. Mijoz: Mijoz.

VAZIFA:
1. Audio asosida to'liq transkript tuzing, gapiruvchini aniqlang (Sotuvchi yoki Mijoz), har bir jumla uchun taxminiy vaqt belgisini (mm:ss) bering.
2. Suhbatni quyidagi mezonlar bo'yicha 0-100 ball bilan baholang: communication (muloqot), needDiscovery (ehtiyojni aniqlash), productPresentation (mahsulot taqdimoti), objectionHandling (e'tiroz bilan ishlash), closing (sotuvni yakunlash).
3. overallScore - yuqoridagi 5 ta ballning umumiy, vaznli o'rtacha bahosi (0-100).
4. Sotuvchining kuchli tomonlarini aniqlang (faqat suhbatda haqiqatan sodir bo'lgan holatlar).
5. Sotuvchining xatolarini aniqlang. Har bir xato uchun: category, severity (low/medium/high), description, evidence (transkriptdan aniq iqtibos), whyItIsWrong, recommendation, betterPhrase.
6. Agar biror xato yoki xulosa uchun yetarli dalil topa olmasangiz, "Dalil yetarli emas" deb yozing va HECH QACHON dalil yoki iqtibosni o'ylab topmang (fabricate qilmang).

MUHIM QOIDALAR:
- summary, customerNeed, customerObjection, customerIntent, strengths, mistakes ichidagi barcha matnlar, recommendation va betterPhrase — FAQAT o'zbek lotin alifbosida yozilishi shart. Kirill va rus tilidan foydalanmang.
- transcript ichidagi "text" maydoni suhbatda haqiqatda gapirilgan tildagi so'zlarni AYNAN o'zi bo'lishi kerak (tarjima qilmang, o'zgartirmang).
- Faqat quyidagi JSON formatida javob bering, boshqa hech qanday matn qo'shmang.

JSON FORMAT:
{
  "overallScore": number,
  "scores": {
    "communication": number,
    "needDiscovery": number,
    "productPresentation": number,
    "objectionHandling": number,
    "closing": number
  },
  "summary": string,
  "customerNeed": string,
  "customerObjection": string,
  "customerIntent": string,
  "strengths": [string],
  "mistakes": [
    {
      "category": string,
      "severity": "low" | "medium" | "high",
      "description": string,
      "evidence": string,
      "whyItIsWrong": string,
      "recommendation": string,
      "betterPhrase": string
    }
  ],
  "transcript": [
    { "speaker": "Sotuvchi" | "Mijoz", "timestamp": "mm:ss", "text": string }
  ]
}
`;

function guessMimeType(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
  };
  return map[ext] || 'audio/mpeg';
}

async function downloadRecording(recordingUrl) {
  const response = await axios.get(recordingUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const mimeType = guessMimeType(recordingUrl);
  const ext = mimeType === 'audio/wav' ? 'wav' : 'mp3';
  const tmpPath = path.join(os.tmpdir(), `call-${crypto.randomUUID()}.${ext}`);
  fs.writeFileSync(tmpPath, response.data);
  return { tmpPath, mimeType };
}

async function waitForFileActive(ai, fileName, { timeoutMs = 60000, intervalMs = 2000 } = {}) {
  const start = Date.now();
  let file = await ai.files.get({ name: fileName });
  while (file.state === 'PROCESSING') {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Audio fayl Gemini tomonidan tayyor bo\'lmadi (timeout).');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    file = await ai.files.get({ name: fileName });
  }
  if (file.state !== 'ACTIVE') {
    throw new Error(`Gemini audio faylni qabul qilmadi (holat: ${file.state}).`);
  }
  return file;
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

async function analyzeCallRecording(recordingUrl) {
  if (!env.geminiApiKey) {
    throw new Error('Gemini API kaliti sozlanmagan.');
  }

  const { tmpPath, mimeType } = await downloadRecording(recordingUrl);

  try {
    const ai = await getClient();
    const { createUserContent, createPartFromUri } = await import('@google/genai');

    const uploaded = await ai.files.upload({ file: tmpPath, config: { mimeType } });
    const activeFile = await waitForFileActive(ai, uploaded.name);

    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: createUserContent([
        createPartFromUri(activeFile.uri, activeFile.mimeType),
        ANALYSIS_PROMPT,
      ]),
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini javob bermadi.');
    }

    const parsedJson = extractJson(text);
    const validated = analysisResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new Error('Gemini javobi kutilgan JSON tuzilishiga mos kelmadi.');
    }

    return { result: validated.data, raw: parsedJson };
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}

module.exports = { analyzeCallRecording };
