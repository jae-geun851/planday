/** PlanDay 규칙 기반 챗봇 엔진 — file:// / Live Server 호환 */
(function () {
  const TAB_MAP = {
    홈: "dashboard", 대시: "dashboard", dashboard: "dashboard",
    달력: "calendar", 캘린더: "calendar", calendar: "calendar",
    리스트: "list", 목록: "list", list: "list",
    추가: "add", 일정추가: "add", add: "add"
  };

  const CATEGORY_MAP = {
    학교: "school", school: "school",
    업무: "work", work: "work", 회사: "work",
    개인: "personal", personal: "personal",
    기타: "other", other: "other"
  };

  function findOccurrences(deps, keyword, opts = {}) {
    const q = (keyword || "").trim().toLowerCase();
    if (!q) return [];
    let items = deps.getAllOccurrences(false);
    if (opts.dateStr) items = items.filter(o => o.dateStr === opts.dateStr);
    if (opts.category) items = items.filter(o => o.event.category === opts.category);
    if (opts.important) items = items.filter(o => o.event.important);
    if (opts.upcoming) items = items.filter(o => o.dateStr >= deps.formatDate(new Date()));
    items = items.filter(({ event }) =>
      event.title.toLowerCase().includes(q) ||
      (event.memo || "").toLowerCase().includes(q)
    );
    return items;
  }

  function pickBestMatch(items, dateHint) {
    if (!items.length) return null;
    if (dateHint) {
      const onDate = items.filter(o => o.dateStr === dateHint);
      if (onDate.length === 1) return onDate[0];
      if (onDate.length > 1) return onDate[0];
    }
    if (items.length === 1) return items[0];
    return null;
  }

  function formatEventLine(deps, event, dateStr) {
    const cat = deps.CATEGORY_LABELS[event.category] || "기타";
    const imp = event.important ? " ★" : "";
    const done = deps.isDone?.(event, dateStr) ? " ✓" : "";
    return `• ${event.time} ${event.title}${imp}${done} [${cat}]`;
  }

  function formatEventList(deps, items, emptyMsg) {
    if (!items.length) return emptyMsg;
    return items.map(({ event, dateStr }) => formatEventLine(deps, event, dateStr)).join("\n");
  }

  function parseCategoryFromText(text) {
    for (const [key, val] of Object.entries(CATEGORY_MAP)) {
      if (text.includes(key)) return val;
    }
    return null;
  }

  async function tryDeleteCommand(deps, helpers, msg) {
    if (!/(삭제|지워|지우|없애|취소\s*해|제거)/.test(msg)) return null;
    if (/삭제\s*모드|일괄/.test(msg)) return null;

    const dateStr = helpers.parseDateFromChat(msg);
    let title = msg
      .replace(/(오늘|내일|모레|어제|그저께|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일)/g, "")
      .replace(/(\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/g, "")
      .replace(/(일정|을|를|은|는|에|의|좀|해\s*줘|해줘|삭제|지워|지우|없애|제거|취소)/g, "")
      .trim();

    let items = title.length >= 1
      ? findOccurrences(deps, title, { dateStr: dateStr || undefined })
      : (dateStr ? deps.getEventsForDate(dateStr, false).map(e => ({ event: e, dateStr })) : []);

    if (!items.length && title.length >= 1) {
      items = findOccurrences(deps, title);
    }

    const match = pickBestMatch(items, dateStr);
    if (!match && items.length > 1) {
      const lines = items.slice(0, 5).map(({ event, dateStr: d }) =>
        `• ${deps.formatDisplayDate(d)} ${event.time} ${event.title}`
      ).join("\n");
      return `같은 이름의 일정이 여러 개예요. 어떤 건지 알려주세요:\n${lines}`;
    }
    if (!match) {
      return title
        ? `「${title}」 일정을 찾지 못했어요.\n예: "내일 팀 미팅 삭제"`
        : "삭제할 일정 제목이나 날짜를 함께 말해 주세요.\n예: \"스터디 삭제\", \"내일 회의 지워줘\"";
    }

    const ok = await deps.deleteEventSilent(match.event.id);
    if (!ok) return "삭제에 실패했어요.";
    deps.showToast("일정이 삭제되었습니다");
    return `🗑️ 삭제했어요!\n${deps.formatDisplayDate(match.dateStr)} ${match.event.time} 「${match.event.title}」`;
  }

  async function tryCompleteCommand(deps, helpers, msg) {
    if (!/(완료|끝|체크|했어|쳤어|마쳤|끝냈)/.test(msg)) return null;
    if (/완료율|몇\s*개\s*했/.test(msg)) return null;

    const dateStr = helpers.parseDateFromChat(msg) || deps.formatDate(new Date());
    let title = msg
      .replace(/(오늘|내일|모레|어제)/g, "")
      .replace(/(완료|끝|체크|했어|쳤어|마쳤|끝냈|처리|로\s*표시|해\s*줘|해줘)/g, "")
      .trim();

    const items = title.length >= 1 ? findOccurrences(deps, title, { dateStr }) : deps.getEventsForDate(dateStr, false).map(e => ({ event: e, dateStr }));
    const match = pickBestMatch(items, dateStr);

    if (!match && items.length > 1) {
      return `어떤 일정을 완료할까요?\n${formatEventList(deps, items.slice(0, 5), "")}`;
    }
    if (!match) {
      return title
        ? `「${title}」 일정을 찾지 못했어요.`
        : "완료 처리할 일정을 말해 주세요.\n예: \"웹개발 수업 완료\", \"팀 미팅 끝\"";
    }

    deps.toggleDone(match.event.id, match.dateStr);
    const nowDone = deps.isDone(match.event, match.dateStr);
    return nowDone
      ? `✅ 완료 처리했어요!\n「${match.event.title}」 (${deps.formatDisplayDate(match.dateStr)})`
      : `↩️ 완료를 취소했어요.\n「${match.event.title}」`;
  }

  async function tryUpdateCommand(deps, helpers, msg) {
    if (!/(변경|수정|바꿔|바꿔줘|고쳐|옮겨|미루)/.test(msg)) return null;

    const dateStr = helpers.parseDateFromChat(msg);
    const newTime = helpers.parseChatTime(msg);
    const hasTimeChange = /(\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시)/.test(msg) && /(변경|수정|바꿔|로)/.test(msg);

    let title = msg
      .replace(/(오늘|내일|모레|어제|\d{1,2}\s*월\s*\d{1,2}\s*일)/g, "")
      .replace(/(\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/g, "")
      .replace(/(변경|수정|바꿔|바꿔줘|고쳐|옮겨|미루|시간|날짜|제목|을|를|에|로|해\s*줘|해줘)/g, "")
      .trim();

    const titleMatch = msg.match(/[「『"](.+?)[」』"]/);
    if (titleMatch) title = titleMatch[1];

    const renameMatch = msg.match(/(.+?)(?:을|를)\s*(.+?)(?:로|으로)\s*(?:변경|수정|바꿔)/);
    if (renameMatch && !titleMatch) {
      title = renameMatch[1].replace(/일정|제목/g, "").trim();
    }

    const items = findOccurrences(deps, title, { dateStr: dateStr || undefined });
    const match = pickBestMatch(items, dateStr);
    if (!match) {
      return title
        ? `「${title}」 일정을 찾지 못했어요.\n예: "스터디 시간 4시로 변경"`
        : "수정할 일정과 내용을 말해 주세요.\n예: \"내일 미팅 4시로 변경\"";
    }

    const patch = {};
    if (hasTimeChange) patch.time = newTime;
    if (dateStr && /(날짜|로\s*옮|미루|내일|모레|어제|\d{1,2}\s*일)/.test(msg)) patch.date = dateStr;
    if (renameMatch?.[2]) patch.title = renameMatch[2].trim();
    if (/중요/.test(msg) && /(추가|설정|표시)/.test(msg)) patch.important = true;
    if (/중요/.test(msg) && /(해제|취소|빼)/.test(msg)) patch.important = false;

    if (!Object.keys(patch).length) {
      return "무엇을 바꿀지 알려주세요.\n예: \"스터디 4시로 변경\", \"미팅 제목을 팀회의로 수정\"";
    }

    await deps.updateEventById(match.event.id, patch);
    deps.showToast("일정이 수정되었습니다");
    const e = { ...match.event, ...patch };
    return `✏️ 수정했어요!\n${deps.formatDisplayDate(patch.date || match.dateStr)} ${patch.time || e.time}\n「${patch.title || e.title}」`;
  }

  function tryNavigateCommand(deps, msg) {
    if (!/(열어|가\s*줘|가줘|보여\s*줘|보여줘|탭|화면|이동)/.test(msg) && !/^(달력|홈|리스트|일정추가|추가)$/.test(msg)) {
      return null;
    }
    for (const [key, tab] of Object.entries(TAB_MAP)) {
      if (msg.includes(key)) {
        deps.switchTab(tab);
        const labels = { dashboard: "홈", calendar: "달력", list: "리스트", add: "일정추가" };
        return `📂 ${labels[tab] || tab} 탭으로 이동했어요.`;
      }
    }
    return null;
  }

  function tryThemeCommand(deps, msg) {
    if (!deps.toggleTheme) return null;
    if (/다크|어두|night|dark/i.test(msg)) {
      deps.toggleTheme("dark");
      return "🌙 다크 모드로 바꿨어요.";
    }
    if (/라이트|밝|light/i.test(msg)) {
      deps.toggleTheme("light");
      return "☀️ 라이트 모드로 바꿨어요.";
    }
    if (/테마|모드/.test(msg) && /(바꿔|변경|전환)/.test(msg)) {
      deps.toggleTheme();
      return "🎨 테마를 전환했어요.";
    }
    return null;
  }

  function tryOpenDayModal(deps, helpers, msg) {
    if (!/(달력\s*에서|날짜\s*열|일정\s*창)/.test(msg) && !/\d{1,2}\s*일\s*(보여|열)/.test(msg)) return null;
    const dateStr = helpers.parseDateFromChat(msg);
    if (!dateStr) return null;
    deps.openCalDayModal?.(dateStr);
    return `📅 ${deps.formatDisplayDate(dateStr)} 달력 상세를 열었어요.`;
  }

  function tryStatsAndInfo(deps, helpers, msg) {
    if (/다음\s*일정|다음\s*약속|다음\s*뭐/.test(msg)) {
      const next = deps.getNextOccurrence?.();
      if (!next) return "앞으로 예정된 일정이 없어요.";
      const { event, dateStr } = next;
      return `⏭️ 다음 일정\n${deps.getRelativeLabel(dateStr)} ${deps.formatDisplayDate(dateStr)} ${event.time}\n「${event.title}」`;
    }

    if (/완료율|완료\s*율|몇\s*%\s*했|달성/.test(msg)) {
      const s = deps.getTodayCompletionStats?.() || { total: 0, done: 0, percent: 0 };
      return `📈 오늘 완료율 ${s.percent}% (${s.done}/${s.total}개)`;
    }

    if (/중요\s*일정|★/.test(msg)) {
      const items = deps.getAllOccurrences(false).filter(o => o.event.important).slice(0, 10);
      if (!items.length) return "등록된 중요 일정이 없어요.";
      return `⭐ 중요 일정 (${items.length}개)\n${formatEventList(deps, items, "")}`;
    }

    const cat = parseCategoryFromText(msg);
    if (cat && /일정/.test(msg)) {
      const items = deps.getAllOccurrences(false).filter(o => o.event.category === cat).slice(0, 12);
      if (!items.length) return `${deps.CATEGORY_LABELS[cat]} 일정이 없어요.`;
      return `📂 ${deps.CATEGORY_LABELS[cat]} 일정\n${formatEventList(deps, items, "")}`;
    }

    if (/이번\s*주\s*일정/.test(msg) && !/바쁜|몇\s*개/.test(msg)) {
      const week = deps.getWeekRange();
      const items = deps.getAllOccurrences(false).filter(o => o.dateStr >= week.start && o.dateStr <= week.end);
      if (!items.length) return "이번 주 일정이 없어요.";
      return `📅 이번 주 일정 (${items.length}개)\n${formatEventList(deps, items.slice(0, 15), "")}${items.length > 15 ? `\n... 외 ${items.length - 15}개` : ""}`;
    }

    if (/다음\s*주\s*일정/.test(msg)) {
      const week = deps.getWeekRange();
      const nextStart = deps.addDays(new Date(week.end + "T12:00:00"), 1);
      const nextEnd = deps.addDays(new Date(nextStart + "T12:00:00"), 6);
      const items = deps.getAllOccurrences(false).filter(o => o.dateStr >= nextStart && o.dateStr <= nextEnd);
      if (!items.length) return "다음 주 일정이 없어요.";
      return `📅 다음 주 일정 (${items.length}개)\n${formatEventList(deps, items.slice(0, 15), "")}`;
    }

    if (/반복\s*일정|매주/.test(msg)) {
      const items = deps.getEvents().filter(e => e.repeat === "weekly");
      if (!items.length) return "반복(매주) 일정이 없어요.";
      const lines = items.map(e => `• ${e.title} (${e.date}부터 매주)`).join("\n");
      return `🔁 반복 일정\n${lines}`;
    }

    return null;
  }

  function getRemainingTodayEvents(deps) {
    const todayStr = deps.formatDate(new Date());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return deps.getEventsForDate(todayStr, false)
      .filter(e => {
        const [h, m] = e.time.split(":").map(Number);
        const tMin = h * 60 + m;
        const pending = !deps.isDone?.(e, todayStr);
        return tMin >= nowMin && pending;
      })
      .map(e => ({ event: e, dateStr: todayStr }));
  }

  function getThisWeekendOccurrences(deps) {
    const todayStr = deps.formatDate(new Date());
    return deps.getAllOccurrences(false).filter(o => {
      if (o.dateStr < todayStr) return false;
      const wd = new Date(o.dateStr + "T12:00:00").getDay();
      return wd === 0 || wd === 6;
    });
  }

  function getTimeOfDayHint() {
    const h = new Date().getHours();
    if (h < 6) return "늦은 밤이네요. 내일 일정을 미리 볼까요?";
    if (h < 11) return "좋은 아침이에요! ☀️";
    if (h < 14) return "점심 시간쯤이네요 🍽️";
    if (h < 18) return "오후도 화이팅!";
    if (h < 22) return "저녁 시간이에요 🌆";
    return "오늘 하루 수고 많으셨어요 🌙";
  }

  function tryContextualScheduleChat(deps, helpers, msg) {
    if (/남은\s*일정|앞으로\s*일정|아직\s*(안\s*)?(끝|끝낸|한)|남은\s*거|남은\s*것|이\s*후\s*일정/.test(msg)) {
      const items = getRemainingTodayEvents(deps);
      if (!items.length) return "오늘 남은 일정이 없어요. 수고하셨어요! 🎉";
      return `⏳ 오늘 남은 일정 (${items.length}개)\n${formatEventList(deps, items, "")}`;
    }

    if (/주말\s*(일정|뭐|계획|어때|약속)/.test(msg) || /^주말/.test(msg.trim())) {
      const items = getThisWeekendOccurrences(deps).slice(0, 12);
      if (!items.length) return "이번 주말 등록된 일정이 없어요. \"토요일 3시에 약속 추가\"처럼 넣을 수 있어요.";
      return `🌴 주말 일정 (${items.length}개)\n${formatEventList(deps, items, "")}`;
    }

    if (/일정\s*(없|비어|없어|빈|하나도)/.test(msg) || /(비어\s*있|빈\s*날|한가)/.test(msg)) {
      const dateStr = helpers.parseDateFromChat(msg) || deps.formatDate(new Date());
      const items = deps.getEventsForDate(dateStr, false);
      const label = dateStr === deps.formatDate(new Date()) ? "오늘" : deps.formatDisplayDate(dateStr);
      if (!items.length) return `${label}은 일정이 비어 있어요. 여유롭네요! ✨`;
      return `${label} 일정 ${items.length}개가 있어요.\n${formatEventList(deps, items.map(e => ({ event: e, dateStr })), "")}`;
    }

    if (/추천|뭐\s*하면\s*좋|뭐\s*할까|뭐\s*하지|심심한데/.test(msg) && !/일정\s*추가/.test(msg)) {
      const next = deps.getNextOccurrence?.();
      if (next) {
        return `💡 다음 일정부터 준비해 보세요!\n${deps.getRelativeLabel(next.dateStr)} ${next.event.time} 「${next.event.title}」\n\n\"오늘 일정\", \"이번 주 바쁜 날?\"도 확인해 보세요.`;
      }
      return "💡 일정이 비어 있네요. \"내일 3시에 스터디 추가\"처럼 새 일정을 넣어 보세요!";
    }

    if (/메모\s*(있|달|적)/.test(msg) || /메모\s*일정/.test(msg)) {
      const items = deps.getAllOccurrences(false).filter(o => (o.event.memo || "").trim()).slice(0, 10);
      if (!items.length) return "메모가 있는 일정이 없어요.";
      return `📝 메모 있는 일정\n${items.map(({ event, dateStr }) => `• ${dateStr} ${event.title}: ${event.memo}`).join("\n")}`;
    }

    if (/전체\s*일정|일정\s*몇\s*개|총\s*일정|일정\s*개수/.test(msg)) {
      const total = deps.getEvents().length;
      const occ = deps.getAllOccurrences(false).length;
      return `📊 등록된 일정 ${total}개 (반복 포함 발생 ${occ}개)`;
    }

    if (/오늘\s*(어때|어떤|괜찮|할\s*만|바빠|한가|여유|힘들)/.test(msg)) {
      const todayStr = deps.formatDate(new Date());
      const items = deps.getEventsForDate(todayStr, false);
      const s = deps.getTodayCompletionStats?.() || { total: 0, done: 0, percent: 0 };
      if (!items.length) return "오늘은 일정이 없어요. 한가한 하루네요! 😊";
      if (items.length >= 6) return `오늘은 꽤 바빠요! 일정 ${items.length}개, 완료율 ${s.percent}%.\n"남은 일정"으로 앞으로 볼 수 있어요.`;
      return `오늘 일정 ${items.length}개, 완료율 ${s.percent}%. ${getTimeOfDayHint()}`;
    }

    if (/내일\s*(어때|바빠|한가|준비|괜찮)/.test(msg)) {
      const tomorrowStr = deps.addDays(new Date(), 1);
      const items = deps.getEventsForDate(tomorrowStr, false);
      if (!items.length) return "내일은 등록된 일정이 없어요. 미리 계획해 두면 좋아요!";
      const lines = formatEventList(deps, items.map(e => ({ event: e, dateStr: tomorrowStr })), "");
      return `내일 일정 ${items.length}개예요.\n${lines}`;
    }

    if (/이번\s*달|월간\s*일정/.test(msg)) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
      const items = deps.getAllOccurrences(false).filter(o => o.dateStr.startsWith(prefix));
      if (!items.length) return "이번 달 일정이 없어요.";
      return `📅 이번 달 일정 (${items.length}개)\n${formatEventList(deps, items.slice(0, 15), "")}${items.length > 15 ? `\n... 외 ${items.length - 15}개` : ""}`;
    }

    if (/공부|시험|과제|수업/.test(msg) && /(힘들|어렵|많|걱정|스트레스)/.test(msg)) {
      const items = deps.getAllOccurrences(false).filter(o => o.event.category === "school").slice(0, 5);
      const extra = items.length
        ? `\n\n📚 다가오는 학교 일정:\n${formatEventList(deps, items, "")}`
        : "";
      return `화이팅! 하나씩 해나가면 돼요 💪\n\"학교 일정\"으로 확인하거나, \"내일 3시에 과제 추가\"처럼 정리할 수 있어요.${extra}`;
    }

    return null;
  }

  function tryFaq(deps, msg) {
    if (/planday|플랜데이|플랜\s*데이/.test(msg) && /(뭐|무엇|소개)/.test(msg)) {
      return "PlanDay는 일정 관리 웹앱이에요.\n홈·달력·리스트·일정추가 탭과 AI 챗봇으로 일정을 관리할 수 있어요.";
    }
    if (/로그\s*아웃|로그아웃/.test(msg)) {
      return "로그아웃은 화면 **우측 상단 로그아웃** 버튼을 누르면 됩니다.";
    }
    if (/프로필|내\s*정보|개인\s*정보\s*수정/.test(msg)) {
      return "우측 상단 **프로필** 버튼을 누르면 이름·전화번호 수정, 약관 동의 내역, 정책 전문을 확인할 수 있어요.";
    }
    if (/로그\s*인|로그인|회원\s*가입/.test(msg)) {
      return "로그인·회원가입은 앱 첫 화면에서 할 수 있어요.\n데모: demo@planday.app";
    }
    if (/카테고리|분류/.test(msg) && /(뭐|종류|어떤)/.test(msg)) {
      return "일정 카테고리: **학교**, **개인**, **업무**, **기타**\n추가 시 \"학교 수업\", \"업무 회의\"처럼 말하면 자동 분류돼요.";
    }
    if (/달력|캘린더/.test(msg) && /(어떻게|사용|쓰)/.test(msg)) {
      return "달력 탭에서 날짜를 클릭하면 그날 일정을 보고 추가할 수 있어요.\n\"달력 열어\"라고 하면 탭 이동도 됩니다.";
    }
    if (/리스트|목록/.test(msg) && /(어떻게|삭제|지)/.test(msg)) {
      return "리스트 탭에서 전체 일정을 보고, **삭제** 버튼으로 여러 개를 한 번에 지울 수 있어요.\n챗봇: \"스터디 삭제\"";
    }
    if (/사용량|요금|비용|토큰/.test(msg)) {
      return "챗봇 **사용량** 탭에서 이번 달·오늘 토큰, 예상 비용, **Google AI Studio와 비교** 표를 확인할 수 있어요.\n(AI 모드 Gemini 사용 시 기록 · KST 기준)";
    }
    if (/openai|오픈ai|플랫폼|비교|ai studio|google/.test(msg) && /(사용량|비교|확인|어디)/.test(msg)) {
      return "PlanDay는 **Gemini API**를 씁니다.\n**사용량** 탭 → 「플랫폼과 비교」에서 앱 수치와 [Google AI Studio](https://aistudio.google.com/apikey) Usage를 같은 기간으로 비교해 보세요.\n숫자가 조금 달라도 정상입니다 (시간대·집계 지연).";
    }
    if (/관리자|admin|백오피스|운영/.test(msg)) {
      return "관리자 페이지는 **별도 서비스**입니다 (일반 사용자 화면 확장 아님).\n같은 Supabase DB를 쓰지만 `admin_users` 권한이 있는 계정만 접근합니다.\n13-1: `database/create_admin_roles.sql` 실행 · `admin/README.md` 참고.";
    }
    if (/gpt|지피티|ai\s*모드/.test(msg) && /(뭐|쓰|사용|켜)/.test(msg)) {
      return "AI 모드는 AI설정에서 Gemini API Key가 필요해요.\n지금은 **규칙 기반 모드**로도 일정 조회·추가·삭제·완료 등 대부분 가능해요.";
    }
    if (/챗봇|ai\s*설정|프롬프트|톤/.test(msg) && /(어디|어떻게|설정)/.test(msg)) {
      return "챗봇 **AI설정** 탭에서 AI 모드(Gemini), API Key, AI 톤, 나만의 프롬프트를 설정할 수 있어요.";
    }
    if (/반복|매주/.test(msg) && /(어떻게|설정|넣)/.test(msg)) {
      return "일정 추가 시 \"매주\", \"반복\"을 포함하면 됩니다.\n예: \"매주 월요일 10시에 스터디 추가\"";
    }
    if (/중요\s*표시|별\s*표|★/.test(msg) && /(어떻게|설정)/.test(msg)) {
      return "일정 추가·수정 시 \"중요\"를 포함하세요.\n예: \"내일 중요한 미팅 추가\"";
    }
    if (/d-?day|디데이/.test(msg) && /(어떻게|설정|등록)/.test(msg)) {
      return "일정 추가 시 \"D-day\" 또는 \"디데이\"를 넣으면 D-day 목록에 표시돼요.";
    }
    if (/완료|체크|했어/.test(msg) && /(어떻게|표시)/.test(msg)) {
      return "챗봇: \"웹개발 수업 완료\"\n또는 홈/리스트에서 ✓ 버튼을 누르세요.";
    }
    if (/테마|다크|라이트/.test(msg) && /(어떻게|바꿔)/.test(msg)) {
      return "\"다크모드\", \"라이트모드\"라고 말하거나 사이드바 ☀️/🌙 버튼을 누르세요.";
    }
    if (/chatgpt|챗\s*gpt/.test(msg) && /(차이|다른)/.test(msg)) {
      return "PlanDay AI는 **일정 데이터**에 연결돼 있어요.\n조회·추가·삭제·완료를 실제로 실행할 수 있다는 점이 달라요.";
    }
    if (/데이터|저장|클라우드|supabase/.test(msg) && /(어디|어떻게)/.test(msg)) {
      return "로그인하면 Supabase 클라우드에 저장되고, 비로그인 시 브라우저 localStorage에 저장돼요.";
    }
    if (/데모|demo/.test(msg)) {
      return "데모 계정: demo@planday.app\n로그인하면 샘플 일정을 볼 수 있어요.";
    }
    return null;
  }

  function tryHandleCasualExtended(msg, helpers) {
    const base = helpers.tryHandleCasualChat(msg);
    if (base) return base;

    const hint = getTimeOfDayHint();

    if (/^(good\s*morning|굿모닝|좋은\s*아침|morning)/i.test(msg)) {
      return `${hint}\n오늘 일정 확인해 드릴까요? \"오늘 일정\"이라고 말해 주세요.`;
    }
    if (/^(good\s*night|굿나잇|굿밤|잘\s*자|좋은\s*밤)/i.test(msg)) {
      return "굿밤! 🌙 내일 일정은 \"내일 일정\"으로 확인할 수 있어요.";
    }
    if (/점심|저녁\s*먹|밥\s*먹/.test(msg)) {
      return `${hint}\n식사 후 \"오늘 일정\"이나 \"남은 일정\" 확인해 보세요.`;
    }

    if (/이름\s*(이\s*뭐|뭐야|은)|뭐라\s*불러|call you/i.test(msg)) {
      return "저는 **PlanDay AI**예요! 그냥 \"PlanDay\" 또는 \"AI\"라고 불러도 돼요 😊";
    }
    if (/몇\s*살|나이|birthday/i.test(msg)) {
      return "저는 AI라 나이는 없지만, 일정 관리는 꽤 자신 있어요!";
    }
    if (/^(뭐해|뭐\s*하|뭐\s*하니|지금\s*뭐)/.test(msg.trim())) {
      return "일정 도와드리고 있어요! 📋 \"오늘 일정\", \"다음 일정\"처럼 물어보세요.";
    }
    if (/어때|잘\s*지내|기분\s*(어때|어떠)|how are you/i.test(msg) && !/오늘|내일|일정/.test(msg)) {
      return `저는 항상 준비돼 있어요! ${hint}\n오늘 일정이 궁금하면 \"오늘 어때?\"라고 물어보세요.`;
    }
    if (/^(응|그래|ㅇㅇ|ok|okay|넵|네네|알겠|알았)/i.test(msg)) {
      return "네! 더 필요하시면 \"도움말\"이나 일정 관련 질문을 편하게 해 주세요.";
    }
    if (/^(진짜|정말|really)\??$/i.test(msg.trim())) {
      return "네, 맞아요! 직접 \"오늘 일정\"처럼 물어보시면 바로 확인해 드릴게요.";
    }
    if (/^(왜|어째서|why)/i.test(msg.trim())) {
      return "일정 관리를 더 쉽게 하려고 도와드리고 있어요.\n궁금한 기능은 \"도움말\"을 참고해 주세요.";
    }

    if (/잘\s*한다|최고|대단|똑똑|고마|수고|잘\s*했|칭찬|good job|nice/i.test(msg)) {
      return "감사해요! 😊 도움이 됐다니 기뻐요. 더 필요하시면 말씀해 주세요.";
    }
    if (/^(사랑|좋아|love you|best)/i.test(msg)) {
      return "고마워요! 💙 저는 일정 비서예요 — \"내일 일정\"처럼 업무 질문도 환영해요.";
    }
    if (/싫어|짜증|화나|annoy|bad/i.test(msg)) {
      return "힘드셨군요 😥 일정 정리가 필요하면 \"오늘 일정\"부터 같이 봐요.";
    }
    if (/심심|놀아|재밌|재미|bored/i.test(msg)) {
      return "😄 \"이번 주 바쁜 날?\", \"주말 일정\", \"추천해줘\"처럼 물어보세요!";
    }
    if (/피곤|힘들|지쳤|졸려|sleepy|tired/i.test(msg)) {
      return "고생 많으셨어요… 😮‍💨 \"남은 일정\" 확인하고 오늘은 일찍 쉬어도 좋아요.";
    }
    if (/^(미안|죄송|sorry)/i.test(msg)) {
      return "전혀 문제없어요! 편하게 말씀해 주세요.";
    }
    if (/^(ㅠ+|ㅜ+|슬퍼|우울|sad)/i.test(msg)) {
      return "힘내세요 💪 작은 것부터 하나씩! \"오늘 일정\" 확인해 드릴까요?";
    }
    if (/^(ㅎㅎ|ㅋㅋ|ㅋ+|lol|haha|웃)/i.test(msg)) {
      return "😄 기분 좋네요! \"오늘 일정\"이나 \"다음 일정\"도 알려드릴게요.";
    }

    if (/날씨/.test(msg)) {
      return "날씨는 확인 못 해요 ☁️ 대신 \"오늘 일정\", \"내일 일정\"은 알려드릴 수 있어요!";
    }
    if (/농담|재밌는\s*말|유머|joke/i.test(msg)) {
      const jokes = [
        "일정을 미루면… 내일의 나에게 선물이 되죠 🎁 (그래도 \"내일 일정\"은 확인하세요!)",
        "D-day는 Dead-line… 아니 Deadline! ⏰ \"D-day\"로 확인해 보세요.",
        "시간 관리의 비결? PlanDay AI에게 물어보기! (지금 대화 중 ✅)"
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }
    if (/팁|꿀팁|tip|요령|비법/.test(msg)) {
      return [
        "💡 PlanDay 꿀팁",
        "• \"내일 3시에 ○○ 추가\" — 빠른 등록",
        "• \"팀 미팅 완료\" — 체크 한 번에",
        "• \"이번 주 바쁜 날?\" — 한눈에 파악",
        "• \"달력 열어\" — 탭 이동도 음성으로!"
      ].join("\n");
    }
    if (/금요일|불금|주말\s*가|토요일\s*가/.test(msg) && !/일정/.test(msg)) {
      return "벌써 주말 기분이시네요 🎉 \"주말 일정\"으로 계획 확인해 보세요!";
    }
    if (/월요일|월요병|출근|등교/.test(msg) && !/일정/.test(msg)) {
      return "월요일 화이팅! 💪 \"이번 주 일정\"이나 \"이번 주 바쁜 날?\"로 미리 준비해요.";
    }
    if (/졸업|취업|면접|발표/.test(msg)) {
      return "중요한 날이네요! 🍀 D-day로 등록하면 \"D-day 알려줘\"로 확인할 수 있어요.";
    }
    if (/^(ㅇㅋ|오키|굿|good|nice|cool|멋|대박)/i.test(msg.trim())) {
      return "👍 좋아요! 다음 일정이 궁금하면 \"다음 일정\"이라고 해 주세요.";
    }
    if (/^\.{2,}$|^…+$|음+$|흠+$|글쎄/.test(msg.trim())) {
      return "천천히 생각하셔도 돼요. \"도움말\"을 보시거나, 하고 싶은 일을 편하게 말해 주세요.";
    }
    if (/뭐\s*물어|뭐\s*물어봐|뭐\s*할\s*수\s*있/.test(msg)) {
      return helpers.tryHandleCasualChat?.("도움말") || "도움말이라고 입력해 주세요!";
    }

    return null;
  }

  async function handleRuleBasedMessage(deps, helpers, msg) {
    const casual = tryHandleCasualExtended(msg, helpers);
    if (casual) return casual;

    const contextual = tryContextualScheduleChat(deps, helpers, msg);
    if (contextual) return contextual;

    const faq = tryFaq(deps, msg);
    if (faq) return faq;

    const nav = tryNavigateCommand(deps, msg);
    if (nav) return nav;

    const theme = tryThemeCommand(deps, msg);
    if (theme) return theme;

    const modal = tryOpenDayModal(deps, helpers, msg);
    if (modal) return modal;

    const del = await tryDeleteCommand(deps, helpers, msg);
    if (del) return del;

    const complete = await tryCompleteCommand(deps, helpers, msg);
    if (complete) return complete;

    const update = await tryUpdateCommand(deps, helpers, msg);
    if (update) return update;

    const stats = tryStatsAndInfo(deps, helpers, msg);
    if (stats) return stats;

    return null;
  }

  window.PlanDayChatRules = { handleRuleBasedMessage, findOccurrences, formatEventLine, formatEventList };
})();
