create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  student_name text not null,
  age integer not null check (age between 3 and 18),
  grade text not null,
  favorite_themes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint children_user_name_grade_unique unique (user_id, student_name, grade)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  subject text not null,
  topic text,
  theme text,
  goal text not null,
  difficulty text not null,
  question_count integer not null default 0,
  lesson_title text,
  lesson_intro text,
  lesson_sections jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  answers_submitted boolean not null default false,
  total_correct integer,
  accuracy numeric(5,2),
  generated_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz,
  retry_of uuid references public.study_sessions (id) on delete set null
);

create table if not exists public.study_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  position integer not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index integer not null,
  explanation text not null,
  selected_index integer,
  selected_option text,
  is_correct boolean,
  answered_at timestamptz
);

create table if not exists public.homework_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  theme text,
  title text not null,
  intro text not null,
  items jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default timezone('utc', now())
);

create index if not exists children_user_id_idx on public.children (user_id);
create index if not exists study_sessions_user_id_idx on public.study_sessions (user_id);
create index if not exists study_sessions_child_id_idx on public.study_sessions (child_id);
create index if not exists study_questions_session_id_idx on public.study_questions (session_id);
create index if not exists homework_sessions_user_id_idx on public.homework_sessions (user_id);
create index if not exists homework_sessions_child_id_idx on public.homework_sessions (child_id);

create or replace function public.handle_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.handle_profile_updated_at();

drop trigger if exists set_children_updated_at on public.children;
create trigger set_children_updated_at
before update on public.children
for each row execute procedure public.handle_profile_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_questions enable row level security;
alter table public.homework_sessions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "children_select_own" on public.children;
create policy "children_select_own"
on public.children
for select
using (auth.uid() = user_id);

drop policy if exists "children_insert_own" on public.children;
create policy "children_insert_own"
on public.children
for insert
with check (auth.uid() = user_id);

drop policy if exists "children_update_own" on public.children;
create policy "children_update_own"
on public.children
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "children_delete_own" on public.children;
create policy "children_delete_own"
on public.children
for delete
using (auth.uid() = user_id);

drop policy if exists "study_sessions_select_own" on public.study_sessions;
create policy "study_sessions_select_own"
on public.study_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "study_sessions_insert_own" on public.study_sessions;
create policy "study_sessions_insert_own"
on public.study_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "study_sessions_update_own" on public.study_sessions;
create policy "study_sessions_update_own"
on public.study_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "study_sessions_delete_own" on public.study_sessions;
create policy "study_sessions_delete_own"
on public.study_sessions
for delete
using (auth.uid() = user_id);

drop policy if exists "study_questions_select_own" on public.study_questions;
create policy "study_questions_select_own"
on public.study_questions
for select
using (
  exists (
    select 1
    from public.study_sessions sessions
    where sessions.id = study_questions.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "study_questions_insert_own" on public.study_questions;
create policy "study_questions_insert_own"
on public.study_questions
for insert
with check (
  exists (
    select 1
    from public.study_sessions sessions
    where sessions.id = study_questions.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "study_questions_update_own" on public.study_questions;
create policy "study_questions_update_own"
on public.study_questions
for update
using (
  exists (
    select 1
    from public.study_sessions sessions
    where sessions.id = study_questions.session_id
      and sessions.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.study_sessions sessions
    where sessions.id = study_questions.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "study_questions_delete_own" on public.study_questions;
create policy "study_questions_delete_own"
on public.study_questions
for delete
using (
  exists (
    select 1
    from public.study_sessions sessions
    where sessions.id = study_questions.session_id
      and sessions.user_id = auth.uid()
  )
);

drop policy if exists "homework_sessions_select_own" on public.homework_sessions;
create policy "homework_sessions_select_own"
on public.homework_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "homework_sessions_insert_own" on public.homework_sessions;
create policy "homework_sessions_insert_own"
on public.homework_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "homework_sessions_update_own" on public.homework_sessions;
create policy "homework_sessions_update_own"
on public.homework_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('estuda-materials', 'estuda-materials', false)
on conflict (id) do nothing;

drop policy if exists "storage_select_own_materials" on storage.objects;
create policy "storage_select_own_materials"
on storage.objects
for select
using (
  bucket_id = 'estuda-materials'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "storage_insert_own_materials" on storage.objects;
create policy "storage_insert_own_materials"
on storage.objects
for insert
with check (
  bucket_id = 'estuda-materials'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "storage_update_own_materials" on storage.objects;
create policy "storage_update_own_materials"
on storage.objects
for update
using (
  bucket_id = 'estuda-materials'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'estuda-materials'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "storage_delete_own_materials" on storage.objects;
create policy "storage_delete_own_materials"
on storage.objects
for delete
using (
  bucket_id = 'estuda-materials'
  and auth.uid()::text = split_part(name, '/', 1)
);
