import { useState } from "react";
import { Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { displayNameFor } from "@/lib/chatUtils";
import { saveMemberName } from "@/lib/memberNames";
import { primaryColor, tierTypeOf } from "@/lib/tiers";
import MemberAvatar from "@/components/chat/MemberAvatar";
import TitleBadges from "@/components/chat/TitleBadges";
import NameDialog from "@/components/chat/NameDialog";

export default function MemberManager({ members, titles, displayNames, memberTiers, onChanged }) {
  const [renaming, setRenaming] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const assign = async (member, tierId, on) => {
    const held = member.title_ids || [];
    const tierIds = on ? [...held, tierId] : held.filter((id) => id !== tierId);
    setBusyId(member.id);
    setNotice("");
    setError("");
    try {
      const response = await base44.functions.invoke("tierAdmin", {
        action: "assignTiers",
        targetUserId: member.user_id,
        tierIds,
      });
      const data = response.data || {};
      if (data.applied) setNotice("Tiers updated.");
      else if (data.awaitingFounder)
        setNotice("Sent to the Founder — only a Founder can make someone an admin.");
      await onChanged();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "That change was not allowed.");
    } finally {
      setBusyId(null);
    }
  };

  const saveName = async (name) => {
    if (!renaming) return;
    await saveMemberName(renaming.user_id, name);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Anyone can hold more than one tier, and their tiers decide which channels open up. Only a Founder can hand
        out an Admin or Founder tier, and only a Founder can take one away from someone else.
      </p>

      {notice && (
        <p className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">{notice}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
        {members.map((member) => {
          const tiers = memberTiers?.[member.user_id] || [];
          const name = displayNameFor(displayNames, member.user_id, member.full_name);
          const held = member.title_ids || [];
          return (
            <div key={member.id} className="space-y-3 px-4 py-4">
              <div className="flex items-center gap-3">
                <MemberAvatar name={name} color={primaryColor(tiers)} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-sm font-medium">{name}</div>
                  <div className="mt-1">
                    <TitleBadges titles={tiers} />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRenaming(member)}
                  aria-label={`Rename ${name}`}
                  className="h-8 w-8 text-muted-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {titles.map((tier) => (
                  <label key={tier.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={held.includes(tier.id)}
                      disabled={busyId === member.id}
                      onCheckedChange={(checked) => assign(member, tier.id, checked === true)}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tier.color }} />
                    <span>{tier.name}</span>
                    {tierTypeOf(tier) !== "standard" && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {tierTypeOf(tier)}
                      </span>
                    )}
                  </label>
                ))}
                {titles.length === 0 && <p className="text-xs text-muted-foreground">No tiers yet.</p>}
              </div>
            </div>
          );
        })}
        {members.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nobody has joined yet.</p>
        )}
      </div>

      <NameDialog
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={renaming ? `Name for ${displayNameFor(displayNames, renaming.user_id, renaming.full_name)}` : "Member name"}
        description="This is the name everyone sees in the chat. Leave it empty to use the name from their account."
        currentName={renaming ? displayNames[renaming.user_id] || "" : ""}
        placeholder={renaming?.full_name || "A name"}
        onSave={saveName}
      />
    </div>
  );
}