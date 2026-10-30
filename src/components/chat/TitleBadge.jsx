import { cn } from "@/lib/utils";

/** @param {{ title: { name: string, color: string } | null, className?: string }} props */
export default function TitleBadge({ title, className }) {
  if (!title) {
    return (
      <span className={cn("inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground", className)}>
        No title
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        className
      )}
      style={{
        color: title.color,
        borderColor: `${title.color}47`,
        backgroundColor: `${title.color}1A`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: title.color }} />
      {title.name}
    </span>
  );
}
