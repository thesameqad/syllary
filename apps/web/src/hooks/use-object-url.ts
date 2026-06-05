import { useEffect, useState } from "react";

/**
 * Create an object URL for a File and revoke it on unmount / file change.
 *
 * Creates AND revokes the URL within the same effect so it survives React
 * StrictMode's dev mount→unmount→remount cycle: a `useMemo`'d object URL would
 * be revoked by the unmount cleanup and then handed back (revoked) on remount,
 * leaving anything that loads it — e.g. wavesurfer — with a dead URL.
 */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}
