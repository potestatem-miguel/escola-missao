(function () {
  const config = window.ESTUDA_SUPABASE_CONFIG || {};
  const hasValidConfig = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  const client = hasValidConfig
    ? window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  function getCurrentPage() {
    return window.location.pathname.split("/").pop() || "index.html";
  }

  async function getSession() {
    if (!client) {
      return null;
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }

    return data.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function login(email, password) {
    if (!client) {
      return { ok: false, error: "Supabase não foi configurado corretamente." };
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || "")
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, user: data.user };
  }

  async function register(name, email, password) {
    if (!client) {
      return { ok: false, error: "Supabase não foi configurado corretamente." };
    }

    const { data, error } = await client.auth.signUp({
      email: String(email || "").trim(),
      password: String(password || ""),
      options: {
        data: {
          full_name: String(name || "").trim()
        }
      }
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const needsEmailConfirmation = !data.session;
    return {
      ok: true,
      user: data.user,
      needsEmailConfirmation
    };
  }

  async function logout() {
    if (client) {
      await client.auth.signOut();
    }
    window.location.href = "login.html";
  }

  async function requireAuth() {
    const currentPage = getCurrentPage();
    const isLoginPage = currentPage === "login.html";
    const session = await getSession().catch(() => null);

    if (!session && !isLoginPage) {
      window.location.href = "login.html";
      return false;
    }

    if (session && isLoginPage) {
      window.location.href = "index.html";
      return false;
    }

    return true;
  }

  async function bindSessionUi() {
    const user = await getUser().catch(() => null);
    const emailTargets = document.querySelectorAll("[data-session-email]");
    const logoutButtons = document.querySelectorAll("[data-logout-button]");

    emailTargets.forEach((target) => {
      target.textContent = user?.email || "";
    });

    logoutButtons.forEach((button) => {
      button.addEventListener("click", logout);
    });
  }

  window.EstudaAuth = {
    getClient() {
      return client;
    },
    async getSession() {
      return getSession();
    },
    async getUser() {
      return getUser();
    },
    async login(email, password) {
      return login(email, password);
    },
    async register(name, email, password) {
      return register(name, email, password);
    },
    async logout() {
      return logout();
    },
    async requireAuth() {
      return requireAuth();
    },
    getScopedKey(baseKey) {
      return baseKey;
    },
    migrateLegacyKey(baseKey) {
      return baseKey;
    }
  };

  requireAuth().then((allowed) => {
    if (!allowed) {
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        bindSessionUi();
      }, { once: true });
    } else {
      bindSessionUi();
    }
  });
})();
