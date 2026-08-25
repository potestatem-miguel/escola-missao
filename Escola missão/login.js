const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginStatus = document.getElementById("login-status");
const authModeButtons = document.querySelectorAll("[data-auth-mode]");

let currentMode = "login";

function showLoginStatus(message, type = "error") {
  loginStatus.textContent = message;
  loginStatus.classList.remove("hidden");
  loginStatus.style.background = type === "error" ? "rgba(249, 215, 218, 0.88)" : "rgba(223, 244, 223, 0.88)";
  loginStatus.style.borderColor = type === "error" ? "rgba(138, 29, 45, 0.18)" : "rgba(20, 93, 41, 0.18)";
  loginStatus.style.color = type === "error" ? "#8a1d2d" : "#145d29";
}

function setMode(mode) {
  currentMode = mode;
  authModeButtons.forEach((button) => {
    const isActive = button.dataset.authMode === mode;
    button.classList.toggle("active-auth-mode", isActive);
  });

  loginForm.classList.toggle("hidden", mode !== "login");
  registerForm.classList.toggle("hidden", mode !== "register");
  loginStatus.classList.add("hidden");
}

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.authMode));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const result = await window.EstudaAuth.login(email, password);

  if (!result.ok) {
    showLoginStatus(result.error, "error");
    return;
  }

  showLoginStatus("Login realizado com sucesso.", "success");
  window.location.href = "index.html";
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(registerForm);
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("registerEmail") || "").trim();
  const password = String(formData.get("registerPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    showLoginStatus("As senhas não conferem.", "error");
    return;
  }

  if (password.length < 6) {
    showLoginStatus("A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }

  const result = await window.EstudaAuth.register(fullName, email, password);

  if (!result.ok) {
    showLoginStatus(result.error, "error");
    return;
  }

  if (result.needsEmailConfirmation) {
    showLoginStatus("Conta criada. Verifique seu email para confirmar o cadastro antes de entrar.", "success");
    setMode("login");
    loginForm.querySelector('[name="email"]').value = email;
    registerForm.reset();
    return;
  }

  showLoginStatus("Conta criada com sucesso. Você já pode usar a plataforma.", "success");
  window.location.href = "index.html";
});

setMode(currentMode);
