/**
 * PlanDay — 일정 데이터 저장/불러오기 (11-3 2단계)
 * 사용: window.createPlanDayEventsStore(deps)
 */
window.createPlanDayEventsStore = function createPlanDayEventsStore(deps) {
  const STORAGE_KEY = "planDayEvents";
  const SEED_KEY = "planDaySeeded_v7";

  function normalizeEvent(e) {
    return {
      id: e.id || crypto.randomUUID(),
      title: e.title || "",
      date: e.date,
      time: e.time || "09:00",
      memo: e.memo || "",
      category: e.category || "other",
      important: !!e.important,
      dday: !!e.dday,
      repeat: e.repeat || "none",
      doneDates: e.doneDates || (e.done ? [e.date] : [])
    };
  }

  function rowToEvent(row) {
    return normalizeEvent({
      id: row.id,
      title: row.title,
      date: row.date,
      time: row.time,
      memo: row.memo,
      category: row.category,
      important: row.important,
      dday: row.dday,
      repeat: row.repeat_type ?? row.repeat ?? "none",
      doneDates: row.done_dates || []
    });
  }

  function loadEventsLocal() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data).map(normalizeEvent) : [];
    } catch {
      return [];
    }
  }

  async function loadEventsFromSupabase() {
    const supabase = deps.getSupabase();
    const currentUser = deps.getCurrentUser();
    if (!supabase || !currentUser) return [];
    const userId = currentUser.id;
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("user_id", userId)
      .order("date")
      .order("time");
    if (error) {
      console.error(error);
      const msg = error.message?.includes("does not exist") || error.code === "42P01"
        ? "events 테이블이 없습니다. Supabase SQL Editor에서 supabase-setup.sql을 실행하세요."
        : `일정 불러오기 실패: ${error.message}`;
      deps.showToast(msg);
      return [];
    }
    return (data || []).map(rowToEvent);
  }

  async function saveEvents() {
    const events = deps.getEvents();
    const supabase = deps.getSupabase();
    const currentUser = deps.getCurrentUser();

    if (!deps.isSupabaseConfigured() || !currentUser || !supabase) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      return;
    }

    const userId = currentUser.id;
    const rows = events.map(e => ({
      id: e.id,
      user_id: userId,
      title: e.title,
      date: e.date,
      time: e.time,
      memo: e.memo,
      category: e.category,
      important: e.important,
      dday: e.dday,
      repeat_type: e.repeat,
      done_dates: e.doneDates
    }));

    const { error: upsertError } = await supabase.from("events").upsert(rows);
    if (upsertError) {
      console.error(upsertError);
      deps.showToast(`저장 실패: ${upsertError.message}`);
      return false;
    }

    const { data: existing, error: fetchError } = await supabase
      .from("events")
      .select("id")
      .eq("user_id", userId);
    if (!fetchError && existing) {
      const currentIds = new Set(events.map(e => e.id));
      const toDelete = existing.filter(r => !currentIds.has(r.id)).map(r => r.id);
      if (toDelete.length) {
        await supabase.from("events").delete().in("id", toDelete);
      }
    }
    return true;
  }

  async function migrateLocalEventsIfAny() {
    const local = loadEventsLocal();
    if (!local.length) return;
    deps.setEvents(local);
    await saveEvents();
    localStorage.removeItem(STORAGE_KEY);
    deps.showToast("기존 일정을 클라우드로 옮겼습니다");
  }

  function createSampleEvents() {
    const t = new Date();
    return [
      { id: crypto.randomUUID(), title: "test", date: deps.addDays(t, 0), time: "08:00", memo: "아침 루틴", category: "personal", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "커피 타임", date: deps.addDays(t, 0), time: "09:30", memo: "카페에서 공부", category: "personal", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "웹개발 수업", date: deps.addDays(t, 0), time: "10:00", memo: "프로젝트 발표", category: "school", important: true, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "팀 스탠드업", date: deps.addDays(t, 0), time: "11:00", memo: "진행 상황 공유", category: "work", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "점심 약속", date: deps.addDays(t, 0), time: "12:30", memo: "친구 만나기", category: "personal", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "스터디", date: deps.addDays(t, 0), time: "14:00", memo: "JS 복습", category: "school", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "운동", date: deps.addDays(t, 0), time: "16:00", memo: "헬스 1시간", category: "personal", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "알바 준비", date: deps.addDays(t, 0), time: "18:00", memo: "", category: "work", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "저녁 식사", date: deps.addDays(t, 0), time: "19:30", memo: "가족 외식", category: "personal", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "과제 확인", date: deps.addDays(t, 0), time: "20:00", memo: "GitHub push", category: "school", important: true, dday: true, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "코딩 연습", date: deps.addDays(t, 0), time: "21:00", memo: "PlanDay 개선", category: "school", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "어제 회의", date: deps.addDays(t, -1), time: "14:00", memo: "팀 회고", category: "work", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "어제 운동", date: deps.addDays(t, -1), time: "19:00", memo: "조깅", category: "personal", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "그저께 공부", date: deps.addDays(t, -2), time: "10:00", memo: "Git 복습", category: "school", important: false, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "팀 미팅", date: deps.addDays(t, 1), time: "10:30", memo: "주간 공유", category: "work", important: true, dday: false, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "과제 제출", date: deps.addDays(t, 2), time: "23:59", memo: "GitHub URL", category: "school", important: true, dday: true, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "중간고사", date: deps.addDays(t, 7), time: "09:00", memo: "웹개발", category: "school", important: true, dday: true, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "알바", date: deps.addDays(t, 4), time: "17:00", memo: "", category: "work", important: false, dday: false, repeat: "weekly", doneDates: [] },
      { id: crypto.randomUUID(), title: "프로젝트 마감", date: deps.addDays(t, 5), time: "18:00", memo: "최종", category: "work", important: true, dday: true, repeat: "none", doneDates: [] },
      { id: crypto.randomUUID(), title: "장보기", date: deps.addDays(t, 3), time: "16:00", memo: "", category: "other", important: false, dday: false, repeat: "none", doneDates: [] }
    ].map(normalizeEvent);
  }

  function seedSampleData() {
    if (localStorage.getItem(SEED_KEY)) return;
    deps.setEvents(createSampleEvents());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deps.getEvents()));
    localStorage.setItem(SEED_KEY, "1");
  }

  async function seedCloudSampleIfEmpty() {
    const currentUser = deps.getCurrentUser();
    if (!currentUser || !deps.isDemoAccount(currentUser)) return;
    if (deps.getEvents().length > 0) return;
    const key = `planDayCloudSeeded_${currentUser.id}`;
    if (localStorage.getItem(key)) return;
    deps.setEvents(createSampleEvents());
    const ok = await saveEvents();
    if (ok) {
      localStorage.setItem(key, "1");
      deps.showToast("데모 일정을 불러왔습니다");
    }
  }

  return {
    normalizeEvent,
    loadEventsLocal,
    loadEventsFromSupabase,
    saveEvents,
    migrateLocalEventsIfAny,
    createSampleEvents,
    seedSampleData,
    seedCloudSampleIfEmpty
  };
};
