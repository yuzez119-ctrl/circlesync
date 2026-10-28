import { Hash, Lock, Menu, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canEditChannel, displayNameFor } from "@/lib/chatUtils";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import MessageList from "./MessageList";
import Composer from "./Composer";
import TitleBadge from "./TitleBadge";
import TitleBadges from "./TitleBadges";

export default function ChatPane({
  channel,
  thread,
  displayNames,
  mentionNames,
  titlesById,
  memberTiers,
  messages,
  currentUserId,
  me,
  memberCount,
  onSend,
  onOpenSidebar,
  onEditChannel,
}) {
  const isDirect = !channel && !!thread;
  const partner = thread?.member;
  const partnerTiers = memberTiers?.[partner?.user_id] || [];
  const partnerName = displayNameFor(displayNames, partner?.user_id, partner?.full_name);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card/30 px-4 py-3.5 sm:px-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSidebar}
          className="h-9 w-9 shrink-0 text-muted-foreground md:hidden"
          aria-label="Open channels"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {isDirect ? (
          <>
            <MemberAvatar name={partnerName} color={primaryColor(partnerTiers)} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-heading text-base font-semibold">{partnerName}</h1>
                <TitleBadges titles={partnerTiers} />
              </div>
              <p className="text-xs text-muted-foreground">Private conversation</p>
            </div>
          </>
        ) : channel ? (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
              {channel.allowed_title_ids?.length ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-base font-semibold">{channel.name}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {channel.description || "No description"}
              </p>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              {(channel.allowed_title_ids || []).length === 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" /> Everyone
                </span>
              ) : (
                (channel.allowed_title_ids || []).map((id) => (
                  <TitleBadge key={id} title={titlesById[id]} />
                ))
              )}
              <span className="text-[11px] text-muted-foreground">{memberCount} people</span>
            </div>
            {canEditChannel(channel, me) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEditChannel(channel)}
                aria-label="Edit channel"
                className="h-8 w-8 shrink-0 text-muted-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <h1 className="font-heading text-base font-semibold text-muted-foreground">Pick a channel to start</h1>
        )}
      </header>

      <MessageList
        messages={messages}
        displayNames={displayNames}
        mentionNames={mentionNames}
        memberTiers={memberTiers}
        currentUserId={currentUserId}
        emptyHint={
          isDirect
            ? `This is just between you and ${partnerName || "them"}.`
            : "No messages here yet. Say something."
        }
      />

      {(channel || isDirect) && (
        <Composer
          key={channel?.id || thread?.id || "none"}
          onSend={onSend}
          placeholder={isDirect ? `Message ${partnerName || ""}` : `Message #${channel?.name || ""}`}
        />
      )}
    </section>
  );
}