import { BadgeCheck, LogOut, Mail, Pencil, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import TitleBadges from "./TitleBadges";

export default function SidebarFooter({
  name, tiers, isAdmin, isFounder, showFounderTitle, onFounderTitleVisibilityChange,
  founderTitleSaving, founderTitleError, canRequestTierChange, onRequestTierChange,
  onOpenAdmin, onEditName, onChangeLoginEmail, onSignOut,
}) {
  return (
    <div className="border-t border-border px-3 py-3">
      {isAdmin && (
        <Button variant="secondary" size="sm" onClick={onOpenAdmin} className="mb-3 w-full justify-start gap-2 rounded-xl">
          <Settings className="h-4 w-4" />
          Admin area
        </Button>
      )}
      {canRequestTierChange && (
        <Button variant="outline" size="sm" onClick={onRequestTierChange} className="mb-3 w-full justify-start gap-2 rounded-xl">
          <BadgeCheck className="h-4 w-4" />
          Request member tier change
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
        <Button variant="ghost" size="icon" onClick={onChangeLoginEmail} aria-label="Change login username" className="h-8 w-8 text-muted-foreground">
          <Mail className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign out" className="h-8 w-8 text-muted-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
      {isFounder && (
        <div className="mt-2">
          <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs text-muted-foreground">
            <span>Show Founder title to others</span>
            <Switch
              checked={showFounderTitle}
              onCheckedChange={onFounderTitleVisibilityChange}
              disabled={founderTitleSaving}
              aria-label="Show Founder title to others"
            />
          </label>
          {founderTitleError && <p role="alert" className="px-2 text-xs text-destructive">{founderTitleError}</p>}
        </div>
      )}
    </div>
  );
}
