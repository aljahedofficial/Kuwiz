const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');

const MAX_BATCH_SIZE = 50;
const MAX_EXTRACTED_CHARS = 30000;
const BATCH_CONTEXT_CHARS = 7000;

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getBatchCount(totalQuestions) {
  return Math.max(1, Math.ceil(totalQuestions / MAX_BATCH_SIZE));
}

function getBatchSize(totalQuestions, batchIndex) {
  const start = batchIndex * MAX_BATCH_SIZE + 1;
  const end = Math.min(totalQuestions, start + MAX_BATCH_SIZE - 1);
  return { start, end, count: end - start + 1 };
}

function extractJsonFromText(text) {
  if (!text) return null;

  const cleaned = text.replace(/```json|```/gi, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = cleaned.slice(start, end + 1);
      return JSON.parse(slice);
    }
  }

  return null;
}

function normalizeQuestions(payload, expectedCount) {
  const source = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.questions)
      ? payload.questions
      : payload && Array.isArray(payload.data)
        ? payload.data
        : [];

  return source
    .filter(Boolean)
    .slice(0, expectedCount)
    .map((item, index) => ({
      question: String(item.question || '').trim(),
      options: Array.isArray(item.options) ? item.options.map((option) => String(option)) : [],
      answerIndex: Number.isInteger(item.answerIndex) ? item.answerIndex : Number(item.answerIndex) || 0,
      explanation: String(item.explanation || '').trim(),
      batchQuestionNumber: index + 1,
    }))
    .filter((item) => item.question && item.options.length >= 4);
}

function splitIntoSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 30);
}

function extractKeywords(text, limit = 8) {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has', 'had', 'not', 'you',
    'your', 'into', 'their', 'they', 'them', 'his', 'her', 'its', 'will', 'would', 'about', 'which', 'what', 'when',
    'where', 'who', 'whom', 'why', 'how', 'also', 'can', 'could', 'should', 'may', 'might', 'must', 'shall', 'been',
    'এর', 'এবং', 'এই', 'ও', 'কে', 'কি', 'কী', 'কেন', 'কখন', 'কোথায়', 'কোন', 'যে', 'তার', 'তাদের', 'তিনি', 'তারা', 'ছিল'
  ]);

  const words = String(text || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2);

  const counts = new Map();
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (stopWords.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function getBatchContext(text, batchIndex, batchCount) {
  const content = String(text || '');
  if (!content) return '';
  if (content.length <= BATCH_CONTEXT_CHARS) return content;

  const totalWindows = Math.max(1, batchCount);
  const windowStart = Math.floor((batchIndex / totalWindows) * Math.max(1, content.length - BATCH_CONTEXT_CHARS));
  return content.slice(windowStart, windowStart + BATCH_CONTEXT_CHARS);
}

function buildOfflineQuestions({ extractedText, language, batchStart, count }) {
  const sentences = splitIntoSentences(extractedText);
  const keywords = extractKeywords(extractedText, Math.max(12, count));
  const availableCount = Math.max(
    1,
    Math.min(
      count,
      sentences.length > 0 ? sentences.length : count,
      Math.max(1, Math.ceil(extractedText.length / 250))
    )
  );
  const questions = [];

  for (let i = 0; i < availableCount; i += 1) {
    const sentence = sentences[(batchStart - 1 + i) % Math.max(sentences.length, 1)] || '';
    const keyword = keywords[(batchStart - 1 + i) % Math.max(keywords.length, 1)] || 'the topic';
    const nextKeyword = keywords[(batchStart + i) % Math.max(keywords.length, 1)] || 'a related concept';
    const prevKeyword = keywords[(batchStart - 2 + i + keywords.length) % Math.max(keywords.length, 1)] || 'related topic';
    const altKeyword = keywords[(batchStart + i + 3) % Math.max(keywords.length, 1)] || 'main idea';
    const shortSentence = sentence.length > 140 ? `${sentence.slice(0, 137)}...` : sentence;
    const lowerLanguage = language.toLowerCase();
    const correctPosition = (batchStart + i) % 4;

    const baseQuestion = lowerLanguage === 'bangla'
      ? `নিচের অংশটি কোন ধারণাটির সাথে সবচেয়ে বেশি সম্পর্কিত?\n\n${shortSentence}`
      : `Which idea is most closely related to the following excerpt?\n\n${shortSentence}`;

    const correctOption = lowerLanguage === 'bangla'
      ? `ডকুমেন্টে উল্লিখিত ${keyword}`
      : `The document mentions ${keyword}`;

    const optionsPool = lowerLanguage === 'bangla'
      ? [
          correctOption,
          `এটি ${nextKeyword} ধারণার ভিন্ন ব্যাখ্যা`,
          `${prevKeyword} সম্পর্কিত কিন্তু প্রসঙ্গভিত্তিক নয়`,
          `${altKeyword} নয়, বরং অন্য একটি বিষয়`,
        ]
      : [
          correctOption,
          `A different explanation about ${nextKeyword}`,
          `A nearby but context-mismatched point on ${prevKeyword}`,
          `A different topic focused on ${altKeyword}`,
        ];

    const options = [
      optionsPool[0],
      optionsPool[1],
      optionsPool[2],
      optionsPool[3],
    ];

    if (correctPosition !== 0) {
      const rotated = options.slice();
      const [correct] = rotated.splice(0, 1);
      rotated.splice(correctPosition, 0, correct);
      options.splice(0, options.length, ...rotated);
    }

    questions.push({
      question: baseQuestion,
      options,
      answerIndex: correctPosition,
      explanation: lowerLanguage === 'bangla'
        ? `এই অংশটি ${keyword} বিষয়টি নির্দেশ করে।`
        : `This excerpt points to ${keyword}.`,
    });
  }

  return questions;
}

async function generateWithGroq(prompt) {
  if (!process.env.GROQ_API_KEY) return null;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const models = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = completion.choices[0]?.message?.content || null;
      if (content) return content;
    } catch (error) {
      lastError = new Error(`Groq model ${model} failed: ${error.message}`);
    }
  }

  throw lastError || new Error('Groq returned no usable content.');
}

async function generateWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ];

  let lastError = null;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) return text;
    } catch (error) {
      lastError = new Error(`Gemini model ${modelName} failed: ${error.message}`);
    }
  }

  throw lastError || new Error('Gemini returned no usable content.');
}

async function generateWithOpenRouter(prompt) {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const models = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
  ];

  let lastError = null;

  for (const model of models) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/aljahedofficial/Kuwiz',
        'X-Title': 'Kuwiz',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      lastError = new Error(`OpenRouter model ${model} returned ${response.status}: ${bodyText.slice(0, 240)}`);
      continue;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || null;
    if (content) {
      return content;
    }
  }

  throw lastError || new Error('OpenRouter did not return usable content.');
}

function getProviderAvailability() {
  return {
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  };
}

async function generateBatch(prompt) {
  const providers = [
    { name: 'Groq Cloud', fn: generateWithGroq },
    { name: 'Google Gemini', fn: generateWithGemini },
    { name: 'OpenRouter', fn: generateWithOpenRouter },
  ];

  const attempts = [];
  let lastError = null;

  for (const provider of providers) {
    try {
      const text = await provider.fn(prompt);
      if (text) {
        const parsed = extractJsonFromText(text);
        if (parsed) {
          return { provider: provider.name, parsed, attempts };
        }

        attempts.push({ provider: provider.name, status: 'invalid-json' });
        lastError = new Error(`${provider.name} returned non-JSON content.`);
        continue;
      }

      attempts.push({ provider: provider.name, status: 'empty-response' });
    } catch (error) {
      lastError = error;
      attempts.push({ provider: provider.name, status: 'error', message: error.message });
      console.warn(`${provider.name} failed:`, error.message);
    }
  }

  return { provider: 'Offline Fallback', parsed: null, error: lastError, attempts };
}

function buildPrompt({ language, batchStart, batchEnd, batchSize, extractedText }) {
  return `
You are an expert exam generator.
You must create up to ${batchSize} high-quality multiple-choice questions for Batch covering Questions ${batchStart} to ${batchEnd}.

Language requirement: write the quiz in ${language}.
If the PDF contains Bangla, English, or mixed text, preserve the original language where relevant.
Preserve mathematical symbols, formulas, inequalities, subscripts, superscripts, and special characters exactly when they appear or are needed.

Source text:
${extractedText}

Rules:
- Return ONLY valid JSON.
- Do NOT wrap the JSON in markdown.
- Return an array of objects with this schema:
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answerIndex": 0,
    "explanation": "Short explanation"
  }
]
- Every question must be original.
- Each question must have 4 options.
- answerIndex must be 0, 1, 2, or 3.
- Keep explanations short and clear.
- Do not repeat questions across batches.
- If the source text is too small, return as many strong questions as possible instead of padding with weak or repeated items.
`.trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const language = String(req.headers['x-language'] || 'English');
    const totalQuestions = Math.min(300, Math.max(5, Number(req.headers['x-question-count'] || 50)));
    const batchCount = getBatchCount(totalQuestions);
    const providerAvailability = getProviderAvailability();

    const buffer = await readRequestBuffer(req);
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text.slice(0, MAX_EXTRACTED_CHARS).trim();

    if (!extractedText) {
      return res.status(400).json({ success: false, error: 'Could not extract readable text from the PDF.' });
    }

    const finalQuestions = [];
    const allProviderAttempts = [];
    let providerUsed = '';

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      const { start, end, count } = getBatchSize(totalQuestions, batchIndex);
      const batchContext = getBatchContext(extractedText, batchIndex, batchCount);
      const prompt = buildPrompt({
        language,
        batchStart: start,
        batchEnd: end,
        batchSize: count,
        extractedText: batchContext,
      });

      const result = await generateBatch(prompt);
      providerUsed = result.provider;
      allProviderAttempts.push({ batch: batchIndex + 1, attempts: result.attempts || [] });

      const normalized = result.parsed
        ? normalizeQuestions(result.parsed, count)
        : buildOfflineQuestions({
            extractedText,
            language,
            batchStart: start,
            count,
          });

      if (!normalized.length) {
        throw new Error(`Batch ${batchIndex + 1} returned invalid quiz data.`);
      }

      finalQuestions.push(...normalized);
    }

    return res.status(200).json({
      success: true,
      provider: providerUsed,
      fallback: providerUsed === 'Offline Fallback',
      providerAvailability,
      providerAttempts: allProviderAttempts,
      batchCount,
      extractedCharCount: extractedText.length,
      totalQuestions: finalQuestions.length,
      requestedQuestions: totalQuestions,
      questions: finalQuestions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      providerAvailability: getProviderAvailability(),
    });
  }
};
