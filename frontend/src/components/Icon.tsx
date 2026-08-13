/**
 * Line icons in the house style, drawn from the same 24px grid and 1.75 stroke
 * so nothing looks pasted in from another decade. Emoji render as each phone's
 * vendor art — a paperclip is beige on one and grey on the next — and never
 * take the surrounding text colour; these do.
 */
export type IconName =
  | "settings"
  | "link"
  | "pencil"
  | "trash"
  | "plus"
  | "x"
  | "check"
  | "paperclip"
  | "camera"
  | "image"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "panel-close"
  | "panel-open"
  | "refresh"
  | "more";

// Multiple subpaths separated by "|"; a zero-length segment ("h.01") is a dot.
const paths: Record<IconName, string> = {
  settings: "M3 6h4|M11 6h10|M3 12h10|M17 12h4|M3 18h2|M9 18h12|M9 4v4|M15 10v4|M7 16v4",
  link: "M9.5 17H8a5 5 0 0 1 0-10h1.5|M14.5 7H16a5 5 0 0 1 0 10h-1.5|M8.5 12h7",
  pencil: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z|M14 5.5l4.5 4.5",
  trash: "M4 7h16|M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2|M9 11v6|M15 11v6|M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12",
  plus: "M12 5v14|M5 12h14",
  x: "M18 6 6 18|M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  paperclip:
    "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.9l-8.58 8.57a2 2 0 1 1-2.83-2.83l8.49-8.48",
  camera: "M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5Z|M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  image: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z|M8.5 8.5h.01|M21 15l-5-5L5 21",
  "chevron-left": "M14.5 6l-6 6 6 6",
  "chevron-right": "M9.5 6l6 6-6 6",
  "chevron-down": "M6 9.5l6 6 6-6",
  // The window with its list rail, and the way the rail is about to move. Says
  // "sidebar" where a bare chevron only says "left".
  "panel-close":
    "M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5Z|M9 4.5v15|M16.5 9.5 13.5 12l3 2.5",
  "panel-open":
    "M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5Z|M9 4.5v15|M13.5 9.5 16.5 12l-3 2.5",
  refresh: "M20.5 12a8.5 8.5 0 1 1-2.5-6|M20.5 3v5h-5",
  more: "M12 5.5h.01|M12 12h.01|M12 18.5h.01",
};

export default function Icon({
  name,
  className = "h-5 w-5",
  // Dots carry no line to be seen by, so an icon made of them may ask for more.
  strokeWidth = 1.75,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name].split("|").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
