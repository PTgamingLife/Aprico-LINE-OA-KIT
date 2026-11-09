alter table public.line_oa_kit_designs add column confirmed_revision integer;

create table public.line_oa_kit_chat_review_sessions (like public.line_oa_kit_chat_design_sessions including all);
alter table public.line_oa_kit_chat_review_sessions enable row level security;
revoke all on public.line_oa_kit_chat_review_sessions from public, anon, authenticated;
grant select, insert, update on public.line_oa_kit_chat_review_sessions to service_role;

create function public.line_oa_kit_confirm_chat_design(p_subject text,p_session uuid,p_next_session uuid,p_event text,p_config jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare
 s public.line_oa_kit_chat_review_sessions%rowtype;
 approved integer;
begin
 select * into s from public.line_oa_kit_chat_review_sessions
 where line_subject=p_subject and revision=p_session for update;
 if not found or s.state->>'step' is distinct from 'paidReview' then return null; end if;

 update public.line_oa_kit_designs d
 set config=p_config,
     revision=d.revision+(d.config is distinct from p_config)::integer,
     confirmed_revision=d.revision+(d.config is distinct from p_config)::integer,
     updated_at=now()
 where d.id=(s.state->>'id')::uuid and d.line_subject=p_subject
   and d.revision=(s.state->>'projectRevision')::integer
   and exists(select 1 from public.line_oa_kit_build_access a
     where a.project_id=d.id and a.line_subject=p_subject and a.grant_method='line_pay')
 returning d.revision into approved;
 if not found then return null; end if;

 update public.line_oa_kit_chat_review_sessions
 set revision=p_next_session,last_event=p_event,updated_at=now(),
     state=s.state || jsonb_build_object('step','paidConfirmed','projectRevision',approved)
 where line_subject=p_subject;
 return approved;
end;
$$;
revoke all on function public.line_oa_kit_confirm_chat_design(text,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.line_oa_kit_confirm_chat_design(text,uuid,uuid,text,jsonb) to service_role;
