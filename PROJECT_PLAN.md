# Kuwiz Project Plan

## Goal
Build a free, personal web app that turns one uploaded PDF into an interactive quiz.

## Core Requirements
- Upload a single PDF.
- Let the user choose the quiz size from 30 to 200 questions.
- Generate questions in batches to avoid AI token exhaustion.
- Support both Bangla and English text.
- Support mathematical symbols, equations, and special notation.
- Run as a web app and stay fully free to use where possible.

## Batch Strategy
Use a fixed batch size of 50 questions.

### Batch Rules
- 30 to 50 questions: 1 batch
- 51 to 100 questions: 2 batches
- 101 to 150 questions: 3 batches
- 151 to 200 questions: 4 batches

### Example
If the user selects 100 questions:
- Batch 1: Questions 1 to 50
- Batch 2: Questions 51 to 100

If the user selects 200 questions:
- Batch 1: Questions 1 to 50
- Batch 2: Questions 51 to 100
- Batch 3: Questions 101 to 150
- Batch 4: Questions 151 to 200

## Suggested Free Architecture
### Frontend
- Simple modern web UI
- PDF upload control
- Question count selector
- Language selector: Bangla / English / Mixed
- Quiz rendering screen
- Score summary screen

### Backend
- Serverless API endpoint for quiz generation
- PDF text extraction
- Batch-based prompt generation
- JSON validation and cleanup
- Provider fallback if one API fails or rate-limits

### Free/Low-Cost Options
- PDF parsing in serverless API
- Free-tier LLM APIs with fallback
- Host on Vercel or a similar free platform

## Recommended Generation Flow
1. User uploads one PDF.
2. User selects quiz size.
3. App extracts text from the PDF.
4. App splits the request into batches.
5. Each batch is sent to the AI separately.
6. Results are validated and combined.
7. The combined quiz is shown in the browser.

## Content Requirements
- Questions should be original.
- Options should be clear and unique.
- Answers should be correct and indexed.
- Explanations should be brief.
- Bangla and English text should render correctly.
- Math expressions should preserve symbols and formatting as much as possible.

## Implementation Phases
### Phase 1: Planning
- Finalize UI flow
- Finalize data schema
- Finalize batch logic
- Finalize fallback strategy

### Phase 2: Frontend
- Build upload form
- Build quiz display screens
- Build results screen
- Add language and question count selectors

### Phase 3: Backend
- Add PDF parsing
- Add batch generation logic
- Add provider failover
- Add response validation

### Phase 4: Polish
- Improve Bangla support
- Improve math rendering
- Add loading and error states
- Improve quiz navigation

### Phase 5: Deployment
- Prepare GitHub repository
- Connect to Vercel
- Add environment variables
- Test deployment

## Success Criteria
- A user can upload one PDF and generate a quiz.
- The app can generate between 30 and 200 questions.
- Long quizzes are split into batches automatically.
- Bangla, English, and math content render properly.
- The app remains usable even when one AI provider fails.

## Next Step
Convert this plan into the actual web app implementation.
