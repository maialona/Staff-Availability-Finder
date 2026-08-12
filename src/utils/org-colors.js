export const ORG_COLORS = [
  {
    bg: "bg-brand-coral/15",
    text: "text-brand-coral",
    dot: "bg-brand-coral",
    bar: "bg-brand-coral",
    buffer: "bg-brand-coral/10 border-brand-coral/20",
    shadow: "shadow-[0_4px_12px_rgba(255,107,107,0.3)]",
  },
  {
    bg: "bg-blue-100",
    text: "text-blue-600",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    buffer: "bg-blue-100/70 border-blue-200",
    shadow: "shadow-[0_4px_12px_rgba(59,130,246,0.25)]",
  },
  {
    bg: "bg-emerald-100",
    text: "text-emerald-600",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    buffer: "bg-emerald-100/70 border-emerald-200",
    shadow: "shadow-[0_4px_12px_rgba(16,185,129,0.25)]",
  },
  {
    bg: "bg-violet-100",
    text: "text-violet-600",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
    buffer: "bg-violet-100/70 border-violet-200",
    shadow: "shadow-[0_4px_12px_rgba(139,92,246,0.25)]",
  },
  {
    bg: "bg-amber-100",
    text: "text-amber-600",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    buffer: "bg-amber-100/70 border-amber-200",
    shadow: "shadow-[0_4px_12px_rgba(245,158,11,0.25)]",
  },
  {
    bg: "bg-pink-100",
    text: "text-pink-600",
    dot: "bg-pink-500",
    bar: "bg-pink-500",
    buffer: "bg-pink-100/70 border-pink-200",
    shadow: "shadow-[0_4px_12px_rgba(236,72,153,0.25)]",
  },
];

export const getOrgColor = (orgIdx = 0) =>
  ORG_COLORS[(orgIdx ?? 0) % ORG_COLORS.length];
