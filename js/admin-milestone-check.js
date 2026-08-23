/**
 * PlanDay — 13-1 관리자 마일스톤 점검 (개발용, 사용자 화면에 노출하지 않음)
 * 브라우저 콘솔: await window.planDayAdminMilestoneCheck()
 */
window.planDayAdminMilestoneCheck = async function planDayAdminMilestoneCheck() {
  const supabase = window.__planDaySupabase;
  if (!supabase) {
    console.warn("[13-1] Supabase 미연결 — index.html 설정 확인");
    return { ok: false, reason: "no_supabase" };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    console.warn("[13-1] 로그인 후 다시 실행하세요.");
    return { ok: false, reason: "not_logged_in" };
  }

  const results = {
    userId: user.id,
    email: user.email,
    isAdmin: false,
    adminListUsers: null,
    usageTotals: null,
    errors: []
  };

  const { data: adminRow, error: adminErr } = await supabase
    .from("admin_users")
    .select("role, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminErr) {
    results.errors.push({ step: "admin_users", message: adminErr.message });
    if (/does not exist|relation/i.test(adminErr.message)) {
      console.error("[13-1] admin_users 테이블 없음 → create_admin_roles.sql 실행");
    }
  } else {
    results.isAdmin = !!adminRow;
    results.adminRole = adminRow?.role || null;
  }

  const { data: users, error: listErr } = await supabase.rpc("admin_list_users");
  if (listErr) {
    results.errors.push({ step: "admin_list_users", message: listErr.message });
  } else {
    results.adminListUsers = users?.length ?? 0;
  }

  const { data: totals, error: totalsErr } = await supabase.rpc("admin_usage_totals");
  if (totalsErr) {
    results.errors.push({ step: "admin_usage_totals", message: totalsErr.message });
  } else {
    results.usageTotals = totals?.[0] || null;
  }

  console.table([
    { 항목: "로그인", 값: user.email },
    { 항목: "관리자 여부", 값: results.isAdmin ? `예 (${results.adminRole})` : "아니오" },
    { 항목: "admin_list_users", 값: results.adminListUsers ?? "—" },
    { 항목: "admin_usage_totals", 값: results.usageTotals ? JSON.stringify(results.usageTotals) : "—" }
  ]);

  if (!results.isAdmin && results.adminListUsers > 0) {
    console.error("[13-1] 보안 문제: 일반 사용자가 전체 목록을 조회했습니다.");
  } else if (results.isAdmin) {
    console.log("[13-1] 관리자 RPC 정상 — 13-2 백오피스 연결 준비 완료");
  } else {
    console.log("[13-1] 일반 사용자 — admin RPC 거부 또는 0건 (정상)");
  }

  return results;
};
