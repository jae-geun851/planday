/**
 * PlanDay — 14-4 보안 유틸 (rate limit · 입력 · 오류 메시지)
 */
window.createPlanDaySecurity = function createPlanDaySecurity(deps) {
  const CHAT_MESSAGE_MAX_LENGTH = 2000;
  const CHAT_DAILY_API_LIMIT = 100;

  function isDevHost() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "";
  }

  function kstTodayStr() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  }

  function userFacingError(err, fallback) {
    const msg = err?.message || String(err || "");
    if (isDevHost()) return msg || fallback || "오류가 발생했습니다.";
    if (/does not exist|Could not find|42P01/i.test(msg)) {
      return "데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
    if (/role change not allowed|invalid role/i.test(msg)) {
      return "권한 오류가 발생했습니다.";
    }
    if (/JWT|Unauthorized|401|403/i.test(msg)) {
      return "로그인이 필요합니다. 다시 로그인해 주세요.";
    }
    return fallback || "요청 처리 중 오류가 발생했습니다.";
  }

  async function assertChatDailyLimit() {
    const user = deps.getCurrentUser?.();
    const supabase = deps.getSupabase?.();
    if (!user || !supabase) {
      throw new Error("LOGIN_REQUIRED");
    }

    const today = kstTodayStr();
    const { data, error } = await supabase
      .from("api_usage_daily")
      .select("api_call_count")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();

    if (error) {
      if (/does not exist|Could not find/i.test(error.message || "")) return;
      console.warn("daily limit check failed", error);
      return;
    }

    if ((Number(data?.api_call_count) || 0) >= CHAT_DAILY_API_LIMIT) {
      throw new Error("DAILY_LIMIT_EXCEEDED");
    }
  }

  function clampChatMessage(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= CHAT_MESSAGE_MAX_LENGTH) return trimmed;
    return trimmed.slice(0, CHAT_MESSAGE_MAX_LENGTH);
  }

  return {
    CHAT_MESSAGE_MAX_LENGTH,
    CHAT_DAILY_API_LIMIT,
    isDevHost,
    userFacingError,
    assertChatDailyLimit,
    clampChatMessage
  };
};
