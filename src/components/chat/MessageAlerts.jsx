import { AtSign, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MessageAlerts({ alerts, onOpen, onDismiss }) {
  if (!alerts.length) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-20 z-30 flex w-[min(90vw,330px)] flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-primary/40 bg-card/95 p-3 shadow-xl backdrop-blur"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {alert.mentioned ? <AtSign className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {alert.from} {alert.mentioned ? "tagged you" : "sent a message"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {alert.where}
              {alert.preview ? ` · ${alert.preview}` : ""}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 h-7 rounded-lg px-2.5 text-[11px]"
              onClick={() => onOpen(alert)}
            >
              Open
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={() => onDismiss(alert)}
            aria-label="Dismiss alert"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}