/** PlanDay chat engine */
import { bindChatDeps, getChatDeps } from "./deps.js";
import {
  CHAT_SUGGESTIONS, CHAT_SUGGESTIONS_GPT, GEMINI_KEY_STORAGE, GPT_MODE_ENABLED_STORAGE, CHAT_TONE_STORAGE, CHAT_CUSTOM_PROMPT_STORAGE,
  ACTIVE_USER_PROMPT_KEY, GEMINI_MODEL, GEMINI_EDGE_FUNCTION, USER_PROMPT_TYPE_LABELS, CHAT_BASE_PROMPT, CHAT_TONE_PRESETS
} from "./constants.js";
import { chatState, resetChatState } from "./state.js";

// --- 톤 선택 (Tone) ---
function getActiveUserPromptId() {
  return localStorage.getItem(ACTIVE_USER_PROMPT_KEY) || "";
}

function setActiveUserPromptId(id) {
  if (id) localStorage.setItem(ACTIVE_USER_PROMPT_KEY, id);
  else localStorage.removeItem(ACTIVE_USER_PROMPT_KEY);
}

function getActiveUserPrompt() {
  const id = getActiveUserPromptId();
  if (!id) return null;
  return chatState.userPrompts.find(p => p.id === id) || null;
}

function clearActiveUserPrompt() {
  setActiveUserPromptId("");
}

function getChatToneSnapshot() {
  const saved = getActiveUserPrompt();
  if (saved) {
    return {
      prompt_tone: "saved",
      prompt_tone_label: saved.name,
      prompt_is_custom: true,
      prompt_applied: saved.content
    };
  }
  const toneId = getChatToneId();
  const isCustom = toneId === "custom";
  return {
    prompt_tone: toneId,
    prompt_tone_label: isCustom ? "직접 작성" : (CHAT_TONE_PRESETS[toneId]?.label || toneId),
    prompt_is_custom: isCustom,
    prompt_applied: getChatTonePromptText()
  };
}

function getSessionToneLabel(session) {
  if (!session) return "";
  if (session.prompt_tone_label) return session.prompt_tone_label;
  if (session.prompt_tone && CHAT_TONE_PRESETS[session.prompt_tone]) {
    return CHAT_TONE_PRESETS[session.prompt_tone].label;
  }
  const m = (session.system_message || "").match(/\[톤:\s*(.+?)\]/);
  return m ? m[1].trim() : "";
}

function updateChatSessionToneBar() {
  const bar = getChatDeps().$("chat-session-tone-bar");
  if (!bar) return;
  const session = chatState.chatSessions.find(s => s.id === chatState.currentSessionId);
  const toneLabel = getSessionToneLabel(session || chatState.currentSessionTone);
  if (chatState.currentSessionId && toneLabel) {
    bar.hidden = false;
    const custom = session?.prompt_is_custom || chatState.currentSessionTone?.prompt_is_custom;
    bar.textContent = custom
      ? `🎭 톤: ${toneLabel}${session?.prompt_tone === "saved" || chatState.currentSessionTone?.prompt_tone === "saved" ? " (저장 프롬프트)" : " (커스텀 프롬프트)"}`
      : `🎭 톤: ${toneLabel}`;
  } else {
    bar.hidden = true;
    bar.textContent = "";
  }
}

function getChatToneId() {
  return localStorage.getItem(CHAT_TONE_STORAGE) || "friendly";
}

function getChatTonePromptText() {
  const saved = getActiveUserPrompt();
  if (saved) return saved.content;
  const toneId = getChatToneId();
  if (toneId === "custom") {
    const custom = (localStorage.getItem(CHAT_CUSTOM_PROMPT_STORAGE) || "").trim();
    return custom || CHAT_TONE_PRESETS.friendly.prompt;
  }
  return CHAT_TONE_PRESETS[toneId]?.prompt || CHAT_TONE_PRESETS.friendly.prompt;
}

function buildSystemPromptForApi() {
  return `${CHAT_BASE_PROMPT}\n\n[말투/역할 지시]\n${getChatTonePromptText()}`;
}

function getDefaultSystemMessage() {
  const saved = getActiveUserPrompt();
  const toneId = getChatToneId();
  const toneLabel = saved
    ? saved.name
    : (CHAT_TONE_PRESETS[toneId]?.label || "친근한 선생님");
  return `[톤: ${toneLabel}]\n${buildSystemPromptForApi()}\n\n--- 디버그 로그 ---`;
}

function isChatSettingsLocked() {
  return chatState.chatReplyInFlight || chatState.currentMessages.length > 0;
}

function saveChatTone(toneId, customPrompt) {
  localStorage.setItem(CHAT_TONE_STORAGE, toneId);
  if (toneId === "custom") {
    localStorage.setItem(CHAT_CUSTOM_PROMPT_STORAGE, customPrompt || "");
  } else {
    clearActiveUserPrompt();
  }
  updateChatToneUi();
  renderUserPromptsList();
}

function updateChatToneUi() {
  const locked = isChatSettingsLocked();
  const toneId = getChatToneId();
  const select = getChatDeps().$("chat-tone-select");
  const customBox = getChatDeps().$("chat-custom-prompt");
  const lockHint = getChatDeps().$("chat-tone-lock-hint");
  const preview = getChatDeps().$("chat-tone-preview");

  if (select) {
    select.value = toneId;
    select.disabled = locked;
  }
  if (customBox) {
    customBox.hidden = toneId !== "custom" && !getActiveUserPrompt();
    customBox.disabled = locked;
    customBox.value = getActiveUserPrompt()?.content
      || localStorage.getItem(CHAT_CUSTOM_PROMPT_STORAGE) || "";
  }
  const saveCurrentBtn = getChatDeps().$("chat-save-current-prompt-btn");
  if (saveCurrentBtn) {
    const showSave = (toneId === "custom" || getActiveUserPrompt()) && !locked && !chatState.userPromptsDbUnavailable;
    saveCurrentBtn.hidden = !showSave;
  }
  if (lockHint) lockHint.hidden = !locked;
  if (preview) preview.textContent = buildSystemPromptForApi();
}

function formatSessionTitle(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min} 대화`;
}

function formatSessionMeta(session) {
  const count = Array.isArray(session.messages) ? session.messages.length : 0;
  const updated = new Date(session.updated_at || session.created_at);
  const label = `${updated.getMonth() + 1}/${updated.getDate()} ${String(updated.getHours()).padStart(2, "0")}:${String(updated.getMinutes()).padStart(2, "0")}`;
  const tone = getSessionToneLabel(session);
  const usageSum = getSessionUsageFromMessages(session.messages);
  const usagePart = usageSum.aiReplies > 0
    ? ` · AI ${usageSum.aiReplies}회 · ${usageSum.totalTokens} tok`
    : "";
  return tone
    ? `${count}개 메시지 · ${label} · ${tone}${usagePart}`
    : `${count}개 메시지 · ${label}${usagePart}`;
}

function getSessionUsageFromMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let aiReplies = 0;
  let totalTokens = 0;
  for (const m of list) {
    if (m.role === "assistant" && m.usage?.model) {
      aiReplies += 1;
      totalTokens += m.usage.total_tokens || 0;
    }
  }
  return { aiReplies, totalTokens };
}

function formatUsdSmall(amount) {
  const n = Number(amount) || 0;
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatMessageUsageLabel(usageMeta) {
  if (!usageMeta?.model) return "";
  return `${usageMeta.model} · 텍스트 in ${usageMeta.input_tokens ?? 0} · out ${usageMeta.output_tokens ?? 0} · ${formatUsdSmall(usageMeta.estimated_cost_usd)}`;
}

function appendSystemLog(line) {
  if (!chatState.currentSystemMessage.includes("--- 디버그 로그 ---")) {
    chatState.currentSystemMessage = getDefaultSystemMessage();
  }
  chatState.currentSystemMessage += `\n[${new Date().toISOString()}] ${line}`;
}

function setChatWidgetVisible(visible) {
  getChatDeps().$("chat-widget").hidden = !visible;
}

function switchChatTab(tab) {
  chatState.chatActiveTab = tab;
  document.querySelectorAll(".chat-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.chatTab === tab);
  });
  getChatDeps().$("chat-view-messages").classList.toggle("active", tab === "messages");
  getChatDeps().$("chat-view-history").classList.toggle("active", tab === "history");
  getChatDeps().$("chat-view-usage").classList.toggle("active", tab === "usage");
  getChatDeps().$("chat-view-system").classList.toggle("active", tab === "system");
  if (tab === "history") renderChatSessionList();
  if (tab === "usage") getChatDeps().renderUsageStatsPanel?.();
  if (tab === "system") {
    updateChatToneUi();
    renderUserPromptsList();
    renderChatSystemBox();
  }
}

// --- 나만의 프롬프트 (User Prompts) ---
function sortUserPrompts(list) {
  return [...list].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    if ((b.usage_count || 0) !== (a.usage_count || 0)) return (b.usage_count || 0) - (a.usage_count || 0);
    return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
  });
}

function filterUserPrompts(list) {
  const q = chatState.userPromptSearchQuery.trim().toLowerCase();
  if (!q) return list;
  return list.filter(p =>
    (p.name || "").toLowerCase().includes(q) ||
    (p.description || "").toLowerCase().includes(q) ||
    (p.content || "").toLowerCase().includes(q)
  );
}

async function loadUserPromptsFromSupabase() {
  if (!getChatDeps().getSupabase() || !getChatDeps().getCurrentUser()) {
    chatState.userPrompts = [];
    return;
  }
  const { data, error } = await getChatDeps().getSupabase()
    .from("user_prompts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error(error);
    chatState.userPrompts = [];
    const msg = error.message || "";
    if (msg.includes("does not exist") || msg.includes("schema cache") || error.code === "42P01") {
      chatState.userPromptsDbUnavailable = true;
    }
    return;
  }
  chatState.userPromptsDbUnavailable = false;
  chatState.userPrompts = data || [];
  const activeId = getActiveUserPromptId();
  if (activeId && !chatState.userPrompts.find(p => p.id === activeId)) {
    clearActiveUserPrompt();
  }
  const defaultPrompt = chatState.userPrompts.find(p => p.is_default);
  if (defaultPrompt && !getActiveUserPromptId() && getChatToneId() === "friendly") {
    await applyUserPrompt(defaultPrompt.id, { silent: true });
  }
}

function showUserPromptForm(prompt) {
  chatState.userPromptFormOpen = true;
  chatState.editingUserPromptId = prompt?.id || null;
  getChatDeps().$("chat-prompt-form").hidden = false;
  getChatDeps().$("chat-prompt-edit-id").value = prompt?.id || "";
  getChatDeps().$("chat-prompt-name").value = prompt?.name || "";
  getChatDeps().$("chat-prompt-desc").value = prompt?.description || "";
  getChatDeps().$("chat-prompt-type").value = prompt?.type || "custom";
  getChatDeps().$("chat-prompt-content").value = prompt?.content || "";
  getChatDeps().$("chat-prompt-favorite").checked = !!prompt?.is_favorite;
  getChatDeps().$("chat-prompt-default").checked = !!prompt?.is_default;
  getChatDeps().$("chat-prompt-save-btn").textContent = prompt?.id ? "수정 저장" : "저장";
}

function hideUserPromptForm() {
  chatState.userPromptFormOpen = false;
  chatState.editingUserPromptId = null;
  getChatDeps().$("chat-prompt-form").hidden = true;
  getChatDeps().$("chat-prompt-edit-id").value = "";
  getChatDeps().$("chat-prompt-name").value = "";
  getChatDeps().$("chat-prompt-desc").value = "";
  getChatDeps().$("chat-prompt-type").value = "custom";
  getChatDeps().$("chat-prompt-content").value = "";
  getChatDeps().$("chat-prompt-favorite").checked = false;
  getChatDeps().$("chat-prompt-default").checked = false;
  getChatDeps().$("chat-prompt-save-btn").textContent = "저장";
}

async function saveUserPromptFromForm() {
  if (!getChatDeps().getSupabase() || !getChatDeps().getCurrentUser()) {
    getChatDeps().showToast("로그인이 필요합니다");
    return;
  }
  const name = getChatDeps().$("chat-prompt-name").value.trim();
  const description = getChatDeps().$("chat-prompt-desc").value.trim();
  const type = getChatDeps().$("chat-prompt-type").value || "custom";
  const content = getChatDeps().$("chat-prompt-content").value.trim();
  const is_favorite = getChatDeps().$("chat-prompt-favorite").checked;
  const is_default = getChatDeps().$("chat-prompt-default").checked;
  const editId = getChatDeps().$("chat-prompt-edit-id").value;

  if (!name) {
    getChatDeps().showToast("프롬프트 이름을 입력하세요");
    return;
  }
  if (!content) {
    getChatDeps().showToast("프롬프트 내용을 입력하세요");
    return;
  }

  const row = {
    user_id: getChatDeps().getCurrentUser().id,
    name,
    description,
    content,
    type,
    is_favorite,
    is_default
  };

  try {
    if (is_default) {
      await getChatDeps().getSupabase()
        .from("user_prompts")
        .update({ is_default: false })
        .eq("user_id", getChatDeps().getCurrentUser().id);
      chatState.userPrompts = chatState.userPrompts.map(p => ({ ...p, is_default: false }));
    }
    if (editId) {
      const { data, error } = await getChatDeps().getSupabase()
        .from("user_prompts")
        .update(row)
        .eq("id", editId)
        .select()
        .single();
      if (error) throw error;
      const idx = chatState.userPrompts.findIndex(p => p.id === editId);
      if (idx >= 0) chatState.userPrompts[idx] = data;
      if (getActiveUserPromptId() === editId) {
        saveChatTone("custom", content);
        setActiveUserPromptId(editId);
      }
      getChatDeps().showToast("프롬프트를 수정했습니다");
    } else {
      const { data, error } = await getChatDeps().getSupabase()
        .from("user_prompts")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      chatState.userPrompts.unshift(data);
      getChatDeps().showToast("프롬프트를 저장했습니다");
    }
    hideUserPromptForm();
    renderUserPromptsList();
    updateChatToneUi();
  } catch (err) {
    console.error(err);
    const msg = err?.message || "";
    if (msg.includes("does not exist") || msg.includes("schema cache") || err?.code === "42P01") {
      chatState.userPromptsDbUnavailable = true;
      renderUserPromptsList();
      getChatDeps().showToast("user_prompts 테이블이 없습니다.\nSQL을 실행해 주세요.");
      return;
    }
    getChatDeps().showToast(`저장 실패: ${msg}`);
  }
}

async function deleteUserPrompt(id) {
  if (!getChatDeps().getSupabase()) return;
  const prompt = chatState.userPrompts.find(p => p.id === id);
  if (!prompt) return;
  if (!confirm(`"${prompt.name}" 프롬프트를 삭제할까요?`)) return;
  try {
    const { error } = await getChatDeps().getSupabase().from("user_prompts").delete().eq("id", id);
    if (error) throw error;
    chatState.userPrompts = chatState.userPrompts.filter(p => p.id !== id);
    if (getActiveUserPromptId() === id) clearActiveUserPrompt();
    renderUserPromptsList();
    updateChatToneUi();
    getChatDeps().showToast("프롬프트를 삭제했습니다");
  } catch (err) {
    console.error(err);
    getChatDeps().showToast("삭제에 실패했습니다");
  }
}

async function toggleUserPromptFavorite(id) {
  if (!getChatDeps().getSupabase()) return;
  const prompt = chatState.userPrompts.find(p => p.id === id);
  if (!prompt) return;
  try {
    const { data, error } = await getChatDeps().getSupabase()
      .from("user_prompts")
      .update({ is_favorite: !prompt.is_favorite })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    const idx = chatState.userPrompts.findIndex(p => p.id === id);
    if (idx >= 0) chatState.userPrompts[idx] = data;
    renderUserPromptsList();
  } catch (err) {
    console.error(err);
    getChatDeps().showToast("즐겨찾기 변경 실패");
  }
}

async function copyUserPrompt(id) {
  const prompt = chatState.userPrompts.find(p => p.id === id);
  if (!prompt) return;
  const text = `이름: ${prompt.name}\n설명: ${prompt.description || ""}\n\n${prompt.content}`;
  try {
    await navigator.clipboard.writeText(text);
    getChatDeps().showToast("프롬프트를 복사했습니다");
  } catch {
    getChatDeps().showToast("복사에 실패했습니다");
  }
}

async function recordUserPromptUsage(id) {
  if (!getChatDeps().getSupabase() || !id) return;
  const prompt = chatState.userPrompts.find(p => p.id === id);
  if (!prompt) return;
  const nextCount = (prompt.usage_count || 0) + 1;
  const last_used_at = new Date().toISOString();
  try {
    const { data, error } = await getChatDeps().getSupabase()
      .from("user_prompts")
      .update({ usage_count: nextCount, last_used_at })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    const idx = chatState.userPrompts.findIndex(p => p.id === id);
    if (idx >= 0) chatState.userPrompts[idx] = data;
    renderUserPromptsList();
  } catch (err) {
    console.error(err);
  }
}

async function applyUserPrompt(id, opts = {}) {
  const { silent = false } = opts;
  if (isChatSettingsLocked()) {
    if (!silent) getChatDeps().showToast("대화 중에는 프롬프트를 변경할 수 없습니다");
    return;
  }
  const prompt = chatState.userPrompts.find(p => p.id === id);
  if (!prompt) return;
  setActiveUserPromptId(id);
  localStorage.setItem(CHAT_TONE_STORAGE, "custom");
  localStorage.setItem(CHAT_CUSTOM_PROMPT_STORAGE, prompt.content);
  getChatDeps().$("chat-tone-select").value = "custom";
  updateChatToneUi();
  renderUserPromptsList();
  if (!silent) getChatDeps().showToast(`프롬프트 적용: ${prompt.name}`);
}

function openSaveCurrentPromptForm() {
  const content = (getChatDeps().$("chat-custom-prompt").value || "").trim()
    || (localStorage.getItem(CHAT_CUSTOM_PROMPT_STORAGE) || "").trim();
  if (!content) {
    getChatDeps().showToast("저장할 프롬프트 내용이 없습니다");
    return;
  }
  showUserPromptForm({
    name: "",
    description: "",
    type: "custom",
    content
  });
}

function renderUserPromptsList() {
  const listEl = getChatDeps().$("chat-prompt-list");
  const emptyEl = getChatDeps().$("chat-prompt-empty");
  const hintEl = getChatDeps().$("chat-prompt-db-hint");
  if (!listEl) return;

  listEl.innerHTML = "";
  if (chatState.userPromptsDbUnavailable) {
    if (emptyEl) emptyEl.hidden = true;
    if (hintEl) hintEl.hidden = false;
    return;
  }
  if (hintEl) hintEl.hidden = true;

  const visible = sortUserPrompts(filterUserPrompts(chatState.userPrompts));
  if (!visible.length) {
    if (emptyEl) emptyEl.hidden = !!chatState.userPromptSearchQuery.trim();
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  const activeId = getActiveUserPromptId();
  visible.forEach(prompt => {
    const item = document.createElement("div");
    item.className = "chat-prompt-item" + (prompt.id === activeId ? " active" : "");
    const typeLabel = USER_PROMPT_TYPE_LABELS[prompt.type] || prompt.type;
    const usage = prompt.usage_count || 0;
    const lastUsed = prompt.last_used_at
      ? new Date(prompt.last_used_at).toLocaleDateString("ko-KR")
      : "미사용";
    item.innerHTML = `
      <div class="chat-prompt-item-head">
        <button type="button" class="chat-prompt-fav-btn" data-action="favorite" title="즐겨찾기">${prompt.is_favorite ? "★" : "☆"}</button>
        <div class="chat-prompt-item-name">${getChatDeps().escapeHtml(prompt.name)}${prompt.is_default ? " · 기본" : ""}</div>
      </div>
      ${prompt.description ? `<div class="chat-prompt-item-desc">${getChatDeps().escapeHtml(prompt.description)}</div>` : ""}
      <div class="chat-prompt-item-meta">${getChatDeps().escapeHtml(typeLabel)} · 사용 ${usage}회 · ${getChatDeps().escapeHtml(lastUsed)}</div>
      <div class="chat-prompt-item-actions">
        <button type="button" class="chat-prompt-use-btn" data-action="use">사용</button>
        <button type="button" data-action="edit">수정</button>
        <button type="button" data-action="copy">복사</button>
        <button type="button" data-action="delete">삭제</button>
      </div>`;

    item.querySelector('[data-action="favorite"]').addEventListener("click", e => {
      e.stopPropagation();
      toggleUserPromptFavorite(prompt.id);
    });
    item.querySelector('[data-action="use"]').addEventListener("click", e => {
      e.stopPropagation();
      applyUserPrompt(prompt.id);
    });
    item.querySelector('[data-action="edit"]').addEventListener("click", e => {
      e.stopPropagation();
      showUserPromptForm(prompt);
    });
    item.querySelector('[data-action="copy"]').addEventListener("click", e => {
      e.stopPropagation();
      copyUserPrompt(prompt.id);
    });
    item.querySelector('[data-action="delete"]').addEventListener("click", e => {
      e.stopPropagation();
      deleteUserPrompt(prompt.id);
    });
    listEl.appendChild(item);
  });
}

// --- 대화 세션·UI (Sessions) ---
function updateChatSessionLabel() {
  getChatDeps().$("chat-session-label").textContent = chatState.currentSessionId
    ? chatState.currentSessionTitle || "대화 중"
    : "새 대화";
}

async function loadChatSessionsFromSupabase() {
  if (!getChatDeps().getSupabase() || !getChatDeps().getCurrentUser()) {
    chatState.chatSessions = [];
    return;
  }
  const { data, error } = await getChatDeps().getSupabase()
    .from("conversation_records")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error(error);
    chatState.chatSessions = [];
    return;
  }
  chatState.chatSessions = data || [];
}

async function createChatSessionInDb() {
  const now = new Date();
  const title = formatSessionTitle(now);
  chatState.currentSystemMessage = getDefaultSystemMessage();
  chatState.currentSessionTone = getChatToneSnapshot();
  const row = {
    user_id: getChatDeps().getCurrentUser().id,
    title,
    messages: [],
    system_message: chatState.currentSystemMessage,
    prompt_tone: chatState.currentSessionTone.prompt_tone,
    prompt_tone_label: chatState.currentSessionTone.prompt_tone_label,
    prompt_is_custom: chatState.currentSessionTone.prompt_is_custom,
    prompt_applied: chatState.currentSessionTone.prompt_applied
  };
  const { data, error } = await getChatDeps().getSupabase()
    .from("conversation_records")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  const activePromptId = getActiveUserPromptId();
  if (activePromptId) await recordUserPromptUsage(activePromptId);
  chatState.currentSessionId = data.id;
  chatState.currentSessionTitle = data.title;
  chatState.currentMessages = [];
  chatState.chatSessions.unshift(data);
  updateChatSessionLabel();
  updateChatSessionToneBar();
  return data;
}

async function ensureChatSession() {
  if (chatState.currentSessionId) return;
  if (chatState.chatDbUnavailable) return;
  if (!getChatDeps().getSupabase() || !getChatDeps().getCurrentUser()) {
    const err = new Error("NOT_LOGGED_IN");
    err.code = "NOT_LOGGED_IN";
    throw err;
  }
  try {
    await createChatSessionInDb();
  } catch (err) {
    const msg = err?.message || "";
    if (msg.includes("does not exist") || msg.includes("schema cache") || err?.code === "42P01") {
      chatState.chatDbUnavailable = true;
    }
    throw err;
  }
}

function getChatSessionErrorMessage(err) {
  if (err?.code === "NOT_LOGGED_IN" || err?.message === "NOT_LOGGED_IN") {
    return "대화 기록을 저장하려면 로그인이 필요합니다.\ndemo@planday.app 계정으로 로그인하면 사용할 수 있어요.";
  }
  const msg = err?.message || "";
  if (msg.includes("does not exist") || msg.includes("schema cache") || err?.code === "42P01") {
    return "conversation_records 테이블이 없습니다.\nSupabase SQL Editor에서 database/create_conversation_records.sql을 실행한 뒤 새로고침해 주세요.";
  }
  if (msg.includes("permission denied")) {
    return "대화 기록 저장 권한이 없습니다.\nSupabase에서 conversation_records 권한(RLS) SQL을 실행해 주세요.";
  }
  if (msg.includes("prompt_tone") || msg.includes("prompt_tone_label") || msg.includes("prompt_is_custom") || msg.includes("prompt_applied")) {
    return "톤 기록 컬럼이 없습니다.\nSupabase SQL Editor에서 database/add_prompt_tone_to_conversation_records.sql을 실행해 주세요.";
  }
  return `대화 기록 저장 실패: ${msg}`;
}

async function persistChatSession() {
  if (!chatState.currentSessionId || !getChatDeps().getSupabase()) return;
  const { data, error } = await getChatDeps().getSupabase()
    .from("conversation_records")
    .update({
      messages: chatState.currentMessages,
      system_message: chatState.currentSystemMessage
    })
    .eq("id", chatState.currentSessionId)
    .select()
    .single();
  if (error) throw error;
  const idx = chatState.chatSessions.findIndex(s => s.id === chatState.currentSessionId);
  if (idx >= 0) chatState.chatSessions[idx] = data;
  else chatState.chatSessions.unshift(data);
}

async function deleteChatSession(id) {
  if (!getChatDeps().getSupabase() || !getChatDeps().getCurrentUser()) {
    getChatDeps().showToast("로그인 후 삭제할 수 있습니다");
    return;
  }
  const session = chatState.chatSessions.find(s => s.id === id);
  if (!session) return;
  const label = session.title || formatSessionTitle(session.created_at);
  if (!confirm(`"${label}" 대화 기록을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)) return;

  try {
    const { error } = await getChatDeps().getSupabase()
      .from("conversation_records")
      .delete()
      .eq("id", id)
      .eq("user_id", getChatDeps().getCurrentUser().id);
    if (error) throw error;

    chatState.chatSessions = chatState.chatSessions.filter(s => s.id !== id);
    if (chatState.currentSessionId === id) {
      startNewChatSession();
    } else {
      renderChatSessionList();
    }
    getChatDeps().showToast("대화 기록을 삭제했습니다");
  } catch (err) {
    console.error(err);
    getChatDeps().showToast("삭제에 실패했습니다");
  }
}

function startNewChatSession() {
  chatState.currentSessionId = null;
  chatState.currentSessionTitle = "";
  chatState.currentMessages = [];
  chatState.currentSystemMessage = getDefaultSystemMessage();
  chatState.currentSessionTone = null;
  updateChatSessionLabel();
  updateChatSessionToneBar();
  renderChatMessages(true);
  renderChatSystemBox();
  renderChatSessionList();
  updateChatToneUi();
}

async function initChatForUser() {
  chatState.chatDbUnavailable = false;
  chatState.userPromptsDbUnavailable = false;
  await loadUserPromptsFromSupabase();
  await loadChatSessionsFromSupabase();
  startNewChatSession();
}

function resetChatForUser() {
  chatState.chatSessions = [];
  chatState.userPrompts = [];
  chatState.userPromptsDbUnavailable = false;
  chatState.userPromptSearchQuery = "";
  hideUserPromptForm();
  clearActiveUserPrompt();
  chatState.currentSessionId = null;
  chatState.currentSessionTitle = "";
  chatState.currentMessages = [];
  chatState.currentSystemMessage = "";
  chatState.chatDbUnavailable = false;
  closeChatPanel();
}

function openChatPanel() {
  chatState.chatOpen = true;
  getChatDeps().$("chat-panel").classList.add("open");
  initChatbotInternal();
  getChatDeps().$("chat-input").focus();
}

function closeChatPanel() {
  chatState.chatOpen = false;
  getChatDeps().$("chat-panel").classList.remove("open");
}

function toggleChatPanel() {
  if (chatState.chatOpen) closeChatPanel();
  else openChatPanel();
}

function appendChatMessage(text, role = "bot", usageMeta = null) {
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;
  const textEl = document.createElement("div");
  textEl.className = "chat-msg-text";
  textEl.textContent = text;
  el.appendChild(textEl);
  if (usageMeta?.model) {
    const usageEl = document.createElement("div");
    usageEl.className = "chat-msg-usage";
    usageEl.textContent = formatMessageUsageLabel(usageMeta);
    el.appendChild(usageEl);
  }
  const box = getChatDeps().$("chat-messages");
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

function renderChatMessages(showWelcome = false) {
  const box = getChatDeps().$("chat-messages");
  box.innerHTML = "";
  if (!chatState.currentMessages.length) {
    if (showWelcome) {
      appendChatMessage(getChatWelcomeMessage(), "bot");
    }
    return;
  }
  chatState.currentMessages.forEach(m => {
    appendChatMessage(
      m.content,
      m.role === "user" ? "user" : "bot",
      m.role === "assistant" ? m.usage : null
    );
  });
}

function renderChatSessionList() {
  const box = getChatDeps().$("chat-session-list");
  box.innerHTML = "";
  if (!chatState.chatSessions.length) {
    box.innerHTML = `<p class="chat-session-empty">저장된 대화 기록이 없습니다.<br>대화 탭에서 메시지를 보내면 기록이 생성됩니다.</p>`;
    return;
  }
  chatState.chatSessions.forEach(session => {
    const row = document.createElement("div");
    row.className = "chat-session-row";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-session-item" + (session.id === chatState.currentSessionId ? " active" : "");
    const toneLabel = getSessionToneLabel(session);
    btn.innerHTML = `
      <div class="session-title">${getChatDeps().escapeHtml(session.title || formatSessionTitle(session.created_at))}</div>
      <div class="session-meta">${formatSessionMeta(session)}</div>
      ${toneLabel ? `<span class="session-tone-badge">${getChatDeps().escapeHtml(toneLabel)}${session.prompt_is_custom ? " · 커스텀" : ""}</span>` : ""}`;
    btn.addEventListener("click", () => openChatSession(session.id));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "chat-session-delete-btn";
    delBtn.title = "대화 삭제";
    delBtn.setAttribute("aria-label", "대화 삭제");
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", e => {
      e.stopPropagation();
      deleteChatSession(session.id);
    });

    row.appendChild(btn);
    row.appendChild(delBtn);
    box.appendChild(row);
  });
}

function renderChatSystemBox() {
  const box = getChatDeps().$("chat-system-box");
  if (!box) return;
  if (!chatState.currentSessionId && !chatState.currentSystemMessage) {
    box.innerHTML = `<div class="chat-system-label">세션 디버그 로그</div>새 대화를 시작하면 톤 설정과 응답 로그가 여기에 표시됩니다.`;
    return;
  }
  const debugPart = chatState.currentSystemMessage.includes("--- 디버그 로그 ---")
    ? chatState.currentSystemMessage.split("--- 디버그 로그 ---")[1] || "(없음)"
    : "";
  const session = chatState.chatSessions.find(s => s.id === chatState.currentSessionId);
  const toneLabel = getSessionToneLabel(session || { system_message: chatState.currentSystemMessage });
  const applied = session?.prompt_applied || chatState.currentSessionTone?.prompt_applied || getChatTonePromptText();
  box.innerHTML =
    `<div class="chat-system-label">세션 디버그 · ${getChatDeps().escapeHtml(chatState.currentSessionTitle || "새 대화")}</div>` +
    (toneLabel ? `<div class="chat-system-label" style="margin-top:8px">적용 톤: ${getChatDeps().escapeHtml(toneLabel)}</div>` : "") +
    (applied ? `<div style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 8px;white-space:pre-wrap">${getChatDeps().escapeHtml(applied)}</div>` : "") +
    getChatDeps().escapeHtml(debugPart.trim() || "(아직 로그 없음)");
}

async function openChatSession(id) {
  let session = chatState.chatSessions.find(s => s.id === id);
  if (!session && getChatDeps().getSupabase()) {
    const { data, error } = await getChatDeps().getSupabase()
      .from("conversation_records")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      console.error(error);
      getChatDeps().showToast("대화 기록을 불러오지 못했습니다");
      return;
    }
    session = data;
  }
  if (!session) return;

  chatState.currentSessionId = session.id;
  chatState.currentSessionTitle = session.title;
  chatState.currentMessages = Array.isArray(session.messages) ? session.messages : [];
  chatState.currentSystemMessage = session.system_message || getDefaultSystemMessage();
  chatState.currentSessionTone = {
    prompt_tone: session.prompt_tone,
    prompt_tone_label: session.prompt_tone_label,
    prompt_is_custom: session.prompt_is_custom,
    prompt_applied: session.prompt_applied
  };
  updateChatSessionLabel();
  updateChatSessionToneBar();
  renderChatMessages(false);
  renderChatSystemBox();
  renderChatSessionList();
  updateChatToneUi();
  switchChatTab("messages");
}

function getChatWelcomeMessage() {
  if (isGptModeActive()) {
    return [
      "안녕하세요! PlanDay AI입니다 ✨",
      "AI 모드(Gemini)가 켜져 있어요. 편하게 말해도 됩니다.",
      "예: \"어제 뭐 있었지?\", \"이번 주 바쁜 날?\", \"내일 3시에 스터디 넣어줘\""
    ].join("\n");
  }
  const hasKey = !!getGeminiApiKey();
  const lines = [
    "안녕하세요! PlanDay AI입니다 🤖",
    "📋 AI 모드 꺼짐 · 규칙 기반 모드로 답변해요.",
    "일정 조회·추가·수정·삭제·완료, 검색, 간단한 대화까지 가능해요."
  ];
  if (hasKey) {
    lines.push("", "💡 AI설정에서 **AI 모드 사용**을 켜면 Gemini 자유 대화도 가능해요.");
  }
  lines.push("", "예: \"오늘 일정\", \"남은 일정\", \"내일 3시에 스터디 추가\", \"도움말\"");
  return lines.join("\n");
}

function refreshChatWelcomeIfEmpty() {
  if (chatState.currentMessages.length > 0) return;
  renderChatMessages(true);
}

function getChatSuggestions() {
  return isGptModeActive() ? CHAT_SUGGESTIONS_GPT : CHAT_SUGGESTIONS;
}

function updateChatGptModeUi() {
  const gptBar = getChatDeps().$("chat-gpt-mode-bar");
  const input = getChatDeps().$("chat-input");
  const toggle = getChatDeps().$("chat-gpt-mode-enabled");
  const ruleHint = getChatDeps().$("chat-rule-mode-hint");

  if (toggle) toggle.checked = isGptModeEnabled();

  if (gptBar) {
    gptBar.hidden = false;
    gptBar.classList.toggle("rule-mode", !isGptModeActive());
    if (isGptModeActive()) {
      gptBar.textContent = `✨ AI 모드 (Gemini) · ${GEMINI_MODEL}`;
    } else if (getGeminiApiKey()) {
      gptBar.textContent = "📋 규칙 기반 모드 (AI 꺼짐 · API Key 저장됨)";
    } else {
      gptBar.textContent = "📋 규칙 기반 모드";
    }
  }

  if (ruleHint) ruleHint.hidden = isGptModeActive();

  if (input) {
    input.placeholder = isGptModeActive()
      ? "자유롭게 말해도 돼요. 예: 어제 일정 알려줘"
      : "예: 어제 일정, 몇시야?, 검색도 가능해?";
  }
  renderChatSuggestions();
  refreshChatWelcomeIfEmpty();
}
function renderChatSuggestions() {
  const box = getChatDeps().$("chat-suggestions");
  box.innerHTML = "";
  getChatSuggestions().forEach(label => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-chip";
    btn.textContent = label;
    btn.addEventListener("click", () => sendChatMessage(label));
    box.appendChild(btn);
  });
}

// --- GPT·규칙 기반 응답 (Reply) ---
function formatEventLine(event, dateStr) {
  const cat = getChatDeps().CATEGORY_LABELS[event.category] || "기타";
  const imp = event.important ? " ★" : "";
  return `• ${event.time} ${event.title}${imp} [${cat}]`;
}

function formatEventList(items, emptyMsg) {
  if (!items.length) return emptyMsg;
  return items.map(({ event, dateStr }) => formatEventLine(event, dateStr)).join("\n");
}

function parseDateFromChat(text) {
  const today = new Date();
  if (/오늘/.test(text)) return getChatDeps().formatDate(today);
  if (/내일/.test(text)) return getChatDeps().addDays(today, 1);
  if (/모레/.test(text)) return getChatDeps().addDays(today, 2);
  if (/어제|yesterday/i.test(text)) return getChatDeps().addDays(today, -1);
  if (/그\s*제\s*께|그저께/.test(text)) return getChatDeps().addDays(today, -2);

  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    const y = today.getFullYear();
    return `${y}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  }

  const weekdayMap = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  const wdMatch = text.match(/(이번\s*주|다음\s*주|다음주)\s*(일|월|화|수|목|금|토)\s*요?\s*일?|(일|월|화|수|목|금|토)\s*요?\s*일/);
  if (wdMatch) {
    const wdChar = wdMatch[2] || wdMatch[3];
    const targetWd = weekdayMap[wdChar];
    if (targetWd !== undefined) {
      const isNextWeek = !!(wdMatch[1] && /다음/.test(wdMatch[1]));
      const currentWd = today.getDay();
      if (isNextWeek) {
        const daysToNextSun = currentWd === 0 ? 7 : 7 - currentWd;
        const nextWeekSun = new Date(today);
        nextWeekSun.setDate(today.getDate() + daysToNextSun);
        nextWeekSun.setDate(nextWeekSun.getDate() + targetWd);
        return getChatDeps().formatDate(nextWeekSun);
      }
      let diff = (targetWd - currentWd + 7) % 7;
      const d = new Date(today);
      d.setDate(today.getDate() + diff);
      return getChatDeps().formatDate(d);
    }
  }

  const dayOnly = text.match(/(\d{1,2})\s*일/);
  if (dayOnly) {
    const d = Number(dayOnly[1]);
    const candidate = new Date(today.getFullYear(), today.getMonth(), d);
    return getChatDeps().formatDate(candidate);
  }

  return null;
}

function parseChatDate(text) {
  return parseDateFromChat(text) || getChatDeps().formatDate(new Date());
}

function parseChatTime(text) {
  const hm = text.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (hm) return `${String(hm[1]).padStart(2, "0")}:${hm[2]}`;
  const h = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (h) {
    const min = h[2] ? String(h[2]).padStart(2, "0") : "00";
    return `${String(h[1]).padStart(2, "0")}:${min}`;
  }
  return "09:00";
}

function parseChatCategory(text) {
  if (/학교|수업|과제|시험/.test(text)) return "school";
  if (/업무|회의|알바|일/.test(text)) return "work";
  if (/개인|약속|운동|식사/.test(text)) return "personal";
  return "other";
}

function tryParseAddEventCommand(text) {
  if (!/(추가|등록|넣어|만들)/.test(text)) return null;
  if (/어떻게|방법|무엇|뭐|설명|도움|[?？]|할\s*수\s*있|가능/i.test(text)) {
    if (!/\d{1,2}\s*(:\d{2}|시).*(추가|등록)/.test(text)) return null;
  }

  const dateStr = parseChatDate(text);
  const time = parseChatTime(text);

  let title = "";
  const patterns = [
    /(?:오늘|내일|모레|\d{1,2}\s*월\s*\d{1,2}\s*일)?\s*(?:\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)?\s*(?:에\s*)?(.+?)\s*(?:일정\s*)?(?:추가|등록|넣어|만들)/,
    /(?:추가|등록|넣어)\s*[:\-]?\s*(.+)/,
    /(.+?)\s*(?:일정\s*)?(?:추가|등록|넣어줘?)/
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      title = m[1]
        .replace(/^(오늘|내일|모레|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일)\s*/g, "")
        .replace(/(\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)\s*(?:에\s*)?/g, "")
        .replace(/^(에|을|를|은|는)\s*/, "")
        .trim();
      if (title) break;
    }
  }

  const blockedTitles = ["일정", "일정 추가", "일정추가", "추가", "등록", "넣어", "만들"];
  if (!title || title.length < 2 || blockedTitles.includes(title)) return null;
  return {
    title,
    date: dateStr,
    time,
    memo: "",
    category: parseChatCategory(text),
    repeat: /매주|반복/.test(text) ? "weekly" : "none",
    important: /중요/.test(text),
    dday: /d-?day|디데이/i.test(text)
  };
}

function tryGetScheduleForDateQuery(msg) {
  if (/몇\s*일|무슨\s*요일|날짜|며칠/.test(msg) && !/일정|스케줄|뭐\s*있|뭐\s*해/.test(msg)) return null;

  const wantsSchedule = /일정|스케줄|뭐\s*있|뭐\s*해|뭐\s*했|알려|보여|있어|있나|확인|바빠|바쁜|비어|비었|뭐\s*하/.test(msg);
  const hasDateHint = /오늘|내일|모레|어제|그\s*제\s*께|그저께|\d{1,2}\s*일|\d{1,2}\s*월|요일|다음\s*주|다음주|이번\s*주/.test(msg);
  if (!wantsSchedule && !hasDateHint) return null;

  const dateStr = parseDateFromChat(msg);
  if (!dateStr) return null;

  const items = getChatDeps().getEventsForDate(dateStr, false).map(e => ({ event: e, dateStr }));
  const lines = formatEventList(items, "등록된 일정이 없어요.");
  return `📅 ${getChatDeps().formatDisplayDate(dateStr)} 일정 (${items.length}개)\n${lines}`;
}

function getChatScheduleContext() {
  const todayStr = getChatDeps().formatDate(new Date());
  const todayItems = getChatDeps().getEventsForDate(todayStr, false).map(e => ({ event: e, dateStr: todayStr }));
  const tomorrowStr = getChatDeps().addDays(new Date(), 1);
  const tomorrowItems = getChatDeps().getEventsForDate(tomorrowStr, false).map(e => ({ event: e, dateStr: tomorrowStr }));
  const ddayEvents = getChatDeps().getEvents()
    .filter(e => e.dday && getChatDeps().getDday(e.date) >= 0)
    .sort((a, b) => getChatDeps().getDday(a.date) - getChatDeps().getDday(b.date))
    .slice(0, 5);
  const week = getChatDeps().getWeekRange();
  const weekCount = getChatDeps().getAllOccurrences(false).filter(o => o.dateStr >= week.start && o.dateStr <= week.end).length;

  return { todayStr, todayItems, tomorrowStr, tomorrowItems, ddayEvents, weekCount };
}

function getGeminiApiKey() {
  return (localStorage.getItem(GEMINI_KEY_STORAGE) || "").trim();
}

function isGptModeEnabled() {
  return localStorage.getItem(GPT_MODE_ENABLED_STORAGE) === "1";
}

function setGptModeEnabled(on) {
  localStorage.setItem(GPT_MODE_ENABLED_STORAGE, on ? "1" : "0");
  updateChatGptModeUi();
  updateChatApiKeyUi();
}

function isGptModeActive() {
  return isGptModeEnabled() && !!getGeminiApiKey();
}

function ensureDefaultGptModeOff() {
  if (localStorage.getItem(GPT_MODE_ENABLED_STORAGE) === null) {
    localStorage.setItem(GPT_MODE_ENABLED_STORAGE, "0");
  }
}

function saveGeminiApiKey(key) {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
  else localStorage.removeItem(GEMINI_KEY_STORAGE);
  updateChatApiKeyUi();
  updateChatGptModeUi();
}

function maskApiKey(key) {
  if (!key || key.length < 8) return "";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function updateChatApiKeyUi() {
  const key = getGeminiApiKey();
  const status = getChatDeps().$("chat-api-key-status");
  const input = getChatDeps().$("chat-api-key-input");
  if (key) {
    status.hidden = false;
    status.textContent = isGptModeActive()
      ? `✓ API 키 저장됨 (${maskApiKey(key)}) · Gemini ${GEMINI_MODEL}`
      : `✓ API 키 저장됨 (${maskApiKey(key)}) · 규칙 기반 모드`;
    if (input && !input.value) input.placeholder = maskApiKey(key);
  } else {
    status.hidden = true;
    status.textContent = "";
    if (input) input.placeholder = "AIza...";
  }
  updateChatGptModeUi();
}

function buildScheduleContextForGpt() {
  const now = new Date();
  const ctx = getChatScheduleContext();
  const yesterdayStr = getChatDeps().addDays(now, -1);
  const yesterdayItems = getChatDeps().getEventsForDate(yesterdayStr, false).map(e => ({ event: e, dateStr: yesterdayStr }));
  const week = getChatDeps().getWeekRange();
  const weekEvents = getChatDeps().getAllOccurrences(false)
    .filter(o => o.dateStr >= week.start && o.dateStr <= week.end)
    .slice(0, 25);
  const weekLines = weekEvents.length
    ? weekEvents.map(({ event, dateStr }) => `• ${dateStr} ${formatEventLine(event, dateStr)}`).join("\n")
    : "(없음)";
  const todayLines = formatEventList(ctx.todayItems, "(없음)");
  const tomorrowLines = formatEventList(ctx.tomorrowItems, "(없음)");
  const yesterdayLines = formatEventList(yesterdayItems, "(없음)");
  const ddayLines = ctx.ddayEvents.length
    ? ctx.ddayEvents.map(e => `• ${getChatDeps().getDdayLabel(e.date)} ${e.title} (${e.date})`).join("\n")
    : "(없음)";
  return [
    `현재 시각: ${now.toLocaleString("ko-KR")} (오늘=${ctx.todayStr})`,
    "--- 사용자 일정 데이터 (요약) ---",
    `[어제 ${yesterdayStr}]`,
    yesterdayLines,
    `[오늘 ${ctx.todayStr}]`,
    todayLines,
    `[내일 ${ctx.tomorrowStr}]`,
    tomorrowLines,
    `[D-day]`,
    ddayLines,
    `[이번 주 ${week.start}~${week.end} · ${ctx.weekCount}개]`,
    weekLines,
    "상세 조회·일정 추가는 제공된 도구(function)를 사용하세요."
  ].join("\n");
}

const GPT_CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_schedule",
      description: "특정 날짜 또는 기간의 일정 목록을 조회합니다.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "시작일 YYYY-MM-DD" },
          end_date: { type: "string", description: "종료일 YYYY-MM-DD (기간 조회 시, 없으면 date 하루만)" }
        },
        required: ["date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_event",
      description: "새 일정을 추가합니다. 날짜·시간·제목이 확실할 때만 호출하세요.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "일정 제목" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM (24시간)" },
          category: { type: "string", enum: ["school", "work", "personal", "other"], description: "카테고리" },
          important: { type: "boolean", description: "중요 일정 여부" },
          memo: { type: "string", description: "메모 (선택)" }
        },
        required: ["title", "date", "time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_events",
      description: "제목·메모 키워드로 일정을 검색합니다.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "검색어" },
          limit: { type: "number", description: "최대 결과 수 (기본 8)" }
        },
        required: ["keyword"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_dday_list",
      description: "등록된 D-day 일정 목록을 조회합니다.",
      parameters: { type: "object", properties: {} }
    }
  }
];

function buildGeminiTools() {
  return [{
    functionDeclarations: GPT_CHAT_TOOLS.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }))
  }];
}

function buildGeminiContentsFromHistory() {
  return chatState.currentMessages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
}

function mapGeminiUsage(usageMetadata) {
  if (!usageMetadata) return null;
  return {
    prompt_tokens: usageMetadata.promptTokenCount || 0,
    completion_tokens: usageMetadata.candidatesTokenCount || 0,
    total_tokens: usageMetadata.totalTokenCount || 0
  };
}

function isValidIsoDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(new Date(str + "T12:00:00").getTime());
}

function mapEventForGpt(event, dateStr) {
  const d = getChatDeps();
  return {
    date: dateStr,
    time: event.time,
    title: event.title,
    category: d.CATEGORY_LABELS[event.category] || event.category,
    important: !!event.important,
    memo: event.memo || ""
  };
}

async function executeGptToolCall(name, args) {
  const d = getChatDeps();
  try {
    if (name === "get_schedule") {
      const start = args?.date;
      const end = args?.end_date || start;
      if (!isValidIsoDate(start)) return { success: false, error: "date 형식은 YYYY-MM-DD여야 합니다." };
      if (!isValidIsoDate(end)) return { success: false, error: "end_date 형식은 YYYY-MM-DD여야 합니다." };
      const items = d.getAllOccurrences(false)
        .filter(o => o.dateStr >= start && o.dateStr <= end)
        .slice(0, 40);
      return {
        success: true,
        count: items.length,
        date_range: { start, end },
        events: items.map(({ event, dateStr }) => mapEventForGpt(event, dateStr))
      };
    }

    if (name === "add_event") {
      const title = String(args?.title || "").trim();
      const date = args?.date;
      const time = String(args?.time || "09:00").trim();
      if (!title || title.length < 2) return { success: false, error: "title이 필요합니다." };
      if (!isValidIsoDate(date)) return { success: false, error: "date 형식은 YYYY-MM-DD여야 합니다." };
      const parts = time.split(":");
      const normalizedTime = /^\d{1,2}:\d{2}$/.test(time)
        ? `${String(parts[0]).padStart(2, "0")}:${parts[1]}`
        : "09:00";
      const eventData = {
        title,
        date,
        time: normalizedTime,
        memo: String(args?.memo || "").trim(),
        category: ["school", "work", "personal", "other"].includes(args?.category) ? args.category : "other",
        repeat: "none",
        important: !!args?.important,
        dday: false
      };
      await d.pushNewEvent(eventData);
      d.renderAll();
      return {
        success: true,
        message: "일정이 추가되었습니다.",
        event: mapEventForGpt(eventData, date)
      };
    }

    if (name === "search_events") {
      const keyword = String(args?.keyword || "").trim();
      const limit = Math.min(Math.max(Number(args?.limit) || 8, 1), 20);
      if (keyword.length < 1) return { success: false, error: "keyword가 필요합니다." };
      const q = keyword.toLowerCase();
      const matches = d.getAllOccurrences(false)
        .filter(({ event }) =>
          event.title.toLowerCase().includes(q) ||
          (event.memo || "").toLowerCase().includes(q)
        )
        .slice(0, limit);
      return {
        success: true,
        count: matches.length,
        keyword,
        events: matches.map(({ event, dateStr }) => mapEventForGpt(event, dateStr))
      };
    }

    if (name === "get_dday_list") {
      const ddayEvents = d.getEvents()
        .filter(e => e.dday && d.getDday(e.date) >= 0)
        .sort((a, b) => d.getDday(a.date) - d.getDday(b.date))
        .slice(0, 15);
      return {
        success: true,
        count: ddayEvents.length,
        events: ddayEvents.map(e => ({
          title: e.title,
          date: e.date,
          dday_label: d.getDdayLabel(e.date)
        }))
      };
    }

    return { success: false, error: `알 수 없는 도구: ${name}` };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

function mergeGptUsage(total, next) {
  if (!next) return total;
  return {
    prompt_tokens: (total.prompt_tokens || 0) + (next.prompt_tokens || 0),
    completion_tokens: (total.completion_tokens || 0) + (next.completion_tokens || 0),
    total_tokens: (total.total_tokens || 0) + (next.total_tokens || 0)
  };
}

function formatGptErrorReply(err) {
  const msg = err?.message || String(err);
  if (msg === "LOGIN_REQUIRED") {
    return "⚠️ AI 모드는 로그인 후 사용할 수 있습니다.\n로그인한 뒤 다시 시도해 주세요.";
  }
  if (msg === "DAILY_LIMIT_EXCEEDED") {
    const limit = getChatDeps().planDaySecurity?.()?.CHAT_DAILY_API_LIMIT ?? 100;
    return [
      `⚠️ 오늘 AI 호출 한도(${limit}회)에 도달했습니다.`,
      "내일 다시 시도하거나, 사용량 탭에서 오늘 사용량을 확인해 주세요."
    ].join("\n");
  }
  if (msg === "EDGE_FUNCTION_AUTH") {
    return [
      "⚠️ Edge Function 인증 오류입니다.",
      "로그인 상태를 확인하고 페이지를 새로고침해 주세요.",
      "Supabase → Edge Functions → **gemini-chat** → **Verify JWT ON** 으로 배포되어 있는지 확인하세요."
    ].join("\n");
  }
  if (msg === "EDGE_FUNCTION_MISSING" || /not found|404|Function not found|FunctionsRelayError/i.test(msg)) {
    return [
      "⚠️ AI 연결에 실패했어요.",
      "브라우저에서는 Gemini API를 직접 호출할 수 없습니다.",
      "",
      "**해결:** Supabase Edge Function `gemini-chat`을 배포해 주세요.",
      "1. Supabase CLI 설치 후 프로젝트 폴더에서:",
      "   `supabase functions deploy gemini-chat`",
      "2. Verify JWT **ON** (로그인 사용자만 호출)",
      "3. 배포 후 페이지 새로고침",
      "",
      "또는 Supabase 대시보드 → Edge Functions에서 `gemini-chat` 코드를 붙여넣어 배포하세요."
    ].join("\n");
  }
  if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
    return [
      "⚠️ Gemini API 연결 실패 (브라우저 CORS).",
      "Edge Function `gemini-chat` 배포가 필요합니다.",
      "AI설정 탭 안내를 확인해 주세요."
    ].join("\n");
  }
  if (/401|403|invalid.*api.*key|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return [
      "⚠️ Gemini API Key가 올바르지 않아요.",
      "AI설정 탭에서 키를 다시 확인해 주세요.",
      "키 발급: https://aistudio.google.com/apikey"
    ].join("\n");
  }
  if (/429|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return [
      "⚠️ Gemini 사용량 한도에 도달했어요.",
      "무료 할당량을 초과했을 수 있습니다. 잠시 후 다시 시도하거나",
      "Google AI Studio에서 사용량을 확인해 주세요."
    ].join("\n");
  }
  if (/non-2xx/i.test(msg)) {
    return [
      "⚠️ Edge Function 호출 실패.",
      "1. 함수 이름이 **gemini-chat** 인지 확인",
      "2. **Verify JWT** → ON 후 재배포",
      "3. 로그인 상태 확인",
      "4. Gemini API Key가 AIza 로 시작하는지 확인"
    ].join("\n");
  }
  const sec = getChatDeps().planDaySecurity?.();
  if (sec && !sec.isDevHost()) {
    return "⚠️ AI 응답 생성 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.";
  }
  return `⚠️ AI 오류: ${msg}\n잠시 후 다시 시도해 주세요.`;
}

async function extractInvokeErrorMessage(error) {
  const fallback = error?.message || String(error);
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error?.message) return body.error.message;
      if (body?.message) return body.message;
      if (typeof body?.error === "string") return body.error;
    } catch {
      // ignore parse errors
    }
  }
  if (/401|403|JWT|Unauthorized/i.test(fallback)) return "EDGE_FUNCTION_AUTH";
  if (/non-2xx/i.test(fallback)) return fallback;
  return fallback;
}

async function fetchGeminiGenerate(requestBody) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("API key 없음");

  const supabase = getChatDeps().getSupabase();
  if (supabase?.functions?.invoke) {
    if (!getChatDeps().getCurrentUser()) {
      throw new Error("LOGIN_REQUIRED");
    }
    await getChatDeps().planDaySecurity?.()?.assertChatDailyLimit?.();

    const { data, error } = await supabase.functions.invoke(GEMINI_EDGE_FUNCTION, {
      body: { apiKey, model: GEMINI_MODEL, body: requestBody }
    });
    if (error) {
      const detail = await extractInvokeErrorMessage(error);
      if (/not found|404|Function not found|FunctionsRelayError|Failed to send/i.test(detail)) {
        throw new Error("EDGE_FUNCTION_MISSING");
      }
      if (detail === "EDGE_FUNCTION_AUTH" || detail === "LOGIN_REQUIRED") {
        throw new Error(detail === "LOGIN_REQUIRED" ? "LOGIN_REQUIRED" : "EDGE_FUNCTION_AUTH");
      }
      if (detail === "DAILY_LIMIT_EXCEEDED") throw new Error("DAILY_LIMIT_EXCEEDED");
      throw new Error(detail);
    }
    if (data?.error?.message === "DAILY_LIMIT_EXCEEDED") throw new Error("DAILY_LIMIT_EXCEEDED");
    if (data?.error?.message === "LOGIN_REQUIRED") throw new Error("LOGIN_REQUIRED");
    if (data?.error?.message) throw new Error(data.error.message);
    return data;
  }

  let res;
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
  } catch (networkErr) {
    throw new Error(`Failed to fetch: ${networkErr.message}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

async function callGeminiChat() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const systemContent = `${buildSystemPromptForApi()}\n\n${buildScheduleContextForGpt()}`;
  const contents = buildGeminiContentsFromHistory();
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let eventAdded = false;
  const model = GEMINI_MODEL;

  for (let step = 0; step < 6; step++) {
    const data = await fetchGeminiGenerate({
      systemInstruction: { parts: [{ text: systemContent }] },
      contents,
      tools: buildGeminiTools(),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800
      }
    });

    totalUsage = mergeGptUsage(totalUsage, mapGeminiUsage(data.usageMetadata));

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);

    if (functionCalls.length) {
      contents.push({ role: "model", parts: candidate.content.parts });
      for (const fc of functionCalls) {
        const result = await executeGptToolCall(fc.name, fc.args || {});
        if (fc.name === "add_event" && result.success) eventAdded = true;
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name: fc.name, response: result } }]
        });
      }
      continue;
    }

    const reply = parts.map(p => p.text || "").join("").trim();
    if (!reply) {
      const blockReason = candidate?.finishReason || data.promptFeedback?.blockReason;
      throw new Error(blockReason ? `응답 차단: ${blockReason}` : "빈 응답");
    }
    return { reply, model, usage: totalUsage, eventAdded };
  }

  throw new Error("도구 호출 한도 초과");
}

function getBusiestDaysInWeek(maxDays = 3) {
  const week = getChatDeps().getWeekRange();
  const byDate = {};
  getChatDeps().getAllOccurrences(false)
    .filter(o => o.dateStr >= week.start && o.dateStr <= week.end)
    .forEach(o => { byDate[o.dateStr] = (byDate[o.dateStr] || 0) + 1; });
  return Object.entries(byDate).sort((a, b) => b[1] - a[1]).slice(0, maxDays);
}

function getChatCapabilitiesReply() {
  const gpt = isGptModeActive();
  const lines = [
    "저는 PlanDay에서 이런 걸 도와드려요:",
    "• **일정 조회** — 오늘/내일/어제, 특정 날짜, 이번 주 등",
    "• **D-day** — \"D-day 알려줘\"",
    "• **일정 추가** — \"내일 3시에 스터디 추가\"",
    "• **검색** — \"팀 미팅 찾아줘\"",
    "• **자유 대화** — 인사, 질문, 잡담"
  ];
  if (gpt) {
    lines.push("", "✨ **AI 모드**가 켜져 있어요 (Gemini). 정해진 명령 없이 편하게 말해도 됩니다.");
  } else {
    lines.push("", "💡 **AI설정** → AI 모드 ON + Gemini API Key 저장 시 더 자유로운 대화가 가능해요.");
  }
  return lines.join("\n");
}

function getChatFallbackReply(noGpt) {
  const lines = [
    "음, 일정 관련 질문이면 더 잘 도와드릴 수 있어요.",
    "예: \"내일 일정\", \"어제 일정\", \"26일 일정\", \"D-day\"",
    "일정 추가: \"내일 3시에 스터디 추가\"",
  ];
  if (noGpt) {
    lines.push("", "💡 **AI설정** 탭에서 API Key를 저장하면 더 자유로운 대화도 가능해요.");
  }
  lines.push("", "\"도움말\"이라고 하시면 할 수 있는 일을 자세히 알려드릴게요.");
  return lines.join("\n");
}

function tryHandleCasualChat(msg) {
  if (/^(안녕|안녕하세요|하이|헬로|hello|hi|헬로우)/i.test(msg)) {
    return "안녕하세요! PlanDay AI입니다 😊\n일정 조회·추가, D-day, 검색, 간단한 질문까지 도와드려요.\n\"어제 일정\", \"몇시야?\", \"도움말\"처럼 편하게 물어보세요.";
  }

  if (/^(그래|응|알겠|알았|오케이|ok|okay|넵|네+|좋아|됐|됐어)/i.test(msg)) {
    return "네! 다른 궁금한 점이나 일정 확인이 필요하면 말씀해 주세요.";
  }

  if (/^(아니|아냐|아닌데|그게\s*아니|일정\s*아니|일정이\s*아니)/i.test(msg)) {
    return "알겠어요! 일정 말고 다른 질문이시군요.\n\"도움말\"을 보시거나, 편하게 다시 말씀해 주세요.";
  }

  if (/도움|help|명령|사용법|설명/.test(msg)) {
    return getChatCapabilitiesReply();
  }

  if (/할\s*줄|할줄|할\s*수\s*있|뭐\s*할\s*수|무엇을\s*할\s*수|기능|능력|can you|what can you/i.test(msg)) {
    return getChatCapabilitiesReply();
  }

  if (/(너|넌|당신|니|챗봇|봇).{0,12}(누구|뭐|무엇|정체)|who are you|what are you/i.test(msg)) {
    return "저는 **PlanDay AI**예요!\n일정 관리 앱 PlanDay 안에서 동작하는 AI 도우미입니다.\n일정 조회·추가, D-day, 간단한 대화를 도와드려요.";
  }

  if (/^(고마|감사|thanks|thank you|thx)/i.test(msg)) {
    return "천만에요! 일정 관련해서 더 필요하시면 편하게 말씀해 주세요.";
  }

  if (/^(잘\s*가|바이|bye|goodbye|굿밤|잘\s*자)/i.test(msg)) {
    return "좋은 하루 보내세요! 일정 확인이 필요하면 언제든 불러주세요.";
  }

  if (/^(ㅎㅎ|ㅋㅋ|ㅋ+|lol|재밌|웃기)/i.test(msg)) {
    return "😊 기분 좋은 하루네요! \"오늘 일정\"처럼 물어보시면 바로 알려드릴게요.";
  }

  return null;
}

async function handleRuleBasedChat(msg) {
  if (/몇\s*일|무슨\s*요일|날짜|며칠/.test(msg) && !/일정|스케줄/.test(msg)) {
    const todayStr = getChatDeps().formatDate(new Date());
    return `오늘은 ${getChatDeps().formatDisplayDate(todayStr)}이에요.`;
  }

  if (/몇\s*시|지금\s*시간|현재\s*시간/.test(msg) && !/일정|미팅|수업|스케줄|에\s/.test(msg)) {
    const now = new Date();
    return `지금은 ${now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}예요.`;
  }

  if (/검색/.test(msg) && /가능|할\s*수|되|냐|\?|？/.test(msg) && !/(찾아|검색해)/.test(msg)) {
    return "네, 일정 검색도 가능해요!\n예: \"팀 미팅 찾아줘\", \"스터디 검색해줘\"";
  }

  if (/추가/.test(msg) && /가능|할\s*수|되|냐|\?|？/.test(msg) && !/(추가해|넣어|등록)/.test(msg)) {
    return "네, 일정 추가도 가능해요!\n예: \"내일 3시에 스터디 추가\", \"모레 10시에 회의 넣어줘\"";
  }

  const casual = tryHandleCasualChat(msg);
  if (casual) return casual;

  if (/일정\s*(을|를)?\s*(추가|등록)|일정추가|어떻게.*추가|추가.*방법|추가.*어떻게/.test(msg)) {
    return [
      "📝 일정 추가 방법",
      "1. 상단 **일정추가** 탭에서 입력",
      "2. 챗봇: \"내일 3시에 스터디 추가\"",
      "3. 달력에서 날짜 클릭 → 추가"
    ].join("\n");
  }

  const dateSchedule = tryGetScheduleForDateQuery(msg);
  if (dateSchedule) return dateSchedule;

  const ctx = getChatScheduleContext();

  if (/오늘.*일정|일정.*오늘/.test(msg) || msg === "오늘") {
    const lines = formatEventList(ctx.todayItems, "오늘 등록된 일정이 없어요.");
    return `📅 오늘 일정 (${ctx.todayItems.length}개)\n${lines}`;
  }

  if (/내일.*일정|일정.*내일/.test(msg) || msg === "내일") {
    const lines = formatEventList(ctx.tomorrowItems, "내일 일정이 없어요.");
    return `📅 내일 일정 (${ctx.tomorrowItems.length}개)\n${lines}`;
  }

  if (/d-?day|디데이|디 데이/i.test(msg)) {
    if (!ctx.ddayEvents.length) return "등록된 D-day 일정이 없어요.";
    const lines = ctx.ddayEvents
      .map(e => `• ${getChatDeps().getDdayLabel(e.date)} ${e.title} (${getChatDeps().formatDisplayDate(e.date)})`)
      .join("\n");
    return `⏰ D-day 일정\n${lines}`;
  }

  if (/이번\s*주|주간/.test(msg)) {
    if (/바쁜|바빠|많은|제일/.test(msg)) {
      const busiest = getBusiestDaysInWeek(3);
      if (!busiest.length) return "이번 주에는 등록된 일정이 없어요.";
      const lines = busiest.map(([d, n]) => `• ${getChatDeps().formatDisplayDate(d)} — ${n}개`).join("\n");
      return `📊 이번 주 바쁜 날\n${lines}`;
    }
    return `📊 이번 주 일정 ${ctx.weekCount}개가 있어요.\n달력 탭에서 자세히 볼 수 있어요.`;
  }

  if (/^오늘\s*바빠|^오늘\s*어때/.test(msg)) {
    const n = ctx.todayItems.length;
    return n >= 5
      ? `오늘은 꽤 바빠요! 일정 ${n}개가 있어요.`
      : n >= 1
        ? `오늘 일정은 ${n}개예요. 무난한 하루네요!`
        : "오늘은 등록된 일정이 없어요. 여유로운 하루예요!";
  }

  const searchMatch = msg.match(/(.+?)\s*(?:검색|찾(?:아|어)?)/);
  const keyword = (searchMatch?.[1] || msg)
    .replace(/일정|검색|찾아/g, "")
    .trim();
  if (keyword.length >= 2 && /(찾아|찾어|검색해|검색\s*해)/.test(msg) && !/알려/.test(msg)) {
    const q = keyword.toLowerCase();
    const matches = getChatDeps().getAllOccurrences(false)
      .filter(({ event }) =>
        event.title.toLowerCase().includes(q) ||
        event.memo.toLowerCase().includes(q)
      )
      .slice(0, 8);
    if (!matches.length) return `「${keyword}」 관련 일정을 찾지 못했어요.`;
    const lines = matches
      .map(({ event, dateStr }) => `• ${getChatDeps().getRelativeLabel(dateStr)} ${formatEventLine(event, dateStr)}`)
      .join("\n");
    return `🔍 검색 결과\n${lines}`;
  }

  if (/몇\s*개|개수|통계|밖에|뿐/.test(msg) && chatState.currentMessages.length >= 2) {
    const lastBot = [...chatState.currentMessages].reverse().find(m => m.role === "assistant");
    const countMatch = lastBot?.content?.match(/\((\d+)개\)/);
    if (countMatch) {
      const n = Number(countMatch[1]);
      return n <= 1
        ? "네, 현재 그 날짜에는 1개만 등록되어 있어요.\n다른 날짜는 \"26일 일정\"처럼 물어보세요."
        : `방금 알려드린 일정이 ${n}개입니다.`;
    }
  }

  if (/몇\s*개|개수|통계/.test(msg)) {
    return `📊 오늘 ${ctx.todayItems.length}개, 내일 ${ctx.tomorrowItems.length}개, 이번 주 ${ctx.weekCount}개 일정이 있어요.`;
  }

  const noGpt = !isGptModeActive();
  return getChatFallbackReply(noGpt);
}

async function handleChatbotMessage(text) {
  const msg = text.trim();
  if (!msg) return { reply: "메시지를 입력해 주세요.", source: "rule-based" };

  const addData = tryParseAddEventCommand(msg);
  if (addData) {
    await getChatDeps().pushNewEvent(addData);
    getChatDeps().renderAll();
    return {
      reply: `✅ 일정을 추가했어요!\n${getChatDeps().formatDisplayDate(addData.date)} ${addData.time}\n「${addData.title}」`,
      source: "rule-based (일정 추가)"
    };
  }

  if (isGptModeActive()) {
    try {
      const gpt = await callGeminiChat();
      if (gpt) {
        return {
          reply: gpt.reply,
          source: gpt.eventAdded ? `Gemini ${gpt.model} (일정 추가)` : `Gemini ${gpt.model}`,
          usage: gpt.usage
        };
      }
    } catch (err) {
      console.error(err);
      appendSystemLog(`AI 오류: ${err.message}`);
      return {
        reply: formatGptErrorReply(err),
        source: "AI error"
      };
    }
  }

  return { reply: await handleRuleBasedChat(msg), source: "rule-based" };
}

async function sendChatMessage(text) {
  const sec = getChatDeps().planDaySecurity?.();
  const msg = sec ? sec.clampChatMessage(text) : String(text || "").trim();
  if (!msg) return;

  if (sec && text.trim().length > sec.CHAT_MESSAGE_MAX_LENGTH) {
    getChatDeps().showToast(`메시지는 ${sec.CHAT_MESSAGE_MAX_LENGTH}자까지 입력할 수 있습니다.`);
  }

  let sessionReady = true;
  try {
    await ensureChatSession();
    sessionReady = !!chatState.currentSessionId;
  } catch (err) {
    console.error(err);
    sessionReady = false;
    if (err?.code === "NOT_LOGGED_IN") {
      appendChatMessage(getChatSessionErrorMessage(err), "bot");
      return;
    }
    if (!chatState.chatDbUnavailable || chatState.currentMessages.length === 0) {
      getChatDeps().showToast("대화 기록 DB 없음 — SQL 실행 후 새로고침하세요");
    }
  }

  const userEntry = { role: "user", content: msg, created_at: new Date().toISOString() };
  chatState.currentMessages.push(userEntry);
  appendChatMessage(msg, "user");
  getChatDeps().$("chat-input").value = "";

  const typing = appendChatMessage(isGptModeActive() ? "Gemini 답변 생성 중..." : "답변 생성 중...", "bot typing");
  chatState.chatReplyInFlight = true;
  updateChatToneUi();

  try {
    const result = await handleChatbotMessage(msg);
    typing.remove();

    let usageMeta = null;
    if (result.usage && isGptModeActive()) {
      const modelMatch = String(result.source || "").match(/Gemini\s+(\S+)/);
      const modelName = modelMatch?.[1] || GEMINI_MODEL;
      if (sessionReady && chatState.currentSessionId) {
        const recorded = await getChatDeps().recordApiUsage?.({
          conversationId: chatState.currentSessionId,
          modelName,
          usage: result.usage
        });
        usageMeta = recorded?.usageMeta || await getChatDeps().buildMessageUsageMeta?.(modelName, result.usage);
      } else {
        usageMeta = await getChatDeps().buildMessageUsageMeta?.(modelName, result.usage);
      }
    }

    const assistantEntry = {
      role: "assistant",
      content: result.reply,
      created_at: new Date().toISOString(),
      source: result.source,
      ...(usageMeta ? { usage: usageMeta } : {})
    };
    chatState.currentMessages.push(assistantEntry);
    appendChatMessage(result.reply, "bot", usageMeta);

    if (sessionReady && chatState.currentSessionId) {
      let logLine = `user: "${msg.slice(0, 40)}" → ${result.source} (${result.reply.length}자)`;
      if (usageMeta) {
        logLine += ` | ${usageMeta.model} in:${usageMeta.input_tokens} out:${usageMeta.output_tokens} cost:${formatUsdSmall(usageMeta.estimated_cost_usd)}`;
      }
      appendSystemLog(logLine);
      await persistChatSession();
      updateChatSessionLabel();
      if (chatState.chatActiveTab === "history") renderChatSessionList();
      if (chatState.chatActiveTab === "usage") getChatDeps().renderUsageStatsPanel?.();
      if (chatState.chatActiveTab === "system") {
        updateChatToneUi();
        renderChatSystemBox();
      }
    }
  } catch (err) {
    typing.remove();
    console.error(err);
    appendChatMessage("오류가 발생했어요. 잠시 후 다시 시도해 주세요.", "bot");
  } finally {
    chatState.chatReplyInFlight = false;
    updateChatToneUi();
  }
}

// --- 이벤트·초기화 (Bootstrap) ---
function initChatbotInternal() {
  ensureDefaultGptModeOff();
  updateChatApiKeyUi();
  updateChatGptModeUi();
  updateChatToneUi();
  updateChatSessionToneBar();
  renderUserPromptsList();
  renderChatMessages(true);
  renderChatSuggestions();
  renderChatSystemBox();
  switchChatTab("messages");
}

function handleChatToneChange() {
  if (isChatSettingsLocked()) {
    getChatDeps().$("chat-tone-select").value = getChatToneId();
    getChatDeps().showToast("대화 중에는 톤을 변경할 수 없습니다");
    return;
  }
  const toneId = getChatDeps().$("chat-tone-select").value;
  const customPrompt = getChatDeps().$("chat-custom-prompt").value.trim();
  if (toneId === "custom" && !customPrompt) {
    getChatDeps().showToast("직접 작성 프롬프트를 입력하세요");
    getChatDeps().$("chat-tone-select").value = getChatToneId();
    return;
  }
  if (toneId === "custom") clearActiveUserPrompt();
  saveChatTone(toneId, customPrompt);
  const label = toneId === "custom"
    ? "직접 작성"
    : (CHAT_TONE_PRESETS[toneId]?.label || toneId);
  getChatDeps().showToast(`AI 톤: ${label}`);
}

function setupChatbotEventsInternal() {
  if (chatState.chatInitialized) return;
  chatState.chatInitialized = true;

  getChatDeps().$("chat-fab").addEventListener("click", toggleChatPanel);
  getChatDeps().$("chat-close").addEventListener("click", closeChatPanel);
  getChatDeps().$("chat-new-btn").addEventListener("click", startNewChatSession);
  document.querySelectorAll(".chat-tab").forEach(btn => {
    btn.addEventListener("click", () => switchChatTab(btn.dataset.chatTab));
  });
  getChatDeps().$("chat-api-key-save").addEventListener("click", () => {
    saveGeminiApiKey(getChatDeps().$("chat-api-key-input").value);
    getChatDeps().$("chat-api-key-input").value = "";
    if (getGeminiApiKey() && !isGptModeEnabled()) {
      getChatDeps().showToast("API Key 저장됨 · 규칙 기반 모드 (AI는 AI설정에서 ON)");
    } else if (isGptModeActive()) {
      getChatDeps().showToast("AI 모드가 활성화되었습니다 ✨");
    } else {
      getChatDeps().showToast("API Key가 삭제되었습니다");
    }
  });
  const gptToggle = getChatDeps().$("chat-gpt-mode-enabled");
  if (gptToggle) {
    gptToggle.addEventListener("change", () => {
      if (gptToggle.checked && !getGeminiApiKey()) {
        gptToggle.checked = false;
        getChatDeps().showToast("AI 모드를 쓰려면 Gemini API Key를 먼저 저장하세요");
        return;
      }
      setGptModeEnabled(gptToggle.checked);
      getChatDeps().showToast(gptToggle.checked ? "AI 모드 ON ✨ (Gemini)" : "규칙 기반 모드로 전환했어요");
    });
  }
  getChatDeps().$("chat-tone-select").addEventListener("change", handleChatToneChange);
  getChatDeps().$("chat-custom-prompt").addEventListener("blur", () => {
    if (getChatDeps().$("chat-tone-select").value !== "custom" && !getActiveUserPrompt()) return;
    if (isChatSettingsLocked()) return;
    const customPrompt = getChatDeps().$("chat-custom-prompt").value.trim();
    if (!customPrompt) return;
    const saved = getActiveUserPrompt();
    if (saved && customPrompt !== saved.content) clearActiveUserPrompt();
    saveChatTone("custom", customPrompt);
  });
  getChatDeps().$("chat-save-current-prompt-btn").addEventListener("click", openSaveCurrentPromptForm);
  getChatDeps().$("chat-prompt-add-btn").addEventListener("click", () => showUserPromptForm(null));
  getChatDeps().$("chat-prompt-cancel-btn").addEventListener("click", hideUserPromptForm);
  getChatDeps().$("chat-prompt-save-btn").addEventListener("click", saveUserPromptFromForm);
  getChatDeps().$("chat-prompt-search").addEventListener("input", e => {
    chatState.userPromptSearchQuery = e.target.value;
    renderUserPromptsList();
  });
  getChatDeps().$("chat-form").addEventListener("submit", e => {
    e.preventDefault();
    sendChatMessage(getChatDeps().$("chat-input").value);
  });
}

export function createChatbot(appDeps) {
  bindChatDeps(appDeps);
  return {
    initForUser: initChatForUser,
    resetForUser: resetChatForUser,
    setWidgetVisible: setChatWidgetVisible,
    setupEvents: setupChatbotEventsInternal,
    initPanel: initChatbotInternal,
    closePanel: closeChatPanel
  };
}

