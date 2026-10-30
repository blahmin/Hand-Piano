import type { CSSProperties } from "react";

type IconName =
  | "camera"
  | "play"
  | "record"
  | "stop"
  | "volume"
  | "keyboard"
  | "arrow"
  | "help"
  | "eye"
  | "close"
  | "shield";
const paths: Record<IconName, React.ReactNode> = {
  camera: (
    <>
      <rect x="3" y="6" width="12" height="12" rx="3" />
      <path d="m15 10 6-3v10l-6-3" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7z" />,
  record: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  volume: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
