/**
 * One browser event, so the header's bell and the inbox cannot disagree about the unread count.
 *
 * The badge lives in `components/Header.tsx`, which the shell mounts once for the whole session, while the
 * buttons that change the read state live on `/notifications` — a sibling route, not a parent. Reading a
 * notification does not navigate, so the header's route-change refetch never fires and its 30 s poll is the
 * only thing that could catch up: the badge used to lie for up to half a minute after "Đánh dấu tất cả đã
 * đọc". The screen dispatches this event after every successful write and the header refetches at once.
 *
 * A DOM event rather than a context: a provider would have to wrap the whole shell to carry one signal, and
 * `Header` cannot re-render `Sidebar`'s sibling subtree anyway. This is an announcement, not shared state —
 * the header always re-reads the number from the API, so a missed event can only cost latency, never truth.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "humora:notifications-changed";

/** Called by every screen that changes a notification's read state (`/notifications` today). */
export function announceNotificationsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
