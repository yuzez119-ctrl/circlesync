import { Flame, Hash, Lock, MessageSquarePlus, Plus, ScrollText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayNameFor } from "@/lib/chatUtils";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import SidebarFooter from "./SidebarFooter";

export default function Sidebar({
  appName,
  channels,
  activeChannelId,
  onSelectChannel,
  activeView,
  onOpenNotices,
  onNewChannel,
  threads,
  activeThreadId,
  onSelectThread,
  onNewDirect,
  me,
  displayNames,
  memberTiers,
  myTiers,
  isAdmin,
  onOpenAdmin,
  canRequestTierChange,
  onRequestTierChange,
  onEditName,
  onChangeLoginEmail,
  onSignOut,
  isFounder,
  showFounderTitle,
  onFounderTitleVisibilityChange,
  founderTitleSaving,
  founderTitleError,
  unreadCounts,
  onClose = () => {},
  className = "",
}) {
  return (
    <div className={cn("flex h-full w-[280px] flex-col border-r border-border bg-card/60", className)}>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Flame className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">{appName}</span>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="ml-auto h-8 w-8 text-muted-foreground md:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Channels</span>
          {isAdmin && (
            <Button variant="ghost" size="icon" onClick={onNewChannel} aria-label="New channel" className="h-7 w-7 text-muted-foreground">
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="mb-6 space-y-0.5">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                channel.id === activeChannelId
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              {channel.allowed_title_ids?.length ? (
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{channel.name}</span>
              <UnreadBadge count={unreadCounts?.channel?.[channel.id]} />
            </button>
          ))}
          {channels.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No channels you can see yet.</p>
          )}
          <button
            onClick={onOpenNotices}
            aria-current={activeView === "notices" ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
              activeView === "notices" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <ScrollText className="h-3.5 w-3.5 shrink-0" />
            <span>Notice Board</span>
          </button>
        </div>

        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Direct</span>
          <Button variant="ghost" size="icon" onClick={onNewDirect} aria-label="New private message" className="h-7 w-7 text-muted-foreground">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-0.5">
          {threads.map((thread) => {
            const tiers = memberTiers?.[thread.member?.user_id] || [];
            const name = displayNameFor(displayNames, thread.member?.user_id, thread.member?.full_name);
            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                  thread.id === activeThreadId
                    ? "bg-primary/15"
                    : "hover:bg-secondary/50"
                )}
              >
                <MemberAvatar name={name} color={primaryColor(tiers)} size={28} />
                <span className="truncate text-sm text-muted-foreground">{name}</span>
                <UnreadBadge count={unreadCounts?.direct?.[thread.id]} />
              </button>
            );
          })}
          {threads.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No private messages yet.</p>
          )}
        </div>
      </div>

      <SidebarFooter
        name={displayNameFor(displayNames, me?.user_id, me?.full_name)}
        tiers={myTiers}
        isFounder={isFounder}
        showFounderTitle={showFounderTitle}
        onFounderTitleVisibilityChange={onFounderTitleVisibilityChange}
        founderTitleSaving={founderTitleSaving}
        founderTitleError={founderTitleError}
        isAdmin={isAdmin}
        canRequestTierChange={canRequestTierChange}
        onRequestTierChange={onRequestTierChange}
        onOpenAdmin={onOpenAdmin}
        onEditName={onEditName}
        onChangeLoginEmail={onChangeLoginEmail}
        onSignOut={onSignOut}
      />
    </div>
  );
}

function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
