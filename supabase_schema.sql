-- Gaming Kiosk Database Schema
-- Run this in Supabase SQL editor

create table games (
  id bigint generated always as identity primary key,
  name text not null,
  steam_app_id text not null,
  price_per_hour integer not null default 150,
  emoji text default '🎮',
  image_url text,
  color text default '#1a1a2a',
  active boolean not null default true,
  display_order integer default 0,
  created_at timestamptz default now()
);

create table sessions (
  id bigint generated always as identity primary key,
  game_id bigint references games(id),
  payment_id text,
  duration_minutes integer not null,
  amount_rub integer not null,
  status text not null default 'active', -- active | finished | interrupted
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

create table transactions (
  id bigint generated always as identity primary key,
  session_id bigint references sessions(id),
  yookassa_payment_id text not null,
  amount_rub integer not null,
  type text not null default 'initial', -- initial | extension
  created_at timestamptz default now()
);

-- Demo games
insert into games (name, steam_app_id, price_per_hour, emoji, display_order) values
  ('Assetto Corsa', '244210', 150, '🏎️', 1),
  ('Assetto Corsa Competizione', '805550', 150, '🏁', 2),
  ('F1 23', '2108330', 150, '🚗', 3),
  ('Dirt Rally 2.0', '690790', 120, '🌪️', 4);

-- RLS: allow all reads (kiosk runs locally)
alter table games enable row level security;
alter table sessions enable row level security;
alter table transactions enable row level security;

create policy "allow all" on games for all using (true);
create policy "allow all" on sessions for all using (true);
create policy "allow all" on transactions for all using (true);
