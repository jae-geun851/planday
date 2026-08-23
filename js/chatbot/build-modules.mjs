import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const extracted = fs.readFileSync(path.join(__dirname, "_extracted.js"), "utf8");

const constantsEnd = extracted.indexOf("let chatOpen = false");
const constantsBlock = extracted.slice(0, constantsEnd).trim();
const rest = extracted.slice(constantsEnd);

const stateEnd = rest.indexOf("function getActiveUserPromptId()");
const stateBlock = rest.slice(0, stateEnd).trim();
const body = rest.slice(stateEnd);

const depsReplacements = [
  [/\bsupabase\b/g, "deps.getSupabase()"],
  [/\bcurrentUser\b/g, "deps.getCurrentUser()"],
  [/\bevents\b/g, "deps.getEvents()"],
  [/\$\(/g, "deps.$("],
  [/\bshowToast\(/g, "deps.showToast("],
  [/\bescapeHtml\(/g, "deps.escapeHtml("],
  [/\bformatDate\(/g, "deps.formatDate("],
  [/\baddDays\(/g, "deps.addAddDays("],
  [/\bformatDisplayDate\(/g, "deps.formatDisplayDate("],
  [/\bgetRelativeLabel\(/g, "deps.getRelativeLabel("],
  [/\bgetDdayLabel\(/g, "deps.getDdayLabel("],
  [/\bgetEventsForDate\(/g, "deps.getEventsForDate("],
  [/\bgetAllOccurrences\(/g, "deps.getAllOccurrences("],
  [/\bgetWeekRange\(/g, "deps.getWeekRange("],
  [/\bgetDday\(/g, "deps.getDday("],
  [/\bpushNewEvent\(/g, "deps.pushNewEvent("],
  [/\brenderAll\(/g, "deps.renderAll("],
  [/\bCATEGORY_LABELS\b/g, "deps.CATEGORY_LABELS"],
];

let transformedBody = body;
for (const [from, to] of depsReplacements) {
  transformedBody = transformedBody.replace(from, to);
}

const stateVars = stateBlock
  .split("\n")
  .filter(l => l.startsWith("let "))
  .map(l => l.replace("let ", "").replace(";", "").trim());

const stateExports = stateBlock
  .split("\n")
  .filter(l => l.startsWith("let "))
  .map(l => "export " + l)
  .join("\n");

const constantsOut = constantsBlock
  .split("\n")
  .map(l => l.replace(/^const /, "export const "))
  .join("\n");

fs.writeFileSync(path.join(root, "js", "chat", "constants.js"), constantsOut + "\n");
fs.writeFileSync(path.join(root, "js", "chat", "state.js"), stateExports + "\n");

const toneEnd = transformedBody.indexOf("function sortUserPrompts(");
const promptsEnd = transformedBody.indexOf("function updateChatSessionLabel(");
const sessionsEnd = transformedBody.indexOf("function formatEventLine(");
const replyEnd = transformedBody.indexOf("function initChatbot(");

const toneBlock = transformedBody.slice(0, toneEnd);
const promptsBlock = transformedBody.slice(toneEnd, promptsEnd);
const sessionsBlock = transformedBody.slice(promptsEnd, sessionsEnd);
const replyBlock = transformedBody.slice(sessionsEnd, replyEnd);
const initBlock = transformedBody.slice(replyEnd);

function wrapModule(name, content, extraImports = "") {
  const stateImport = stateVars.map(v => v.split("=")[0].trim()).join(", ");
  return `/** ${name} — PlanDay 챗봇 모듈 (10-4 리팩토링) */
import {
  CHAT_TONE_STORAGE,
  CHAT_CUSTOM_PROMPT_STORAGE,
  ACTIVE_USER_PROMPT_KEY,
  CHAT_TONE_PRESETS,
  CHAT_BASE_PROMPT,
  CHAT_SUGGESTIONS,
  GEMINI_KEY_STORAGE,
  GEMINI_MODEL,
  USER_PROMPT_TYPE_LABELS
} from "./constants.js";
import { ${stateImport} } from "./state.js";

${extraImports}

${content}
`;
}

fs.writeFileSync(
  path.join(root, "js", "chat", "tone.js"),
  wrapModule("톤 선택", toneBlock, `import { renderUserPromptsList } from "./user-prompts.js";\nimport { updateChatSessionToneBar } from "./ui.js";`)
);

fs.writeFileSync(
  path.join(root, "js", "chat", "user-prompts.js"),
  wrapModule("나만의 프롬프트", promptsBlock, `import { saveChatTone, updateChatToneUi, getChatToneId } from "./tone.js";`)
);

fs.writeFileSync(
  path.join(root, "js", "chat", "sessions-ui.js"),
  wrapModule("세션·UI", sessionsBlock,
    `import { getSessionToneLabel, formatSessionMeta, getDefaultSystemMessage, getChatTonePromptText, updateChatToneUi, isChatSettingsLocked } from "./tone.js";
import { renderUserPromptsList, recordUserPromptUsage, getActiveUserPromptId } from "./user-prompts.js";
import { sendChatMessage } from "./reply.js";`)
);

fs.writeFileSync(
  path.join(root, "js", "chat", "reply.js"),
  wrapModule("응답 생성", replyBlock,
    `import { buildSystemPromptForApi, appendSystemLog, getDefaultSystemMessage, updateChatToneUi, isChatSettingsLocked } from "./tone.js";
import { ensureChatSession, persistChatSession, getChatSessionErrorMessage } from "./sessions-ui.js";
import { appendChatMessage, renderChatSessionList, renderChatSystemBox } from "./sessions-ui.js";`)
);

const initExports = initBlock
  .replace("function setupChatbotEvents()", "export function setupChatbotEvents(deps)")
  .replace("function initChatbot()", "export function initChatbot(deps)");

fs.writeFileSync(
  path.join(root, "js", "chatbot", "index.js"),
  `/** PlanDay 챗봇 진입점 */
export { setupChatbotEvents, initChatbot } from "../chat/bootstrap.js";
export {
  initChatForUser,
  resetChatForUser,
  setChatWidgetVisible
} from "../chat/sessions-ui.js";
`
);

fs.writeFileSync(path.join(root, "js", "chat", "bootstrap.js"), wrapModule("이벤트·초기화", initExports,
  `import { updateChatApiKeyUi, saveOpenAiApiKey, handleChatToneChange } from "./reply.js";
import { startNewChatSession, switchChatTab, toggleChatPanel, closeChatPanel } from "./sessions-ui.js";
import { updateChatToneUi, updateChatSessionToneBar } from "./tone.js";
import { renderUserPromptsList, showUserPromptForm, hideUserPromptForm, saveUserPromptFromForm, openSaveCurrentPromptForm } from "./user-prompts.js";
import { renderChatMessages, renderChatSuggestions, renderChatSystemBox } from "./sessions-ui.js";
import { sendChatMessage } from "./reply.js";
import { getActiveUserPrompt, clearActiveUserPrompt, saveChatTone } from "./tone.js";
import { getChatToneId, isChatSettingsLocked } from "./tone.js";`));

console.log("Modules built.");
