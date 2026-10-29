-- LINE subjects are verified by the studio Edge endpoint; no public progress API.
create table public.line_oa_kit_learning_progress (
 line_subject text not null check (line_subject ~ '^U[0-9a-f]{32}$'),
 course_id text not null check (course_id in ('claude-01','claude-code','claude-api')),
 completed_count integer not null default 0,
 quiz_score integer not null default 0 check (quiz_score between 0 and 8),
 passed boolean not null default false,
 revision integer not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 primary key (line_subject,course_id),
 check (completed_count between 0 and case course_id when 'claude-01' then 6 when 'claude-code' then 7 else 8 end),
 check (not passed or (quiz_score >= 6 and completed_count=case course_id when 'claude-01' then 6 when 'claude-code' then 7 else 8 end))
);
alter table public.line_oa_kit_learning_progress enable row level security;
revoke all on public.line_oa_kit_learning_progress from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_learning_progress to service_role;
