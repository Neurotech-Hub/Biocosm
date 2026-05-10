/** Inline SVG icons for timeline playback (stroke-based, inherits currentColor). */

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true as const
};

export function PlayIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 5l10 5-10 5V5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...iconProps}>
      <rect x={5} y={4} width={4} height={12} rx={1} fill="currentColor" />
      <rect x={11} y={4} width={4} height={12} rx={1} fill="currentColor" />
    </svg>
  );
}

/** Advance one timestep (vertical bar + triangle). */
export function StepForwardIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 4v12l7-6-7-6z" fill="currentColor" />
      <rect x={13} y={4} width={2.5} height={12} rx={0.5} fill="currentColor" />
    </svg>
  );
}

/** Jump to start of timeline (counterclockwise circular arrow). Scaled Lucide-style rotate-ccw. */
export function ResetTimelineIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3v5h5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
