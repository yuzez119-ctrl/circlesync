import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
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
    memberTiers,
    myTiers,
    load,
  } = useChatData();

  const [activeChannelId, setActiveChannelId] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [allDms, setAllDms] = useState([]);
  const [threadMessages, setThreadMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [channelDialog, setChannelDialog] = useState({ open: false, channel: null });
  const [directOpen, setDirectOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [nameOpen, setNameOpen] = useState(false);
  const [alertList, setAlertList] = useState([]);

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

  useEffect(() => {
    if (!membership || !activeChannelId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    base44.entities.Message.filter({ channel_id: activeChannelId }, { sort: "created_date", limit: 200 })
      .then((page) => { if (!cancelled) setMessages(page.items || []); });
    return () => { cancelled = true; };
  }, [membership, activeChannelId, tick]);

  useEffect(() => {
    if (!membership || !me) return undefined;
    let cancelled = false;
    base44.entities.DirectMessage.filter(
      { $or: [{ sender_id: me.id }, { recipient_id: me.id }] },
      { sort: "-created_date", limit: 300 }
    ).then((page) => { if (!cancelled) setAllDms(page.items || []); });
    return () => { cancelled = true; };
  }, [membership, me, tick]);

  useEffect(() => {
    if (!membership || !me || !activeThreadId) {
      setThreadMessages([]);
      return undefined;
    }
    let cancelled = false;
    base44.entities.DirectMessage.filter(
      {
        $or: [
          { sender_id: me.id, recipient_id: activeThreadId },
          { sender_id: activeThreadId, recipient_id: me.id },
        ],
      },
      { sort: "created_date", limit: 200 }
    ).then((page) => { if (!cancelled) setThreadMessages(page.items || []); });
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
  useMessageAlerts({ me, myName, enabled: !!membership, onMessage: handleIncoming });

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
    const unsubscribeMessages = base44.entities.Message.subscribe(() => setTick((value) => value + 1));
    const unsubscribeDirect = base44.entities.DirectMessage.subscribe(() => setTick((value) => value + 1));
    const unsubscribeNames = base44.entities.MemberName.subscribe(() => load(false));
    return () => {
      unsubscribeMessages();
      unsubscribeDirect();
      unsubscribeNames();
    };
  }, [load]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const handleSend = async (body, attachments = []) => {
    if (!membership || !me) return;
    if (activeThreadId) {
      const partner = activeThread?.member;
      await base44.entities.DirectMessage.create({
        sender_id: me.id,
        sender_name: myName,
        recipient_id: activeThreadId,
        recipient_name: displayNameFor(displayNames, activeThreadId, partner?.full_name),
        body,
        attachments,
      });
    } else if (activeChannel) {
      await base44.entities.Message.create({
        channel_id: activeChannel.id,
        author_id: me.id,
        author_name: myName,
        body,
        attachments,
      });
    }
    refresh();
  };

  const openThread = (partnerId) => {
    setActiveThreadId(partnerId);
    setActiveChannelId(null);
    setDirectOpen(false);
    setSidebarOpen(false);
  };

  const selectChannel = (id) => {
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

  if (!me) return null;

  if (!membership) {
    return (
      <JoinGate
        me={me}
        onJoined={() => load()}
        onSignOut={() => base44.auth.logout()}
      />
    );
  }

  const sidebar = (
    <Sidebar
      appName="Campfire"
      channels={visible}
      activeChannelId={activeThreadId ? null : activeChannelId}
      onSelectChannel={selectChannel}
      onNewChannel={() => setChannelDialog({ open: true, channel: null })}
      threads={threads}
      activeThreadId={activeThreadId}
      onSelectThread={openThread}
      onNewDirect={() => setDirectOpen(true)}
      me={membership}
      displayNames={displayNames}
      memberTiers={memberTiers}
      myTiers={myTiers}
      isAdmin={isAdmin}
      onEditName={() => setNameOpen(true)}
      onOpenAdmin={() => navigate("/admin")}
      onSignOut={() => base44.auth.logout()}
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
        <ChatPane
          channel={activeThreadId ? null : activeChannel}
          thread={activeThread}
          displayNames={displayNames}
          mentionNames={mentionNames}
          titlesById={titlesById}
          memberTiers={memberTiers}
          messages={activeThreadId ? threadViews : messages}
          currentUserId={me.id}
          me={me}
          memberCount={members.length}
          onSend={handleSend}
          onOpenSidebar={() => setSidebarOpen(true)}
          onEditChannel={(channel) => setChannelDialog({ open: true, channel })}
        />

        <MessageAlerts
          alerts={alertList}
          onOpen={openAlert}
          onDismiss={(alert) => setAlertList((prev) => prev.filter((entry) => entry.id !== alert.id))}
        />
      </div>

      <MemberPanel
        members={members}
        displayNames={displayNames}
        memberTiers={memberTiers}
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
        memberTiers={memberTiers}
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
    </div>
  );
}