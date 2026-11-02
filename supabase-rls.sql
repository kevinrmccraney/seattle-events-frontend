alter table public.events enable row level security;

drop policy if exists "authenticated users can read events" on public.events;
create policy "authenticated users can read events"
on public.events for select to authenticated using (true);

drop policy if exists "authenticated users can update review state" on public.events;
create policy "authenticated users can update review state"
on public.events for update to authenticated using (true) with check (true);

revoke update on table public.events from authenticated;
grant update (review_status, reviewed_at) on table public.events to authenticated;
grant select on table public.events to authenticated;
