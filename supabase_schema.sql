-- CampusConnect Supabase Schema
-- IMPORTANT: Running this script will RESET your database tables.

-- 0. Clean up existing tables
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.materials CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.notices CASCADE;

-- 1. Profiles (Student Information)
-- 1. Profiles (Student Information)
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  student_id text unique not null,
  full_name text not null,
  avatar_url text,
  is_online boolean default false,
  is_typing_in text, -- Room ID or user ID they are typing to
  role text default 'student' check (role in ('student', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Subjects
create table public.subjects (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Learning Materials (Videos, Notes, Links)
create table public.materials (
  id uuid default gen_random_uuid() primary key,
  subject_id uuid references public.subjects(id) on delete cascade not null,
  type text not null check (type in ('video', 'note', 'link')),
  title text not null,
  content text not null, -- URL for videos/links, text or file path for notes
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Chat Rooms (Groups)
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null check (type in ('group', 'dm', 'anonymous')),
  subject_id uuid references public.subjects(id) on delete cascade, -- Optional, for subject-specific groups
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Messages
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) not null,
  content text not null,
  is_anonymous boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Notices (Dashboard Announcements)
create table public.notices (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text,
  color text default 'blue',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Enable Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.notices;
alter publication supabase_realtime add table public.subjects;
alter publication supabase_realtime add table public.materials;

-- 8. RLS Policies (Permissive for Demo Simulation)
alter table public.profiles enable row level security;
create policy "Permissive profiles" on public.profiles for all using (true) with check (true);

alter table public.subjects enable row level security;
create policy "Permissive subjects" on public.subjects for all using (true) with check (true);

alter table public.materials enable row level security;
create policy "Permissive materials" on public.materials for all using (true) with check (true);

alter table public.rooms enable row level security;
create policy "Permissive rooms" on public.rooms for all using (true) with check (true);

alter table public.messages enable row level security;
create policy "Permissive messages" on public.messages for all using (true) with check (true);

alter table public.notices enable row level security;
create policy "Permissive notices" on public.notices for all using (true) with check (true);

-- 9. Storage for PDFs
insert into storage.buckets (id, name, public) 
values ('materials', 'materials', true)
on conflict (id) do nothing;

create policy "Public Access" on storage.objects for select using ( bucket_id = 'materials' );
create policy "Admin Upload" on storage.objects for insert with check ( bucket_id = 'materials' );
create policy "Admin Update" on storage.objects for update with check ( bucket_id = 'materials' );
create policy "Admin Delete" on storage.objects for delete using ( bucket_id = 'materials' );

-- 10. Presence / Online Status
-- Simple setup for tracking online status via the profiles table
-- In a real app, this might be handled by Supabase Presence, but for this demo
-- we'll use an is_online flag that the client updates.
