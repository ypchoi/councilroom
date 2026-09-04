/**
 * Every word the interface says, in one table: one row per string, one column
 * per language. A new language is a column and nothing else.
 *
 * A row is either the text itself or a function taking whatever the sentence
 * needs — `t("roomCount")(3)` — so each language keeps the word order it wants
 * rather than having a sentence glued together at the call site.
 */
const S = {
  // ── App shell ────────────────────────────────────────────────────────────
  leaveRoom: { ko: "방을 나가시겠습니까?", en: "Leave this room?" },
  newRoom: { ko: "새 방", en: "New room" },
  notAuthed: {
    ko: "인증되지 않았습니다. 이 배포는 신뢰된 리버스 프록시가 보내는 신원 헤더를 기대하지만, 요청에 헤더가 없었습니다.",
    en: "Not authenticated. This deployment expects an identity header from a trusted reverse proxy, but the request arrived without one.",
  },
  password: { ko: "비밀번호", en: "Password" },
  signIn: { ko: "로그인", en: "Sign in" },
  showRooms: { ko: "방 목록 열기", en: "Show the room list" },
  shareRoom: { ko: "방 공유", en: "Share room" },
  shareRoomTip: {
    ko: "이 방을 읽기 전용 공개 링크로 공유합니다",
    en: "Create a public read-only link to this room",
  },
  emptyRoom: { ko: "질문 하나. 카운슬이 답합니다.", en: "Ask one question. The council answers." },

  // Stages, as the live stream reports them
  deliberating: { ko: "카운슬 심의 중…", en: "Council deliberating…" },
  peerReviewing: { ko: "상호 리뷰 중…", en: "Peer review…" },
  synthesizing: {
    ko: (chair: string) => `종합 중… 의장: ${chair}`,
    en: (chair: string) => `Synthesizing… Chairman: ${chair}`,
  },

  // ── Composer ─────────────────────────────────────────────────────────────
  send: { ko: "보내기", en: "Send" },
  queueSend: { ko: "대기열에", en: "Queue" },
  queued: { ko: "대기 중", en: "queued" },
  queueHint: {
    ko: "심의가 끝나면 순서대로 나갑니다",
    en: "Goes out in turn, once the council is free",
  },
  attachedCount: {
    ko: (n: number, max: number) => `${n} / ${max} 첨부됨`,
    en: (n: number, max: number) => `${n} / ${max} attached`,
  },
  removeFile: { ko: (name: string) => `${name} 제거`, en: (name: string) => `Remove ${name}` },
  quick: { ko: "빠른 심의", en: "Quick" },
  quickTip: {
    ko: "빠른 심의: 각 멤버가 한 번씩 답하고 의장이 종합합니다.",
    en: "Quick: each member answers once, the Chairman synthesises.",
  },
  deepTip: {
    ko: "깊은 심의: 멤버들이 서로의 답을 익명으로 리뷰까지 합니다 — 사용량은 약 두 배.",
    en: "Deep: members also review each other anonymously first — about double the usage.",
  },
  camera: { ko: "카메라", en: "Camera" },
  photos: { ko: "사진", en: "Photos" },
  files: { ko: "파일", en: "Files" },
  moreOptions: { ko: "더보기", en: "More options" },
  asking: { ko: "보내는 중…", en: "Asking…" },
  typeSomething: { ko: "무엇이든 입력하세요…", en: "Type something…" },

  // ── Conversation ─────────────────────────────────────────────────────────
  pullToRefresh: { ko: "당겨서 새로고침", en: "Pull to refresh" },
  releaseToRefresh: { ko: "놓으면 새로고침", en: "Release to refresh" },

  // ── Council answer ───────────────────────────────────────────────────────
  councilMembers: { ko: "카운슬 멤버", en: "COUNCIL MEMBERS" },
  councilAnswer: { ko: "카운슬 답변", en: "COUNCIL ANSWER" },
  theCouncilAnswer: { ko: "카운슬 답변", en: "the Council answer" },
  thinking: { ko: "생각 중…", en: "Thinking…" },
  retry: { ko: "다시 시도", en: "Retry" },
  retryWith: {
    ko: (label: string) => `${label}을(를) 의장으로 다시 시도`,
    en: (label: string) => `Retry with ${label} as chairman`,
  },
  peerReviews: { ko: "상호 리뷰", en: "Peer reviews" },
  reviewOf: { ko: (label: string) => `${label}의 리뷰`, en: (label: string) => `${label}'s review` },
  answerOf: { ko: (label: string) => `${label}의 답변`, en: (label: string) => `${label}'s answer` },
  noAttachments: {
    ko: "첨부 파일을 받지 못했습니다",
    en: "did not receive the attachments",
  },
  copyAsMarkdown: {
    ko: (label: string) => `${label} 마크다운으로 복사`,
    en: (label: string) => `Copy ${label} as Markdown`,
  },

  // ── Council status ───────────────────────────────────────────────────────
  council: { ko: "카운슬", en: "COUNCIL" },
  refresh: { ko: "새로고침", en: "Refresh" },
  refreshTip: {
    ko: "각 CLI의 계정과 사용량을 다시 읽습니다",
    en: "Re-read every CLI's account and quota",
  },
  statusLoading: {
    ko: "불러오는 중… 각 CLI에 계정과 사용량을 묻고 있습니다.",
    en: "Loading… asking each CLI for its account and quota.",
  },
  chairBadge: { ko: "의장", en: "CHAIR" },
  memberOff: { ko: "제외됨", en: "off" },
  modelUnknown: { ko: "모델 알 수 없음", en: "model unknown" },
  cliDefaultSuffix: { ko: " (CLI 기본값)", en: " (CLI default)" },
  effortSuffix: { ko: (v: string) => ` · 강도: ${v}`, en: (v: string) => ` · effort: ${v}` },
  noQuota: {
    ko: "이 CLI는 남은 사용량을 알려주지 않습니다",
    en: "quota not reported by this CLI",
  },
  resetIn: { ko: (left: string) => `${left} 후 초기화`, en: (left: string) => `reset in ${left}` },
  unitMinutes: { ko: (n: number) => `${n}분`, en: (n: number) => `${n}m` },
  unitHours: { ko: (n: number) => `${n}시간`, en: (n: number) => `${n}h` },
  unitDays: { ko: (n: number) => `${n}일`, en: (n: number) => `${n}d` },
  callsHere: { ko: (n: number) => `여기서 ${n}회 호출`, en: (n: number) => `${n} calls here` },
  failedCount: { ko: (n: number) => ` · ${n}회 실패`, en: (n: number) => ` · ${n} failed` },
  quotaVia: { ko: (src: string) => `사용량 출처: ${src}`, en: (src: string) => `quota via ${src}` },
  noQuotaSource: {
    ko: "사용량 출처 없음 — CLI 자체는 남은 사용량을 알려주지 않습니다",
    en: "no quota source installed — CLIs do not report remaining quota",
  },

  // ── Rooms drawer ─────────────────────────────────────────────────────────
  newQuestion: { ko: "새 질문", en: "New question" },
  hideRooms: { ko: "방 목록 접기", en: "Hide the room list" },
  closeRooms: { ko: "방 목록 닫기", en: "Close the room list" },
  askNew: { ko: "새로 묻기", en: "Ask new" },
  searchRooms: { ko: "방 검색…", en: "Search rooms…" },
  actionsFor: { ko: (title: string) => `${title} 메뉴`, en: (title: string) => `Actions for ${title}` },
  rename: { ko: "이름 변경", en: "Rename" },
  share: { ko: "공유", en: "Share" },
  stopSharing: { ko: "공유 중지", en: "Stop sharing" },
  shareTip: { ko: "읽기 전용 공개 링크를 만듭니다", en: "Create a public read-only link" },
  delete: { ko: "삭제", en: "Delete" },
  noMatchingRooms: { ko: "일치하는 방 없음", en: "no matching rooms" },
  roomCount: { ko: (n: number) => `방 ${n}개`, en: (n: number) => `${n} room${n === 1 ? "" : "s"}` },
  ofTotal: { ko: (n: number) => ` / 전체 ${n}개`, en: (n: number) => ` of ${n}` },
  deleteAll: { ko: "전체 삭제", en: "Delete all" },
  deleteAllConfirm: {
    ko: (n: number) => `방 ${n}개와 대화 기록을 모두 삭제할까요?`,
    en: (n: number) => `Delete all ${n} rooms and their history?`,
  },
  settings: { ko: "설정", en: "Settings" },

  // ── Settings ─────────────────────────────────────────────────────────────
  probing: {
    ko: "어떤 CLI가 설치되고 로그인되어 있는지 확인하는 중…",
    en: "Checking which CLIs are installed and signed in…",
  },
  loading: { ko: "불러오는 중…", en: "Loading…" },
  signOut: { ko: "로그아웃", en: "Sign out" },
  membersTitle: { ko: "멤버", en: "MEMBERS" },
  membersHint: {
    ko: "체크된 멤버가 모두 동시에, 각자 독립적으로 질문에 답합니다. 멤버가 많을수록 답변이 넓어지고 구독 사용량도 그만큼 늘어납니다.",
    en: "Every checked member answers your question independently, at the same time. More members means a broader answer and proportionally more subscription usage.",
  },
  cliNotInstalled: { ko: "CLI 미설치", en: "CLI not installed" },
  notSignedIn: { ko: "로그인 안 됨", en: "not signed in" },
  chairmanTitle: { ko: "의장", en: "CHAIRMAN" },
  chairmanHint: {
    ko: "모든 멤버의 답을 읽고 하나의 최종 답변을 씁니다: 이견을 정리하고, 쓸모 있는 소수 의견은 남깁니다. 멤버들이 끝난 뒤에 돌기 때문에 호출이 한 번 더 듭니다. **무작위**는 방이 열릴 때 멤버 하나를 뽑고, **순번**은 새 방마다 다음 멤버에게 자리를 넘깁니다. 어느 쪽이든 방은 열릴 때의 의장을 계속 지켜서, 한 대화가 한 목소리로 남습니다.",
    en: "Reads every member's answer and writes the single final answer: resolving disagreements, keeping useful minority points. It runs after the members finish, so it costs one extra call. **Random** draws a member when a room opens; **Rotation** seats the next member in each new room. Either way the room keeps the chair it opened with, so one conversation stays in one voice.",
  },
  checkingSignedIn: {
    ko: "로그인된 CLI를 확인하는 중…",
    en: "Checking which CLIs are signed in…",
  },
  chairRandom: { ko: "무작위", en: "Random" },
  chairRotation: { ko: "순번", en: "Rotation" },
  optionNotSignedIn: { ko: " — 로그인 안 됨", en: " — not signed in" },
  optionNotInstalled: { ko: " — 미설치", en: " — not installed" },
  defaultModeTitle: { ko: "기본 모드", en: "DEFAULT MODE" },
  defaultModeHint: {
    ko: "**빠른 심의**: 멤버가 한 번씩 답하고 의장이 종합 — 멤버 수만큼 + 1회 호출. **깊은 심의**: 종합 전에 멤버들이 서로의 답을 익명으로 리뷰 — 호출이 대략 두 배, 대신 실수를 더 잘 잡습니다.",
    en: "**Quick**: members answer once, the Chairman synthesises — 1 call per member + 1. **Deep**: members then review each other's answers anonymously before synthesis — roughly double the calls, better at catching mistakes.",
  },
  quickCouncil: { ko: "빠른 카운슬", en: "Quick Council" },
  deepCouncil: { ko: "깊은 카운슬", en: "Deep Council" },
  providerTitle: { ko: "프로바이더 설정", en: "PROVIDER SETTINGS" },
  providerHint: {
    ko: "라인업은 고정입니다 — 모든 멤버가 같은 등급으로 답해야 한 번의 심의가 예측 가능한 사용량을 씁니다. Antigravity는 강도 등급을 모델 id 안에 담고 있습니다. 바꾸려면 ~/.councilroom/config.yaml 을 고치고 재시작하세요.",
    en: "The line-up is fixed so every member answers at the same tier and a council run costs a predictable amount of quota. Antigravity carries its effort tier inside the model id. To change any of it, edit ~/.councilroom/config.yaml and restart.",
  },
  cliDefaultModel: { ko: "CLI 기본값", en: "CLI default" },
  executionTitle: { ko: "실행", en: "EXECUTION" },
  timeoutHint: {
    ko: "한 멤버가 취소되고 실패로 기록되기까지 허용되는 시간입니다.",
    en: "How long one member may take before it is cancelled and marked failed.",
  },
  timeoutLabel: { ko: "타임아웃 (초)", en: "Timeout (seconds)" },
  minMembersHint: {
    ko: "이보다 적은 멤버만 성공하면 종합을 건너뛰고, 빈약한 답을 카운슬의 답인 양 내놓는 대신 오류와 재시도 버튼을 보여줍니다.",
    en: "If fewer members than this succeed, synthesis is skipped and the errors are shown with a retry button, rather than presenting a thin answer as if it were the council's.",
  },
  minMembersLabel: { ko: "최소 성공 멤버 수", en: "Minimum successful members" },
  minMembersWarn: {
    ko: (selected: number, required: number) =>
      `멤버가 ${selected}명뿐이라 실제로는 ${required}명만 요구됩니다.`,
    en: (selected: number, required: number) =>
      `Only ${selected} member(s) selected — runs will require just ${required}.`,
  },
  conversationTitle: { ko: "대화", en: "CONVERSATION" },
  conversationHint: {
    ko: "켜면: 각 멤버가 방마다 자기 CLI 세션을 이어가서 앞선 답과 첨부를 기억하고, 프로바이더 쪽 캐싱도 적용됩니다. 끄면: 매 턴 새 세션으로 시작하고 CouncilRoom이 방에서 다시 만든 대화 기록을 보냅니다.",
    en: "On: each member continues its own CLI session per room, so it remembers its earlier answers and attachments, and provider-side caching applies. Off: every turn starts a fresh session and CouncilRoom resends a transcript it rebuilds from the room.",
  },
  resumeSessions: { ko: "프로바이더 세션 이어가기", en: "Resume provider sessions" },
  languageTitle: { ko: "언어", en: "LANGUAGE" },
  languageHint: {
    ko: "화면에 쓰이는 말입니다. 모델이 답하는 말이 아니라 — 그건 질문한 말을 따라갑니다. 고르면 페이지를 다시 엽니다.",
    en: "The language of the interface — not of the answers, which follow the language you ask in. Choosing one reloads the page.",
  },
  cancel: { ko: "취소", en: "Cancel" },
  save: { ko: "저장", en: "Save" },

  // ── Share ────────────────────────────────────────────────────────────────
  copy: { ko: "복사", en: "Copy" },
  copied: { ko: "복사됨", en: "Copied" },
  unshare: { ko: "공유 해제", en: "Unshare" },
  unshareConfirm: {
    ko: "공유를 중지할까요? 링크가 모두에게 동작하지 않게 됩니다.",
    en: "Stop sharing? The link stops working for everyone.",
  },
  linkGone: { ko: "이 링크는 더 이상 공유되지 않습니다.", en: "This link is no longer shared." },
  sharedReadOnly: { ko: "공유됨 · 읽기 전용", en: "shared · read-only" },
  nothingYet: { ko: "아직 아무것도 없습니다.", en: "Nothing here yet." },
} as const;

export type Lang = "ko" | "en";
export const LANGS: { value: Lang; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

/** Korean, unless this browser was told otherwise. */
export const lang: Lang = localStorage.getItem("lang") === "en" ? "en" : "ko";
document.documentElement.lang = lang;

export function t<K extends keyof typeof S>(key: K): (typeof S)[K]["en"] {
  return S[key][lang] as (typeof S)[K]["en"];
}

/** The server names a room "New room" until its first question gives it one. */
export const roomTitle = (title: string) => (title === "New room" ? t("newRoom") : title);

// ponytail: a reload, rather than threading the language through every component.
// Choosing a language is a once-ever act, and every room comes back from the server.
export function setLang(next: Lang) {
  localStorage.setItem("lang", next);
  location.reload();
}
