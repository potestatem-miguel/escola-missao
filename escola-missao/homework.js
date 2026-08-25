const homeworkForm = document.getElementById("homework-form");
const homeworkChildSelect = document.getElementById("homework-child-select");
const homeworkStudentName = document.getElementById("homework-student-name");
const homeworkAge = document.getElementById("homework-age");
const homeworkGrade = document.getElementById("homework-grade");
const homeworkTheme = document.getElementById("homework-theme");
const homeworkFiles = document.getElementById("homework-files");
const homeworkFilesSummary = document.getElementById("homework-files-summary");
const homeworkStatus = document.getElementById("homework-status");
const homeworkLoading = document.getElementById("homework-loading");
const homeworkEmpty = document.getElementById("homework-empty");
const homeworkResult = document.getElementById("homework-result");
const homeworkMeta = document.getElementById("homework-meta");
const homeworkTitle = document.getElementById("homework-title");
const homeworkIntro = document.getElementById("homework-intro");
const homeworkSteps = document.getElementById("homework-steps");
const explainWordButton = document.getElementById("explain-word-button");
const wordModal = document.getElementById("word-modal");
const wordModalTitle = document.getElementById("word-modal-title");
const wordModalContext = document.getElementById("word-modal-context");
const wordModalBody = document.getElementById("word-modal-body");
const wordModalClose = document.getElementById("word-modal-close");
const homeworkStepper = document.getElementById("homework-stepper");
const homeworkEndpoint = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}api/homework.php`;
const explainEndpoint = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}api/explain.php`;
const MAX_INLINE_UPLOAD_BYTES = 18 * 1024 * 1024;
let currentSelectionData = null;
let currentHomeworkStep = 1;
let childrenCache = [];

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function showHomeworkStatus(message, type = "success") {
  homeworkStatus.textContent = message;
  homeworkStatus.classList.remove("hidden");
  homeworkStatus.style.background = type === "error" ? "rgba(249, 215, 218, 0.88)" : "rgba(223, 244, 223, 0.88)";
  homeworkStatus.style.borderColor = type === "error" ? "rgba(138, 29, 45, 0.18)" : "rgba(20, 93, 41, 0.18)";
  homeworkStatus.style.color = type === "error" ? "#8a1d2d" : "#145d29";
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

function setHomeworkStep(step) {
  currentHomeworkStep = step;
  document.querySelectorAll("[data-step-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", Number(panel.dataset.stepPanel) === step);
  });

  homeworkStepper?.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle("is-active", indicatorStep === step);
    indicator.classList.toggle("is-complete", indicatorStep < step);
  });
}

function validateHomeworkStep(step) {
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

function setHomeworkLoadingState(isLoading) {
  homeworkLoading.classList.toggle("hidden", !isLoading);
  if (isLoading) {
    homeworkEmpty.classList.add("hidden");
    homeworkResult.classList.add("hidden");
  }
}

function updateHomeworkFilesSummary() {
  const files = Array.from(homeworkFiles.files || []);
  if (files.length === 0) {
    homeworkFilesSummary.classList.add("hidden");
    homeworkFilesSummary.textContent = "";
    return;
  }

  homeworkFilesSummary.classList.remove("hidden");
  homeworkFilesSummary.textContent = `Arquivos selecionados: ${files.map((file) => file.name).join(", ")}`;
}

function fillChildFields(child) {
  homeworkStudentName.value = child?.studentName || "";
  homeworkAge.value = child?.age ? `${child.age} anos` : "";
  homeworkGrade.value = child?.grade || "";
  homeworkTheme.value = child?.favoriteThemes?.[0] || "";
}

async function renderRegisteredChildren() {
  if (!window.EstudaData) {
    return;
  }

  childrenCache = await window.EstudaData.listChildren();
  homeworkChildSelect.innerHTML = '<option value="">Selecione uma criança</option>';

  childrenCache.forEach((child) => {
    const option = document.createElement("option");
    option.value = child.id;
    option.textContent = `${child.studentName} - ${child.grade}`;
    homeworkChildSelect.appendChild(option);
  });
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

async function readAttachments() {
  const files = Array.from(homeworkFiles.files || []);
  if (files.length === 0) {
    throw new Error("Envie pelo menos uma imagem ou PDF da lição de casa.");
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_INLINE_UPLOAD_BYTES) {
    throw new Error("Os arquivos passaram do limite desta versão. Envie menos arquivos ou arquivos menores.");
  }

  return Promise.all(files.map(fileToBase64Payload));
}

function renderHomeworkResult(content) {
  homeworkLoading.classList.add("hidden");
  homeworkEmpty.classList.add("hidden");
  homeworkResult.classList.remove("hidden");

  homeworkMeta.textContent = `${content.studentName} | ${content.grade}`;
  homeworkTitle.textContent = content.title;
  homeworkIntro.textContent = content.intro;
  homeworkSteps.innerHTML = content.items.map((item, index) => `
    <section class="lesson-card homework-step">
      <div class="homework-step-header">
        <span class="content-tag">Exercício ${index + 1}</span>
        <h3>${escapeHtml(item.transcriptionTitle)}</h3>
      </div>
      <p><strong>O que a atividade pede:</strong> ${escapeHtml(item.requestSummary)}</p>
      <p><strong>Explicação simples:</strong> ${escapeHtml(item.simpleExplanation)}</p>
      <p><strong>Exemplo parecido:</strong> ${escapeHtml(item.similarExample)}</p>
      <p><strong>Dica para pensar:</strong> ${escapeHtml(item.guidanceTip)}</p>
      <div class="homework-warning subtle">
        A resposta final não aparece aqui. A ideia é ajudar a criança a pensar sozinha.
      </div>
    </section>
  `).join("");
}

async function submitHomework(payload) {
  const response = await fetch(homeworkEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Não foi possível explicar a lição de casa.");
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

homeworkChildSelect.addEventListener("change", () => {
  const selectedChild = childrenCache.find((child) => child.id === homeworkChildSelect.value);
  fillChildFields(selectedChild || null);
});

homeworkFiles.addEventListener("change", updateHomeworkFilesSummary);

document.querySelectorAll(".wizard-next").forEach((button) => {
  button.addEventListener("click", () => {
    if (!validateHomeworkStep(currentHomeworkStep)) {
      return;
    }
    setHomeworkStep(Number(button.dataset.nextStep));
  });
});

document.querySelectorAll(".wizard-prev").forEach((button) => {
  button.addEventListener("click", () => {
    setHomeworkStep(Number(button.dataset.prevStep));
  });
});

homeworkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const selectedChild = childrenCache.find((child) => child.id === homeworkChildSelect.value);

  if (!selectedChild) {
    showHomeworkStatus("Selecione uma criança cadastrada antes de enviar a lição.", "error");
    return;
  }

  try {
    setHomeworkLoadingState(true);
    showHomeworkStatus("Analisando a lição de casa. Aguarde...");

    const attachments = await readAttachments();
    const uploadedAttachments = await window.EstudaData.uploadFiles(Array.from(homeworkFiles.files || []), "homework");
    const content = await submitHomework({
      child: {
        studentName: selectedChild.studentName,
        age: selectedChild.age,
        grade: selectedChild.grade
      },
      theme: homeworkTheme.value.trim(),
      attachments
    });

    await window.EstudaData.registerHomeworkSession(selectedChild.id, homeworkTheme.value.trim(), content, uploadedAttachments);
    renderHomeworkResult(content);
    showHomeworkStatus("Explicação da lição gerada com sucesso.");
  } catch (error) {
    setHomeworkLoadingState(false);
    const message = error instanceof TypeError
      ? `Não foi possível conectar ao backend em ${homeworkEndpoint}.`
      : error.message;
    showHomeworkStatus(message, "error");
  }
});

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
  const contentArea = anchorNode?.parentElement?.closest("#homework-result");
  if (!contentArea) {
    hideSelectionHelper();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const contextBlock = anchorNode?.parentElement?.closest(".homework-step, .content-header");
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
  if (!currentSelectionData) {
    return;
  }

  explainWordButton.disabled = true;
  explainWordButton.textContent = "Explicando...";

  try {
    const explanation = await explainWord({
      word: currentSelectionData.word,
      contextText: currentSelectionData.contextText,
      subject: "Lição de casa",
      topic: homeworkTitle.textContent || "Exercício escolar",
      theme: homeworkTheme.value.trim(),
      goal: "Explicação detalhada",
      difficulty: "Adaptada à criança"
    });

    openWordModal(
      currentSelectionData.word,
      "Explicação detalhada dentro do contexto da lição de casa",
      `<p><strong>Significado:</strong> ${escapeHtml(explanation.meaning)}</p><p><strong>No contexto:</strong> ${escapeHtml(explanation.inContext)}</p>`
    );
  } catch (error) {
    showHomeworkStatus(error.message, "error");
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

renderRegisteredChildren();
updateHomeworkFilesSummary();
setHomeworkStep(1);
