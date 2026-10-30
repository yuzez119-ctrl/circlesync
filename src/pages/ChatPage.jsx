import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, TABLES } from "@/api/supabaseClient";
import useChatData from "@/hooks/useChatData";
import useUnreadCounts from "@/hooks/useUnreadCounts";
import useMessageAlerts from "@/hooks/useMessageAlerts";
import { displayNameFor, visibleChannels } from "@/lib/chatUtils";
import { hasTierType } from "@/lib/tiers";
import { saveMemberName } from "@/lib/memberNames";
import Sidebar from "@/components/chat/Sidebar";
import ChatPane from "@/components/chat/ChatPane";
import MemberPanel from "@/components/chat/MemberPanel";
import JoinGate from "@/components/chat/JoinGate";
import ChannelDialog from "@/components/chat/ChannelDialog";
import NewDirectDialog from "@/components/chat/NewDirectDialog";
import NameDialog from "@/components/chat/NameDialog";
import MessageAlerts from "@/components/chat/MessageAlerts";
import NoticeBoard from "@/components/chat/NoticeBoard";
import AccountEmailDialog from "@/components/chat/AccountEmailDialog";
import MemberTierRequestDialog from "@/components/chat/MemberTierRequestDialog";

export default function ChatPage() {
  const navigate = useNavigate();
  const {
    loading,
    me,
    membership,
    titles,
    channels,
    members,
    displayNames,
    loadError,
    memberTiers,
    myTiers,
    load,
  } = useChatData();

  const [activeChannelId, setActiveChannelId] = useState(null);
  const [activeView, setActiveView] = useState("chat");
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [allDms, setAllDms] = useState([]);
  const [threadMessages, setThreadMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [channelDialog, setChannelDialog] = useState({ open: false, channel: null });
  const [directOpen, setDirectOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [nameOpen, setNameOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [tierRequestOpen, setTierRequestOpen] = useState(false);
  const [alertList, setAlertList] = useState([]);
  const [founderTitleSaving, setFounderTitleSaving] = useState(false);
  const [founderTitleError, setFounderTitleError] = useState("");

  const titlesById = useMemo(
    () => Object.fromEntries(titles.map((title) => [title.id, title])),
    [titles]
  );
  const myName = me ? displayNameFor(displayNames, me.id, membership?.full_name || me.full_name) : "";
  const visible = useMemo(
    () => visibleChannels(channels, membership?.title_ids),
    [channels, membership]
  );
  const visibleIds = useMemo(() => new Set(visible.map((channel) => channel.id)), [visible]);
  const mentionNames = useMemo(
    () => members.map((member) => displayNameFor(displayNames, member.user_id, member.full_name)),
    [members, displayNames]
  );
  const visibleMemberTiers = useMemo(() => Object.fromEntries(
    Object.entries(memberTiers).map(([userId, tiers]) => [
      userId,
      userId === me?.id || members.find((member) => member.user_id === userId)?.show_founder_title !== false
        ? tiers
        : tiers.filter((tier) => tier.tier_type !== "founder"),
    ])
  ), [memberTiers, members, me?.id]);

  useEffect(() => {
    if (!membership || !activeChannelId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    supabase.from(TABLES.messages).select("*").eq("channel_id", activeChannelId)
      .order("created_date", { ascending: true }).limit(200)
      .then(({ data }) => { if (!cancelled) setMessages(data || []); });
    return () => { cancelled = true; };
  }, [membership, activeChannelId, tick]);

  useEffect(() => {
    if (!membership || !me) return undefined;
    let cancelled = false;
    supabase.from(TABLES.directMessages).select("*")
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order("created_date", { ascending: false }).limit(300)
      .then(({ data }) => { if (!cancelled) setAllDms(data || []); });
    return () => { cancelled = true; };
  }, [membership, me, tick]);

  useEffect(() => {
    if (!membership || !me || !activeThreadId) {
      setThreadMessages([]);
      return undefined;
    }
    let cancelled = false;
    supabase.from(TABLES.directMessages).select("*")
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${activeThreadId}),and(sender_id.eq.${activeThreadId},recipient_id.eq.${me.id})`)
      .order("created_date", { ascending: true }).limit(200)
      .then(({ data }) => { if (!cancelled) setThreadMessages(data || []); });
    return () => { cancelled = true; };
  }, [membership, me, activeThreadId, tick]);

  const threads = useMemo(() => {
    if (!me) return [];
    const map = new Map();
    allDms.forEach((dm) => {
      const partnerId = dm.sender_id === me.id ? dm.recipient_id : dm.sender_id;
      if (!map.has(partnerId)) {
        map.set(partnerId, {
          id: partnerId,
          member: members.find((member) => member.user_id === partnerId),
          last: dm,
        });
      }
    });
    return Array.from(map.values());
  }, [allDms, members, me]);

  const activeChannel = visible.find((channel) => channel.id === activeChannelId) || null;
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ||
    (activeThreadId
      ? { id: activeThreadId, member: members.find((member) => member.user_id === activeThreadId) }
      : null);

  const targets = useMemo(
    () => [
      ...visible.map((channel) => ({
        key: `channel:${channel.id}`,
        scope: "channel",
        targetId: channel.id,
      })),
      ...threads.map((thread) => ({
        key: `direct:${thread.id}`,
        scope: "direct",
        targetId: thread.id,
      })),
    ],
    [visible, threads]
  );

  const { counts: unreadCounts, markRead, bump } = useUnreadCounts({
    me,
    membership,
    targets,
    enabled: !!membership,
  });

  // Whatever is on screen counts as read.
  useEffect(() => {
    if (!membership) return;
    if (activeThreadId) markRead("direct", activeThreadId);
    else if (activeChannelId) markRead("channel", activeChannelId);
  }, [membership, activeThreadId, activeChannelId, markRead]);

  // Somebody posted in a conversation that is not open — count it and say so.
  const handleIncoming = useCallback(
    (message) => {
      const isDirect = message.kind === "direct";
      const kind = isDirect ? "direct" : "channel";
      const targetId = isDirect ? message.sender_id : message.channel_id;
      if (!targetId) return;
      if (!isDirect && !visibleIds.has(targetId)) return;

      const isOpen = isDirect
        ? targetId === activeThreadId
        : !activeThreadId && targetId === activeChannelId;
      if (isOpen) {
        markRead(kind, targetId);
        return;
      }

      bump(kind, targetId);

      const channel = channels.find((entry) => entry.id === targetId);
      const alert = {
        id: message.id,
        kind,
        targetId,
        mentioned: message.mentioned,
        from: displayNameFor(
          displayNames,
          isDirect ? message.sender_id : message.author_id,
          isDirect ? message.sender_name : message.author_name
        ),
        where: isDirect ? "Private chat" : `#${channel?.name || "channel"}`,
        preview: (message.body || "").replace(/\s+/g, " ").slice(0, 90),
      };
      setAlertList((prev) => [alert, ...prev.filter((entry) => entry.id !== alert.id)].slice(0, 3));
    },
    [activeChannelId, activeThreadId, channels, displayNames, visibleIds, markRead, bump]
  );

  const isAdmin = me?.role === "admin" || hasTierType(myTiers, "admin");
  const isFounder = hasTierType(myTiers, "founder");
  useMessageAlerts({ me, myName, enabled: !!membership, onMessage: handleIncoming });

  const setFounderTitleVisibility = async (show) => {
    if (!isFounder || founderTitleSaving) return;
    setFounderTitleSaving(true);
    setFounderTitleError("");
    try {
      const { data, error } = await supabase.from(TABLES.memberships)
        .update({ show_founder_title: show })
        .eq("user_id", me.id)
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only a Founder can change this setting.");
      await load(false);
    } catch (error) {
      setFounderTitleError(error?.message || "Could not update Founder title visibility.");
    } finally {
      setFounderTitleSaving(false);
    }
  };

  // Keep a channel selected whenever the visible list changes (never while a private thread is open).
  useEffect(() => {
    if (activeThreadId) return;
    if (visible.length && !visible.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(visible[0].id);
    }
    if (!visible.length && activeChannelId) setActiveChannelId(null);
  }, [visible, activeChannelId, activeThreadId]);

  // Live updates from everyone else.
  useEffect(() => {
    const channel = supabase
      .channel("chat-page-live")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.messages }, () => setTick((value) => value + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.directMessages }, () => setTick((value) => value + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.memberNames }, () => load(false))
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.channels }, () => load(false))
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.memberships }, () => load(false))
      .on("postgres_changes", { event: "*", schema: "public", table: TABLES.titles }, () => load(false))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const handleSend = async (body, attachments = []) => {
    if (!membership || !me) return;
    if (activeThreadId) {
      const partner = activeThread?.member;
      const { error } = await supabase.from(TABLES.directMessages).insert({
        sender_id: me.id,
        sender_name: myName,
        recipient_id: activeThreadId,
        recipient_name: displayNameFor(displayNames, activeThreadId, partner?.full_name),
        body,
        attachments,
      });
      if (error) throw error;
    } else if (activeChannel) {
      const { error } = await supabase.from(TABLES.messages).insert({
        channel_id: activeChannel.id,
        author_id: me.id,
        author_name: myName,
        body,
        attachments,
      });
      if (error) throw error;
    }
    refresh();
  };

  const openThread = (partnerId) => {
    setActiveView("chat");
    setActiveThreadId(partnerId);
    setActiveChannelId(null);
    setDirectOpen(false);
    setSidebarOpen(false);
  };

  const selectChannel = (id) => {
    setActiveView("chat");
    setActiveChannelId(id);
    setActiveThreadId(null);
    setSidebarOpen(false);
  };

  const openAlert = (alert) => {
    if (alert.kind === "direct") openThread(alert.targetId);
    else selectChannel(alert.targetId);
    setAlertList((prev) => prev.filter((entry) => entry.id !== alert.id));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {loadError || "Your account could not be loaded."}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!membership) {
    return (
      <JoinGate
        me={me}
        onJoined={async (joinedMembership) => {
          const membership = await load(false, joinedMembership);
          if (membership?.channel_id) setActiveChannelId(membership.channel_id);
          return membership;
        }}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  const sidebar = (
    <Sidebar
      appName="Campfire"
      channels={visible}
      activeChannelId={activeThreadId ? null : activeChannelId}
      onSelectChannel={selectChannel}
      activeView={activeView}
      onOpenNotices={() => { setActiveView("notices"); setSidebarOpen(false); }}
      onNewChannel={() => setChannelDialog({ open: true, channel: null })}
      threads={threads}
      activeThreadId={activeThreadId}
      onSelectThread={openThread}
      onNewDirect={() => setDirectOpen(true)}
      me={membership}
      displayNames={displayNames}
      memberTiers={visibleMemberTiers}
      myTiers={myTiers}
      isFounder={isFounder}
      showFounderTitle={membership.show_founder_title !== false}
      onFounderTitleVisibilityChange={setFounderTitleVisibility}
      founderTitleSaving={founderTitleSaving}
      founderTitleError={founderTitleError}
      isAdmin={isAdmin}
      canRequestTierChange={!isAdmin}
      onRequestTierChange={() => setTierRequestOpen(true)}
      onEditName={() => setNameOpen(true)}
      onChangeLoginEmail={() => setEmailOpen(true)}
      onOpenAdmin={() => navigate("/admin")}
      onSignOut={() => supabase.auth.signOut()}
      unreadCounts={unreadCounts}
    />
  );

  const threadViews = threadMessages.map((dm) => ({
    id: dm.id,
    author_id: dm.sender_id,
    author_name: dm.sender_name,
    body: dm.body,
    attachments: dm.attachments || [],
    created_date: dm.created_date,
  }));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden md:flex">{sidebar}</div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">{sidebar}</div>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1">
        {activeView === "notices" ? (
          <NoticeBoard isAdmin={isAdmin} onOpenSidebar={() => setSidebarOpen(true)} />
        ) : <ChatPane
          channel={activeThreadId ? null : activeChannel}
          thread={activeThread}
          displayNames={displayNames}
          mentionNames={mentionNames}
          titlesById={titlesById}
          memberTiers={visibleMemberTiers}
          messages={activeThreadId ? threadViews : messages}
          currentUserId={me.id}
          me={me}
          memberCount={members.length}
          onSend={handleSend}
          onOpenSidebar={() => setSidebarOpen(true)}
          onEditChannel={(channel) => setChannelDialog({ open: true, channel })}
        />}

        <MessageAlerts
          alerts={alertList}
          onOpen={openAlert}
          onDismiss={(alert) => setAlertList((prev) => prev.filter((entry) => entry.id !== alert.id))}
        />
      </div>

      <MemberPanel
        members={members}
        displayNames={displayNames}
        memberTiers={visibleMemberTiers}
        currentUserId={me.id}
      />

      <ChannelDialog
        open={channelDialog.open}
        onOpenChange={(open) => setChannelDialog((current) => ({ ...current, open }))}
        channel={channelDialog.channel}
        titles={titles}
        onSaved={() => load(false)}
      />

      <NewDirectDialog
        open={directOpen}
        onOpenChange={setDirectOpen}
        members={members}
        displayNames={displayNames}
        memberTiers={visibleMemberTiers}
        currentUserId={me.id}
        onSelect={openThread}
      />

      <NameDialog
        open={nameOpen}
        onOpenChange={setNameOpen}
        title="Your name"
        description="Everyone sees this name instead of the name from your account. Leave it empty to go back to that name."
        currentName={displayNames[me.id] || ""}
        placeholder={membership.full_name || "A name"}
        onSave={async (name) => {
          await saveMemberName(me.id, name);
          await load(false);
        }}
      />

      <AccountEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        currentEmail={me.email}
        onChanged={async () => { await load(false); }}
      />

      <MemberTierRequestDialog
        open={tierRequestOpen}
        onOpenChange={setTierRequestOpen}
        titles={titles}
        currentTierIds={membership.title_ids || []}
      />
    </div>
  );
}
