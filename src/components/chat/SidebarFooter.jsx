import { LogOut, Pencil, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import TitleBadges from "./TitleBadges";

export default function SidebarFooter({ name, tiers, isAdmin, onOpenAdmin, onEditName, onSignOut }) {
  return (
    <div className="border-t border-border px-3 py-3">
      {isAdmin && (
        <Button variant="secondary" size="sm" onClick={onOpenAdmin} className="mb-3 w-full justify-start gap-2 rounded-xl">
          <Settings className="h-4 w-4" />
          Admin area
        </Button>
      )}
      <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
        <MemberAvatar name={name} color={primaryColor(tiers)} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-sm font-medium">{name || "You"}</div>
          <div className="mt-1">
            <TitleBadges titles={tiers} />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onEditName} aria-label="Change your name" className="h-8 w-8 text-muted-foreground">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign out" className="h-8 w-8 text-muted-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}