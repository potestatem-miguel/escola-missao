const THEME_STORAGE_KEY = "estuda-kids-theme";
const dashboardGrid = document.getElementById("dashboard-grid");
const dashboardEmpty = document.getElementById("dashboard-empty");
const themeToggle = document.getElementById("theme-toggle");

function applyTheme(theme) {
  const darkModeEnabled = theme === "dark";
  document.body.classList.toggle("dark-mode", darkModeEnabled);

  if (themeToggle) {
    themeToggle.textContent = darkModeEnabled ? "Desativar modo escuro" : "Ativar modo escuro";
    themeToggle.setAttribute("aria-pressed", String(darkModeEnabled));
  }
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

async function renderDashboard() {
  if (!dashboardGrid || !dashboardEmpty || !window.EstudaData) {
    return;
  }

  try {
    await window.EstudaData.ensureProfile();
    const children = await window.EstudaData.getDashboardSummary();

    if (children.length === 0) {
      dashboardEmpty.classList.remove("hidden");
      dashboardGrid.innerHTML = "";
      return;
    }

    dashboardEmpty.classList.add("hidden");
    dashboardGrid.className = `dashboard-grid dashboard-grid-${Math.min(children.length, 4)}`;
    dashboardGrid.innerHTML = children.map((child) => {
      const totalQuestions = Number(child.totalQuestions || 0);
      const totalCorrect = Number(child.totalCorrect || 0);
      const accuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

      return `
        <article class="panel child-dashboard-card">
          <div class="child-dashboard-header">
            <span class="content-tag">${child.grade || "Sem série"}</span>
            <h3>${child.studentName || "Criança"}</h3>
          </div>
          <div class="dashboard-metrics">
            <div class="metric-card">
              <span class="metric-label">Questões feitas</span>
              <strong>${totalQuestions}</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">Acertos</span>
              <strong>${totalCorrect}</strong>
            </div>
            <div class="metric-card metric-card-wide">
              <span class="metric-label">Aproveitamento</span>
              <strong>${formatPercent(accuracy)}</strong>
            </div>
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    dashboardEmpty.classList.remove("hidden");
    dashboardEmpty.innerHTML = `
      <h3>Não foi possível carregar a página inicial</h3>
      <p>${error.message}</p>
    `;
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  });
}

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "dark");
renderDashboard();
