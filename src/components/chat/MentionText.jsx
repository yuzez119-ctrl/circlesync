import { cn } from "@/lib/utils";
import { splitMentions } from "@/lib/chatUtils";

export default function MentionText({ body, names, mine }) {
  const parts = splitMentions(body, names);

  return parts.map((part, index) =>
    part.mention ? (
      <span
        key={index}
        className={cn(
          "rounded px-1 font-semibold",
          mine ? "bg-background/25" : "bg-primary/20 text-primary"
        )}
      >
        {part.text}
      </span>
    ) : (
      <span key={index}>{part.text}</span>
    )
  );
}