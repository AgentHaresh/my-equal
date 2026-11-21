// The symbols used on buttons. Each button that shows one also carries a spoken label.
type P = { className?: string };
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const PhoneIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
export const VideoIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2" y="6" width="14" height="12" rx="2.5" />
    <path d="m16 10 6-3.5v11L16 14" />
  </svg>
);
export const MicIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </svg>
);
export const StopIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </svg>
);
export const SendIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);
export const ClipIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.9-2.9l8.5-8.5" />
  </svg>
);
export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base} {...p} fill={filled ? "currentColor" : "none"}>
    <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
  </svg>
);
export const GearIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.800-1.200l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.300 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.200-2.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.7 1.7 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 2.800 1.200l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z" />
  </svg>
);
export const ChatIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-12.300 7.400L3 21l2.100-5.700A8.400 8.400 0 1 1 21 11.500z" />
  </svg>
);
export const SparkIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900zM19 15l.900 2.100L22 18l-2.100.900L19 21l-.900-2.100L16 18l2.100-.900z" />
  </svg>
);
export const BackIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const TickIcon = ({ double, ...p }: P & { double?: boolean }) => (
  <svg {...base} {...p} width={16} height={16} strokeWidth={2.4}>
    {double ? <path d="M1.500 12.500l4 4L15 7M9.500 15.500l1 1L20.500 7" /> : <path d="M4 12.500l5 5L20 6.500" />}
  </svg>
);
export const FileIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);
