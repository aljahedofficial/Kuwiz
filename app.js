const quizForm = document.getElementById('quiz-form');
const setupScreen = document.getElementById('setup-screen');
const loadingScreen = document.getElementById('loading-screen');
const loadingMessage = document.getElementById('loading-message');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const questionCountInput = document.getElementById('question-count');
const questionCountValue = document.getElementById('question-count-value');
const customTimerInput = document.getElementById('custom-timer');
const customTimerValue = document.getElementById('custom-timer-value');
const customTimerWrap = document.getElementById('custom-timer-wrap');
const estimatedTime = document.getElementById('estimated-time');
const timerTag = document.getElementById('timer-tag');
const timerModeInputs = document.querySelectorAll('input[name="timer-mode"]');

const generateBtn = document.getElementById('generate-btn');
const providerTag = document.getElementById('provider-tag');
const progressTag = document.getElementById('progress-tag');
const tracker = document.getElementById('question-tracker');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const explanationBox = document.getElementById('explanation-box');
const finalScore = document.getElementById('final-score');
const analysisGrid = document.getElementById('analysis-grid');
const showIncorrectBtn = document.getElementById('show-incorrect-btn');
const showCorrectBtn = document.getElementById('show-correct-btn');
const incorrectSection = document.getElementById('incorrect-section');
const correctSection = document.getElementById('correct-section');
const incorrectList = document.getElementById('incorrect-list');
const correctList = document.getElementById('correct-list');

let questions = [];
let currentIndex = 0;
let score = 0;
let answeredCount = 0;
let answers = [];
let timerId = null;
let timerRemainingSeconds = 0;
let timerLimitSeconds = 0;
let quizStartAt = 0;
let quizTimedOut = false;
let timerMode = 'default';
let advanceTimeoutId = null;

function getQuestionCount() {
  return Number(questionCountInput.value);
}

function getDefaultTimerMinutes(questionCount) {
  return Math.min(120, Math.max(1, Math.ceil(questionCount / 3)));
}

function getSelectedTimerMode() {
  return document.querySelector('input[name="timer-mode"]:checked')?.value || 'default';
}

function getCustomTimerMinutes() {
  return Math.min(120, Math.max(1, Number(customTimerInput.value) || 30));
}

function getActiveTimerMinutes(questionCount) {
  return timerMode === 'custom'
    ? getCustomTimerMinutes()
    : getDefaultTimerMinutes(questionCount);
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateEstimatedTimeLabel() {
  const questionCount = getQuestionCount();
  const defaultMinutes = getDefaultTimerMinutes(questionCount);
  const customMinutes = getCustomTimerMinutes();

  if (timerMode === 'custom') {
    estimatedTime.textContent = `Estimated time: ${customMinutes} minute(s) selected for the quiz.`;
    customTimerWrap.classList.remove('hidden');
  } else {
    estimatedTime.textContent = `Estimated time: about ${defaultMinutes} minute(s) at 3 questions per minute.`;
    customTimerWrap.classList.add('hidden');
  }

  customTimerValue.textContent = String(customMinutes);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function stopAdvanceTimeout() {
  if (advanceTimeoutId) {
    clearTimeout(advanceTimeoutId);
    advanceTimeoutId = null;
  }
}

function updateTimerTag() {
  timerTag.textContent = `Time Left: ${formatTime(timerRemainingSeconds)}`;
}

function startTimer(questionCount) {
  stopTimer();
  timerMode = getSelectedTimerMode();
  timerLimitSeconds = getActiveTimerMinutes(questionCount) * 60;
  timerRemainingSeconds = timerLimitSeconds;
  quizStartAt = Date.now();
  quizTimedOut = false;
  updateTimerTag();

  timerId = setInterval(() => {
    timerRemainingSeconds -= 1;
    if (timerRemainingSeconds <= 0) {
      timerRemainingSeconds = 0;
      updateTimerTag();
      endQuiz(true);
      return;
    }

    updateTimerTag();
  }, 1000);
}

function buildAnalysis() {
  const attempted = answeredCount;
  const incorrect = Math.max(0, attempted - score);
  const unanswered = Math.max(0, questions.length - attempted);
  const accuracy = attempted > 0 ? Math.round((score / attempted) * 100) : 0;
  const completion = questions.length > 0 ? Math.round((attempted / questions.length) * 100) : 0;
  const elapsedSeconds = quizStartAt ? Math.max(0, Math.round((Date.now() - quizStartAt) / 1000)) : 0;
  const elapsedLabel = formatTime(quizTimedOut ? timerLimitSeconds : elapsedSeconds);
  const modeLabel = timerMode === 'custom'
    ? `Custom (${Math.round(timerLimitSeconds / 60)} minute(s))`
    : `Default (${Math.round(timerLimitSeconds / 60)} minute(s))`;

  const items = [
    ['Questions Generated', String(questions.length)],
    ['Answered', String(attempted)],
    ['Correct', String(score)],
    ['Incorrect', String(incorrect)],
    ['Unanswered', String(unanswered)],
    ['Accuracy', `${accuracy}%`],
    ['Completion', `${completion}%`],
    ['Timer Mode', modeLabel],
    ['Time Used', elapsedLabel],
    ['Status', quizTimedOut ? 'Time expired' : 'Completed'],
  ];

  analysisGrid.innerHTML = items.map(([label, value]) => `
    <div class="analysis-item">
      <span class="analysis-label">${label}</span>
      <span class="analysis-value">${value}</span>
    </div>
  `).join('');

  const resolvedAnswers = questions.map((question, index) => {
    const answer = answers[index] || null;
    const selectedIndex = answer ? answer.selectedIndex : null;
    const correctIndex = Number.isInteger(question.answerIndex) ? question.answerIndex : 0;
    const correctOption = question.options?.[correctIndex] || 'Unknown';
    const selectedOption = answer && selectedIndex !== null ? question.options?.[selectedIndex] || 'No answer' : 'No answer';

    return {
      index: index + 1,
      question: question.question,
      selectedOption,
      correctOption,
      explanation: question.explanation || 'No explanation provided.',
      isCorrect: answer ? answer.selectedIndex === correctIndex : false,
      answered: Boolean(answer),
    };
  });

  const incorrectItems = resolvedAnswers.filter((item) => item.answered && !item.isCorrect);
  const correctItems = resolvedAnswers.filter((item) => item.answered && item.isCorrect);

  incorrectList.innerHTML = incorrectItems.length
    ? incorrectItems.map(renderAnswerCard).join('')
    : '<p class="timer-note">No incorrect answers.</p>';

  correctList.innerHTML = correctItems.length
    ? correctItems.map(renderAnswerCard).join('')
    : '<p class="timer-note">No correct answers yet.</p>';

  bindExplanationToggles();
}

function renderAnswerCard(item) {
  const statusClass = item.isCorrect ? 'correct' : 'incorrect';
  const answerLabel = item.answered ? item.selectedOption : 'No answer';
  return `
    <div class="answer-card ${statusClass}">
      <h5>Q${item.index}. ${item.question}</h5>
      <div class="answer-meta">
        <div><strong>Your answer:</strong> ${answerLabel}</div>
        <div><strong>Correct answer:</strong> ${item.correctOption}</div>
      </div>
      <button type="button" class="explanation-toggle" data-explanation-target="explanation-${item.index}">Show Explanation</button>
      <div id="explanation-${item.index}" class="answer-explanation hidden">${item.explanation}</div>
    </div>
  `;
}

function bindExplanationToggles() {
  document.querySelectorAll('.explanation-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-explanation-target');
      const target = document.getElementById(targetId);
      if (!target) return;

      const isHidden = target.classList.contains('hidden');
      target.classList.toggle('hidden');
      button.textContent = isHidden ? 'Hide Explanation' : 'Show Explanation';
    });
  });
}

function renderAnswerSelection(answer) {
  answers[answer.questionIndex] = answer;
}

function endQuiz(timedOut = false) {
  if (resultScreen && !quizScreen.classList.contains('hidden')) {
    quizTimedOut = timedOut;
    stopTimer();
    stopAdvanceTimeout();
    toggleHidden(quizScreen, true);
    toggleHidden(resultScreen, false);
    finalScore.textContent = `${score} / ${questions.length}`;
    buildAnalysis();
  }
}

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
  if (quizTimedOut) return;

  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach((button) => {
    button.disabled = true;
  });

  stopAdvanceTimeout();

  if (selectedIndex === correctIndex) {
    buttons[selectedIndex]?.classList.add('correct');
    score += 1;
  } else {
    buttons[selectedIndex]?.classList.add('incorrect');
    buttons[correctIndex]?.classList.add('correct');
  }

  answeredCount += 1;
  renderAnswerSelection({
    questionIndex: currentIndex,
    selectedIndex,
    correctIndex,
    explanation: explanation || 'No explanation provided.',
  });

  advanceTimeoutId = window.setTimeout(() => {
    if (currentIndex + 1 < questions.length) {
      currentIndex += 1;
      renderQuestion();
    } else {
      showResults();
    }
  }, 550);
}

function showResults() {
  quizTimedOut = false;
  stopTimer();
  stopAdvanceTimeout();
  toggleHidden(quizScreen, true);
  toggleHidden(resultScreen, false);
  finalScore.textContent = `${score} / ${questions.length}`;
  buildAnalysis();
}

questionCountInput.addEventListener('input', () => {
  questionCountValue.textContent = questionCountInput.value;
  updateEstimatedTimeLabel();
});

customTimerInput.addEventListener('input', () => {
  customTimerValue.textContent = customTimerInput.value;
  updateEstimatedTimeLabel();
});

timerModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    timerMode = getSelectedTimerMode();
    updateEstimatedTimeLabel();
  });
});

updateEstimatedTimeLabel();

quizForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('pdf-file');
  const subject = document.getElementById('subject').value.trim();
  const language = document.getElementById('language').value;
  const questionCount = getQuestionCount();
  const file = fileInput.files?.[0];

  if (!file) {
    alert('Please upload one PDF file.');
    return;
  }

  if (questionCount < 5 || questionCount > 300) {
    alert('Question count must be between 5 and 300.');
    return;
  }

  questions = [];
  currentIndex = 0;
  score = 0;
  answeredCount = 0;
  answers = [];
  quizTimedOut = false;
  stopTimer();
  stopAdvanceTimeout();

  toggleHidden(setupScreen, true);
  toggleHidden(loadingScreen, false);
  const batches = Math.max(1, Math.ceil(questionCount / 50));
  loadingMessage.textContent = `Generating ${questionCount} questions in ${batches} batch(es) of up to 50...`;
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
    providerTag.textContent = data.fallback
      ? `Engine: Offline Fallback`
      : `Engine: ${data.provider || 'Unknown'}`;
    progressTag.textContent = `Batches: ${data.batchCount || 1}`;

    if (data.fallback) {
      estimatedTime.textContent = 'Offline mode is active. Add API keys in Vercel to enable live AI generation.';
    }

    toggleHidden(loadingScreen, true);
    toggleHidden(quizScreen, false);

    startTimer(questions.length || questionCount);

    if (!questions.length) {
      throw new Error('No questions were returned by the AI provider.');
    }

    renderQuestion();
  } catch (error) {
    stopTimer();
    stopAdvanceTimeout();
    alert(`Error: ${error.message}`);
    location.reload();
  } finally {
    generateBtn.disabled = false;
  }
});

showIncorrectBtn.addEventListener('click', () => {
  incorrectSection.classList.toggle('hidden');
  if (!incorrectSection.classList.contains('hidden')) {
    correctSection.classList.add('hidden');
  }
});

showCorrectBtn.addEventListener('click', () => {
  correctSection.classList.toggle('hidden');
  if (!correctSection.classList.contains('hidden')) {
    incorrectSection.classList.add('hidden');
  }
});
