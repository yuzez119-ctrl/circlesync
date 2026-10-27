import { useEffect, useRef } from "react";
import moment from "moment";
import { cn } from "@/lib/utils";
import { displayNameFor } from "@/lib/chatUtils";
import { primaryColor } from "@/lib/tiers";
import MemberAvatar from "./MemberAvatar";
import TitleBadges from "./TitleBadges";
import MentionText from "./MentionText";
import MessageAttachments from "./MessageAttachments";

export default function MessageList({ messages, displayNames, mentionNames, memberTiers, currentUserId, emptyHint }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">{emptyHint || "No messages here yet. Say something."}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const mine = message.author_id === currentUserId;
          const showHeader = !previous || previous.author_id !== message.author_id;
          const tiers = memberTiers?.[message.author_id] || [];
          const authorName = displayNameFor(displayNames, message.author_id, message.author_name);

          return (
            <div
              key={message.id}
              className={cn("flex gap-3", mine && "flex-row-reverse", showHeader ? "mt-5 first:mt-0" : "mt-1")}
            >
              <div className="w-9 shrink-0">
                {showHeader && (
                  <MemberAvatar name={authorName} color={primaryColor(tiers)} size={36} />
                )}
              </div>

              <div className={cn("min-w-0 max-w-[78%]", mine && "flex flex-col items-end")}>
                {showHeader && (
                  <div className={cn("mb-1.5 flex items-center gap-2", mine && "flex-row-reverse")}>
                    <span className="font-heading text-sm font-semibold">{authorName}</span>
                    <TitleBadges titles={tiers} />
                    <span className="text-[11px] text-muted-foreground">
                      {moment(message.created_date).format("HH:mm")}
                    </span>
                  </div>
                )}
                {message.body?.trim() ? (
                  <div
                    className={cn(
                      "inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/70 text-foreground"
                    )}
                  >
                    <MentionText body={message.body} names={mentionNames} mine={mine} />
                  </div>
                ) : null}

                <MessageAttachments attachments={message.attachments} mine={mine} />
              </div>
            </div>
          );
        })}
      </div>
      <div ref={endRef} />
    </div>
  );
}