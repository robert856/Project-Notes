-- Run once in a new Supabase project using the SQL editor or Supabase CLI.
create table public.projects (id uuid primary key default gen_random_uuid(), title text not null, created_at timestamptz not null default now());
create table public.project_members (project_id uuid references public.projects on delete cascade, user_id uuid references auth.users on delete cascade, role text not null check(role in ('owner','editor','viewer')), primary key(project_id,user_id));
create table public.boards (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,title text not null,description text not null default '',created_at timestamptz not null default now());
create table public.cards (id uuid primary key default gen_random_uuid(),board_id uuid not null references public.boards on delete cascade,title text not null default '',content text not null default '',kind text not null check(kind in ('text','image','checklist','link','file','group')),x double precision not null default 0,y double precision not null default 0,width double precision not null default 280,height double precision not null default 230,color text not null default 'white',version integer not null default 1,updated_at timestamptz not null default now());
create table public.attachments (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,card_id uuid not null references public.cards on delete cascade,path text unique not null,name text not null);
create table public.project_invites (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,email text not null check(email=lower(trim(email))),role text not null check(role in ('owner','editor','viewer')),unique(project_id,email));
create index on public.project_members(user_id);
create index on public.boards(project_id);
create index on public.cards(board_id);
create index on public.attachments(card_id);
create function public.project_role(p_id uuid) returns text language sql stable security definer set search_path=public as $$select role from public.project_members where project_id=p_id and user_id=auth.uid()$$;
revoke all on function public.project_role(uuid) from public;
grant execute on function public.project_role(uuid) to authenticated;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.boards enable row level security;
alter table public.cards enable row level security;
alter table public.attachments enable row level security;
alter table public.project_invites enable row level security;
create policy project_read on public.projects for select to authenticated using(public.project_role(id) is not null);
create policy project_edit on public.projects for update to authenticated using(public.project_role(id)='owner') with check(public.project_role(id)='owner');
create policy project_delete on public.projects for delete to authenticated using(public.project_role(id)='owner');
create policy members_read on public.project_members for select to authenticated using(public.project_role(project_id) is not null);
-- Membership writes only through invitation claim; owners cannot accidentally remove the last owner.
create policy boards_read on public.boards for select to authenticated using(public.project_role(project_id) is not null);
create policy boards_insert on public.boards for insert to authenticated with check(public.project_role(project_id) in ('owner','editor'));
create policy boards_edit on public.boards for update to authenticated using(public.project_role(project_id) in ('owner','editor')) with check(public.project_role(project_id) in ('owner','editor'));
create policy boards_delete on public.boards for delete to authenticated using(public.project_role(project_id) in ('owner','editor'));
create function public.board_role(p_id uuid) returns text language sql stable security definer set search_path=public as $$select public.project_role(project_id) from public.boards where id=p_id$$;
revoke all on function public.board_role(uuid) from public;
grant execute on function public.board_role(uuid) to authenticated;
create policy cards_read on public.cards for select to authenticated using(public.board_role(board_id) is not null);
create policy cards_insert on public.cards for insert to authenticated with check(public.board_role(board_id) in ('owner','editor') and version=1);
create policy cards_delete on public.cards for delete to authenticated using(public.board_role(board_id) in ('owner','editor'));
-- No direct UPDATE grant: every write must compare the stored version atomically.
revoke update on public.cards from anon,authenticated;
create function public.save_card(p_id uuid,p_version integer,p_title text,p_content text,p_x double precision,p_y double precision,p_width double precision,p_height double precision,p_color text) returns public.cards language plpgsql security definer set search_path=public as $$
declare result public.cards;
begin
 if not exists(select 1 from public.cards where id=p_id and public.board_role(board_id) in ('owner','editor')) then raise exception 'Access denied'; end if;
 update public.cards set title=p_title,content=p_content,x=p_x,y=p_y,width=greatest(210,p_width),height=greatest(150,p_height),color=p_color,version=version+1,updated_at=now() where id=p_id and version=p_version returning * into result;
 if result.id is null then raise exception 'CONFLICT: card version changed'; end if;
 return result;
end $$;
revoke all on function public.save_card(uuid,integer,text,text,double precision,double precision,double precision,double precision,text) from public;
grant execute on function public.save_card(uuid,integer,text,text,double precision,double precision,double precision,double precision,text) to authenticated;
create function public.create_project(p_title text) returns uuid language plpgsql security definer set search_path=public as $$declare pid uuid; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.projects(title) values(p_title) returning id into pid;
 insert into public.project_members values(pid,auth.uid(),'owner');return pid;
end $$;
revoke all on function public.create_project(text) from public;
grant execute on function public.create_project(text) to authenticated;
create policy invites_owner on public.project_invites for all to authenticated using(public.project_role(project_id)='owner') with check(public.project_role(project_id)='owner');
create function public.claim_invites() returns void language plpgsql security definer set search_path=public as $$declare verified_email text;begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then return; end if;
 insert into public.project_members(project_id,user_id,role) select project_id,auth.uid(),role from public.project_invites where email=verified_email on conflict(project_id,user_id) do nothing;
 delete from public.project_invites where email=verified_email;
end $$;
revoke all on function public.claim_invites() from public;
grant execute on function public.claim_invites() to authenticated;
create policy attachments_read on public.attachments for select to authenticated using(public.project_role(project_id) is not null);
create policy attachments_insert on public.attachments for insert to authenticated with check(public.project_role(project_id) in ('owner','editor') and exists(select 1 from public.boards b join public.cards c on c.board_id=b.id where c.id=card_id and b.project_id=attachments.project_id) and split_part(path,'/',1)=project_id::text);
create policy attachments_delete on public.attachments for delete to authenticated using(public.project_role(project_id) in ('owner','editor'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attachments','attachments',false,20971520,null);
-- Compare text, not a UUID cast: malformed paths fail closed without cast errors.
create function public.storage_role(p_path text) returns text language sql stable security definer set search_path=public as $$select m.role from public.project_members m where m.project_id::text=split_part(p_path,'/',1) and m.user_id=auth.uid()$$;
revoke all on function public.storage_role(text) from public;
grant execute on function public.storage_role(text) to authenticated;
create policy files_read on storage.objects for select to authenticated using(bucket_id='attachments' and public.storage_role(name) is not null);
create policy files_insert on storage.objects for insert to authenticated with check(bucket_id='attachments' and public.storage_role(name) in ('owner','editor'));
create policy files_delete on storage.objects for delete to authenticated using(bucket_id='attachments' and public.storage_role(name) in ('owner','editor'));
