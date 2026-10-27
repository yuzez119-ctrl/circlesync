import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayNameFor } from "@/lib/chatUtils";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import TitleBadges from "./TitleBadges";

export default function NewDirectDialog({ open, onOpenChange, members, displayNames, memberTiers, currentUserId, onSelect }) {
  const others = members.filter((member) => member.user_id !== currentUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New private message</DialogTitle>
          <DialogDescription>Only the two of you can see this conversation.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {others.map((member) => {
            const tiers = memberTiers?.[member.user_id] || [];
            const name = displayNameFor(displayNames, member.user_id, member.full_name);
            return (
              <button
                key={member.id}
                onClick={() => onSelect(member.user_id)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary/60"
              >
                <MemberAvatar name={name} color={primaryColor(tiers)} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-sm font-medium">{name}</div>
                  <div className="mt-1">
                    <TitleBadges titles={tiers} />
                  </div>
                </div>
              </button>
            );
          })}
          {others.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nobody else has joined yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}