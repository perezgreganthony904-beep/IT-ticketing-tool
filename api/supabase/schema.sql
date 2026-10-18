create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  requester text not null check (char_length(requester) between 1 and 80),
  email text not null default '',
  category text not null check (category in ('Hardware', 'Software', 'Network', 'Account')),
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Critical')),
  assignee text not null default 'Unassigned',
  status text not null default 'open' check (status in ('open', 'in-progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.tickets enable row level security;
alter table public.team_members enable row level security;

revoke all on public.tickets from anon, authenticated;
revoke all on public.team_members from anon, authenticated;
revoke all on sequence public.tickets_ticket_number_seq from anon;
grant select, insert, update on public.tickets to authenticated;
grant select on public.team_members to authenticated;
grant usage, select on sequence public.tickets_ticket_number_seq to authenticated;

drop policy if exists "Team members can view their membership" on public.team_members;
create policy "Team members can view their membership"
  on public.team_members for select to authenticated using (user_id = auth.uid());

drop policy if exists "Invited technicians can read team tickets" on public.tickets;
create policy "Invited technicians can read team tickets"
  on public.tickets for select to authenticated using (
    exists (select 1 from public.team_members where user_id = auth.uid())
  );

drop policy if exists "Invited technicians can create team tickets" on public.tickets;
create policy "Invited technicians can create team tickets"
  on public.tickets for insert to authenticated with check (
    exists (select 1 from public.team_members where user_id = auth.uid())
  );

drop policy if exists "Invited technicians can update team tickets" on public.tickets;
create policy "Invited technicians can update team tickets"
  on public.tickets for update to authenticated using (
    exists (select 1 from public.team_members where user_id = auth.uid())
  ) with check (
    exists (select 1 from public.team_members where user_id = auth.uid())
  );

drop policy if exists "Public visitors can submit new tickets" on public.tickets;