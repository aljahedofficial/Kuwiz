const quizForm = document.getElementById('quiz-form');
const setupScreen = document.getElementById('setup-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingMessage = document.getElementById('loading-message');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const questionCountInput = document.getElementById('question-count');
const questionCountValue = document.getElementById('question-count-value');

const generateBtn = document.getElementById('generate-btn');
const providerTag = document.getElementById('provider-tag');
const progressTag = document.getElementById('progress-tag');
const tracker = document.getElementById('question-tracker');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const explanationBox = document.getElementById('explanation-box');
const nextBtn = document.getElementById('next-btn');
const finalScore = document.getElementById('final-score');

let questions = [];
let currentIndex = 0;
let score = 0;

function toggleHidden(element, hidden) {
  element.classList.toggle('hidden', hidden);
}

function setQuizProgress() {
  tracker.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
  progressTag.textContent = `Progress ${currentIndex + 1}/${questions.length}`;
}

function renderMath(container) {
  if (window.renderMathInElement) {
    window.renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }
}

function renderQuestion() {
  const q = questions[currentIndex];
  if (!q) return;

  setQuizProgress();
  questionText.textContent = q.question;
  optionsContainer.innerHTML = '';
  explanationBox.classList.add('hidden');
  explanationBox.textContent = '';
  nextBtn.classList.add('hidden');
  nextBtn.disabled = false;

  (q.options || []).forEach((option, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.textContent = option;
    btn.addEventListener('click', () => selectAnswer(idx, q.answerIndex, q.explanation));
    optionsContainer.appendChild(btn);
  });

  renderMath(questionText);
  renderMath(optionsContainer);
}

function selectAnswer(selectedIndex, correctIndex, explanation) {
  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach((button) => {
    button.disabled = true;
  });

  if (selectedIndex === correctIndex) {
    buttons[selectedIndex]?.classList.add('correct');
    score += 1;
  } else {
    buttons[selectedIndex]?.classList.add('incorrect');
    buttons[correctIndex]?.classList.add('correct');
  }

  explanationBox.textContent = `Explanation: ${explanation || 'No explanation provided.'}`;
  explanationBox.classList.remove('hidden');
  renderMath(explanationBox);

  if (currentIndex + 1 < questions.length) {
    nextBtn.textContent = 'Next Question';
    nextBtn.onclick = () => {
      currentIndex += 1;
      renderQuestion();
    };
  } else {
    nextBtn.textContent = 'See Final Results';
    nextBtn.onclick = showResults;
  }

  nextBtn.classList.remove('hidden');
}

function showResults() {
  toggleHidden(quizScreen, true);
  toggleHidden(resultScreen, false);
  finalScore.textContent = `${score} / ${questions.length}`;
}

questionCountInput.addEventListener('input', () => {
  questionCountValue.textContent = questionCountInput.value;
});

quizForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('pdf-file');
  const subject = document.getElementById('subject').value.trim();
  const language = document.getElementById('language').value;
  const questionCount = Number(questionCountInput.value);
  const file = fileInput.files?.[0];

  if (!file) {
    alert('Please upload one PDF file.');
    return;
  }

  if (questionCount < 30 || questionCount > 200) {
    alert('Question count must be between 30 and 200.');
    return;
  }

  questions = [];
  currentIndex = 0;
  score = 0;

  toggleHidden(setupScreen, true);
  toggleHidden(loadingScreen, false);
  loadingMessage.textContent = `Generating ${questionCount} questions in batches of 50...`;
  generateBtn.disabled = true;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'x-subject': subject,
        'x-language': language,
        'x-question-count': String(questionCount)
      },
      body: file
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Unable to generate quiz.');
    }

    questions = data.questions || [];
    providerTag.textContent = `Engine: ${data.provider || 'Unknown'}`;
    progressTag.textContent = `Batches: ${data.batchCount || 1}`;

    toggleHidden(loadingScreen, true);
    toggleHidden(quizScreen, false);

    if (!questions.length) {
      throw new Error('No questions were returned by the AI provider.');
    }

    renderQuestion();
  } catch (error) {
    alert(`Error: ${error.message}`);
    location.reload();
  } finally {
    generateBtn.disabled = false;
  }
});
