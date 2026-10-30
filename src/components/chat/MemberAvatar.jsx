import { cn } from "@/lib/utils";

const FALLBACK = "#6B7280";

/** @param {{ name?: string, color?: string, size?: number, className?: string }} props */
export default function MemberAvatar({ name = "?", color, size = 36, className }) {
  const initials = (name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const tone = color || FALLBACK;

  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full border font-heading font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        color: color || "hsl(var(--muted-foreground))",
        borderColor: `${tone}59`,
        backgroundColor: `${tone}1F`,
      }}
    >
      {initials}
    </span>
  );
}
