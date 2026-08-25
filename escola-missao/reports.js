const reportsChildSelect = document.getElementById("reports-child-select");
const reportsSubjectFilter = document.getElementById("reports-subject-filter");
const reportsEmpty = document.getElementById("reports-empty");
const reportsContent = document.getElementById("reports-content");
const reportsSummary = document.getElementById("reports-summary");
const reportsSubjectPerformance = document.getElementById("reports-subject-performance");
const reportsDailyUsage = document.getElementById("reports-daily-usage");
const reportsGeneratedBySubject = document.getElementById("reports-generated-by-subject");
const reportsExecutionsTable = document.getElementById("reports-executions-table");
const reportsExecutionDetailPanel = document.getElementById("reports-execution-detail-panel");
const reportsExecutionDetailTitle = document.getElementById("reports-execution-detail-title");
const reportsExecutionDetail = document.getElementById("reports-execution-detail");

let childrenCache = [];
let executionsCache = [];

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function formatDate(isoDate) {
  if (!isoDate) {
    return "-";
  }
  const date = new Date(isoDate);
  return date.toLocaleDateString("pt-BR");
}

function fillChildSelector() {
  reportsChildSelect.innerHTML = '<option value="">Selecione uma criança</option>';

  childrenCache.forEach((child) => {
    const option = document.createElement("option");
    option.value = child.id;
    option.textContent = `${child.studentName} - ${child.grade}`;
    reportsChildSelect.appendChild(option);
  });
}

function renderSummaryCards(executions) {
  const totalGenerated = executions.length;
  const answeredExecutions = executions.filter((execution) => execution.answersSubmitted);
  const totalQuestions = answeredExecutions.reduce((sum, execution) => sum + Number(execution.questionCount || 0), 0);
  const totalCorrect = answeredExecutions.reduce((sum, execution) => sum + Number(execution.totalCorrect || 0), 0);
  const accuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

  reportsSummary.innerHTML = `
    <article class="panel metric-card">
      <span class="metric-label">Execuções geradas</span>
      <strong>${totalGenerated}</strong>
    </article>
    <article class="panel metric-card">
      <span class="metric-label">Exercícios feitos</span>
      <strong>${totalQuestions}</strong>
    </article>
    <article class="panel metric-card">
      <span class="metric-label">Acertos totais</span>
      <strong>${totalCorrect}</strong>
    </article>
    <article class="panel metric-card">
      <span class="metric-label">Aproveitamento geral</span>
      <strong>${formatPercent(accuracy)}</strong>
    </article>
  `;
}

function renderSimpleTable(container, headers, rows) {
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-children-state">Ainda não há dados suficientes para este relatório.</div>';
    return;
  }

  container.innerHTML = `
    <div class="reports-table-wrap">
      <table class="reports-table">
        <thead>
          <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSubjectPerformance(executions) {
  const subjectMap = new Map();

  executions.forEach((execution) => {
    if (!execution.answersSubmitted) {
      return;
    }

    const bucket = subjectMap.get(execution.subject) || {
      subject: execution.subject,
      questions: 0,
      correct: 0
    };

    bucket.questions += Number(execution.questionCount || 0);
    bucket.correct += Number(execution.totalCorrect || 0);
    subjectMap.set(execution.subject, bucket);
  });

  const rows = Array.from(subjectMap.values()).map((item) => {
    const accuracy = item.questions > 0 ? (item.correct / item.questions) * 100 : 0;
    return [
      escapeHtml(item.subject || "Sem matéria"),
      String(item.questions),
      String(item.correct),
      formatPercent(accuracy)
    ];
  });

  renderSimpleTable(
    reportsSubjectPerformance,
    ["Matéria", "Exercícios", "Acertos", "Percentual"],
    rows
  );
}

function renderDailyUsage(executions) {
  const dayMap = new Map();

  executions.forEach((execution) => {
    const day = formatDate(execution.generatedAt);
    const bucket = dayMap.get(day) || {
      day,
      exercises: 0,
      contents: 0
    };

    bucket.exercises += execution.answersSubmitted ? Number(execution.questionCount || 0) : 0;
    bucket.contents += 1;
    dayMap.set(day, bucket);
  });

  const rows = Array.from(dayMap.values()).map((item) => [
    item.day,
    String(item.exercises),
    String(item.contents)
  ]);

  renderSimpleTable(
    reportsDailyUsage,
    ["Dia", "Exercícios feitos", "Conteúdos gerados"],
    rows
  );
}

function renderGeneratedBySubject(executions) {
  const subjectMap = new Map();

  executions.forEach((execution) => {
    const subject = execution.subject || "Sem matéria";
    subjectMap.set(subject, (subjectMap.get(subject) || 0) + 1);
  });

  const rows = Array.from(subjectMap.entries()).map(([subject, total]) => [
    escapeHtml(subject),
    String(total)
  ]);

  renderSimpleTable(
    reportsGeneratedBySubject,
    ["Matéria", "Conteúdos gerados"],
    rows
  );
}

function renderExecutionDetail(execution) {
  reportsExecutionDetailPanel.classList.remove("hidden");
  reportsExecutionDetailTitle.textContent = `Detalhes da execução de ${formatDate(execution.generatedAt)} - ${execution.subject}`;

  const rows = execution.questions.map((question, index) => [
    String(index + 1),
    escapeHtml(question.prompt),
    question.isCorrect === null ? "-" : question.isCorrect ? "Acertou" : "Errou",
    escapeHtml(question.selectedOption || "-"),
    escapeHtml(question.correctOption || "-")
  ]);

  renderSimpleTable(
    reportsExecutionDetail,
    ["Questão", "Exercício", "Status", "Resposta escolhida", "Resposta certa"],
    rows
  );
}

function renderExecutions(executions) {
  if (executions.length === 0) {
    reportsExecutionsTable.innerHTML = '<div class="empty-children-state">Nenhuma execução encontrada para este filtro.</div>';
    reportsExecutionDetailPanel.classList.add("hidden");
    return;
  }

  const rowsHtml = executions.map((execution) => {
    const totalCorrect = execution.totalCorrect ?? "-";
    const accuracy = execution.accuracy === null ? "-" : formatPercent(execution.accuracy);
    return `
      <tr data-execution-id="${execution.executionId}">
        <td>${formatDate(execution.generatedAt)}</td>
        <td>${escapeHtml(execution.subject || "Sem matéria")}</td>
        <td>${escapeHtml(execution.topic || "-")}</td>
        <td>${execution.questionCount || 0}</td>
        <td>${totalCorrect}</td>
        <td>${accuracy}</td>
      </tr>
    `;
  }).join("");

  reportsExecutionsTable.innerHTML = `
    <div class="reports-table-wrap">
      <table class="reports-table reports-table-clickable">
        <thead>
          <tr>
            <th>Data</th>
            <th>Matéria</th>
            <th>Tópico</th>
            <th>Exercícios</th>
            <th>Acertos</th>
            <th>Aproveitamento</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  reportsExecutionsTable.querySelectorAll("tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      const execution = executions.find((item) => item.executionId === row.dataset.executionId);
      if (execution) {
        renderExecutionDetail(execution);
      }
    });
  });
}

function fillSubjectFilter(executions) {
  const subjects = Array.from(new Set(executions.map((item) => item.subject).filter(Boolean)));
  reportsSubjectFilter.innerHTML = '<option value="">Todas as matérias</option>';

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    reportsSubjectFilter.appendChild(option);
  });
}

function renderReports() {
  const selectedChildId = reportsChildSelect.value;

  if (!selectedChildId) {
    reportsEmpty.classList.remove("hidden");
    reportsContent.classList.add("hidden");
    reportsExecutionDetailPanel.classList.add("hidden");
    return;
  }

  const childExecutions = executionsCache.filter((execution) => execution.childId === selectedChildId);
  fillSubjectFilter(childExecutions);

  const subjectFilter = reportsSubjectFilter.value;
  const filteredExecutions = subjectFilter
    ? childExecutions.filter((execution) => execution.subject === subjectFilter)
    : childExecutions;

  reportsEmpty.classList.add("hidden");
  reportsContent.classList.remove("hidden");

  renderSummaryCards(childExecutions);
  renderSubjectPerformance(childExecutions);
  renderDailyUsage(childExecutions);
  renderGeneratedBySubject(childExecutions);
  renderExecutions(filteredExecutions);
}

async function initReports() {
  if (!window.EstudaData) {
    return;
  }

  try {
    [childrenCache, executionsCache] = await Promise.all([
      window.EstudaData.listChildren(),
      window.EstudaData.listStudyExecutions()
    ]);
    fillChildSelector();
    renderReports();
  } catch (error) {
    reportsEmpty.classList.remove("hidden");
    reportsEmpty.innerHTML = `
      <h3>Não foi possível carregar os relatórios</h3>
      <p>${escapeHtml(error.message)}</p>
    `;
    reportsContent.classList.add("hidden");
  }
}

reportsChildSelect.addEventListener("change", () => {
  reportsSubjectFilter.value = "";
  renderReports();
});

reportsSubjectFilter.addEventListener("change", renderReports);

initReports();
