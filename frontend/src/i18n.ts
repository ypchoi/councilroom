/**
 * Every word the interface says, in one table: one row per string, one column
 * per language. A new language is a column and nothing else.
 *
 * A row is either the text itself or a function taking whatever the sentence
 * needs — `t("roomCount")(3)` — so the parts of a sentence stay in the order
 * that language puts them in, rather than being glued together at the call site.
 */
const S = {
  // App shell
  leaveRoom: { ko: "방을 나가시겠습니까?", en: "Leave this room?" },
  queued: { ko: "대기 중", en: "queued" },

  // Composer
  send: { ko: "보내기", en: "Send" },
  queueSend: { ko: "대기열에", en: "Queue" },
  queueHint: { ko: "심의가 끝나면 순서대로 나갑니다", en: "Goes out when the council is free" },
} as const;

export type Lang = "ko" | "en";
export const LANGS: { value: Lang; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

/** Korean unless this browser was told otherwise. */
export const lang: Lang = localStorage.getItem("lang") === "en" ? "en" : "ko";
document.documentElement.lang = lang;

export function t<K extends keyof typeof S>(key: K): (typeof S)[K]["en"] {
  return S[key][lang] as (typeof S)[K]["en"];
}

// ponytail: a reload, rather than threading the language through every component.
// Picking a language is a once-ever act, and the rooms all come back from the server.
export function setLang(next: Lang) {
  localStorage.setItem("lang", next);
  location.reload();
}
