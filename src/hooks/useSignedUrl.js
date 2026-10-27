import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Private files need a temporary link before they can be shown.
export default function useSignedUrl(fileUri) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!fileUri) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    setUrl(null);
    base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 3600 })
      .then((result) => {
        if (!cancelled) setUrl(result?.signed_url || null);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileUri]);

  return url;
}