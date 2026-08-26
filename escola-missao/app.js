const form = document.getElementById("content-form");
const generateButton = document.getElementById("generate-button");
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const contentView = document.getElementById("content-view");
const statusBanner = document.getElementById("status-banner");
const contentMeta = document.getElementById("content-meta");
const contentTitle = document.getElementById("content-title");
const contentIntro = document.getElementById("content-intro");
const lessonBody = document.getElementById("lesson-body");
const playAudioButton = document.getElementById("play-audio-button");
const audioStatus = document.getElementById("audio-status");
const lessonAudioPlayer = document.getElementById("lesson-audio-player");
const questionTemplate = document.getElementById("question-template");
const themeToggle = document.getElementById("theme-toggle");
const childrenCount = document.getElementById("children-count");
const childrenContainer = document.getElementById("children-container");
const childrenResults = document.getElementById("children-results");
const contentFilesInput = document.getElementById("content-files");
const filesSummary = document.getElementById("files-summary");
const explainWordButton = document.getElementById("explain-word-button");
const wordModal = document.getElementById("word-modal");
const wordModalTitle = document.getElementById("word-modal-title");
const wordModalContext = document.getElementById("word-modal-context");
const wordModalBody = document.getElementById("word-modal-body");
const wordModalClose = document.getElementById("word-modal-close");
const studyStepper = document.getElementById("study-stepper");
const apiEndpoint = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}api/generate.php`;
const explainEndpoint = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}api/explain.php`;
const audioEndpoint = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}api/audio.php`;

let latestPayload = null;
let latestRequestPayload = null;
let currentSelectionData = null;
let currentAudioUrl = null;
let currentSpeechUtterance = null;
let currentStudyStep = 1;
let registeredChildrenCache = [];

const MAX_INLINE_UPLOAD_BYTES = 18 * 1024 * 1024;

function setStudyStep(step) {
  currentStudyStep = step;
  document.querySelectorAll("[data-step-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", Number(panel.dataset.stepPanel) === step);
  });

  studyStepper?.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle("is-active", indicatorStep === step);
    indicator.classList.toggle("is-complete", indicatorStep < step);
  });
}

function validateStudyStep(step) {
  const panel = document.querySelector(`[data-step-panel="${step}"]`);
  if (!panel) {
    return true;
  }

  const fields = Array.from(panel.querySelectorAll("input, select, textarea"));
  for (const field of fields) {
    if (!field.reportValidity()) {
      return false;
    }
  }
  return true;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function applyTheme(theme) {
  const darkModeEnabled = theme === "dark";
  document.body.classList.toggle("dark-mode", darkModeEnabled);
  themeToggle.textContent = darkModeEnabled ? "Desativar modo escuro" : "Ativar modo escuro";
  themeToggle.setAttribute("aria-pressed", String(darkModeEnabled));
}

function showLoadingState() {
  loadingState.classList.remove("hidden");
  emptyState.classList.add("hidden");
  contentView.classList.add("hidden");
}

function hideLoadingState() {
  loadingState.classList.add("hidden");
}

function setAudioStatus(message = "", type = "info") {
  if (!message) {
    audioStatus.textContent = "";
    audioStatus.classList.add("hidden");
    return;
  }

  audioStatus.textContent = message;
  audioStatus.classList.remove("hidden");
  audioStatus.dataset.type = type;
}

function stopBrowserNarration() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentSpeechUtterance = null;
}

function showStatus(message, type = "success") {
  statusBanner.textContent = message;
  statusBanner.classList.remove("hidden");
  statusBanner.style.background = type === "error" ? "rgba(249, 215, 218, 0.88)" : "rgba(223, 244, 223, 0.88)";
  statusBanner.style.borderColor = type === "error" ? "rgba(138, 29, 45, 0.18)" : "rgba(20, 93, 41, 0.18)";
  statusBanner.style.color = type === "error" ? "#8a1d2d" : "#145d29";
}

function updateFilesSummary() {
  const files = Array.from(contentFilesInput.files || []);
  if (files.length === 0) {
    filesSummary.classList.add("hidden");
    filesSummary.textContent = "";
    return;
  }

  filesSummary.classList.remove("hidden");
  filesSummary.textContent = `Arquivos selecionados: ${files.map((file) => file.name).join(", ")}`;
}

function hideSelectionHelper() {
  explainWordButton.classList.add("hidden");
  currentSelectionData = null;
}

function openWordModal(word, contextLabel, explanationHtml) {
  wordModalTitle.textContent = `Explicação de "${word}"`;
  wordModalContext.textContent = contextLabel;
  wordModalBody.innerHTML = explanationHtml;
  wordModal.classList.remove("hidden");
}

function closeWordModal() {
  wordModal.classList.add("hidden");
}

function getRegisteredChildLabel(child) {
  return `${child.studentName}::${child.grade}`;
}

function buildRegisteredChildOptions(index, selectedId = "") {
  if (registeredChildrenCache.length === 0) {
    return "";
  }

  const baseOption = '<option value="">Selecionar criança cadastrada</option>';
  const childrenOptions = registeredChildrenCache.map((child) => {
    const selected = child.id === selectedId ? "selected" : "";
    return `<option value="${escapeHtml(child.id)}" ${selected}>${escapeHtml(child.studentName)} - ${escapeHtml(child.grade)}</option>`;
  }).join("");

  return `
    <label>
      <span>Criança cadastrada</span>
      <select class="registered-child-select" name="registeredChild-${index}">
        ${baseOption}
        ${childrenOptions}
      </select>
    </label>
  `;
}

function applyRegisteredChildToCard(card, childId) {
  const selectedChild = registeredChildrenCache.find((child) => child.id === childId);
  if (!selectedChild) {
    return;
  }

  const studentNameInput = card.querySelector('input[name^="studentName-"]');
  const ageInput = card.querySelector('input[name^="age-"]');
  const gradeSelect = card.querySelector('select[name^="grade-"]');
  const themeInput = form.querySelector('[name="theme"]');

  if (studentNameInput) {
    studentNameInput.value = selectedChild.studentName || "";
  }

  if (ageInput) {
    ageInput.value = selectedChild.age || "";
  }

  if (gradeSelect) {
    gradeSelect.value = selectedChild.grade || gradeSelect.value;
  }

  if (themeInput && Array.isArray(selectedChild.favoriteThemes) && selectedChild.favoriteThemes[0]) {
    themeInput.value = selectedChild.favoriteThemes[0];
  }
}

function createChildrenFields(count) {
  const previous = Array.from(childrenContainer.querySelectorAll(".child-card")).map((card, index) => ({
    selectedProfile: card.querySelector(".registered-child-select")?.value ?? "",
    studentName: card.querySelector(`[name="studentName-${index}"]`)?.value ?? "",
    age: card.querySelector(`[name="age-${index}"]`)?.value ?? "",
    grade: card.querySelector(`[name="grade-${index}"]`)?.value ?? "1 ano"
  }));

  childrenContainer.innerHTML = "";

  for (let index = 0; index < count; index += 1) {
    const values = previous[index] ?? {};
    const card = document.createElement("section");
    card.className = "child-card";
    card.innerHTML = `
      <div class="child-card-header">
        <h3>Criança ${index + 1}</h3>
      </div>
      ${buildRegisteredChildOptions(index, values.selectedProfile ?? "")}
      <div class="field-grid">
        <label>
          <span>Nome do aluno</span>
          <input type="text" name="studentName-${index}" value="${escapeHtml(values.studentName ?? "")}" placeholder="Ex.: Miguel" required>
        </label>
        <label>
          <span>Idade</span>
          <input type="number" name="age-${index}" min="5" max="16" value="${escapeHtml(values.age ?? "")}" placeholder="Ex.: 8" required>
        </label>
      </div>
      <label>
        <span>Série / Ano escolar</span>
        <select name="grade-${index}" required>
          ${["1 ano", "2 ano", "3 ano", "4 ano", "5 ano", "6 ano", "7 ano", "8 ano", "9 ano"]
            .map((grade) => `<option value="${grade}" ${grade === (values.grade ?? "1 ano") ? "selected" : ""}>${grade}</option>`)
            .join("")}
        </select>
      </label>
    `;

    const profileSelect = card.querySelector(".registered-child-select");
    if (profileSelect) {
      profileSelect.addEventListener("change", () => {
        if (!profileSelect.value) {
          return;
        }
        applyRegisteredChildToCard(card, profileSelect.value);
      });
    }

    childrenContainer.appendChild(card);
  }
}

async function refreshRegisteredChildren() {
  if (!window.EstudaData) {
    return;
  }

  try {
    registeredChildrenCache = await window.EstudaData.listChildren();
    createChildrenFields(Number(childrenCount.value));
  } catch (_error) {
    registeredChildrenCache = [];
    createChildrenFields(Number(childrenCount.value));
  }
}

function collectChildren() {
  const count = Number(childrenCount.value);
  const children = [];

  for (let index = 0; index < count; index += 1) {
    const registryId = form.querySelector(`[name="registeredChild-${index}"]`)?.value || "";
    const matchedChild = registeredChildrenCache.find((child) => child.id === registryId);

    children.push({
      id: registryId || `child-${index}`,
      registryId: registryId || null,
      studentName: form.querySelector(`[name="studentName-${index}"]`).value.trim(),
      age: Number(form.querySelector(`[name="age-${index}"]`).value),
      grade: form.querySelector(`[name="grade-${index}"]`).value,
      favoriteThemes: matchedChild?.favoriteThemes || []
    });
  }

  return children;
}

function renderLesson(sections) {
  lessonBody.innerHTML = sections.map((section) => {
    const items = Array.isArray(section.bullets) && section.bullets.length
      ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";

    return `
      <section>
        <h3>${escapeHtml(section.heading)}</h3>
        <p>${escapeHtml(section.body)}</p>
        ${items}
      </section>
    `;
  }).join("");
}

function buildOption(childId, questionIndex, optionIndex, optionText) {
  const optionLetter = String.fromCharCode(65 + optionIndex);
  const inputId = `${childId}-question-${questionIndex}-${optionIndex}`;

  return `
    <label class="option-item" for="${inputId}">
      <input id="${inputId}" type="radio" name="question-${questionIndex}" value="${optionIndex}" required>
      <span><strong>${optionLetter})</strong> ${escapeHtml(optionText)}</span>
    </label>
  `;
}

function renderQuestions(child) {
  return child.questions.map((question, questionIndex) => {
    const fragment = questionTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".question-card");
    const title = fragment.querySelector(".question-title");
    const optionsList = fragment.querySelector(".options-list");

    title.textContent = `${questionIndex + 1}. ${question.prompt}`;
    optionsList.innerHTML = question.options
      .map((optionText, optionIndex) => buildOption(child.id, questionIndex, optionIndex, optionText))
      .join("");

    return card.outerHTML;
  }).join("");
}

function renderChildrenResults(children) {
  childrenResults.innerHTML = "";

  children.forEach((child, index) => {
    const card = document.createElement("section");
    card.className = "child-result-card";
    card.dataset.childId = child.id;
    card.innerHTML = `
      <div class="child-result-header">
        <span class="content-tag">Criança ${index + 1}</span>
        <h3>${escapeHtml(child.studentName)}</h3>
        <p>${escapeHtml(child.grade)} | ${escapeHtml(String(child.age))} anos</p>
      </div>
      <form class="quiz-form child-quiz-form" data-child-id="${escapeHtml(child.id)}" data-execution-id="${escapeHtml(child.executionId || "")}">
        ${Array.isArray(child.questions) && child.questions.length > 0 ? renderQuestions(child) : "<p class='no-questions'>Nenhum exercício foi gerado para este objetivo.</p>"}
        ${Array.isArray(child.questions) && child.questions.length > 0 ? '<button type="submit" class="submit-answers">Enviar respostas</button>' : ""}
      </form>
    `;
    childrenResults.appendChild(card);
  });
}

function renderContent(data) {
  hideLoadingState();
  emptyState.classList.add("hidden");
  contentView.classList.remove("hidden");

  contentMeta.textContent = `${data.subject} | ${data.topic} | ${data.difficulty}`;
  contentTitle.textContent = data.title;
  contentIntro.textContent = data.intro;

  const lessonCard = document.querySelector(".shared-lesson");
  if (Array.isArray(data.lessonSections) && data.lessonSections.length > 0) {
    lessonCard.classList.remove("hidden");
    renderLesson(data.lessonSections);
    playAudioButton.classList.remove("hidden");
  } else {
    lessonCard.classList.add("hidden");
    lessonBody.innerHTML = "";
    playAudioButton.classList.add("hidden");
  }

  lessonAudioPlayer.classList.add("hidden");
  lessonAudioPlayer.removeAttribute("src");
  setAudioStatus();
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  renderChildrenResults(data.children);
}

function buildRequestPayload(overrides = {}) {
  const payload = Object.fromEntries(new FormData(form).entries());
  return {
    children: collectChildren(),
    subject: payload.subject,
    topic: payload.topic,
    theme: payload.theme,
    goal: payload.goal,
    questionCount: Number(payload.questionCount),
    difficulty: payload.difficulty,
    attachments: [],
    retryMode: false,
    previousQuestions: [],
    retryOf: null,
    ...overrides
  };
}

function fileToBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64] = result.split(",");
      resolve({
        name: file.name,
        mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
        data: base64
      });
    };
    reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function readAttachmentsFromInput() {
  const files = Array.from(contentFilesInput.files || []);
  if (files.length === 0) {
    return [];
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_INLINE_UPLOAD_BYTES) {
    throw new Error("Os arquivos passaram do limite desta versão. Envie um PDF/imagens menores ou menos arquivos.");
  }

  return Promise.all(files.map(fileToBase64Payload));
}

async function generateContent(payload) {
  if (window.location.protocol === "file:") {
    throw new Error("Abra o projeto em um servidor PHP. Se abrir o index.html direto no navegador, o endpoint da API não funciona.");
  }

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Não foi possível gerar o conteúdo.");
  }

  if (data.content?.generatedWithFallback) {
    throw new Error(data.content.fallbackReason || "A IA não gerou um conteúdo confiável. O material foi bloqueado para evitar aula ruim.");
  }

  return data.content;
}

async function explainWord(payload) {
  const response = await fetch(explainEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Não foi possível explicar a palavra.");
  }

  return data.explanation;
}

function buildLessonNarrationText() {
  if (!latestPayload || !Array.isArray(latestPayload.lessonSections) || latestPayload.lessonSections.length === 0) {
    return "";
  }

  const parts = [
    latestPayload.title || "",
    latestPayload.intro || "",
    ...latestPayload.lessonSections.flatMap((section) => [
      section.heading || "",
      section.body || "",
      ...(Array.isArray(section.bullets) ? section.bullets : [])
    ])
  ];

  return parts.filter(Boolean).join("\n\n");
}

async function generateLessonAudio(text) {
  const response = await fetch(audioEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      subject: latestRequestPayload?.subject ?? "",
      topic: latestRequestPayload?.topic ?? "",
      theme: latestRequestPayload?.theme ?? ""
    })
  });

  if (!response.ok) {
    let message = "Não foi possível gerar o áudio.";
    try {
      const errorData = await response.json();
      message = errorData.error || message;
    } catch (_error) {
      // Keep generic message.
    }
    throw new Error(message);
  }

  return response.blob();
}

function playBrowserNarration(text) {
  if (!("speechSynthesis" in window)) {
    throw new Error("O navegador não suporta narração por voz.");
  }

  stopBrowserNarration();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  currentSpeechUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

async function regenerateChildTest(childId, button) {
  if (!latestPayload || !latestRequestPayload) {
    return;
  }

  const child = latestPayload.children.find((item) => item.id === childId);
  const baseChild = latestRequestPayload.children.find((item) => item.id === childId || item.registryId === childId);

  if (!child || !baseChild) {
    return;
  }

  button.disabled = true;
  button.textContent = "Gerando novo teste...";
  showStatus("Gerando um novo teste com os mesmos dados da criança...");
  showLoadingState();

  try {
    const payload = {
      ...latestRequestPayload,
      children: [baseChild],
      retryMode: true,
      previousQuestions: child.questions.map((question) => question.prompt),
      retryOf: child.executionId || null
    };

    const generatedContent = await generateContent(payload);
    const content = await window.EstudaData.registerStudyContent(payload, generatedContent, latestRequestPayload.uploadedAttachments || []);
    latestPayload.children = latestPayload.children.map((item) => (item.id === childId ? content.children[0] : item));
    renderContent(latestPayload);
    showStatus(`Novo teste gerado para ${content.children[0].studentName}.`);
  } catch (error) {
    hideLoadingState();
    showStatus(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Gerar novo teste";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  generateButton.disabled = true;
  showStatus("Gerando o conteúdo com IA. Aguarde alguns segundos...");
  showLoadingState();

  try {
    const attachments = await readAttachmentsFromInput();
    const selectedFiles = Array.from(contentFilesInput.files || []);
    const topicValue = String(form.querySelector('[name="topic"]').value || "").trim();
    if (!topicValue && attachments.length === 0) {
      throw new Error("Preencha o conteúdo da matéria ou envie um PDF/imagens para a IA analisar.");
    }

    const uploadedAttachments = await window.EstudaData.uploadFiles(selectedFiles, "study");
    const payload = buildRequestPayload({
      topic: topicValue,
      attachments
    });

    latestPayload = null;
    latestRequestPayload = {
      ...payload,
      uploadedAttachments
    };

    const generatedContent = await generateContent(payload);
    const content = await window.EstudaData.registerStudyContent(payload, generatedContent, uploadedAttachments);
    registeredChildrenCache = await window.EstudaData.listChildren();
    latestRequestPayload.children = content.children.map((child) => ({
      id: child.id,
      registryId: child.id,
      studentName: child.studentName,
      age: child.age,
      grade: child.grade,
      favoriteThemes: registeredChildrenCache.find((item) => item.id === child.id)?.favoriteThemes || []
    }));
    latestPayload = content;
    renderContent(content);
    showStatus("Conteúdo gerado com sucesso. Agora cada criança já pode responder seus exercícios.");
    window.scrollTo({ top: contentView.offsetTop - 16, behavior: "smooth" });
  } catch (error) {
    hideLoadingState();
    const message = error instanceof TypeError
      ? `Não foi possível conectar ao backend em ${apiEndpoint}. Verifique se o projeto está rodando em um servidor com PHP e se api/generate.php está acessível.`
      : error.message;
    showStatus(message, "error");
  } finally {
    generateButton.disabled = false;
  }
});

childrenResults.addEventListener("submit", async (event) => {
  const quizForm = event.target.closest(".child-quiz-form");
  if (!quizForm) {
    return;
  }

  event.preventDefault();

  const childId = quizForm.dataset.childId;
  const child = latestPayload?.children.find((item) => item.id === childId);

  if (!child || !Array.isArray(child.questions) || child.questions.length === 0) {
    return;
  }

  const formData = new FormData(quizForm);
  const questionCards = quizForm.querySelectorAll(".question-card");
  let score = 0;
  const answers = [];

  child.questions.forEach((question, index) => {
    const selectedValue = formData.get(`question-${index}`);
    const selected = selectedValue === null ? -1 : Number(selectedValue);
    const questionCard = questionCards[index];
    const options = questionCard.querySelectorAll(".option-item");
    const feedback = questionCard.querySelector(".feedback");
    const correctText = question.options[question.correctIndex];
    const answerIsCorrect = selected === question.correctIndex;

    options.forEach((option, optionIndex) => {
      option.classList.toggle("correct-answer", optionIndex === question.correctIndex);
    });

    feedback.classList.remove("hidden", "correct", "incorrect");
    feedback.classList.add(answerIsCorrect ? "correct" : "incorrect");
    feedback.innerHTML = answerIsCorrect
      ? `Correto! ${escapeHtml(question.explanation)}`
      : `Incorreto. Resposta certa: <strong>${escapeHtml(correctText)}</strong>. ${escapeHtml(question.explanation)}`;

    if (answerIsCorrect) {
      score += 1;
    }

    answers.push({
      selectedIndex: selected,
      selectedOption: selected >= 0 ? (question.options[selected] ?? "") : "",
      isCorrect: answerIsCorrect
    });
  });

  quizForm.querySelector(".score-card")?.remove();
  quizForm.querySelector(".retry-button")?.remove();

  const percentage = Math.round((score / child.questions.length) * 100);
  await window.EstudaData.saveStudyAnswers(child.executionId, score, percentage, answers);
  const scoreCard = document.createElement("div");
  scoreCard.className = "score-card";
  scoreCard.innerHTML = `<strong>Total de acertos: ${score}</strong><span>Aproveitamento: ${percentage}%.</span>`;
  quizForm.appendChild(scoreCard);

  if (percentage <= 79) {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "secondary-button retry-button";
    retryButton.textContent = "Gerar novo teste";
    retryButton.addEventListener("click", () => regenerateChildTest(childId, retryButton));
    quizForm.appendChild(retryButton);
    showStatus(`${child.studentName} ficou com ${percentage}%. Um novo teste pode ser gerado sem preencher o formulário novamente.`);
  } else {
    showStatus(`${child.studentName} ficou com ${percentage}%. Não é necessário refazer o teste.`);
  }
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
  localStorage.setItem("estuda-kids-theme", nextTheme);
  applyTheme(nextTheme);
});

childrenCount.addEventListener("change", () => {
  createChildrenFields(Number(childrenCount.value));
});

document.querySelectorAll(".wizard-next").forEach((button) => {
  button.addEventListener("click", () => {
    if (!validateStudyStep(currentStudyStep)) {
      return;
    }
    setStudyStep(Number(button.dataset.nextStep));
  });
});

document.querySelectorAll(".wizard-prev").forEach((button) => {
  button.addEventListener("click", () => {
    setStudyStep(Number(button.dataset.prevStep));
  });
});

contentFilesInput.addEventListener("change", updateFilesSummary);

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideSelectionHelper();
    return;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText || selectedText.split(/\s+/).length > 3 || selectedText.length > 40) {
    hideSelectionHelper();
    return;
  }

  const anchorNode = selection.anchorNode;
  const contentArea = anchorNode?.parentElement?.closest("#content-view");
  if (!contentArea) {
    hideSelectionHelper();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const contextBlock = anchorNode?.parentElement?.closest(".lesson-body, .question-card");
  const contextText = contextBlock ? contextBlock.textContent.trim() : contentArea.textContent.trim();

  currentSelectionData = {
    word: selectedText,
    contextText,
    x: rect.left + window.scrollX,
    y: rect.bottom + window.scrollY + 8
  };

  explainWordButton.style.left = `${currentSelectionData.x}px`;
  explainWordButton.style.top = `${currentSelectionData.y}px`;
  explainWordButton.classList.remove("hidden");
});

explainWordButton.addEventListener("click", async () => {
  if (!currentSelectionData || !latestRequestPayload) {
    return;
  }

  explainWordButton.disabled = true;
  explainWordButton.textContent = "Explicando...";

  try {
    const explanation = await explainWord({
      word: currentSelectionData.word,
      contextText: currentSelectionData.contextText,
      subject: latestRequestPayload.subject,
      topic: latestRequestPayload.topic,
      theme: latestRequestPayload.theme,
      goal: latestRequestPayload.goal,
      difficulty: latestRequestPayload.difficulty
    });

    openWordModal(
      currentSelectionData.word,
      "Explicação dentro do contexto da matéria/questão selecionada",
      `<p><strong>Significado:</strong> ${escapeHtml(explanation.meaning)}</p><p><strong>No contexto:</strong> ${escapeHtml(explanation.inContext)}</p>`
    );
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    explainWordButton.disabled = false;
    explainWordButton.textContent = "Explicar palavra";
    hideSelectionHelper();
    window.getSelection()?.removeAllRanges();
  }
});

wordModalClose.addEventListener("click", closeWordModal);
wordModal.addEventListener("click", (event) => {
  if (event.target === wordModal) {
    closeWordModal();
  }
});

playAudioButton.addEventListener("click", async () => {
  const narrationText = buildLessonNarrationText();
  if (!narrationText) {
    setAudioStatus("Não há explicação disponível para narrar.", "error");
    return;
  }

  playAudioButton.disabled = true;
  setAudioStatus("Gerando áudio da explicação...");

  try {
    const audioBlob = await generateLessonAudio(narrationText);
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
    }

    currentAudioUrl = URL.createObjectURL(audioBlob);
    lessonAudioPlayer.src = currentAudioUrl;
    lessonAudioPlayer.classList.remove("hidden");
    await lessonAudioPlayer.play();
    setAudioStatus("Áudio pronto. O aluno já pode ouvir a explicação.", "success");
  } catch (error) {
    const shouldFallbackToBrowserVoice = /text_to_speech|permission|ElevenLabs|library voices|upgrade your subscription|free users/i.test(error.message);

    if (shouldFallbackToBrowserVoice) {
      try {
        if (currentAudioUrl) {
          URL.revokeObjectURL(currentAudioUrl);
          currentAudioUrl = null;
        }
        lessonAudioPlayer.pause();
        lessonAudioPlayer.removeAttribute("src");
        lessonAudioPlayer.classList.add("hidden");
        playBrowserNarration(narrationText);
        setAudioStatus("A ElevenLabs não liberou áudio nesta chave. Usando a voz do navegador como alternativa.", "success");
      } catch (fallbackError) {
        setAudioStatus(fallbackError.message, "error");
      }
    } else {
      setAudioStatus(error.message, "error");
    }
  } finally {
    playAudioButton.disabled = false;
  }
});

applyTheme(localStorage.getItem("estuda-kids-theme") || "dark");
updateFilesSummary();
setStudyStep(1);
refreshRegisteredChildren();
