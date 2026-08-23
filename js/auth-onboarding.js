/**
 * PlanDay — 인증 · 온보딩 · 약관 동의 (11-3차시 분리)
 * 사용: window.createPlanDayAuth(deps)
 */
window.createPlanDayAuth = function createPlanDayAuth(deps) {
  const QUERY_TIMEOUT_MS = 10000;
  let activePolicies = { terms: null, privacy: null };
  let sessionCheckPromise = null;
  let sessionHandledFromGetSession = false;

  const $ = deps.$;
  const chat = () => deps.getChat?.();

  function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function hideChat() {
    chat()?.setWidgetVisible(false);
    chat()?.closePanel?.();
  }

  function showAuthLoginPage() {
    $("auth-login-page").hidden = false;
    $("auth-signup-page").hidden = true;
    $("auth-checking-page").hidden = true;
  }

  function showAuthSignupPage() {
    $("auth-login-page").hidden = true;
    $("auth-signup-page").hidden = false;
    $("auth-checking-page").hidden = true;
    $("signup-error").textContent = "";
  }

  function showSessionCheckScreen(message) {
    $("auth-login-page").hidden = true;
    $("auth-signup-page").hidden = true;
    $("auth-checking-page").hidden = false;
    $("auth-checking-message").textContent = message || "사용자 정보를 확인하는 중...";
    $("auth-checking-error").textContent = "";
    $("auth-checking-retry").hidden = true;
    $("auth-checking-back").hidden = true;
    $("auth-screen").hidden = false;
    $("onboarding-screen").hidden = true;
    $("app-shell").hidden = true;
    hideChat();
  }

  function showSessionCheckError(message) {
    $("auth-checking-message").textContent = "사용자 정보 확인에 실패했습니다";
    $("auth-checking-error").textContent = message || "잠시 후 다시 시도해 주세요.";
    $("auth-checking-retry").hidden = false;
    $("auth-checking-back").hidden = false;
  }

  function hideSessionCheckScreen() {
    $("auth-checking-page").hidden = true;
  }

  function showAuthScreen() {
    sessionCheckPromise = null;
    showAuthLoginPage();
    $("auth-screen").hidden = false;
    $("onboarding-screen").hidden = true;
    $("app-shell").hidden = true;
    $("login-error").textContent = "";
    hideChat();
  }

  function hideAuthScreen() {
    hideSessionCheckScreen();
    $("auth-screen").hidden = true;
  }

  function isMissingTableError(error) {
    const msg = error?.message || "";
    return error?.code === "42P01" || msg.includes("does not exist") || msg.includes("Could not find");
  }

  async function runSupabaseQuery(queryPromise, label) {
    const result = await withTimeout(queryPromise, QUERY_TIMEOUT_MS, `${label} 시간 초과`);
    if (result.error) {
      if (isMissingTableError(result.error)) {
        return { data: null, error: null, missingTable: true };
      }
      return { data: null, error: new Error(`${label} 실패: ${result.error.message}`), missingTable: false };
    }
    return { data: result.data, error: null, missingTable: false };
  }

  function showOnboardingScreen() {
    $("auth-screen").hidden = true;
    $("onboarding-screen").hidden = false;
    $("app-shell").hidden = true;
    $("onboarding-error").textContent = "";
    hideChat();
    void prepareOnboardingScreen();
  }

  function hideOnboardingScreen() {
    $("onboarding-screen").hidden = true;
  }

  function showMainAppShell() {
    hideAuthScreen();
    hideOnboardingScreen();
    $("app-shell").hidden = false;
    chat()?.setWidgetVisible(true);
  }

  async function loadActivePolicies() {
    const supabase = deps.getSupabase();
    if (!supabase) return { terms: null, privacy: null, error: "Supabase 미연결", missingTable: false };
    const { data, error, missingTable } = await runSupabaseQuery(
      supabase.from("policy_versions").select("*").eq("is_active", true).in("policy_type", ["terms", "privacy"]),
      "정책 버전"
    );
    if (missingTable) return { terms: null, privacy: null, error: null, missingTable: true };
    if (error) return { terms: null, privacy: null, error: error.message, missingTable: false };
    const terms = (data || []).find(p => p.policy_type === "terms") || null;
    const privacy = (data || []).find(p => p.policy_type === "privacy") || null;
    return { terms, privacy, error: null, missingTable: false };
  }

  async function loadUserProfile(userId) {
    const supabase = deps.getSupabase();
    if (!supabase || !userId) return { profile: null, error: null, missingTable: false };
    const { data, error, missingTable } = await runSupabaseQuery(
      supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
      "사용자 프로필"
    );
    if (missingTable) return { profile: null, error: null, missingTable: true };
    if (error) return { profile: null, error: error.message, missingTable: false };
    return { profile: data, error: null, missingTable: false };
  }

  async function loadUserConsents(userId) {
    const supabase = deps.getSupabase();
    if (!supabase || !userId) return { consents: [], error: null, missingTable: false };
    const { data, error, missingTable } = await runSupabaseQuery(
      supabase.from("user_policy_consents").select("*").eq("user_id", userId).eq("agreed", true),
      "정책 동의 이력"
    );
    if (missingTable) return { consents: [], error: null, missingTable: true };
    if (error) return { consents: [], error: error.message, missingTable: false };
    return { consents: data || [], error: null, missingTable: false };
  }

  function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  }

  async function checkUserOnboardingStatus(userId) {
    const profileResult = await loadUserProfile(userId);
    if (profileResult.missingTable) return { complete: false, error: null };
    if (profileResult.error) return { complete: false, error: profileResult.error };

    const profile = profileResult.profile;
    if (!profile?.profile_completed) return { complete: false, error: null };
    if (!profile.nickname?.trim() || !profile.phone?.trim()) return { complete: false, error: null };

    const policies = await loadActivePolicies();
    if (policies.missingTable) return { complete: false, error: null };
    if (policies.error) return { complete: false, error: policies.error };
    if (!policies.terms || !policies.privacy) return { complete: false, error: null };

    const consentResult = await loadUserConsents(userId);
    if (consentResult.missingTable) return { complete: false, error: null };
    if (consentResult.error) return { complete: false, error: consentResult.error };

    const consents = consentResult.consents;
    const hasTerms = consents.some(c =>
      c.policy_id === policies.terms.id &&
      c.agreed &&
      c.policy_version === policies.terms.version
    );
    const hasPrivacy = consents.some(c =>
      c.policy_id === policies.privacy.id &&
      c.agreed &&
      c.policy_version === policies.privacy.version
    );
    return { complete: hasTerms && hasPrivacy, error: null };
  }

  async function prepareOnboardingScreen() {
    $("onboarding-error").textContent = "";
    $("onboarding-terms").checked = false;
    $("onboarding-privacy").checked = false;

    const policies = await loadActivePolicies();
    activePolicies = { terms: policies.terms, privacy: policies.privacy };

    if (policies.missingTable || policies.error) {
      $("policy-terms-content").textContent = "정책을 불러올 수 없습니다.";
      $("policy-privacy-content").textContent = "정책을 불러올 수 없습니다.";
      $("onboarding-error").textContent = policies.missingTable
        ? "정책 테이블을 찾을 수 없습니다. Supabase SQL Editor에서 database/create_privacy_policy_tables.sql을 실행하세요."
        : policies.error;
      return;
    }

    if (!policies.terms || !policies.privacy) {
      $("onboarding-error").textContent =
        "활성화된 약관/개인정보 처리방침이 없습니다. SQL 초기 데이터를 확인하세요.";
    }

    $("policy-terms-content").textContent = policies.terms?.content || "약관 내용 없음";
    $("policy-privacy-content").textContent = policies.privacy?.content || "개인정보 처리방침 내용 없음";

    const currentUser = deps.getCurrentUser();
    if (currentUser) {
      const { profile } = await loadUserProfile(currentUser.id);
      $("onboarding-nickname").value = profile?.nickname || "";
      $("onboarding-phone").value = profile?.phone || "";
    }
  }

  async function saveOnboardingProfile(nickname, phone) {
    const supabase = deps.getSupabase();
    const currentUser = deps.getCurrentUser();
    const { error } = await supabase.from("user_profiles").upsert(
      { user_id: currentUser.id, nickname, phone, profile_completed: true },
      { onConflict: "user_id" }
    );
    if (error) throw error;
  }

  async function savePolicyConsents() {
    const supabase = deps.getSupabase();
    const currentUser = deps.getCurrentUser();
    const rows = [];
    if (activePolicies.terms) {
      rows.push({
        user_id: currentUser.id,
        policy_id: activePolicies.terms.id,
        agreed: true,
        policy_version: activePolicies.terms.version
      });
    }
    if (activePolicies.privacy) {
      rows.push({
        user_id: currentUser.id,
        policy_id: activePolicies.privacy.id,
        agreed: true,
        policy_version: activePolicies.privacy.version
      });
    }
    if (!rows.length) throw new Error("동의할 정책 정보가 없습니다.");
    const { error } = await supabase.from("user_policy_consents").upsert(rows, {
      onConflict: "user_id,policy_id"
    });
    if (error) throw error;
  }

  function updateUserUi() {
    const currentUser = deps.getCurrentUser();
    const userProfile = deps.getUserProfile();
    const headerNav = $("app-header-nav");
    const profileName = $("header-profile-name");

    if (currentUser && deps.isSupabaseConfigured()) {
      if (headerNav) headerNav.hidden = false;
      const nickname = userProfile?.nickname?.trim();
      if (profileName) {
        profileName.textContent = nickname || currentUser.email?.split("@")[0] || "프로필";
      }
    } else {
      if (headerNav) headerNav.hidden = true;
      if (profileName) profileName.textContent = "프로필";
    }
  }

  async function enterMainApp() {
    const currentUser = deps.getCurrentUser();
    const { profile } = await loadUserProfile(currentUser.id);
    deps.setUserProfile(profile);
    showMainAppShell();
    updateUserUi();
    $("search-input").value = "";
    deps.setEvents(await deps.loadEventsFromSupabase());
    if (deps.getEvents().length === 0 && deps.isDemoAccount(currentUser)) {
      await deps.seedCloudSampleIfEmpty();
    }
    await chat()?.initForUser?.();
    deps.renderAll();
  }

  async function resolveSessionAfterLogin(user) {
    showSessionCheckScreen("사용자 정보를 확인하는 중...");
    const status = await checkUserOnboardingStatus(user.id);

    if (status.error) {
      console.error(status.error);
      showSessionCheckError(status.error);
      return;
    }

    if (!status.complete) {
      hideSessionCheckScreen();
      hideAuthScreen();
      showOnboardingScreen();
      return;
    }

    hideSessionCheckScreen();
    await enterMainApp();
  }

  async function onLogin(user) {
    if (sessionCheckPromise) return sessionCheckPromise;

    sessionCheckPromise = (async () => {
      deps.setCurrentUser(user);
      try {
        await resolveSessionAfterLogin(user);
      } catch (err) {
        console.error(err);
        showSessionCheckError(err.message || "사용자 정보 확인 중 오류가 발생했습니다.");
      } finally {
        sessionCheckPromise = null;
      }
    })();

    return sessionCheckPromise;
  }

  async function onLogout() {
    const supabase = deps.getSupabase();
    if (supabase) await supabase.auth.signOut();
    sessionHandledFromGetSession = false;
    sessionCheckPromise = null;
    deps.setCurrentUser(null);
    deps.setUserProfile(null);
    activePolicies = { terms: null, privacy: null };
    deps.setEvents([]);
    chat()?.resetForUser?.();
    showAuthScreen();
  }

  async function initSupabase() {
    const readySubtitle = "로그인하고 일정을 클라우드에 저장하세요";
    try {
      if (!window.supabase?.createClient) {
        throw new Error("Supabase SDK 로드 실패. 인터넷 연결을 확인하세요.");
      }
      const client = window.supabase.createClient(deps.SUPABASE_URL, deps.SUPABASE_ANON_KEY);
      deps.setSupabase(client);

      const { data: { session }, error } = await withTimeout(
        client.auth.getSession(),
        12000,
        "Supabase 연결 시간 초과. 인터넷 연결 또는 API Key를 확인해 주세요."
      );
      if (error) throw error;

      $("auth-subtitle").textContent = readySubtitle;

      if (session?.user) {
        sessionHandledFromGetSession = true;
        await onLogin(session.user);
      } else {
        showAuthScreen();
      }

      client.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          if (event === "INITIAL_SESSION" && sessionHandledFromGetSession) return;
          const currentUser = deps.getCurrentUser();
          if (!currentUser || currentUser.id !== session.user.id) {
            await onLogin(session.user);
          }
        } else if (deps.getCurrentUser()) {
          sessionHandledFromGetSession = false;
          deps.setCurrentUser(null);
          deps.setUserProfile(null);
          activePolicies = { terms: null, privacy: null };
          sessionCheckPromise = null;
          deps.setEvents([]);
          chat()?.resetForUser?.();
          showAuthScreen();
        }
      });
    } catch (err) {
      console.error(err);
      $("auth-subtitle").textContent = readySubtitle;
      $("login-error").style.color = "var(--danger)";
      $("login-error").textContent = err.message || "Supabase 연결 실패";
      showAuthScreen();
      throw err;
    }
  }

  function setupEvents() {
    $("login-form").addEventListener("submit", async e => {
      e.preventDefault();
      $("login-error").textContent = "";
      const supabase = deps.getSupabase();
      if (!supabase) {
        $("login-error").style.color = "var(--danger)";
        $("login-error").textContent = deps.getInitAppDone()
          ? "Supabase 연결에 실패했습니다. F12 Console 오류를 확인하고 새로고침해 주세요."
          : "Supabase 연결 중입니다. 1~2초 후 다시 시도해 주세요.";
        return;
      }
      const email = $("login-email").value.trim();
      const password = $("login-password").value;
      showSessionCheckScreen("로그인 중...");
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } catch (err) {
        showAuthLoginPage();
        $("login-error").style.color = "var(--danger)";
        $("login-error").textContent = err.message || "로그인에 실패했습니다";
      }
    });

    $("signup-form").addEventListener("submit", async e => {
      e.preventDefault();
      $("signup-error").textContent = "";
      const supabase = deps.getSupabase();
      if (!supabase) {
        $("signup-error").style.color = "var(--danger)";
        $("signup-error").textContent = deps.getInitAppDone()
          ? "Supabase 연결에 실패했습니다. F12 Console 오류를 확인하고 새로고침해 주세요."
          : "Supabase 연결 중입니다. 1~2초 후 다시 시도해 주세요.";
        return;
      }
      const email = $("signup-email").value.trim();
      const password = $("signup-password").value;
      const password2 = $("signup-password2").value;
      if (password !== password2) {
        $("signup-error").style.color = "var(--danger)";
        $("signup-error").textContent = "비밀번호가 일치하지 않습니다";
        return;
      }
      try {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        showAuthLoginPage();
        $("login-email").value = email;
        $("login-password").value = "";
        $("login-error").style.color = "var(--success)";
        $("login-error").textContent = "가입 완료! 로그인해 주세요.";
      } catch (err) {
        $("signup-error").style.color = "var(--danger)";
        $("signup-error").textContent = err.message || "회원가입에 실패했습니다";
      }
    });

    $("onboarding-form").addEventListener("submit", async e => {
      e.preventDefault();
      const errEl = $("onboarding-error");
      errEl.textContent = "";
      errEl.style.color = "var(--danger)";

      const supabase = deps.getSupabase();
      const currentUser = deps.getCurrentUser();
      if (!supabase || !currentUser) {
        errEl.textContent = "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.";
        return;
      }

      const nickname = $("onboarding-nickname").value.trim();
      const phone = $("onboarding-phone").value.trim();
      const termsOk = $("onboarding-terms").checked;
      const privacyOk = $("onboarding-privacy").checked;

      if (!nickname) { errEl.textContent = "닉네임을 입력해 주세요."; return; }
      if (!phone) { errEl.textContent = "전화번호를 입력해 주세요."; return; }
      if (!isValidPhone(phone)) { errEl.textContent = "올바른 전화번호 형식을 입력해 주세요."; return; }
      if (!termsOk || !privacyOk) {
        errEl.textContent = "서비스 이용약관과 개인정보 처리방침에 모두 동의해야 합니다.";
        return;
      }
      if (!activePolicies.terms || !activePolicies.privacy) {
        errEl.textContent = "정책 정보를 불러오지 못했습니다. SQL 실행 후 새로고침해 주세요.";
        return;
      }

      const submitBtn = e.target.querySelector(".submit-btn");
      submitBtn.disabled = true;
      try {
        await saveOnboardingProfile(nickname, phone);
        await savePolicyConsents();
        await enterMainApp();
        deps.showToast("프로필 등록이 완료되었습니다");
      } catch (err) {
        console.error(err);
        errEl.textContent = err.message?.includes("does not exist") || err.code === "42P01"
          ? "프로필/동의 테이블이 없습니다. database/create_privacy_policy_tables.sql을 실행하세요."
          : (err.message || "저장에 실패했습니다");
      } finally {
        submitBtn.disabled = false;
      }
    });

    $("go-signup").addEventListener("click", showAuthSignupPage);
    $("go-login").addEventListener("click", showAuthLoginPage);

    $("auth-checking-retry").addEventListener("click", () => {
      const currentUser = deps.getCurrentUser();
      if (currentUser) void onLogin(currentUser);
    });

    $("auth-checking-back").addEventListener("click", async () => {
      await onLogout();
    });

    $("header-logout-btn").addEventListener("click", onLogout);
  }

  return {
    showAuthLoginPage,
    showAuthSignupPage,
    showAuthScreen,
    showSessionCheckScreen,
    onLogin,
    onLogout,
    initSupabase,
    enterMainApp,
    updateUserUi,
    setupEvents,
    loadUserProfile,
    loadUserConsents,
    loadActivePolicies,
    isValidPhone
  };
};
