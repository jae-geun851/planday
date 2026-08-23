/**
 * PlanDay — AI API 사용량 · 예상 요금 (12-2차시, Gemini 텍스트)
 * 사용: window.createPlanDayUsageStats(deps)
 */
window.createPlanDayUsageStats = function createPlanDayUsageStats(deps) {
  const $ = deps.$;
  let pricingCache = null;
  let pricingLoadedAt = 0;
  const PRICING_TTL_MS = 5 * 60 * 1000;

  function formatUsd(amount) {
    const n = Number(amount) || 0;
    if (n === 0) return "$0.00";
    if (n < 0.01) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
  }

  function formatTokens(n) {
    const v = Number(n) || 0;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  }

  function formatKstDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
  }

  function formatKstDateTime(date = new Date()) {
    return new Date(date).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }) + " (KST)";
  }

  function todayDateStr() {
    return formatKstDate(new Date());
  }

  function monthStartStr() {
    const today = todayDateStr();
    return `${today.slice(0, 7)}-01`;
  }

  async function loadPricing(force = false) {
    const now = Date.now();
    if (!force && pricingCache && now - pricingLoadedAt < PRICING_TTL_MS) {
      return pricingCache;
    }
    const supabase = deps.getSupabase();
    if (!supabase) {
      pricingCache = [];
      return pricingCache;
    }
    const { data, error } = await supabase
      .from("api_pricing_config")
      .select("*")
      .eq("is_active", true);
    if (error) {
      console.warn("pricing load failed", error);
      pricingCache = [];
      return pricingCache;
    }
    pricingCache = data || [];
    pricingLoadedAt = now;
    return pricingCache;
  }

  function getUnitPrice(pricingRows, modelName, priceType) {
    const row = (pricingRows || []).find(r =>
      r.model_name === modelName && r.price_type === priceType
    );
    if (row) return Number(row.unit_price_usd) || 0;
    const fallback = (pricingRows || []).find(r =>
      r.model_name === "gemini-3.6-flash" && r.price_type === priceType
    );
    return fallback ? Number(fallback.unit_price_usd) || 0 : 0;
  }

  function calculateEstimatedCost(modelName, inputTokens, outputTokens, pricingRows) {
    const inputPrice = getUnitPrice(pricingRows, modelName, "input_text");
    const outputPrice = getUnitPrice(pricingRows, modelName, "output_text");
    const inputCost = (inputTokens / 1_000_000) * inputPrice;
    const outputCost = (outputTokens / 1_000_000) * outputPrice;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

  async function upsertDailySummary(userId, usageDate, inputTokens, outputTokens, costUsd) {
    const supabase = deps.getSupabase();
    const total = inputTokens + outputTokens;
    const { data: existing, error: readErr } = await supabase
      .from("api_usage_daily")
      .select("*")
      .eq("user_id", userId)
      .eq("usage_date", usageDate)
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing) {
      const { error } = await supabase
        .from("api_usage_daily")
        .update({
          input_tokens: Number(existing.input_tokens) + inputTokens,
          output_tokens: Number(existing.output_tokens) + outputTokens,
          total_tokens: Number(existing.total_tokens) + total,
          estimated_cost_usd: Number(existing.estimated_cost_usd) + costUsd,
          api_call_count: Number(existing.api_call_count) + 1
        })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from("api_usage_daily").insert({
      user_id: userId,
      usage_date: usageDate,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: total,
      estimated_cost_usd: costUsd,
      api_call_count: 1
    });
    if (error) throw error;
  }

  async function buildMessageUsageMeta(modelName, usage) {
    if (!usage) return null;
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;
    if (totalTokens <= 0) return null;

    const model = modelName || "gemini-3.6-flash";
    const pricing = await loadPricing();
    const cost = calculateEstimatedCost(model, inputTokens, outputTokens, pricing);

    return {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      audio_input_tokens: 0,
      audio_output_tokens: 0,
      estimated_cost_usd: cost,
      recorded_at: new Date().toISOString()
    };
  }

  async function recordApiUsage({ conversationId, modelName, usage, usageMeta }) {
    const user = deps.getCurrentUser();
    const supabase = deps.getSupabase();
    if (!user || !supabase || !usage) return { ok: false };

    const meta = usageMeta || await buildMessageUsageMeta(modelName, usage);
    if (!meta) return { ok: false };

    const { error: logErr } = await supabase.from("api_usage_logs").insert({
      user_id: user.id,
      conversation_id: conversationId || null,
      model_name: meta.model,
      input_tokens: meta.input_tokens,
      output_tokens: meta.output_tokens,
      total_tokens: meta.total_tokens,
      estimated_cost_usd: meta.estimated_cost_usd
    });
    if (logErr) {
      console.warn("api_usage_logs insert failed", logErr);
      return { ok: false, error: logErr, usageMeta: meta };
    }

    try {
      await upsertDailySummary(
        user.id,
        todayDateStr(),
        meta.input_tokens,
        meta.output_tokens,
        meta.estimated_cost_usd
      );
    } catch (err) {
      console.warn("api_usage_daily upsert failed", err);
    }

    return {
      ok: true,
      cost: meta.estimated_cost_usd,
      inputTokens: meta.input_tokens,
      outputTokens: meta.output_tokens,
      totalTokens: meta.total_tokens,
      usageMeta: meta
    };
  }

  async function fetchUsageSummary() {
    const user = deps.getCurrentUser();
    const supabase = deps.getSupabase();
    if (!user || !supabase) {
      return { missingTable: false, error: "로그인 필요", data: null };
    }

    const monthStart = monthStartStr();
    const today = todayDateStr();

    const [dailyRes, logsRes, sessionsRes] = await Promise.all([
      supabase
        .from("api_usage_daily")
        .select("*")
        .eq("user_id", user.id)
        .gte("usage_date", monthStart)
        .order("usage_date", { ascending: false }),
      supabase
        .from("api_usage_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", `${monthStart}T00:00:00`)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("conversation_records")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50)
    ]);

    const err = dailyRes.error || logsRes.error;
    if (err) {
      const msg = err.message || "";
      const missingTable = err.code === "42P01" || /does not exist|Could not find/i.test(msg);
      return { missingTable, error: msg, data: null };
    }

    const dailyRows = dailyRes.data || [];
    const logs = logsRes.data || [];
    const sessions = sessionsRes.data || [];
    const sessionTitleById = new Map(sessions.map(s => [s.id, s.title || "새 대화"]));

    const monthTotals = dailyRows.reduce(
      (acc, row) => {
        acc.input += Number(row.input_tokens) || 0;
        acc.output += Number(row.output_tokens) || 0;
        acc.total += Number(row.total_tokens) || 0;
        acc.cost += Number(row.estimated_cost_usd) || 0;
        acc.calls += Number(row.api_call_count) || 0;
        return acc;
      },
      { input: 0, output: 0, total: 0, cost: 0, calls: 0 }
    );

    const todayRow = dailyRows.find(r => r.usage_date === today);
    const todayStats = {
      input: todayRow ? Number(todayRow.input_tokens) : 0,
      output: todayRow ? Number(todayRow.output_tokens) : 0,
      total: todayRow ? Number(todayRow.total_tokens) : 0,
      cost: todayRow ? Number(todayRow.estimated_cost_usd) : 0,
      calls: todayRow ? Number(todayRow.api_call_count) : 0
    };

    const byConversation = new Map();
    for (const log of logs) {
      const key = log.conversation_id || "unknown";
      if (!byConversation.has(key)) {
        byConversation.set(key, {
          conversation_id: log.conversation_id,
          title: sessionTitleById.get(log.conversation_id) || "(삭제된 대화)",
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          estimated_cost_usd: 0,
          api_call_count: 0,
          last_used_at: log.created_at
        });
      }
      const row = byConversation.get(key);
      row.input_tokens += log.input_tokens || 0;
      row.output_tokens += log.output_tokens || 0;
      row.total_tokens += log.total_tokens || 0;
      row.estimated_cost_usd += Number(log.estimated_cost_usd) || 0;
      row.api_call_count += 1;
      if (new Date(log.created_at) > new Date(row.last_used_at)) {
        row.last_used_at = log.created_at;
      }
    }

    const conversationRows = [...byConversation.values()]
      .sort((a, b) => new Date(b.last_used_at) - new Date(a.last_used_at));

    const recentLogs = logs.slice(0, 12).map(log => ({
      ...log,
      conversation_title: sessionTitleById.get(log.conversation_id) || "대화"
    }));

    return {
      missingTable: false,
      error: null,
      data: {
        monthTotals,
        todayStats,
        dailyRows,
        conversationRows,
        recentLogs,
        aiConversationCount: conversationRows.length
      }
    };
  }

  async function renderUsageStatsPanel() {
    const panel = $("usage-stats-panel");
    if (!panel) return;

    if (!deps.getCurrentUser()) {
      panel.innerHTML = `<p class="usage-empty">로그인 후 AI 사용량을 확인할 수 있어요.</p>`;
      return;
    }

    panel.innerHTML = `<p class="usage-loading">사용량 불러오는 중...</p>`;
    const result = await fetchUsageSummary();

    if (result.missingTable) {
      panel.innerHTML = `
        <p class="usage-empty">사용량 테이블이 없습니다.</p>
        <p class="usage-hint">Supabase SQL Editor에서 <code>database/create_api_usage_tables.sql</code>을 실행한 뒤 새로고침하세요.</p>`;
      return;
    }
    if (result.error || !result.data) {
      panel.innerHTML = `<p class="usage-empty">사용량을 불러오지 못했습니다.<br>${deps.escapeHtml(result.error || "")}</p>`;
      return;
    }

    const { monthTotals, todayStats, dailyRows, conversationRows, recentLogs, aiConversationCount } = result.data;
    const pricing = await loadPricing();
    const modelNote = pricing.length
      ? `기준 모델: gemini-3.6-flash (입력 $${getUnitPrice(pricing, "gemini-3.6-flash", "input_text")}/1M · 출력 $${getUnitPrice(pricing, "gemini-3.6-flash", "output_text")}/1M)`
      : "가격 설정을 불러오지 못했습니다.";
    const kstToday = todayDateStr();
    const kstNow = formatKstDateTime(new Date());
    const monthLabel = kstToday.slice(0, 7);

    const compareHtml = `
      <div class="usage-compare-box">
        <p class="usage-compare-lead">PlanDay는 <strong>Gemini API</strong>를 사용합니다. (OpenAI/오디오 API 아님)</p>
        <table class="usage-compare-table">
          <thead>
            <tr><th>항목</th><th>PlanDay (앱)</th><th>Google AI Studio (플랫폼)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>비교 기간</td>
              <td>${monthLabel} (KST)</td>
              <td>같은 날짜·월 선택</td>
            </tr>
            <tr>
              <td>오늘 입력 토큰</td>
              <td>${formatTokens(todayStats.input)}</td>
              <td>플랫폼에서 확인</td>
            </tr>
            <tr>
              <td>오늘 출력 토큰</td>
              <td>${formatTokens(todayStats.output)}</td>
              <td>플랫폼에서 확인</td>
            </tr>
            <tr>
              <td>이번 달 입력</td>
              <td>${formatTokens(monthTotals.input)}</td>
              <td>모델별 Usage</td>
            </tr>
            <tr>
              <td>이번 달 출력</td>
              <td>${formatTokens(monthTotals.output)}</td>
              <td>모델별 Usage</td>
            </tr>
            <tr>
              <td>예상 비용</td>
              <td>${formatUsd(monthTotals.cost)}</td>
              <td>무료 할당량 or Billing</td>
            </tr>
            <tr>
              <td>오디오</td>
              <td>해당 없음 (텍스트만)</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
        <ul class="usage-compare-notes">
          <li>앱 기록: 대화·API 호출 단위 · 저장 시각 <strong>KST(한국)</strong></li>
          <li>플랫폼: UTC 또는 프로젝트 시간대 · <strong>반영 지연</strong> 있을 수 있음</li>
          <li>숫자가 100% 일치하지 않아도 정상 — <strong>규모·추세</strong>가 비슷한지 확인</li>
          <li>무료 할당량 사용 시 플랫폼 Billing은 $0일 수 있음</li>
        </ul>
        <div class="usage-platform-links">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio (API Key · Usage)</a>
          <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener noreferrer">Gemini 할당량 문서</a>
          <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">Gemini 가격 문서</a>
        </div>
      </div>`;

    const deployChecklistHtml = `
      <details class="usage-deploy-check">
        <summary>배포 전 최종 점검 (PlanDay)</summary>
        <ol class="usage-deploy-list">
          <li>Supabase URL · Anon Key 설정</li>
          <li>Edge Function <code>gemini-chat</code> 배포 (Verify JWT <strong>ON</strong> · 로그인 필수)</li>
          <li><code>database/fix_user_profiles_role_security.sql</code> 실행 (role 승격 차단)</li>
          <li>SQL: events, conversation_records, privacy, api_usage, <strong>admin_roles</strong> 테이블</li>
          <li>배포 URL에서 로그인 → 프로필 → AI 대화 → 기록 → 사용량 → 로그아웃</li>
          <li>AI 모드 ON + Gemini Key로 대화 후 사용량 탭과 AI Studio 비교</li>
          <li>13-1: <code>admin_users</code> 등록 후 콘솔 <code>await planDayAdminMilestoneCheck()</code></li>
          <li>13-2: <code>admin/</code> 백오피스 템플릿 연결 (같은 Supabase URL/Key)</li>
        </ol>
      </details>`;

    const dailyHtml = dailyRows.length
      ? dailyRows.map(row => `
        <div class="usage-daily-row">
          <span class="usage-daily-date">${row.usage_date}</span>
          <span class="usage-daily-tokens">${formatTokens(row.total_tokens)} tok</span>
          <span class="usage-daily-cost">${formatUsd(row.estimated_cost_usd)}</span>
          <span class="usage-daily-calls">${row.api_call_count}회</span>
        </div>`).join("")
      : `<p class="usage-empty-inline">이번 달 AI 사용 기록이 없습니다.</p>`;

    const convHtml = conversationRows.length
      ? conversationRows.map(row => `
        <div class="usage-conv-row">
          <div class="usage-conv-title">${deps.escapeHtml(row.title)}</div>
          <div class="usage-conv-meta">
            in ${formatTokens(row.input_tokens)} · out ${formatTokens(row.output_tokens)}
            · ${formatUsd(row.estimated_cost_usd)} · ${row.api_call_count}회
          </div>
        </div>`).join("")
      : `<p class="usage-empty-inline">대화별 AI 사용 기록이 없습니다.<br>AI 모드(Gemini)로 대화하면 여기에 표시됩니다.</p>`;

    const recentHtml = recentLogs.length
      ? recentLogs.map(log => {
        const title = log.conversation_title || "대화";
        const time = formatKstDateTime(log.created_at);
        return `
        <div class="usage-recent-row">
          <span class="usage-recent-time">${time}</span>
          <span class="usage-recent-model">${deps.escapeHtml(log.model_name)}</span>
          <span class="usage-recent-tokens">in ${log.input_tokens} · out ${log.output_tokens}</span>
          <span class="usage-recent-cost">${formatUsd(log.estimated_cost_usd)}</span>
          <span class="usage-recent-title">${deps.escapeHtml(title)}</span>
        </div>`;
      }).join("")
      : `<p class="usage-empty-inline">최근 API 호출 기록이 없습니다.</p>`;

    panel.innerHTML = `
      <p class="usage-kst-banner">🕐 앱 집계 기준: <strong>한국 시간(KST)</strong> · ${kstNow} 갱신</p>
      <div class="usage-summary-grid">
        <div class="usage-stat-card">
          <span class="usage-stat-label">이번 달 예상 비용</span>
          <span class="usage-stat-value">${formatUsd(monthTotals.cost)}</span>
        </div>
        <div class="usage-stat-card">
          <span class="usage-stat-label">오늘 토큰 (KST)</span>
          <span class="usage-stat-value">${formatTokens(todayStats.total)}</span>
        </div>
        <div class="usage-stat-card">
          <span class="usage-stat-label">오늘 in / out</span>
          <span class="usage-stat-value usage-stat-value-sm">${formatTokens(todayStats.input)} / ${formatTokens(todayStats.output)}</span>
        </div>
        <div class="usage-stat-card">
          <span class="usage-stat-label">이번 달 API 호출</span>
          <span class="usage-stat-value">${monthTotals.calls}</span>
        </div>
      </div>

      <section class="usage-section">
        <h3>플랫폼과 비교 (12-4)</h3>
        ${compareHtml}
      </section>

      <section class="usage-section">
        <h3>일별 사용량 (KST 날짜)</h3>
        <div class="usage-daily-list">${dailyHtml}</div>
      </section>

      <section class="usage-section">
        <h3>대화별 사용량</h3>
        <div class="usage-conv-list">${convHtml}</div>
      </section>

      <section class="usage-section">
        <h3>최근 API 호출</h3>
        <div class="usage-recent-list">${recentHtml}</div>
      </section>

      <p class="usage-footnote">
        📌 ${deps.escapeHtml(modelNote)}<br>
        Google AI Studio <strong>무료 할당량</strong>을 쓰는 경우 실제 과금은 없을 수 있습니다.
        위 금액은 Paid Tier 기준 <strong>참고용 예상 비용</strong>입니다.<br>
        AI 대화 세션 수(이번 달): ${aiConversationCount}개
      </p>
      ${deployChecklistHtml}
      <button type="button" class="usage-refresh-btn" id="usage-refresh-btn">↻ 새로고침</button>`;

    $("usage-refresh-btn")?.addEventListener("click", () => renderUsageStatsPanel());
  }

  return {
    loadPricing,
    calculateEstimatedCost,
    buildMessageUsageMeta,
    recordApiUsage,
    renderUsageStatsPanel
  };
};
