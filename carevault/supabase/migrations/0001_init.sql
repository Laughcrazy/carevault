-- CareVault — initial schema.
--
-- Design rules baked in here:
--  1. auth.users is the account. `subjects` are the *people* whose records these
--     are (you, your mother, your child). Records never hang off an account.
--  2. Everything is reachable from exactly one subject, and every RLS policy
--     resolves through owns_subject(). One function, one place to audit.
--  3. Anything the AI produced is stored next to the page it came from, with a
--     confidence score and a human-verified flag. Nothing is presented as fact
--     until a person has confirmed it.
--  4. Share tokens are stored hashed. A database leak must not hand out live
--     read links to people's medical histories.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------- enums

create type relationship as enum ('self','child','spouse','parent','sibling','ward','other');
create type record_source as enum ('camera','gallery','file','inbound_email','manual');
create type record_status as enum ('queued','uploading','uploaded','processing','needs_review','completed','failed','quarantined');
create type sex_at_birth  as enum ('female','male','intersex','undisclosed');

-- ---------------------------------------------------------------- accounts

create table account_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  locale           text not null default 'en-NG',
  -- Explicit, revocable, logged. NDPA 2023 treats health data as sensitive:
  -- no AI processing happens until this is true.
  ai_processing_consent_at  timestamptz,
  ai_processing_revoked_at  timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- subjects

create table subjects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  full_name      text not null,
  relationship   relationship not null default 'self',
  date_of_birth  date,
  sex_at_birth   sex_at_birth,
  blood_type     text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  -- Shown on the emergency card without unlocking the whole vault.
  known_allergies      text[] not null default '{}',
  emergency_contact    jsonb,
  genotype             text check (genotype in ('AA','AS','AC','SS','SC','CC')),  -- sickle-cell status matters here
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on subjects (user_id) where archived_at is null;

-- Each subject gets a high-entropy inbound address. Never derived from a user id:
-- a guessable address is an open inbox for someone else's medical data.
create table inbound_addresses (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references subjects(id) on delete cascade,
  local_part   citext not null unique,          -- e.g. 'k7f2-mango-41x9'
  is_active    boolean not null default true,
  -- Mail from an address not on this list lands as `quarantined`, not on the timeline.
  allowed_senders citext[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index on inbound_addresses (subject_id);

-- ---------------------------------------------------------------- records

create table records (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid not null references subjects(id) on delete cascade,
  storage_path    text,                        -- object key in the private bucket
  mime_type       text,
  byte_size       bigint check (byte_size >= 0),
  page_count      int,
  source          record_source not null,
  status          record_status not null default 'queued',
  -- Set by the client before upload so a queued offline capture is never
  -- duplicated when the phone comes back online and retries.
  client_uuid     uuid not null,
  sha256          text,
  captured_at     timestamptz,                 -- when the photo was taken
  failure_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (subject_id, client_uuid)
);
create index on records (subject_id, created_at desc);
create index on records (status) where status in ('queued','uploaded','processing');

-- Provenance of the inbound email that produced a record, kept separate so the
-- records table stays the same shape whatever the source.
create table record_email_meta (
  record_id     uuid primary key references records(id) on delete cascade,
  from_address  citext not null,
  subject_line  text,
  message_id    text,
  spf_pass      boolean,
  dkim_pass     boolean,
  received_at   timestamptz not null default now()
);

-- ------------------------------------------------- AI extraction (1:1 per pass)

create table extractions (
  id                uuid primary key default gen_random_uuid(),
  record_id         uuid not null references records(id) on delete cascade,
  model             text not null,
  prompt_version    text not null,
  -- Re-running the model creates a new row rather than overwriting. You can
  -- always show a clinician what the app said on the day they were shown it.
  revision          int not null default 1,
  is_current        boolean not null default true,
  document_type     text,                      -- prescription | lab_result | discharge_summary | imaging | note
  visit_date        date,
  facility_name     text,
  physician_name    text,
  summary           text,
  tags              text[] not null default '{}',
  -- 0..1, self-reported by the model and clamped server-side.
  confidence        numeric(3,2) check (confidence between 0 and 1),
  -- Fields the model was unsure about, so the UI can ask the user just those.
  low_confidence_fields text[] not null default '{}',
  raw_response      jsonb,
  verified_by_user_at timestamptz,
  created_at        timestamptz not null default now(),
  unique (record_id, revision)
);
create unique index on extractions (record_id) where is_current;

-- Medications and vitals are one-to-many. Flattening them into columns (as the
-- original PRD did) loses every prescription after the first.
create table extracted_medications (
  id             uuid primary key default gen_random_uuid(),
  extraction_id  uuid not null references extractions(id) on delete cascade,
  name           text not null,
  dose           text,
  route          text,
  frequency      text,
  duration       text,
  confidence     numeric(3,2) check (confidence between 0 and 1),
  corrected_by_user boolean not null default false
);
create index on extracted_medications (extraction_id);

create table extracted_vitals (
  id             uuid primary key default gen_random_uuid(),
  extraction_id  uuid not null references extractions(id) on delete cascade,
  code           text not null,               -- 'bp_systolic', 'hba1c', 'weight_kg'
  value_num      numeric,
  value_text     text,
  unit           text,
  reference_low  numeric,
  reference_high numeric,
  measured_at    timestamptz,
  confidence     numeric(3,2) check (confidence between 0 and 1)
);
create index on extracted_vitals (extraction_id, code);

-- ---------------------------------------------------------------- sharing

create table shared_links (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references subjects(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete cascade,
  -- The raw token is shown to the user exactly once and never stored.
  token_hash    text not null unique,
  -- Spoken aloud to the doctor; the web view needs link + PIN. A photographed
  -- QR code on its own is useless.
  pin_hash      text,
  label         text,                          -- 'Dr Okafor, Reddington, 3 Mar'
  -- Least privilege: share the cardiology thread, not the whole life.
  scope_tags    text[] not null default '{}',
  scope_from    date,
  scope_to      date,
  expires_at    timestamptz not null,
  max_views     int not null default 20 check (max_views > 0),
  view_count    int not null default 0,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (expires_at > created_at)
);
create index on shared_links (subject_id, created_at desc);
create index on shared_links (expires_at) where revoked_at is null;

-- Every view, so the patient can see exactly who opened their file and when.
create table share_access_log (
  id             bigserial primary key,
  shared_link_id uuid not null references shared_links(id) on delete cascade,
  viewed_at      timestamptz not null default now(),
  ip_hash        text,
  user_agent     text,
  outcome        text not null                 -- 'granted' | 'expired' | 'bad_pin' | 'revoked'
);
create index on share_access_log (shared_link_id, viewed_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function owns_subject(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from subjects s
    where s.id = p_subject and s.user_id = auth.uid()
  );
$$;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger subjects_touch before update on subjects
  for each row execute function touch_updated_at();
create trigger records_touch before update on records
  for each row execute function touch_updated_at();

-- On signup: create the settings row and a 'self' subject with an inbox.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_subject uuid;
begin
  insert into account_settings (user_id) values (new.id);

  insert into subjects (user_id, full_name, relationship)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Me'), 'self')
  returning id into v_subject;

  insert into inbound_addresses (subject_id, local_part)
  values (v_subject, encode(gen_random_bytes(9), 'hex'));

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- RLS

alter table account_settings       enable row level security;
alter table subjects               enable row level security;
alter table inbound_addresses      enable row level security;
alter table records                enable row level security;
alter table record_email_meta      enable row level security;
alter table extractions            enable row level security;
alter table extracted_medications  enable row level security;
alter table extracted_vitals       enable row level security;
alter table shared_links           enable row level security;
alter table share_access_log       enable row level security;

create policy own_settings on account_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_subjects on subjects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_inboxes on inbound_addresses
  for select using (owns_subject(subject_id));

create policy own_records on records
  for all using (owns_subject(subject_id)) with check (owns_subject(subject_id));

create policy own_email_meta on record_email_meta
  for select using (exists (
    select 1 from records r where r.id = record_id and owns_subject(r.subject_id)));

create policy own_extractions on extractions
  for select using (exists (
    select 1 from records r where r.id = record_id and owns_subject(r.subject_id)));

-- The user may correct what the AI wrote, but only the service role may insert it.
create policy correct_extractions on extractions
  for update using (exists (
    select 1 from records r where r.id = record_id and owns_subject(r.subject_id)));

create policy own_meds on extracted_medications
  for all using (exists (
    select 1 from extractions e join records r on r.id = e.record_id
    where e.id = extraction_id and owns_subject(r.subject_id)));

create policy own_vitals on extracted_vitals
  for all using (exists (
    select 1 from extractions e join records r on r.id = e.record_id
    where e.id = extraction_id and owns_subject(r.subject_id)));

create policy own_links on shared_links
  for all using (owns_subject(subject_id)) with check (owns_subject(subject_id));

create policy own_access_log on share_access_log
  for select using (exists (
    select 1 from shared_links l where l.id = shared_link_id and owns_subject(l.subject_id)));

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'records', 'records', false, 52428800,
  array['image/jpeg','image/png','image/heic','image/webp','application/pdf','video/mp4','video/quicktime']
)
on conflict (id) do nothing;

-- Object key convention: {subject_id}/{record_id}.{ext}
-- The first path segment is the subject, so ownership is checkable from the key.
create policy read_own_objects on storage.objects
  for select to authenticated
  using (bucket_id = 'records' and owns_subject(((storage.foldername(name))[1])::uuid));

create policy write_own_objects on storage.objects
  for insert to authenticated
  with check (bucket_id = 'records' and owns_subject(((storage.foldername(name))[1])::uuid));

create policy delete_own_objects on storage.objects
  for delete to authenticated
  using (bucket_id = 'records' and owns_subject(((storage.foldername(name))[1])::uuid));
