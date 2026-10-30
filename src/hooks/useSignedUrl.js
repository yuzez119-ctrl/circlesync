import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// Private files need a temporary link before they can be shown.
export default function useSignedUrl(fileUri, bucket = "chat-attachments") {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!fileUri) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    setUrl(null);
    supabase.storage.from(bucket).createSignedUrl(fileUri, 3600)
      .then(({ data, error }) => {
        if (!cancelled) setUrl(error ? null : data?.signedUrl || null);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileUri, bucket]);

  return url;
}
