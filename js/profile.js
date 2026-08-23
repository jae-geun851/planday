/**
 * PlanDay — 내 프로필 · 약관 동의 (12-1차시)
 * 사용: window.createPlanDayProfile(deps)
 */
window.createPlanDayProfile = function createPlanDayProfile(deps) {
  const $ = deps.$;
  let cachedPolicies = { terms: null, privacy: null };
  let policyById = new Map();

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return iso;
    }
  }

  function policyTypeLabel(type) {
    return type === "terms" ? "서비스 이용약관" : type === "privacy" ? "개인정보 처리방침" : "정책";
  }

  async function loadPoliciesForProfile() {
    const result = await deps.loadActivePolicies();
    cachedPolicies = { terms: result.terms, privacy: result.privacy };
    policyById = new Map();
    if (result.terms) policyById.set(result.terms.id, result.terms);
    if (result.privacy) policyById.set(result.privacy.id, result.privacy);
    return result;
  }

  function renderConsentRows(consents) {
    const tbody = $("profile-consent-body");
    if (!consents.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="profile-empty-cell">동의 이력이 없습니다.</td></tr>';
      return;
    }

    const sorted = [...consents].sort((a, b) => new Date(b.agreed_at) - new Date(a.agreed_at));
    tbody.innerHTML = sorted.map(c => {
      const policy = policyById.get(c.policy_id);
      const label = policy ? policyTypeLabel(policy.policy_type) : "정책";
      const version = c.policy_version || policy?.version || "—";
      const agreedAt = formatDateTime(c.agreed_at);
      const viewType = policy?.policy_type || "";
      return `<tr>
        <td>${deps.escapeHtml(label)}</td>
        <td>v${deps.escapeHtml(version)}</td>
        <td>${deps.escapeHtml(agreedAt)}</td>
        <td>${viewType ? `<button type="button" class="link-btn profile-consent-view" data-policy-type="${viewType}">보기</button>` : "—"}</td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll(".profile-consent-view").forEach(btn => {
      btn.addEventListener("click", () => openPolicyDetail(btn.dataset.policyType));
    });
  }

  async function fillProfileForm() {
    const currentUser = deps.getCurrentUser();
    const profile = deps.getUserProfile();
    $("profile-error").textContent = "";
    $("profile-email").value = currentUser?.email || "";
    $("profile-nickname").value = profile?.nickname || "";
    $("profile-phone").value = profile?.phone || "";
    $("profile-created-at").textContent = formatDateTime(profile?.created_at);
    $("profile-updated-at").textContent = formatDateTime(profile?.updated_at);

    const policies = await loadPoliciesForProfile();
    if (policies.missingTable || policies.error) {
      renderConsentRows([]);
      $("profile-error").textContent = policies.missingTable
        ? "정책 테이블이 없습니다. SQL을 실행해 주세요."
        : (policies.error || "");
      return;
    }

    const { consents } = await deps.loadUserConsents(currentUser.id);
    renderConsentRows(consents);
  }

  function openProfileModal() {
    if (!deps.getCurrentUser()) {
      deps.showToast("로그인이 필요합니다");
      return;
    }
    $("profile-modal").classList.add("open");
    document.body.style.overflow = "hidden";
    void fillProfileForm();
  }

  function closeProfileModal() {
    $("profile-modal").classList.remove("open");
    document.body.style.overflow = "";
    $("profile-error").textContent = "";
  }

  function openPolicyDetail(policyType) {
    const policy = policyType === "terms" ? cachedPolicies.terms : cachedPolicies.privacy;
    if (!policy) {
      deps.showToast("정책 내용을 불러올 수 없습니다");
      return;
    }
    $("policy-detail-title").textContent = policy.title || policyTypeLabel(policyType);
    $("policy-detail-meta").textContent = `버전 ${policy.version} · 시행 ${formatDateTime(policy.effective_at)}`;
    $("policy-detail-content").textContent = policy.content || "내용 없음";
    $("policy-detail-modal").classList.add("open");
  }

  function closePolicyDetailModal() {
    $("policy-detail-modal").classList.remove("open");
  }

  async function saveProfileChanges(e) {
    e.preventDefault();
    const errEl = $("profile-error");
    errEl.textContent = "";
    errEl.style.color = "var(--danger)";

    const currentUser = deps.getCurrentUser();
    const supabase = deps.getSupabase();
    if (!currentUser || !supabase) {
      errEl.textContent = "로그인 상태를 확인할 수 없습니다.";
      return;
    }

    const nickname = $("profile-nickname").value.trim();
    const phone = $("profile-phone").value.trim();
    if (!nickname) { errEl.textContent = "이름(닉네임)을 입력해 주세요."; return; }
    if (!phone) { errEl.textContent = "전화번호를 입력해 주세요."; return; }
    if (!deps.isValidPhone(phone)) { errEl.textContent = "올바른 전화번호 형식을 입력해 주세요."; return; }

    const saveBtn = $("profile-save-btn");
    saveBtn.disabled = true;
    try {
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id: currentUser.id,
          nickname,
          phone,
          profile_completed: true
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      const { profile } = await deps.loadUserProfile(currentUser.id);
      deps.setUserProfile(profile);
      deps.updateUserUi();
      $("profile-created-at").textContent = formatDateTime(profile?.created_at);
      $("profile-updated-at").textContent = formatDateTime(profile?.updated_at);
      deps.showToast("프로필이 저장되었습니다");
      closeProfileModal();
    } catch (err) {
      console.error(err);
      errEl.textContent = deps.userFacingError
        ? deps.userFacingError(err, "저장에 실패했습니다")
        : (err.message?.includes("does not exist")
          ? "프로필 테이블이 없습니다. database/create_privacy_policy_tables.sql을 실행하세요."
          : (err.message || "저장에 실패했습니다"));
    } finally {
      saveBtn.disabled = false;
    }
  }

  function setupSidebarToggle() {
    const toggle = $("sidebar-toggle");
    const shell = $("app-shell");
    if (!toggle || !shell) return;

    toggle.addEventListener("click", () => {
      const open = shell.classList.toggle("sidebar-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
    });

    document.addEventListener("click", e => {
      if (!shell.classList.contains("sidebar-open")) return;
      if (window.innerWidth > 860) return;
      const sidebar = $("app-sidebar");
      if (sidebar?.contains(e.target) || toggle.contains(e.target)) return;
      shell.classList.remove("sidebar-open");
      toggle.setAttribute("aria-expanded", "false");
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) {
        shell.classList.remove("sidebar-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function setupEvents() {
    $("profile-btn")?.addEventListener("click", openProfileModal);
    $("profile-modal-close")?.addEventListener("click", closeProfileModal);
    $("profile-cancel")?.addEventListener("click", closeProfileModal);
    $("profile-form")?.addEventListener("submit", saveProfileChanges);
    $("profile-view-terms")?.addEventListener("click", () => openPolicyDetail("terms"));
    $("profile-view-privacy")?.addEventListener("click", () => openPolicyDetail("privacy"));
    $("policy-detail-close")?.addEventListener("click", closePolicyDetailModal);
    $("policy-detail-ok")?.addEventListener("click", closePolicyDetailModal);

    $("profile-modal")?.addEventListener("click", e => {
      if (e.target === $("profile-modal")) closeProfileModal();
    });
    $("policy-detail-modal")?.addEventListener("click", e => {
      if (e.target === $("policy-detail-modal")) closePolicyDetailModal();
    });

    setupSidebarToggle();
  }

  return {
    openProfileModal,
    closeProfileModal,
    setupEvents
  };
};
