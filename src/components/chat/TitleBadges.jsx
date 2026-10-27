import { cn } from "@/lib/utils";
import TitleBadge from "./TitleBadge";

export default function TitleBadges({ titles, className }) {
  const list = titles || [];

  if (!list.length) return <TitleBadge title={null} className={className} />;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {list.map((tier) => (
        <TitleBadge key={tier.id} title={tier} />
      ))}
    </span>
  );
}