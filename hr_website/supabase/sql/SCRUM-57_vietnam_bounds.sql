-- SCRUM-57: Vietnam geographic bounds constraint on branches
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- This is the cheap envelope check only: a bounding box around the country. The precise test — is the
-- point on Vietnamese land at all, rather than in Laos, in the sea or in a lake — cannot be written as
-- a CHECK constraint without PostGIS, so it lives in JavaScript instead:
--   lib/geo/vietnamOutline.ts  the outline (generated, never edited by hand)
--   lib/geo/vietnam.ts         isInsideVietnam() — point-in-polygon + a 2 km coastal tolerance band
-- Both the branches API (app/api/branches/_lib/branchRequest.ts) and the branch map picker call it, so
-- a coordinate off the outline is refused with 400 before it ever reaches this constraint. Keep the two
-- in step: this box is the outline's envelope widened by MORE than that band (0.022° on each side), or
-- the database would refuse a branch the API had already accepted.
--
-- Vietnam bounds (the outline's envelope + 0.022° ~ 2.2 km of margin, so this box can never refuse a
-- coordinate the API accepted):
-- Latitude:  8.5436° to 23.3883° N
-- Longitude: 102.0967° to 109.4944° E

alter table public.branches drop constraint if exists branches_vietnam_bounds_check;
alter table public.branches add constraint branches_vietnam_bounds_check
  check (
    latitude is null
    or (
      latitude >= 8.5436 and latitude <= 23.3883
      and longitude >= 102.0967 and longitude <= 109.4944
    )
  );

comment on constraint branches_vietnam_bounds_check on public.branches is
  'Envelope of lib/geo/vietnamOutline.ts widened by 2.2 km; rejects coordinates outside 8.5436–23.3883° N, 102.0967–109.4944° E.';