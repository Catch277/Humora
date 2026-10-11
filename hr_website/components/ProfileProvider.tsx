"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { can as canRole, type Capability } from "@/lib/accessPolicy";
import { isPublicPath } from "@/lib/publicPaths";

/** The signed-in account as `/api/auth/session` answers it. */
export type SessionProfile = {
  id: string;
  full_name: string;
  role: string;
  /** The branch the account belongs to (SCRUM-63); `null` means "chưa gán chi nhánh". */
  branch_id: string | null;
};

type ProfileContextValue = {
  profile: SessionProfile | null;
  /** True while the profile is unknown — public screens and a failed fetch both answer `false`. */
  loading: boolean;
  /**
   * `can(role, capability)` for the signed-in account (SCRUM-59). Loading answers `false`, so a
   * role-dependent control is never rendered for a role we have not confirmed yet.
   */
  can: (capability: Capability) => boolean;
};

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  can: () => false,
});

/**
 * One `/api/auth/session` read for the whole shell. Before SCRUM-59 the header fetched it on its
 * own; the navigation, the pages and the header all need the role now, so it is fetched once here
 * and shared, which also keeps the fetch count at one per navigation instead of one per component.
 */
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}

export default function ProfileProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublic = isPublicPath(pathname);

  // Keyed by pathname instead of two independent flags: the role must be refetched per route change
  // (that is what makes it appear right after signing in without a full reload), and "still loading"
  // then simply means "the answer we hold belongs to another route". Deriving both values this way
  // keeps the effect free of a synchronous `setState`, which would cascade a second render on every
  // navigation (react-hooks/set-state-in-effect).
  const [session, setSession] = useState<{
    pathname: string;
    profile: SessionProfile | null;
  } | null>(null);

  useEffect(() => {
    if (isPublic) {
      return;
    }

    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SessionProfile | null) => {
        if (!cancelled) {
          setSession({ pathname, profile: data });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ pathname, profile: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, isPublic]);

  // Both are derived, never stored: a public screen has no profile, and a session fetched for a
  // previous route is not an answer about this one.
  const profile =
    isPublic || session?.pathname !== pathname ? null : session.profile;
  const loading = !isPublic && session?.pathname !== pathname;

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      loading,
      can: (capability) => canRole(profile?.role, capability),
    }),
    [profile, loading],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
