import { cn } from "@/lib/utils";
import { displayNameFor, membersWithNames } from "@/lib/chatUtils";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import TitleBadges from "./TitleBadges";

export default function MemberPanel({ members, displayNames, memberTiers, currentUserId, className }) {
  const visibleMembers = membersWithNames(members, displayNames, currentUserId);
  return (
    <aside className={cn("hidden w-[264px] shrink-0 flex-col border-l border-border bg-card/30 lg:flex", className)}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="font-heading text-sm font-semibold tracking-wide">People</span>
        <span className="text-xs text-muted-foreground">{visibleMembers.length}</span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleMembers.map((member) => {
          const tiers = memberTiers?.[member.user_id] || [];
          const name = displayNameFor(displayNames, member.user_id, member.full_name);
          return (
            <div key={member.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/50">
              <MemberAvatar name={name} color={primaryColor(tiers)} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-heading text-sm font-medium">
                  {name}
                  {member.user_id === currentUserId && <span className="ml-1.5 text-[11px] text-muted-foreground">you</span>}
                </div>
                <div className="mt-1">
                  <TitleBadges titles={tiers} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}