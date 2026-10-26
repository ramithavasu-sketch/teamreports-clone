-- Call Calibration: server-side storage and rules for Team Reports.
--
-- The look-alike app has no backend yet; this migration is what makes the
-- rules in src/calibration/service.js enforceable by the database once
-- Team Reports runs on Supabase (or any Postgres with an auth.uid()).
--
-- Clients may READ through row-level security, but every state change goes
-- through the SECURITY DEFINER functions at the bottom, which check the
-- caller's role. Triggers make the important rules hold even for code that
-- bypasses those functions:
--   * status changes must follow the format's allowed transitions
--   * submitted scorecards cannot change (except the audited reopen)
--   * the audit log is append-only
--
-- Blind rule: nobody (facilitator and admins included) can read another
-- reviewer's submission until revealed_at is set. Submission status without
-- ratings is available through cal_submission_status().

create extension if not exists pgcrypto;

/* ---------- people ---------- */
-- Replace with a view over the existing Team Reports users table when wiring in.
create table public.calibration_people (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,
  name          text not null,
  role          text not null check (role in ('admin', 'qa_lead', 'qa', 'agent')),
  agent_ref     text unique            -- the agent id the Call Library uses
);

/* ---------- sessions ---------- */
create table public.calibration_sessions (
  id               uuid primary key default gen_random_uuid(),
  title            text not null default '' check (length(title) <= 120),
  format           text not null check (format in ('blind', 'team', 'agent')),
  connection_id    text not null default '',          -- Call Library Connection ID
  scheduled_at     timestamptz,
  facilitator_id   uuid references public.calibration_people (id),
  agent_id         uuid references public.calibration_people (id),
  goal             text not null default '',
  scorecard_id     text not null default 'tr-soft-tech',
  baseline         numeric(5,2) not null default 5 check (baseline between 0 and 100),
  instructions     text not null default '',
  meeting_link     text not null default '' check (meeting_link = '' or meeting_link ~ '^https://'),
  pre_review       boolean not null default false,
  recurring        jsonb not null default '{"enabled": false, "cadence": "monthly", "rotateFacilitator": false}',
  status           text not null default 'draft' check (status in ('draft', 'scheduled', 'in_progress', 'awaiting_submissions',
                     'ready_to_reveal', 'discussion', 'awaiting_final_decision', 'completed', 'cancelled')),
  revealed_at      timestamptz,
  reveal_exception jsonb,
  escalation       jsonb,
  previous_id      uuid references public.calibration_sessions (id),
  created_by       uuid not null references public.calibration_people (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint blind_has_review check (format <> 'blind' or pre_review),
  constraint agent_only_for_agent check ((format = 'agent') = (agent_id is not null) or status = 'draft')
);
create index calibration_sessions_status_idx on public.calibration_sessions (status, scheduled_at);

create table public.calibration_reviewers (
  session_id  uuid not null references public.calibration_sessions (id) on delete cascade,
  person_id   uuid not null references public.calibration_people (id),
  primary key (session_id, person_id)
);

create table public.calibration_submissions (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.calibration_sessions (id) on delete cascade,
  reviewer_id      uuid not null references public.calibration_people (id),
  status           text not null default 'draft' check (status in ('draft', 'submitted', 'closed')),
  ratings          jsonb not null default '{}',   -- { criterionId: { value, comment, evidence } }
  overall_comment  text not null default '',
  submitted_at     timestamptz,
  updated_at       timestamptz not null default now(),
  unique (session_id, reviewer_id)
);

create table public.calibration_submission_versions (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.calibration_submissions (id) on delete cascade,
  ratings         jsonb not null,
  overall_comment text not null,
  submitted_at    timestamptz,
  reopened_by     uuid not null references public.calibration_people (id),
  reopened_at     timestamptz not null default now(),
  reason          text not null
);

-- Final decision, stored apart from the original reviewer verdicts.
create table public.calibration_decisions (
  session_id            uuid primary key references public.calibration_sessions (id) on delete cascade,
  ratings               jsonb not null default '{}',  -- { criterionId: { value, resolution, disputed } }
  rationale             text not null default '',
  learning_points       text not null default '',
  rubric_clarifications text not null default '',
  internal_notes        text not null default '',     -- never shown to the agent
  coaching_points       text not null default '',
  agreed_expectations   text not null default '',
  consensus             text check (consensus in ('consensus', 'lead_decision')),
  lead_reason           text not null default '',
  share_with            text[] not null default '{}',
  updated_by            uuid references public.calibration_people (id),
  updated_at            timestamptz not null default now(),
  finalized_by          uuid references public.calibration_people (id),
  finalized_at          timestamptz
);

create table public.calibration_notes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.calibration_sessions (id) on delete cascade,
  author_id     uuid not null references public.calibration_people (id),
  body          text not null check (length(body) between 1 and 4000),
  criterion_id  text not null default '',
  ts            text not null default '' check (ts = '' or ts ~ '^\d{1,2}:\d{2}(:\d{2})?$'),
  kind          text not null default 'note' check (kind in ('note', 'evidence', 'dispute')),
  private       boolean not null default false,       -- QA only, hidden from the agent
  created_at    timestamptz not null default now()
);

create table public.calibration_attendance (
  session_id   uuid not null references public.calibration_sessions (id) on delete cascade,
  person_id    uuid not null references public.calibration_people (id),
  attended     boolean not null default false,
  contributed  boolean not null default false,
  primary key (session_id, person_id)
);

create table public.calibration_actions (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.calibration_sessions (id) on delete cascade,
  body          text not null,
  owner_id      uuid not null references public.calibration_people (id),
  due_date      date,
  kind          text not null default 'followup' check (kind in ('coaching', 'rubric', 'followup')),
  status        text not null default 'open' check (status in ('open', 'done')),
  completed_at  timestamptz,
  created_by    uuid not null references public.calibration_people (id),
  created_at    timestamptz not null default now()
);

create table public.calibration_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  session_id  uuid references public.calibration_sessions (id) on delete set null,
  actor_id    uuid references public.calibration_people (id),
  action      text not null,
  detail      text not null default ''
);

/* ---------- helpers ---------- */

create or replace function public.cal_me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.calibration_people where auth_user_id = auth.uid()
$$;

create or replace function public.cal_is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.calibration_people where id = public.cal_me() and role in ('admin', 'qa_lead'))
$$;

create or replace function public.cal_needs_submissions(s public.calibration_sessions) returns boolean
language sql immutable as $$ select s.format = 'blind' or s.pre_review $$;

-- 'manager' | 'facilitator' | 'reviewer' | 'agent' | null
create or replace function public.cal_role(p_session uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.cal_is_manager() then 'manager'
    when s.facilitator_id = public.cal_me() then 'facilitator'
    when exists (select 1 from public.calibration_reviewers r where r.session_id = s.id and r.person_id = public.cal_me()) then 'reviewer'
    when s.agent_id = public.cal_me() then 'agent'
  end
  from public.calibration_sessions s where s.id = p_session
$$;

create or replace function public.cal_can_view(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.cal_role(p_session) = 'manager'
    or (public.cal_role(p_session) is not null and (select status from public.calibration_sessions where id = p_session) <> 'draft'), false)
$$;

create or replace function public.cal_qa_side(p_session uuid) returns boolean
language sql stable as $$ select public.cal_can_view(p_session) and public.cal_role(p_session) in ('manager', 'facilitator', 'reviewer') $$;

create or replace function public.cal_runner(p_session uuid) returns boolean
language sql stable as $$ select public.cal_role(p_session) in ('manager', 'facilitator') $$;

create or replace function public.cal_log(p_session uuid, p_action text, p_detail text default '') returns void
language sql security definer set search_path = public as $$
  insert into public.calibration_audit (session_id, actor_id, action, detail) values (p_session, public.cal_me(), p_action, coalesce(p_detail, ''))
$$;

/* ---------- triggers ---------- */

create or replace function public.cal_valid_transition(p_review boolean, p_from text, p_to text) returns boolean
language sql immutable as $$
  select p_to = 'cancelled' and p_from not in ('completed', 'cancelled')
    or (p_from || '>' || p_to) = any (case when p_review then array[
      'draft>scheduled', 'scheduled>awaiting_submissions', 'awaiting_submissions>ready_to_reveal', 'ready_to_reveal>awaiting_submissions',
      'ready_to_reveal>discussion', 'awaiting_submissions>discussion', 'discussion>awaiting_final_decision', 'awaiting_final_decision>discussion',
      'discussion>completed', 'awaiting_final_decision>completed']
    else array['draft>scheduled', 'scheduled>in_progress', 'in_progress>awaiting_final_decision', 'awaiting_final_decision>in_progress',
      'in_progress>completed', 'awaiting_final_decision>completed'] end)
$$;

create or replace function public.cal_sessions_guard() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('cal.rpc', true), '') <> 'on' then
      raise exception 'Status changes must go through the calibration functions';
    end if;
    if not public.cal_valid_transition(public.cal_needs_submissions(old), old.status, new.status) then
      raise exception 'A % session cannot go from % to %', old.format, old.status, new.status;
    end if;
    if new.status = 'discussion' and old.status in ('awaiting_submissions', 'ready_to_reveal') and new.revealed_at is null then
      raise exception 'Discussion starts with the reveal';
    end if;
    insert into public.calibration_audit (session_id, actor_id, action, detail) values (new.id, public.cal_me(), 'status', old.status || ' -> ' || new.status);
  end if;
  if old.status not in ('draft', 'scheduled') and (new.format, new.connection_id, new.scorecard_id, new.pre_review)
       is distinct from (old.format, old.connection_id, old.scorecard_id, old.pre_review) then
    raise exception 'The call, format and scorecard are locked once the session starts';
  end if;
  if old.revealed_at is not null and new.revealed_at is distinct from old.revealed_at then
    raise exception 'A reveal cannot be undone';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger calibration_sessions_guard before update on public.calibration_sessions for each row execute function public.cal_sessions_guard();

-- Submitted scorecards are immutable; only cal_reopen_submission may flip them back to draft.
create or replace function public.cal_submissions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Submitted scorecards cannot be deleted'; end if;
    return old;
  end if;
  if old.status = 'submitted' and coalesce(current_setting('cal.reopen', true), '') <> 'on'
     and (new.ratings, new.overall_comment, new.submitted_at, new.status) is distinct from (old.ratings, old.overall_comment, old.submitted_at, 'submitted') then
    raise exception 'Submitted scorecards are locked';
  end if;
  if old.status = 'closed' then raise exception 'This scorecard was closed at the reveal'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger calibration_submissions_guard before update or delete on public.calibration_submissions for each row execute function public.cal_submissions_guard();

create or replace function public.cal_audit_append_only() returns trigger
language plpgsql as $$ begin raise exception 'The audit trail is append-only'; end $$;
create trigger calibration_audit_append_only before update or delete on public.calibration_audit for each row execute function public.cal_audit_append_only();

/* ---------- row-level security (reads) ---------- */

alter table public.calibration_people enable row level security;
alter table public.calibration_sessions enable row level security;
alter table public.calibration_reviewers enable row level security;
alter table public.calibration_submissions enable row level security;
alter table public.calibration_submission_versions enable row level security;
alter table public.calibration_decisions enable row level security;
alter table public.calibration_notes enable row level security;
alter table public.calibration_attendance enable row level security;
alter table public.calibration_actions enable row level security;
alter table public.calibration_audit enable row level security;

create policy people_read on public.calibration_people for select to authenticated using (true);
create policy sessions_read on public.calibration_sessions for select to authenticated using (public.cal_can_view(id));
create policy reviewers_read on public.calibration_reviewers for select to authenticated using (public.cal_can_view(session_id));
-- Your own scorecard always; anyone else's only after the reveal, and only for QA-side participants.
create policy submissions_read on public.calibration_submissions for select to authenticated using (
  reviewer_id = public.cal_me()
  or (status = 'submitted' and public.cal_qa_side(session_id)
      and exists (select 1 from public.calibration_sessions s where s.id = session_id and s.revealed_at is not null)));
create policy versions_read on public.calibration_submission_versions for select to authenticated using (
  exists (select 1 from public.calibration_submissions x where x.id = submission_id and (x.reviewer_id = public.cal_me() or public.cal_is_manager())));
-- Agents never read this table directly (it holds internal notes); they use cal_agent_outcome().
create policy decisions_read on public.calibration_decisions for select to authenticated using (
  public.cal_qa_side(session_id)
  and (public.cal_runner(session_id) or exists (select 1 from public.calibration_sessions s where s.id = session_id
       and s.status in ('discussion', 'in_progress', 'awaiting_final_decision', 'completed'))));
create policy notes_read on public.calibration_notes for select to authenticated using (
  public.cal_can_view(session_id) and (not private or public.cal_qa_side(session_id)));
create policy attendance_read on public.calibration_attendance for select to authenticated using (public.cal_can_view(session_id));
create policy actions_read on public.calibration_actions for select to authenticated using (
  public.cal_can_view(session_id) and (public.cal_qa_side(session_id) or owner_id = public.cal_me()
    or (kind <> 'rubric' and exists (select 1 from public.calibration_sessions s where s.id = session_id and s.status = 'completed'))));
create policy audit_read on public.calibration_audit for select to authenticated using (public.cal_runner(session_id));
-- No insert/update/delete policies: all writes go through the functions below.

/* ---------- functions (writes) ---------- */

create or replace function public.cal_session_for(p_session uuid) returns public.calibration_sessions
language plpgsql stable security definer set search_path = public as $$
declare s public.calibration_sessions;
begin
  select * into s from public.calibration_sessions where id = p_session;
  if not found or not public.cal_can_view(p_session) then raise exception 'Calibration not found' using errcode = 'P0002'; end if;
  return s;
end $$;

create or replace function public.cal_set_status(p_session uuid, p_to text, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare s public.calibration_sessions := public.cal_session_for(p_session);
begin
  if p_to in ('scheduled', 'cancelled') and not public.cal_is_manager() then raise exception 'Only QA admins and QA Leads can do this'; end if;
  if p_to in ('awaiting_submissions', 'in_progress', 'awaiting_final_decision', 'discussion') and not public.cal_runner(p_session) then
    raise exception 'Only the facilitator or a QA Lead can do this';
  end if;
  if p_to in ('completed', 'ready_to_reveal') or (p_to = 'discussion' and s.status <> 'awaiting_final_decision') then
    raise exception 'Use the reveal / finalize functions for this step';
  end if;
  if p_to = 'scheduled' and (s.connection_id = '' or s.scheduled_at is null or s.facilitator_id is null
     or (select count(*) from public.calibration_reviewers where session_id = s.id) < case when s.format = 'blind' then 2 else 1 end) then
    raise exception 'Finish the setup before publishing';
  end if;
  if p_to in ('cancelled', 'awaiting_final_decision') and coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason'; end if;
  perform set_config('cal.rpc', 'on', true);
  update public.calibration_sessions set status = p_to,
    escalation = case when p_to = 'awaiting_final_decision' then jsonb_build_object('by', public.cal_me(), 'at', now(), 'reason', p_reason) else escalation end
    where id = s.id;
  if p_reason <> '' then perform public.cal_log(s.id, p_to, p_reason); end if;
end $$;

create or replace function public.cal_save_submission(p_session uuid, p_ratings jsonb, p_comment text default null, p_submit boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.calibration_sessions := public.cal_session_for(p_session);
  me uuid := public.cal_me();
begin
  if not exists (select 1 from public.calibration_reviewers where session_id = s.id and person_id = me) then raise exception 'Only assigned reviewers submit scorecards'; end if;
  if not public.cal_needs_submissions(s) then raise exception 'This session does not use individual scorecards'; end if;
  if s.status <> 'awaiting_submissions' then raise exception 'Scorecards are not open for this session'; end if;
  insert into public.calibration_submissions (session_id, reviewer_id) values (s.id, me) on conflict (session_id, reviewer_id) do nothing;
  update public.calibration_submissions
     set ratings = ratings || coalesce(p_ratings, '{}'), overall_comment = coalesce(p_comment, overall_comment)
   where session_id = s.id and reviewer_id = me;          -- the trigger rejects this if already submitted
  if p_submit then
    -- Completeness is checked against the scorecard by the API layer; here we require at least one rating with a value.
    if not exists (select 1 from public.calibration_submissions x, jsonb_each(x.ratings) r
                   where x.session_id = s.id and x.reviewer_id = me and coalesce(r.value->>'value', '') <> '') then
      raise exception 'Rate every item before submitting';
    end if;
    update public.calibration_submissions set status = 'submitted', submitted_at = now() where session_id = s.id and reviewer_id = me;
    perform public.cal_log(s.id, 'submitted', 'scorecard locked');
    if not exists (select 1 from public.calibration_reviewers r where r.session_id = s.id
                   and not exists (select 1 from public.calibration_submissions x where x.session_id = s.id and x.reviewer_id = r.person_id and x.status = 'submitted')) then
      perform set_config('cal.rpc', 'on', true);
      update public.calibration_sessions set status = 'ready_to_reveal' where id = s.id;
    end if;
  end if;
end $$;

create or replace function public.cal_reopen_submission(p_session uuid, p_reviewer uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.calibration_sessions := public.cal_session_for(p_session);
  x public.calibration_submissions;
begin
  if not public.cal_is_manager() then raise exception 'Only QA admins and QA Leads can reopen a submission'; end if;
  if s.status not in ('awaiting_submissions', 'ready_to_reveal') then raise exception 'Submissions can only be reopened before the reveal'; end if;
  if length(coalesce(trim(p_reason), '')) < 10 then raise exception 'Give a reason (at least 10 characters)'; end if;
  select * into x from public.calibration_submissions where session_id = s.id and reviewer_id = p_reviewer and status = 'submitted';
  if not found then raise exception 'That reviewer has not submitted'; end if;
  insert into public.calibration_submission_versions (submission_id, ratings, overall_comment, submitted_at, reopened_by, reason)
    values (x.id, x.ratings, x.overall_comment, x.submitted_at, public.cal_me(), trim(p_reason));
  perform set_config('cal.reopen', 'on', true);
  update public.calibration_submissions set status = 'draft', submitted_at = null where id = x.id;
  perform set_config('cal.reopen', 'off', true);
  perform public.cal_log(s.id, 'reopened', trim(p_reason));
  if s.status = 'ready_to_reveal' then
    perform set_config('cal.rpc', 'on', true);
    update public.calibration_sessions set status = 'awaiting_submissions' where id = s.id;
  end if;
end $$;

create or replace function public.cal_reveal(p_session uuid, p_exception_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.calibration_sessions := public.cal_session_for(p_session);
begin
  if not public.cal_runner(p_session) then raise exception 'Only the facilitator or a QA Lead can reveal results'; end if;
  if not exists (select 1 from public.calibration_submissions where session_id = s.id and status = 'submitted') then raise exception 'Nobody has submitted yet'; end if;
  if s.status = 'awaiting_submissions' then
    if not public.cal_is_manager() then raise exception 'All reviewers must submit before the reveal'; end if;
    if length(coalesce(trim(p_exception_reason), '')) < 10 then raise exception 'Give a reason for revealing early'; end if;
    update public.calibration_sessions set reveal_exception = jsonb_build_object('by', public.cal_me(), 'at', now(), 'reason', trim(p_exception_reason)) where id = s.id;
    perform public.cal_log(s.id, 'reveal_exception', trim(p_exception_reason));
  elsif s.status <> 'ready_to_reveal' then
    raise exception 'Nothing to reveal yet';
  end if;
  update public.calibration_submissions set status = 'closed' where session_id = s.id and status = 'draft';
  perform set_config('cal.rpc', 'on', true);
  update public.calibration_sessions set revealed_at = now(), status = 'discussion' where id = s.id;
end $$;

-- Submission status for the facilitator before the reveal: who has submitted, never what.
create or replace function public.cal_submission_status(p_session uuid)
returns table (reviewer_id uuid, status text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.person_id, coalesce(x.status, 'not_started'), x.submitted_at
  from public.calibration_reviewers r
  left join public.calibration_submissions x on x.session_id = r.session_id and x.reviewer_id = r.person_id
  where r.session_id = p_session and public.cal_qa_side(p_session)
$$;

create or replace function public.cal_add_note(p_session uuid, p_body text, p_kind text default 'note', p_criterion text default '', p_ts text default '', p_private boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.calibration_sessions := public.cal_session_for(p_session);
  nid uuid;
begin
  if s.status not in ('discussion', 'in_progress', 'awaiting_final_decision') then raise exception 'Discussion is not open'; end if;
  insert into public.calibration_notes (session_id, author_id, body, kind, criterion_id, ts, private)
    values (s.id, public.cal_me(), trim(p_body), p_kind, coalesce(p_criterion, ''), coalesce(p_ts, ''),
            s.format = 'agent' and public.cal_role(s.id) <> 'agent' and p_private)
    returning id into nid;
  return nid;
end $$;

create or replace function public.cal_save_decision(p_session uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s public.calibration_sessions := public.cal_session_for(p_session);
begin
  if not public.cal_runner(p_session) then raise exception 'Only the facilitator or a QA Lead can record the decision'; end if;
  if s.status not in ('discussion', 'in_progress', 'awaiting_final_decision') then raise exception 'The decision can be recorded once discussion starts'; end if;
  insert into public.calibration_decisions (session_id) values (s.id) on conflict do nothing;
  update public.calibration_decisions d set
    ratings = d.ratings || coalesce(p_patch->'ratings', '{}'),
    rationale = coalesce(p_patch->>'rationale', d.rationale),
    learning_points = coalesce(p_patch->>'learningPoints', d.learning_points),
    rubric_clarifications = coalesce(p_patch->>'rubricClarifications', d.rubric_clarifications),
    internal_notes = coalesce(p_patch->>'internalNotes', d.internal_notes),
    coaching_points = coalesce(p_patch->>'coachingPoints', d.coaching_points),
    agreed_expectations = coalesce(p_patch->>'agreedExpectations', d.agreed_expectations),
    updated_by = public.cal_me(), updated_at = now()
  where d.session_id = s.id and d.finalized_at is null;
  perform public.cal_log(s.id, 'decision_saved');
end $$;

create or replace function public.cal_finalize(p_session uuid, p_consensus text, p_lead_reason text, p_share_with text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.calibration_sessions := public.cal_session_for(p_session);
  d public.calibration_decisions;
begin
  if not public.cal_runner(p_session) then raise exception 'Only the facilitator or a QA Lead can finalize'; end if;
  if p_consensus = 'lead_decision' and not public.cal_is_manager() then raise exception 'Only a QA Lead or admin can make the final call without consensus'; end if;
  if p_consensus = 'lead_decision' and length(coalesce(trim(p_lead_reason), '')) < 10 then raise exception 'Record why the QA Lead made the final call'; end if;
  select * into d from public.calibration_decisions where session_id = s.id;
  if not found or d.rationale = '' or d.ratings = '{}' then raise exception 'Record the final ratings and rationale first'; end if;
  if exists (select 1 from jsonb_each(d.ratings) r where (r.value->>'disputed')::boolean and coalesce(r.value->>'resolution', '') = '') then
    raise exception 'Add a resolution note for every disputed item';
  end if;
  update public.calibration_decisions set consensus = p_consensus, lead_reason = case when p_consensus = 'lead_decision' then trim(p_lead_reason) else '' end,
    share_with = array(select unnest(p_share_with) intersect select unnest(case when s.format = 'agent' then array['participants', 'agent', 'team'] else array['participants', 'team'] end)),
    finalized_by = public.cal_me(), finalized_at = now()
  where session_id = s.id;
  perform set_config('cal.rpc', 'on', true);
  update public.calibration_sessions set status = 'completed' where id = s.id;
  perform public.cal_log(s.id, 'finalized', p_consensus);
end $$;

-- What an agent may see of the outcome: agreed ratings and coaching, never internal notes.
create or replace function public.cal_agent_outcome(p_session uuid)
returns table (ratings jsonb, rationale text, coaching_points text, agreed_expectations text, finalized_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.ratings, d.rationale, d.coaching_points, d.agreed_expectations, d.finalized_at
  from public.calibration_decisions d join public.calibration_sessions s on s.id = d.session_id
  where d.session_id = p_session and s.status = 'completed' and s.agent_id = public.cal_me() and 'agent' = any (d.share_with)
$$;

-- Create or edit (Draft / Scheduled only). p_agent_ref comes from the Call Library record for the
-- chosen Connection ID, so an Agent Session's agent is always the agent on that call.
create or replace function public.cal_save_session(p_id uuid, p_data jsonb, p_reviewers uuid[], p_agent_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := p_id;
  fmt text := coalesce(p_data->>'format', 'blind');
  agent uuid;
begin
  if not public.cal_is_manager() then raise exception 'Only QA admins and QA Leads can create or edit calibrations'; end if;
  if fmt = 'agent' then
    select id into agent from public.calibration_people where agent_ref = p_agent_ref and role = 'agent';
  end if;
  if sid is null then
    insert into public.calibration_sessions (format, pre_review, created_by) values (fmt, fmt = 'blind', public.cal_me()) returning id into sid;
    perform public.cal_log(sid, 'created', fmt);
  elsif not exists (select 1 from public.calibration_sessions where id = sid and status in ('draft', 'scheduled')) then
    raise exception 'Only Draft or Scheduled calibrations can be edited';
  else
    perform public.cal_log(sid, 'edited');
  end if;
  update public.calibration_sessions set
    title = coalesce(p_data->>'title', title), format = fmt, connection_id = coalesce(p_data->>'connectionId', connection_id),
    scheduled_at = coalesce((p_data->>'scheduledAt')::timestamptz, scheduled_at), facilitator_id = coalesce((p_data->>'facilitatorId')::uuid, facilitator_id),
    goal = coalesce(p_data->>'goal', goal), scorecard_id = coalesce(p_data->>'scorecardId', scorecard_id),
    baseline = coalesce((p_data->>'baseline')::numeric, baseline), instructions = coalesce(p_data->>'instructions', instructions),
    meeting_link = coalesce(p_data->>'meetingLink', meeting_link), pre_review = fmt = 'blind' or coalesce((p_data->>'preReview')::boolean, pre_review),
    recurring = coalesce(p_data->'recurring', recurring), agent_id = agent
  where id = sid;
  if p_reviewers is not null then
    if fmt in ('blind') or coalesce((p_data->>'preReview')::boolean, false) then
      if (select facilitator_id from public.calibration_sessions where id = sid) = any (p_reviewers) then
        raise exception 'The facilitator cannot also be a reviewer when scorecards are blind';
      end if;
    end if;
    if exists (select 1 from public.calibration_people where id = any (p_reviewers) and role = 'agent') then raise exception 'Reviewers must be QA team members'; end if;
    delete from public.calibration_reviewers where session_id = sid;
    insert into public.calibration_reviewers select sid, unnest(p_reviewers);
  end if;
  return sid;
end $$;

create or replace function public.cal_set_attendance(p_session uuid, p_person uuid, p_attended boolean, p_contributed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.cal_session_for(p_session);
  if not public.cal_runner(p_session) then raise exception 'Only the facilitator or a QA Lead can track attendance'; end if;
  insert into public.calibration_attendance values (p_session, p_person, p_attended, p_contributed)
    on conflict (session_id, person_id) do update set attended = excluded.attended, contributed = excluded.contributed;
end $$;

create or replace function public.cal_add_action(p_session uuid, p_body text, p_owner uuid, p_due date, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.calibration_sessions := public.cal_session_for(p_session);
  aid uuid;
begin
  if not public.cal_runner(p_session) then raise exception 'Only the facilitator or a QA Lead can add action items'; end if;
  if exists (select 1 from public.calibration_people where id = p_owner and role = 'agent') and p_owner is distinct from s.agent_id then
    raise exception 'Pick an owner from the QA team or this session''s agent';
  end if;
  insert into public.calibration_actions (session_id, body, owner_id, due_date, kind, created_by)
    values (s.id, trim(p_body), p_owner, p_due, p_kind, public.cal_me()) returning id into aid;
  perform public.cal_log(s.id, 'action_added', p_kind);
  return aid;
end $$;

create or replace function public.cal_set_action_done(p_action uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.calibration_actions;
begin
  select * into a from public.calibration_actions where id = p_action;
  if not found or not public.cal_can_view(a.session_id) then raise exception 'Action not found'; end if;
  if not (public.cal_runner(a.session_id) or a.owner_id = public.cal_me()) then raise exception 'Only the owner, facilitator or a QA Lead can update this action'; end if;
  update public.calibration_actions set status = case when p_done then 'done' else 'open' end, completed_at = case when p_done then now() end where id = p_action;
  perform public.cal_log(a.session_id, case when p_done then 'action_done' else 'action_reopened' end);
end $$;

revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- Clients must not write audit entries or flip internal flags themselves.
revoke execute on function public.cal_log(uuid, text, text) from public, authenticated;
