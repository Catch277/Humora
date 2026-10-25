"use client";

import { ChevronRight, Landmark, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { useProfile } from "@/components/ProfileProvider";
import { isPublicPath } from "@/lib/publicPaths";

type OrganizationSummary = {
  organization: { id: string; name: string } | null;
  member_count: number;
};

/** Shared by the sidebar and the phone drawer, so the footer looks the same in both. */
const CARD_CLASS =
  "m-3 block rounded-xl border border-blue-100 bg-surface-accent p-3 transition-colors hover:border-blue-200 hover:bg-surface-accent-strong";

/**
 * The collapsed desktop rail's version of the card: the same tint and radius reduced to a 40px chip.
 *
 * It exists so that collapsing the sidebar does not cost the owner their only route to `/organization` —
 * the name and the member count are the full card's extra detail, the link is the part that matters.
 */
const COMPACT_CARD_CLASS =
  "mx-3 mb-3 flex h-10 items-center justify-center rounded-xl border border-blue-100 bg-surface-accent text-primary transition-colors hover:border-blue-200 hover:bg-surface-accent-strong";

type OrganizationCardProps = {
  /** Icon-only mode for the collapsed sidebar; the phone drawer and the expanded rail keep the full card. */
  compact?: boolean;
};

/**
 * The organization card at the foot of both navigations (SCRUM-51).
 *
 * The organization screen is deliberately not a navigation tab: setup happens once, right after login, and
 * lives in `/onboarding`, so this card is how the owner gets back to it — while the redirect in `proxy.ts`
 * sends an account that belongs to no organization there in the first place, which is why the same link
 * serves both cases. `organization:manage` is owner-only (SCRUM-59), so a manager or an employee sees the
 * card *without* the link: the name and the member count are useful context, the settings behind the link
 * are not theirs to change.
 *
 * It fetches its own summary because the sidebar and the drawer are two mount points; anything unexpected
 * (no session, a SQL script that has not been applied yet) simply leaves the card empty instead of breaking
 * the navigation around it.
 */
export default function OrganizationCard({
  compact = false,
}: OrganizationCardProps) {
  const pathname = usePathname();
  const { can } = useProfile();
  const { t } = useLocale();
  const [summary, setSummary] = useState<OrganizationSummary | null>(null);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      return;
    }

    let cancelled = false;

    fetch("/api/organizations/current", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OrganizationSummary | null) => {
        if (!cancelled) {
          setSummary(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (compact) {
    // The name is the tooltip and the accessible name; the visible chip is only the glyph.
    const name = summary?.organization?.name ?? t("organization.heading");
    const content = (
      <>
        <Landmark size={16} className="shrink-0" />
        <span className="sr-only">{name}</span>
      </>
    );

    return can("organization:manage") ? (
      <Link href="/organization" title={name} className={COMPACT_CARD_CLASS}>
        {content}
      </Link>
    ) : (
      <div title={name} className={COMPACT_CARD_CLASS}>
        {content}
      </div>
    );
  }

  const card = (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        <Landmark size={14} className="shrink-0 text-primary" />
        <span className="truncate">
          {summary?.organization?.name ?? t("organization.cardTitle")}
        </span>
        <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
        {summary?.organization ? (
          <>
            <UsersRound size={12} />
            {t("organization.memberCount", { count: summary.member_count })}
          </>
        ) : (
          <>
            <Landmark size={12} />
            {t("organization.joinPrompt")}
          </>
        )}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">
        {t("organization.version")}{" "}
        <span className="float-right font-medium text-slate-700">v2.5</span>
      </p>
    </>
  );

  return can("organization:manage") ? (
    <Link href="/organization" className={CARD_CLASS}>
      {card}
    </Link>
  ) : (
    <div className={CARD_CLASS}>{card}</div>
  );
}
