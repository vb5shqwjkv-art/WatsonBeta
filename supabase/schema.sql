-- ─────────────────────────────────────────────────────────────────────────
-- AI Voice Document Assistant — database schema
--
-- Managed by Supabase. Auth is handled by Supabase Auth (auth.users). Every
-- table is owner-scoped via Row Level Security so a user only ever sees their
-- own documents. This is the Phase 4 target schema; applied via migrations.
-- ─────────────────────────────────────────────────────────────────────────

-- Documents ----------------------------------------------------------------
create table if not exists public.documents (
  id           text primary key,                 -- `<userId>:<docId>`
  owner_id     uuid not null references auth.users (id) on delete cascade,
  title        text not null default 'Untitled',
  content      jsonb not null default '{}'::jsonb, -- ProseMirror JSON
  annotations  jsonb not null default '[]'::jsonb, -- overlay annotations
  doc_version  integer not null default 0,          -- optimistic concurrency
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists documents_owner_idx on public.documents (owner_id);

-- Named, restorable versions ("restore the previous version") --------------
create table if not exists public.document_versions (
  id           text primary key,                 -- ver_…
  document_id  text not null references public.documents (id) on delete cascade,
  label        text not null,
  title        text not null default 'Documento',
  content      jsonb not null,
  annotations  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists document_versions_doc_idx
  on public.document_versions (document_id, created_at desc);

-- Conversation log (transcripts + assistant actions) -----------------------
create table if not exists public.conversation_messages (
  id           text primary key,                 -- msg_…
  document_id  text not null references public.documents (id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  kind         text check (kind in ('reply', 'action')),
  content      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists conversation_messages_doc_idx
  on public.conversation_messages (document_id, created_at);

-- Row Level Security -------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.conversation_messages enable row level security;

create policy "owners manage their documents"
  on public.documents for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners access versions of their documents"
  on public.document_versions for all
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_id = auth.uid()
    )
  );

create policy "owners access messages of their documents"
  on public.conversation_messages for all
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_id = auth.uid()
    )
  );
