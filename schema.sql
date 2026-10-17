-- CIA CASA STREET RP — Supabase schema
-- Run once in Supabase Dashboard > SQL Editor using the project's SQL editor.
-- Public browser client uses only the Publishable/anon key; never put service_role/secret keys in the website.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'New Agent',
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rank text not null default 'Agent 1',
  badge text not null default 'RECRUIT',
  skin_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  discord_name text not null check (char_length(discord_name) between 1 and 50),
  age integer not null check (age between 13 and 99),
  availability text not null check (char_length(availability) between 1 and 80),
  skills text not null check (char_length(skills) between 1 and 300),
  reason text not null check (char_length(reason) between 1 and 600),
  skin_image text,
  qcm_score integer not null default 0 check (qcm_score between 0 and 3),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  details text not null check (char_length(details) between 1 and 600),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.member_access_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  member_code text not null unique,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists applications_status_created_idx on public.applications(status, created_at desc);
create index if not exists missions_assigned_status_idx on public.missions(assigned_to, status, created_at desc);
alter table public.profiles add column if not exists badge text not null default 'RECRUIT';
alter table public.profiles add column if not exists skin_image text;
alter table public.applications add column if not exists skin_image text;
alter table public.applications add column if not exists qcm_score integer not null default 0;

create index if not exists messages_created_idx on public.messages(created_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), 'New Agent'))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cia_profile on auth.users;
create trigger on_auth_user_created_cia_profile
after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_cia_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.missions enable row level security;
alter table public.messages enable row level security;
alter table public.member_access_codes enable row level security;

-- Profiles: users can read their own record; approved members can see the roster; admins can manage profiles.
drop policy if exists "profiles_select_own_roster_admin" on public.profiles;
create policy "profiles_select_own_roster_admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_cia_admin() or status = 'approved');
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated
using (public.is_cia_admin()) with check (public.is_cia_admin());

-- Applications: submit/read own application, only admin can review/change applications.
drop policy if exists "applications_insert_own_pending" on public.applications;
create policy "applications_insert_own_pending" on public.applications for insert to authenticated
with check (user_id = auth.uid() and status = 'pending' and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'pending'));
drop policy if exists "applications_select_own_or_admin" on public.applications;
create policy "applications_select_own_or_admin" on public.applications for select to authenticated
using (user_id = auth.uid() or public.is_cia_admin());
drop policy if exists "applications_admin_update" on public.applications;
create policy "applications_admin_update" on public.applications for update to authenticated
using (public.is_cia_admin()) with check (public.is_cia_admin());

-- Missions: only admins create/change/delete; approved members see tasks for everyone or themselves.
drop policy if exists "missions_select_approved" on public.missions;
create policy "missions_select_approved" on public.missions for select to authenticated
using (public.is_cia_admin() or (exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved') and (assigned_to is null or assigned_to = auth.uid())));
drop policy if exists "missions_admin_insert" on public.missions;
create policy "missions_admin_insert" on public.missions for insert to authenticated
with check (public.is_cia_admin() and created_by = auth.uid());
drop policy if exists "missions_admin_update" on public.missions;
create policy "missions_admin_update" on public.missions for update to authenticated
using (public.is_cia_admin()) with check (public.is_cia_admin());
drop policy if exists "missions_admin_delete" on public.missions;
create policy "missions_admin_delete" on public.missions for delete to authenticated using (public.is_cia_admin());

-- Member codes are visible only to their owner and admins. They are IDs, not a substitute for login authentication.
drop policy if exists "member_codes_select_owner_admin" on public.member_access_codes;
create policy "member_codes_select_owner_admin" on public.member_access_codes for select to authenticated using (user_id = auth.uid() or public.is_cia_admin());
drop policy if exists "member_codes_admin_write" on public.member_access_codes;
create policy "member_codes_admin_write" on public.member_access_codes for all to authenticated using (public.is_cia_admin()) with check (public.is_cia_admin());

-- Team messages: approved members and admins may read; approved members may post as themselves.
drop policy if exists "messages_select_approved" on public.messages;
create policy "messages_select_approved" on public.messages for select to authenticated
using (public.is_cia_admin() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved'));
drop policy if exists "messages_insert_approved_self" on public.messages;
create policy "messages_insert_approved_self" on public.messages for insert to authenticated
with check (user_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and (p.status = 'approved' or p.role = 'admin')));

-- Ensure the browser roles can use only the tables protected above.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.member_access_codes to authenticated;
grant select, insert, update on public.applications to authenticated;
grant select, insert, update, delete on public.missions to authenticated;
grant select, insert on public.messages to authenticated;

-- Optional Realtime for team messages. Ignore duplicate-publication errors if already enabled.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: create/sign up with your own account first, then run the next command
-- after replacing the email. This is the only intended manual admin bootstrap step:
-- update public.profiles set role='admin', status='approved', display_name='Command Admin' where email='YOUR_LOGIN_EMAIL_HERE';
