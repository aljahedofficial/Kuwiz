# Kuwiz

Kuwiz is a free personal PDF-to-quiz web app.

## What it does
- Upload one PDF
- Choose between 30 and 200 questions
- Generate quizzes in batches of up to 50 questions
- Support Bangla, English, and mixed text
- Preserve mathematical symbols and notation
- Fail over across free AI providers when possible

## Project Structure
- `index.html` — main web app UI
- `styles.css` — app styling
- `app.js` — client-side quiz flow
- `api/generate.js` — serverless PDF parsing and batch question generation
- `PROJECT_PLAN.md` — project blueprint

## Environment Variables
Set these in Vercel:
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

## Current Status
This is the first working build of the app. The next step is to refine the quiz flow, strengthen response validation, and improve batching behavior.
