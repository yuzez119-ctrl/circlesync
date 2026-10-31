import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Crown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useChatData from "@/hooks/useChatData";
import { hasTierType } from "@/lib/tiers";
import TitleManager from "@/components/admin/TitleManager";
import MemberManager from "@/components/admin/MemberManager";
import ChannelManager from "@/components/admin/ChannelManager";
import ApprovalsPanel from "@/components/admin/ApprovalsPanel";
import JoinCodeCard from "@/components/admin/JoinCodeCard";

export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("tiers");
  const hasEnteredAsAdmin = useRef(false);
  const {
    loading,
    me,
    membership,
    titles,
    channels,
    members,
    displayNames,
    memberTiers,
    myTiers,
    load,
  } = useChatData();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  const isFounder = me?.role === "admin";
  const amAdmin = hasTierType(myTiers, "admin");
  const isAuthorized = Boolean(me && (isFounder || amAdmin) && membership);

  // Keep the current Admin area open if a successful change also changes the
  // actor's own tier. A fresh visit still has to pass this authorization check.
  if (isAuthorized) hasEnteredAsAdmin.current = true;

  if (!isAuthorized && !hasEnteredAsAdmin.current) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/30">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to chat">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-display text-xl font-semibold tracking-tight">Admin area</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
            {isFounder ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {isFounder ? "Founder" : "Admin"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="tiers">Tiers</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="join">Join code</TabsTrigger>
          </TabsList>

          <TabsContent value="tiers" className="mt-6">
            <TitleManager titles={titles} isFounder={isFounder} onChanged={() => load(false)} />
          </TabsContent>
          <TabsContent value="people" className="mt-6">
            <MemberManager
              members={members}
              titles={titles}
              displayNames={displayNames}
              memberTiers={memberTiers}
              currentUserId={me.id}
              isFounder={isFounder}
              onChanged={() => load(false)}
            />
          </TabsContent>
          <TabsContent value="requests" className="mt-6">
            <ApprovalsPanel isFounder={isFounder} currentUserId={me.id} />
          </TabsContent>
          <TabsContent value="channels" className="mt-6">
            <ChannelManager channels={channels} titles={titles} onChanged={() => load(false)} />
          </TabsContent>
          <TabsContent value="join" className="mt-6">
            <JoinCodeCard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
