/** 앱 ↔ 챗봇 의존성 연결 (10-4 리팩토링) */
let deps = null;

export function bindChatDeps(nextDeps) {
  deps = nextDeps;
}

export function getChatDeps() {
  if (!deps) throw new Error("PlanDay chat deps not bound");
  return deps;
}
