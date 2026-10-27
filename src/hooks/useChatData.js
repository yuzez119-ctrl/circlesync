import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  clearPendingChatName,
  readPendingChatName,
  saveMemberName,
} from "@/lib/memberNames";
import { tierMapFor } from "@/lib/tiers";

export default function useChatData() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [membership, setMembership] = useState(null);
  const [titles, setTitles] = useState([]);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [displayNames, setDisplayNames] = useState({});

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const user = await base44.auth.me();
    setMe(user);

    const { items: mine } = await base44.entities.Membership.filter({ user_id: user.id }, { limit: 1 });
    let myMembership = mine[0] || null;

    // The first admin is enrolled automatically; everyone else needs the join code.
    if (!myMembership && user.role === "admin") {
      const response = await base44.functions.invoke("joinWithCode", {});
      myMembership = response.data?.membership || null;
    }
    setMembership(myMembership);

    if (myMembership) {
      const [titleList, channelPage, memberPage, namePage] = await Promise.all([
        base44.entities.Title.list(),
        base44.entities.Channel.filter({}, { sort: "created_date", limit: 200 }),
        base44.entities.Membership.filter({}, { sort: "full_name", limit: 200 }),
        base44.entities.MemberName.filter({}, { limit: 200 }),
      ]);

      const names = Object.fromEntries(
        (namePage.items || []).map((entry) => [entry.user_id, entry.display_name])
      );

      // The name typed when signing up becomes the name everyone sees in the chat.
      const pendingName = readPendingChatName();
      if (pendingName && !names[user.id]) {
        await saveMemberName(user.id, pendingName);
        clearPendingChatName();
        names[user.id] = pendingName;
      }

      setTitles(titleList || []);
      setChannels(channelPage.items || []);
      setMembers(memberPage.items || []);
      setDisplayNames(names);
    }

    if (showSpinner) setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const memberTiers = tierMapFor(titles, members);

  return {
    loading,
    me,
    membership,
    titles,
    channels,
    members,
    displayNames,
    memberTiers,
    myTiers: memberTiers[me?.id] || [],
    load,
  };
}