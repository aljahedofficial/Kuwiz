const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');

const MAX_BATCH_SIZE = 50;
const MAX_EXTRACTED_CHARS = 30000;

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

async function generateWithGroq(prompt) {
  if (!process.env.GROQ_API_KEY) return null;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  return completion.choices[0]?.message?.content || null;
}

async function generateWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return null;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateWithOpenRouter(prompt) {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/aljahedofficial/Kuwiz',
      'X-Title': 'Kuwiz',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || null;
}

async function generateBatch(prompt) {
  const providers = [
    { name: 'Groq Cloud', fn: generateWithGroq },
    { name: 'Google Gemini', fn: generateWithGemini },
    { name: 'OpenRouter', fn: generateWithOpenRouter },
  ];

  let lastError = null;

  for (const provider of providers) {
    try {
      const text = await provider.fn(prompt);
      if (text) {
        const parsed = extractJsonFromText(text);
        if (parsed) {
          return { provider: provider.name, parsed };
        }
      }
    } catch (error) {
      lastError = error;
      console.warn(`${provider.name} failed:`, error.message);
    }
  }

  throw lastError || new Error('All AI providers failed or returned invalid JSON.');
}

function buildPrompt({ subject, language, batchStart, batchEnd, batchSize, extractedText }) {
  return `
You are an expert exam generator for the subject: ${subject}.
You must create exactly ${batchSize} multiple-choice questions for Batch covering Questions ${batchStart} to ${batchEnd}.

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
`.trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const subject = String(req.headers['x-subject'] || 'General Knowledge');
    const language = String(req.headers['x-language'] || 'English');
    const totalQuestions = Math.min(200, Math.max(30, Number(req.headers['x-question-count'] || 50)));
    const batchCount = getBatchCount(totalQuestions);

    const buffer = await readRequestBuffer(req);
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text.slice(0, MAX_EXTRACTED_CHARS).trim();

    if (!extractedText) {
      return res.status(400).json({ success: false, error: 'Could not extract readable text from the PDF.' });
    }

    const finalQuestions = [];
    let providerUsed = '';

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      const { start, end, count } = getBatchSize(totalQuestions, batchIndex);
      const prompt = buildPrompt({
        subject,
        language,
        batchStart: start,
        batchEnd: end,
        batchSize: count,
        extractedText,
      });

      const result = await generateBatch(prompt);
      providerUsed = result.provider;

      const normalized = normalizeQuestions(result.parsed, count);
      if (!normalized.length) {
        throw new Error(`Batch ${batchIndex + 1} returned invalid quiz data.`);
      }

      finalQuestions.push(...normalized);
    }

    return res.status(200).json({
      success: true,
      provider: providerUsed,
      batchCount,
      totalQuestions: finalQuestions.length,
      questions: finalQuestions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
