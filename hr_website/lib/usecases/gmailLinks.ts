/**
 * Deep link Gmail (SCRUM-101, C3) — không dependency, không OAuth, không token.
 *
 * The app cannot read a mailbox, so C3 is answered by (a) a log of what was exchanged and (b) links that
 * open the right place in Gmail. These builders are pure and live in `lib/` so the dialog, the reminder
 * queue and the tests (there is no runner in this repo — the typecheck is the gate) all use one copy.
 *
 * Every generated URL is percent-encoded through `URLSearchParams`; a subject with `&` or a body with a
 * newline must not truncate the link. `GMAIL_COMPOSE_BODY_MAX` keeps the URL under the ~2 KB Gmail
 * accepts, and the dialog shows the same limit as a hint.
 */
export const GMAIL_THREAD_URL_PREFIX = "https://mail.google.com/";
export const GMAIL_COMPOSE_BODY_MAX = 1200;

export type ComposeTarget = {
  to: string;
  subject: string;
  body: string;
};

/** A stored thread link is rendered into an `href`, so only Gmail's own host is accepted. */
export function isGmailThreadUrl(value: string): boolean {
  return value.startsWith(GMAIL_THREAD_URL_PREFIX);
}

/** `https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…` in the owner's default account. */
export function gmailComposeUrl({ to, subject, body }: ComposeTarget): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to,
    su: subject,
    body: body.slice(0, GMAIL_COMPOSE_BODY_MAX),
  });

  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * The same draft for a client that is not Gmail (Outlook, Mail.app). The screen offers Gmail first because
 * the log records Gmail thread links, and falls back to this when the owner prefers another client.
 */
export function mailtoUrl({ to, subject, body }: ComposeTarget): string {
  const params = new URLSearchParams({
    subject,
    body: body.slice(0, GMAIL_COMPOSE_BODY_MAX),
  });

  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}

/** Every thread with this customer, both directions — what "xem thư của khách" opens. */
export function gmailSearchUrl(email: string): string {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(
    `from:${email} OR to:${email}`,
  )}`;
}
