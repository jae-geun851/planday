/** 챗봇 공유 상태 (10-4 리팩토링) — 객체로 export해 engine.js에서 수정 가능 */
export const chatState = {
  chatOpen: false,
  chatInitialized: false,
  chatSessions: [],
  currentSessionId: null,
  currentSessionTitle: "",
  currentMessages: [],
  currentSystemMessage: "",
  chatActiveTab: "messages",
  chatDbUnavailable: false,
  chatReplyInFlight: false,
  currentSessionTone: null,
  userPrompts: [],
  userPromptsDbUnavailable: false,
  userPromptSearchQuery: "",
  userPromptFormOpen: false,
  editingUserPromptId: null
};

export function resetChatState() {
  chatState.chatOpen = false;
  chatState.chatInitialized = false;
  chatState.chatSessions = [];
  chatState.currentSessionId = null;
  chatState.currentSessionTitle = "";
  chatState.currentMessages = [];
  chatState.currentSystemMessage = "";
  chatState.chatActiveTab = "messages";
  chatState.chatDbUnavailable = false;
  chatState.chatReplyInFlight = false;
  chatState.currentSessionTone = null;
  chatState.userPrompts = [];
  chatState.userPromptsDbUnavailable = false;
  chatState.userPromptSearchQuery = "";
  chatState.userPromptFormOpen = false;
  chatState.editingUserPromptId = null;
}
