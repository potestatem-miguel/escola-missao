const childrenForm = document.getElementById("children-form");
const childrenList = document.getElementById("children-list");
const childrenStatus = document.getElementById("children-status");

function showChildrenStatus(message, type = "success") {
  childrenStatus.textContent = message;
  childrenStatus.classList.remove("hidden");
  childrenStatus.style.background = type === "error" ? "rgba(249, 215, 218, 0.88)" : "rgba(223, 244, 223, 0.88)";
  childrenStatus.style.borderColor = type === "error" ? "rgba(138, 29, 45, 0.18)" : "rgba(20, 93, 41, 0.18)";
  childrenStatus.style.color = type === "error" ? "#8a1d2d" : "#145d29";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function buildPreferenceTags(favoriteThemes = []) {
  const labels = ["Desenho", "Esporte", "Filme ou série"];

  return favoriteThemes
    .map((theme, index) => {
      if (!theme) {
        return "";
      }

      return `<span class="profile-tag">${escapeHtml(labels[index] || "Preferência")}: ${escapeHtml(theme)}</span>`;
    })
    .filter(Boolean)
    .join("");
}

async function renderChildrenList() {
  if (!childrenList || !window.EstudaData) {
    return;
  }

  try {
    const children = await window.EstudaData.listChildren();

    if (children.length === 0) {
      childrenList.innerHTML = `
        <div class="empty-children-state">
          Nenhuma criança cadastrada ainda.
        </div>
      `;
      return;
    }

    childrenList.innerHTML = children.map((child) => `
      <article class="child-profile-card">
        <div class="child-profile-header">
          <span class="content-tag">${escapeHtml(child.grade)}</span>
          <h4>${escapeHtml(child.studentName)}</h4>
        </div>
        <p class="registry-copy">${escapeHtml(String(child.age || ""))} anos</p>
        <div class="profile-tags">
          ${buildPreferenceTags(child.favoriteThemes)}
        </div>
      </article>
    `).join("");
  } catch (error) {
    childrenList.innerHTML = `<div class="empty-children-state">${escapeHtml(error.message)}</div>`;
  }
}

if (childrenForm) {
  childrenForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(childrenForm);
    const studentName = String(formData.get("studentName") || "").trim();
    const age = Number(formData.get("age") || 0);
    const grade = String(formData.get("grade") || "").trim();
    const favoriteThemes = [
      String(formData.get("favoriteTheme1") || "").trim(),
      String(formData.get("favoriteTheme2") || "").trim(),
      String(formData.get("favoriteTheme3") || "").trim()
    ].filter(Boolean);

    if (!studentName || !age || !grade || favoriteThemes.length === 0) {
      showChildrenStatus("Preencha nome, idade, série e pelo menos um desenho favorito.", "error");
      return;
    }

    try {
      await window.EstudaData.saveChild({
        studentName,
        age,
        grade,
        favoriteThemes
      });

      await renderChildrenList();
      childrenForm.reset();
      showChildrenStatus(`Cadastro salvo para ${studentName}.`);
    } catch (error) {
      showChildrenStatus(error.message, "error");
    }
  });
}

renderChildrenList();
