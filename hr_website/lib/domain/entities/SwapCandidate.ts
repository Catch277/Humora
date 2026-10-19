/**
 * A colleague the caller may hand a ca to (SCRUM-82): an active `EMPLOYEE` of their own branch who is
 * free in that ca on that day.
 *
 * It is the answer of `public.eligible_swap_targets()` rather than a stored row, so it carries the two
 * fields a picker needs and nothing else — there is no `is_active` flag to re-test, because the RPC
 * already refused everybody who is not selectable.
 */
export interface SwapCandidate {
  id: string;
  full_name: string;
}
