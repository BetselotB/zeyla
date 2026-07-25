import { useEffect, useState } from "react";
import type { AuthUser } from "@zeyla/shared";
import { getMe } from "./api";
import { getAuthToken } from "./authToken";

type Viewer = {
  /** null while the check is still in flight. */
  isSignedIn: boolean | null;
  user: AuthUser | null;
};

/**
 * Who's paying. Escrow endpoints are all bearer-authenticated, so the page
 * needs to know whether there's a usable session before offering to charge
 * anyone — and the profile email prefills the receipt field.
 */
export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>({ isSignedIn: null, user: null });

  useEffect(() => {
    if (!getAuthToken()) {
      setViewer({ isSignedIn: false, user: null });
      return;
    }

    let isCancelled = false;
    getMe()
      .then((user) => {
        if (!isCancelled) setViewer({ isSignedIn: true, user });
      })
      .catch(() => {
        if (!isCancelled) setViewer({ isSignedIn: false, user: null });
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return viewer;
}
