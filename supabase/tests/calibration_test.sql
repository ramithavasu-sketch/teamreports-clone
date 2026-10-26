-- Database tests for Call Calibration. Run with scripts/test-db.sh against an
-- empty local Postgres. Any failed check stops the run with an error.
\set ON_ERROR_STOP 1
\set QUIET 1

-- Supabase stand-ins: roles and auth.uid().
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;

\i supabase/migrations/20261027000001_call_calibration.sql

create function public.t_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', msg; end if; end $$;
-- Runs as the caller, so RLS and grants apply.
create function public.t_fails(q text, pattern text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm !~* pattern then raise exception 'FAILED: % raised "%" (expected /%/)', q, sqlerrm, pattern; end if;
    return;
  end;
  raise exception 'FAILED: expected an error for: %', q;
end $$;
grant execute on function public.t_assert(boolean, text), public.t_fails(text, text) to authenticated;

insert into public.calibration_people (id, auth_user_id, name, role, agent_ref) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Admin', 'admin', null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Lead', 'qa_lead', null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Facilitator', 'qa', null),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'R1', 'qa', null),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'R2', 'qa', null),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'R3', 'qa', null),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007', 'Outsider', 'qa', null),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008', 'Agent', 'agent', 'AG1'),
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', 'Other agent', 'agent', 'AG2');

\set ADMIN '00000000-0000-0000-0000-000000000001'
\set LEAD '00000000-0000-0000-0000-000000000002'
\set FAC '00000000-0000-0000-0000-000000000003'
\set R1 '00000000-0000-0000-0000-000000000004'
\set R2 '00000000-0000-0000-0000-000000000005'
\set R3 '00000000-0000-0000-0000-000000000006'
\set OUT '00000000-0000-0000-0000-000000000007'
\set AGENT '00000000-0000-0000-0000-000000000008'
\set AGENT2 '00000000-0000-0000-0000-000000000009'
\set RATINGS '{"soft-open": {"value": "Good", "comment": "secret comment"}, "tech-notes": {"value": "Not Yet"}}'

set role authenticated;

\echo '--- blind session'
select set_config('request.jwt.claim.sub', :'R1', false);
select public.t_fails($$select public.cal_save_session(null, '{"title":"x"}', null)$$, 'Only QA admins');

select set_config('request.jwt.claim.sub', :'LEAD', false);
select public.cal_save_session(null, jsonb_build_object('title', 'Blind', 'format', 'blind', 'connectionId', 'CNX-1', 'scheduledAt', '2026-11-01T10:00Z', 'facilitatorId', :'FAC'),
  array[:'R1', :'R2', :'R3']::uuid[]) as sid \gset
select public.t_fails(format($$select public.cal_save_session(%L, '{"format":"blind"}', array[%L]::uuid[])$$, :'sid', :'FAC'), 'facilitator cannot also be a reviewer');

select set_config('request.jwt.claim.sub', :'R1', false);
select public.t_assert((select count(*) from public.calibration_sessions) = 0, 'drafts are hidden from reviewers');

select set_config('request.jwt.claim.sub', :'LEAD', false);
select public.cal_set_status(:'sid', 'scheduled');
select set_config('request.jwt.claim.sub', :'R1', false);
select public.t_fails(format($$select public.cal_set_status(%L, 'awaiting_submissions')$$, :'sid'), 'facilitator or a QA Lead');
select set_config('request.jwt.claim.sub', :'FAC', false);
select public.cal_set_status(:'sid', 'awaiting_submissions');

select set_config('request.jwt.claim.sub', :'OUT', false);
select public.t_assert((select count(*) from public.calibration_sessions) = 0, 'outsiders cannot see the session');
select public.t_fails(format($$select public.cal_save_submission(%L, '{}', null, true)$$, :'sid'), 'not found');

select set_config('request.jwt.claim.sub', :'R1', false);
select public.cal_save_submission(:'sid', :'RATINGS', 'overall', true);
select public.t_fails(format($$select public.cal_save_submission(%L, '{"soft-open":{"value":"Not Yet"}}', null, false)$$, :'sid'), 'locked');
select public.t_fails(format($$update public.calibration_submissions set ratings = '{}' where session_id = %L$$, :'sid'), 'permission denied');

select set_config('request.jwt.claim.sub', :'FAC', false);
select public.t_assert((select count(*) from public.calibration_submissions) = 0, 'facilitator cannot read verdicts before the reveal');
select public.t_assert((select status from public.cal_submission_status(:'sid') where reviewer_id = :'R1') = 'submitted', 'facilitator sees submission status');
select public.t_fails(format($$select public.cal_reveal(%L, 'we are out of time today')$$, :'sid'), 'All reviewers must submit');
select public.t_fails(format($$update public.calibration_sessions set status = 'discussion' where id = %L$$, :'sid'), 'permission denied');

select set_config('request.jwt.claim.sub', :'ADMIN', false);
select public.t_assert((select count(*) from public.calibration_submissions) = 0, 'admins cannot read verdicts before the reveal either');
select public.t_fails(format($$select public.cal_reveal(%L, 'short')$$, :'sid'), 'reason');
select public.t_fails($$insert into public.calibration_audit (action) values ('forged')$$, 'permission denied');
select public.t_fails($$select public.cal_log(null, 'forged')$$, 'permission denied');

select set_config('request.jwt.claim.sub', :'R2', false);
select public.t_assert((select count(*) from public.calibration_submissions) = 0, 'reviewers cannot read each other before the reveal');
select public.cal_save_submission(:'sid', :'RATINGS', null, true);
select set_config('request.jwt.claim.sub', :'R3', false);
select public.cal_save_submission(:'sid', '{"soft-open": {"value": "Not Yet"}}', null, true);
select public.t_assert((select status from public.calibration_sessions where id = :'sid') = 'ready_to_reveal', 'all submitted -> ready to reveal');

select set_config('request.jwt.claim.sub', :'LEAD', false);
select public.cal_reopen_submission(:'sid', :'R3', 'Scored the wrong call by mistake');
select public.t_assert((select status from public.calibration_sessions where id = :'sid') = 'awaiting_submissions', 'reopen moves back to awaiting submissions');
select public.t_assert((select count(*) from public.calibration_submission_versions) = 0, 'earlier versions stay blind before the reveal too');
select set_config('request.jwt.claim.sub', :'R3', false);
select public.cal_save_submission(:'sid', '{"soft-open": {"value": "Good"}}', null, true);

select set_config('request.jwt.claim.sub', :'FAC', false);
select public.cal_reveal(:'sid');
select public.t_assert((select count(*) from public.calibration_submissions) = 3, 'after the reveal the facilitator sees all verdicts');
select set_config('request.jwt.claim.sub', :'R2', false);
select public.t_assert((select count(*) from public.calibration_submissions) = 3, 'after the reveal reviewers see all verdicts');
select set_config('request.jwt.claim.sub', :'FAC', false);
select public.cal_save_decision(:'sid', '{"ratings": {"soft-open": {"value": "Good", "disputed": true}}, "rationale": "Agreed"}');
select public.t_fails(format($$select public.cal_finalize(%L, 'consensus', '', array['participants'])$$, :'sid'), 'resolution note');
select public.cal_save_decision(:'sid', '{"ratings": {"soft-open": {"value": "Good", "disputed": true, "resolution": "Rubric is clear"}}}');
select public.t_fails(format($$select public.cal_finalize(%L, 'lead_decision', 'I decided this one', array['participants'])$$, :'sid'), 'QA Lead or admin');
select public.cal_finalize(:'sid', 'consensus', '', array['participants', 'agent']);
select public.t_assert((select share_with from public.calibration_decisions where session_id = :'sid') = array['participants'], 'blind outcome cannot be shared with an agent');
select public.t_assert((select ratings->'tech-notes'->>'value' from public.calibration_submissions where reviewer_id = :'R1' and session_id = :'sid') = 'Not Yet', 'original verdict unchanged by the decision');
select public.t_fails(format($$select public.cal_set_status(%L, 'awaiting_final_decision', 'x')$$, :'sid'), 'cannot go from completed');

reset role;
select public.t_fails(format($$update public.calibration_submissions set ratings = '{}' where session_id = %L and reviewer_id = %L$$, :'sid', :'R1'), 'locked');
select public.t_fails(format($$update public.calibration_sessions set status = 'draft' where id = %L$$, :'sid'), 'must go through');
select public.t_fails($$delete from public.calibration_audit$$, 'append-only');
select public.t_assert((select count(*) from public.calibration_audit where action = 'reopened') = 1, 'reopen is audited');
select public.t_assert((select count(*) from public.calibration_submission_versions) = 1, 'reopen keeps the original version');
set role authenticated;

\echo '--- agent session'
select set_config('request.jwt.claim.sub', :'LEAD', false);
select public.cal_save_session(null, jsonb_build_object('title', 'Agent', 'format', 'agent', 'connectionId', 'CNX-2', 'scheduledAt', '2026-11-02T10:00Z', 'facilitatorId', :'FAC', 'instructions', 'internal prep'),
  array[:'R1']::uuid[], 'AG1') as aid \gset
select public.cal_set_status(:'aid', 'scheduled');
select set_config('request.jwt.claim.sub', :'FAC', false);
select public.cal_set_status(:'aid', 'in_progress');
select set_config('request.jwt.claim.sub', :'R1', false);
select public.t_fails(format($$select public.cal_save_submission(%L, '{}', null, true)$$, :'aid'), 'does not use individual scorecards');
select public.cal_add_note(:'aid', 'QA-only: agent sounded rushed', 'note', '', '', true);
select set_config('request.jwt.claim.sub', :'AGENT', false);
select public.cal_add_note(:'aid', 'System was slow', 'note', '', '01:52', true);
select public.t_assert((select count(*) from public.calibration_notes) = 1, 'agent sees only non-private notes');
select public.t_assert((select bool_and(not private) from public.calibration_notes), 'agent notes are never private');
select set_config('request.jwt.claim.sub', :'AGENT2', false);
select public.t_assert((select count(*) from public.calibration_sessions) = 0, 'other agents cannot see the session');
select set_config('request.jwt.claim.sub', :'FAC', false);
select public.t_fails(format($$select public.cal_add_action(%L, 'x', %L, null, 'coaching')$$, :'aid', :'AGENT2'), 'owner');
select public.cal_add_action(:'aid', 'Use the notes template', :'AGENT', '2026-11-10', 'coaching') as act \gset
select public.cal_add_action(:'aid', 'Fix rubric wording', :'LEAD', null, 'rubric');
select public.cal_set_attendance(:'aid', :'AGENT', true, true);
select public.cal_save_decision(:'aid', '{"ratings": {"soft-open": {"value": "Good"}}, "rationale": "Fine", "internalNotes": "SECRET", "coachingPoints": "Explain holds"}');
select set_config('request.jwt.claim.sub', :'AGENT', false);
select public.t_assert((select count(*) from public.calibration_decisions) = 0, 'agent cannot read the decisions table');
select public.t_assert((select count(*) from public.cal_agent_outcome(:'aid')) = 0, 'outcome hidden until finalized');
select public.t_assert((select count(*) from public.calibration_actions) = 1, 'agent sees only their own action before completion');
select public.cal_set_action_done(:'act', true);
select set_config('request.jwt.claim.sub', :'FAC', false);
select public.cal_finalize(:'aid', 'consensus', '', array['participants', 'agent']);
select set_config('request.jwt.claim.sub', :'AGENT', false);
select public.t_assert((select coaching_points from public.cal_agent_outcome(:'aid')) = 'Explain holds', 'agent sees shared coaching');
select public.t_assert((select count(*) from public.calibration_actions) = 1, 'rubric actions stay QA-only');
select public.t_assert((select count(*) from public.calibration_audit) = 0, 'agents cannot read the audit trail');

\echo '--- team session'
select set_config('request.jwt.claim.sub', :'LEAD', false);
select public.cal_save_session(null, jsonb_build_object('title', 'Team', 'format', 'team', 'connectionId', 'CNX-3', 'scheduledAt', '2026-11-03T10:00Z', 'facilitatorId', :'FAC', 'meetingLink', 'https://meet.google.com/abc'),
  array[:'R1', :'R2']::uuid[]) as tid \gset
select public.cal_set_status(:'tid', 'scheduled');
select set_config('request.jwt.claim.sub', :'FAC', false);
select public.cal_set_status(:'tid', 'in_progress');
select public.t_fails(format($$select public.cal_reveal(%L)$$, :'tid'), 'Nobody has submitted');
select public.cal_save_decision(:'tid', '{"ratings": {"soft-open": {"value": "Good"}}, "rationale": "Split"}');
select public.cal_set_status(:'tid', 'awaiting_final_decision', 'Split 2-2');
select public.t_fails(format($$select public.cal_finalize(%L, 'lead_decision', 'Applied the rubric', array['participants'])$$, :'tid'), 'QA Lead or admin');
select set_config('request.jwt.claim.sub', :'LEAD', false);
select public.cal_finalize(:'tid', 'lead_decision', 'Applied the rubric as written', array['participants', 'team']);
select public.t_assert((select consensus from public.calibration_decisions where session_id = :'tid') = 'lead_decision', 'QA Lead decision recorded');

\echo 'All calibration database tests passed.'
