import { useCallback, useEffect, useState } from "react";
import { supabase, TABLES } from "@/api/supabaseClient";
import {
  clearPendingChatName,
  readPendingChatName,
  saveMemberName,
} from "@/lib/memberNames";
import { tierMapFor } from "@/lib/tiers";

export default function useChatData() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(/** @type {any} */ (null));
  const [membership, setMembership] = useState(null);
  const [titles, setTitles] = useState(/** @type {any[]} */ ([]));
  const [channels, setChannels] = useState(/** @type {any[]} */ ([]));
  const [members, setMembers] = useState(/** @type {any[]} */ ([]));
  const [displayNames, setDisplayNames] = useState(/** @type {Record<string, string>} */ ({}));
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (showSpinner = true, joinedMembership = /** @type {any} */ (null)) => {
    if (showSpinner) setLoading(true);
    setLoadError("");
    let resolvedMembership = null;

    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authUser) {
        setMe(null);
        setMembership(null);
        setTitles([]);
        setChannels([]);
        setMembers([]);
        setDisplayNames({});
        return null;
      }

      const fallbackUser = {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "Member",
        role: "user",
      };
      // Preserve the resolved role during a background refresh. AdminPage uses
      // this role to guard the route, so briefly resetting it to "user" would
      // redirect a Founder to chat after every successful admin change.
      setMe((current) => current?.id === fallbackUser.id
        ? { ...fallbackUser, role: current.role }
        : fallbackUser);

      const membershipResult = await supabase
        .from(TABLES.memberships)
        .select("*")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (membershipResult.error) console.warn("Could not load membership:", membershipResult.error);

      const user = fallbackUser;

      const rpcResult = Array.isArray(joinedMembership) ? joinedMembership[0] : joinedMembership;
      const hintedMembership = rpcResult?.membership || rpcResult?.data?.membership || rpcResult;
      let activeMembership = (membershipResult.error ? null : membershipResult.data) || (
        hintedMembership?.user_id === user.id ? hintedMembership : null
      );

      // The first admin is enrolled automatically; everyone else needs the join code.
      if (!activeMembership && !membershipResult.error && user.role === "admin") {
        const { data, error } = await supabase.rpc("join_with_code", { join_code: null });
        if (error) throw error;
        activeMembership = Array.isArray(data) ? data[0] : data;
      }
      setMembership(activeMembership);
      resolvedMembership = activeMembership;

      if (!activeMembership) {
        setTitles([]);
        setChannels([]);
        setMembers([]);
        setDisplayNames({});
        return null;
      }

      const [titleResult, channelResult, memberResult, nameResult] = await Promise.all([
        supabase.from(TABLES.titles).select("*").order("created_date"),
        supabase.from(TABLES.channels).select("*").order("created_date").limit(200),
        supabase.from(TABLES.memberships).select("*").order("full_name").limit(200),
        supabase.from(TABLES.memberNames).select("*").limit(200),
      ]);
      for (const result of [titleResult, channelResult, memberResult, nameResult]) {
        if (result.error) throw result.error;
      }

      const names = Object.fromEntries(
        (nameResult.data || []).map((entry) => [entry.user_id, entry.display_name])
      );
      const pendingName = readPendingChatName();
      if (pendingName && !names[user.id]) {
        try {
          await saveMemberName(user.id, pendingName);
          clearPendingChatName();
          names[user.id] = pendingName;
        } catch (error) {
          console.warn("Could not save the pending display name:", error);
        }
      }

      setTitles(titleResult.data || []);
      setChannels(channelResult.data || []);
      setMembers(memberResult.data || []);
      setDisplayNames(names);
      const memberRows = memberResult.data || [];
      const myMembership = memberRows.find((member) => member.user_id === user.id) || activeMembership;
      const titleById = Object.fromEntries((titleResult.data || []).map((title) => [title.id, title]));
      const myTitleIds = /** @type {any[]} */ (myMembership?.title_ids || []);
      const isFounder = myTitleIds.some((id) => titleById[id]?.tier_type === "founder");
      setMe({ ...user, role: isFounder ? "admin" : "user" });
      return activeMembership;
    } catch (error) {
      console.error("Could not load chat data:", error);
      setLoadError(error instanceof Error ? error.message : "Could not load chat data.");
      const hintedMembership = Array.isArray(joinedMembership) ? joinedMembership[0] : joinedMembership;
      const fallbackMembership = hintedMembership?.membership || hintedMembership?.data?.membership || hintedMembership;
      if (!resolvedMembership && fallbackMembership?.user_id) {
        resolvedMembership = fallbackMembership;
        setMembership(fallbackMembership);
      }
      return resolvedMembership;
    } finally {
      if (showSpinner) setLoading(false);
    }
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
    loadError,
    memberTiers,
    myTiers: memberTiers[me?.id] || [],
    load,
  };
}
