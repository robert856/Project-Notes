-- One content-bearing page type, with unlimited nesting. Legacy data remains intact.
create table public.pages (
 id uuid primary key default gen_random_uuid(), parent_id uuid references public.pages(id),
 project_id uuid not null references public.projects(id), title text not null default 'Untitled page',
 kind text not null default 'page' check(kind in ('page','text','image','link','checklist','file','group')),
 content text not null default '', x double precision not null default 100, y double precision not null default 100,
 width double precision not null default 260 check(width>=170), height double precision not null default 200 check(height>=120),
 color text not null default 'white', version integer not null default 1,
 updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index pages_parent on public.pages(parent_id);
create index pages_project on public.pages(project_id);
create table public.page_files(path text not null,page_id uuid not null references public.pages(id),primary key(path,page_id));
alter table public.pages enable row level security;
alter table public.page_files enable row level security;
revoke all on public.pages,public.page_files from anon,authenticated;
grant select on public.pages to authenticated;
insert into public.pages(id,project_id,title,x,y)
 select id,id,title,100+((row_number() over(order by created_at,id)-1)%5)*220,100+((row_number() over(order by created_at,id)-1)/5)*200 from public.projects where home_owner is null and deleted_at is null;
insert into public.pages(id,parent_id,project_id,title,kind,content,x,y)
 select b.id,case when p.home_owner is null then p.id else null end,p.id,b.title,'page',b.description,
 100+((row_number() over(partition by p.id order by b.created_at,b.id)-1)%5)*220,100+((row_number() over(partition by p.id order by b.created_at,b.id)-1)/5)*200
 from public.boards b join public.projects p on p.id=b.project_id where not b.is_project_canvas and b.deleted_at is null and p.deleted_at is null;
insert into public.pages(id,parent_id,project_id,title,kind,content,x,y,width,height,color)
 select c.id,case when b.is_project_canvas then case when p.home_owner is null then p.id else null end else b.id end,p.id,c.title,c.kind,c.content,c.x,c.y,c.width,c.height,c.color
 from public.cards c join public.boards b on b.id=c.board_id join public.projects p on p.id=b.project_id where c.deleted_at is null and b.deleted_at is null and p.deleted_at is null;
insert into public.page_files(path,page_id) select distinct a.path,p.id from public.attachments a join public.pages p on (p.id=a.card_id or (p.kind='file' and p.content=a.path and p.project_id=a.project_id));
create function public.page_role(p_id uuid) returns text language sql stable security definer set search_path=public as $$
 with recursive ancestors as (select id,parent_id,deleted_at from public.pages where id=p_id union all select p.id,p.parent_id,p.deleted_at from public.pages p join ancestors a on p.id=a.parent_id)
 select public.project_role(project_id) from public.pages where id=p_id and not exists(select 1 from ancestors where deleted_at is not null)
$$;
revoke all on function public.page_role(uuid) from public;
grant execute on function public.page_role(uuid) to authenticated;
create policy pages_read on public.pages for select to authenticated using(public.page_role(id) is not null);
create or replace function public.storage_role(p_path text) returns text language plpgsql stable security definer set search_path=public as $$
begin
 if exists(select 1 from public.page_files where path=p_path) then
   return (select public.page_role(page_id) from public.page_files where path=p_path and public.page_role(page_id) is not null order by case public.page_role(page_id) when 'owner' then 0 when 'editor' then 1 else 2 end limit 1);
 end if;
 if exists(select 1 from public.attachment_board_paths where path=p_path) then
   return (select public.board_role(r.board_id) from public.attachment_board_paths r where r.path=p_path and exists(select 1 from public.cards c where c.board_id=r.board_id and c.content=p_path and c.deleted_at is null));
 end if;
 if exists(select 1 from public.attachments where path=p_path) then
   return (select public.board_role(c.board_id) from public.attachments a join public.cards c on c.id=a.card_id where a.path=p_path and c.deleted_at is null);
 end if;
 return (select public.project_role(id) from public.projects where id::text=split_part(p_path,'/',1));
end $$;
-- All hierarchy writes share a transaction lock, preventing simultaneous A->B/B->A cycles.
create function public.create_page(p_parent uuid,p_title text,p_kind text default 'page',p_content text default '',p_x float8 default 100,p_y float8 default 100) returns jsonb language plpgsql security definer set search_path=public as $$
declare pid uuid; result public.pages;
begin
 perform pg_advisory_xact_lock(74112891);
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_kind='file' and p_content<>'' then raise exception 'Upload files through the private attachment action'; end if;
 if p_parent is null then pid=public.create_project(p_title);
 else
   if coalesce(public.page_role(p_parent),'') not in ('owner','editor') then raise exception 'Edit access required'; end if;
   select project_id into pid from public.pages where id=p_parent;
 end if;
 insert into public.pages(parent_id,project_id,title,kind,content,x,y) values(p_parent,pid,coalesce(nullif(trim(p_title),''),'Untitled page'),p_kind,p_content,p_x,p_y) returning * into result;
 return jsonb_build_object('before','[]'::jsonb,'after',jsonb_build_array(to_jsonb(result)));
end $$;
create function public.save_pages(p_edits jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; old public.pages; result public.pages; previous jsonb='[]'; changed jsonb='[]';
begin
 perform pg_advisory_xact_lock(74112891);
 for item in select value from jsonb_array_elements(p_edits) loop
  select * into old from public.pages where id=(item->>'id')::uuid for update;
  if old.id is null or old.version<>(item->>'version')::integer or coalesce(public.page_role(old.id),'') not in ('owner','editor') then raise exception 'CONFLICT: page changed or edit access denied'; end if;
  if old.kind='file' and coalesce(item->>'content',old.content)<>old.content then raise exception 'File attachment cannot be replaced by an arbitrary path'; end if;
  update public.pages set title=coalesce(item->>'title',title),content=coalesce(item->>'content',content),x=coalesce((item->>'x')::float8,x),y=coalesce((item->>'y')::float8,y),width=coalesce((item->>'width')::float8,width),height=coalesce((item->>'height')::float8,height),color=coalesce(item->>'color',color),version=version+1,updated_at=now() where id=old.id returning * into result;
  previous=previous||jsonb_build_array(to_jsonb(old));changed=changed||jsonb_build_array(to_jsonb(result));
 end loop;
 return jsonb_build_object('before',previous,'after',changed);
end $$;
create function public.move_page(p_id uuid,p_version integer,p_parent uuid,p_x float8 default 100,p_y float8 default 100) returns jsonb language plpgsql security definer set search_path=public as $$
declare old public.pages; pid uuid; ids uuid[]; previous jsonb; changed jsonb;
begin
 perform pg_advisory_xact_lock(74112891);
 select * into old from public.pages where id=p_id;
 if old.id is null or old.version<>p_version or coalesce(public.page_role(p_id),'') not in ('owner','editor') then raise exception 'CONFLICT: page changed or edit access denied'; end if;
 if p_parent is not null and coalesce(public.page_role(p_parent),'') not in ('owner','editor') then raise exception 'Edit access to the destination is required'; end if;
 with recursive tree as(select id from public.pages where id=p_id union all select p.id from public.pages p join tree t on p.parent_id=t.id) select array_agg(id) into ids from tree;
 if p_parent=any(ids) then raise exception 'A page cannot be moved inside itself or its descendants'; end if;
 pid=old.project_id;
 if p_parent is not null then select project_id into pid from public.pages where id=p_parent; end if;
 select jsonb_agg(to_jsonb(p)) into previous from public.pages p where id=any(ids);
 update public.pages set project_id=pid,version=version+1,updated_at=now(),parent_id=case when id=p_id then p_parent else parent_id end,x=case when id=p_id then p_x else x end,y=case when id=p_id then p_y else y end where id=any(ids);
 select jsonb_agg(to_jsonb(p)) into changed from public.pages p where id=any(ids);
 return jsonb_build_object('before',previous,'after',changed);
end $$;
create function public.trash_pages(p_versions jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; ids uuid[]; previous jsonb; changed jsonb;
begin
 perform pg_advisory_xact_lock(74112891);
 for item in select key,value from jsonb_each_text(p_versions) loop
  if not exists(select 1 from public.pages where id=item.key::uuid and version=item.value::integer and public.page_role(id) in ('owner','editor')) then raise exception 'CONFLICT: page changed or edit access denied'; end if;
 end loop;
 with recursive tree as(select id from public.pages where p_versions ? id::text union select p.id from public.pages p join tree t on p.parent_id=t.id) select array_agg(id) into ids from tree;
 select coalesce(jsonb_agg(to_jsonb(p)),'[]') into previous from public.pages p where id=any(ids) and deleted_at is null;
 update public.pages set deleted_at=now(),version=version+1,updated_at=now() where id=any(ids) and deleted_at is null;
 select coalesce(jsonb_agg(to_jsonb(p)),'[]') into changed from public.pages p where id in(select (value->>'id')::uuid from jsonb_array_elements(previous));
 return jsonb_build_object('before',previous,'after',changed);
end $$;
create function public.attach_page_file(p_id uuid,p_version integer,p_path text) returns jsonb language plpgsql security definer set search_path=public as $$
declare old public.pages; result public.pages;
begin
 perform pg_advisory_xact_lock(74112891);
 select * into old from public.pages where id=p_id;
 if old.kind<>'file' or old.version<>p_version or coalesce(public.page_role(p_id),'') not in ('owner','editor') then raise exception 'CONFLICT: page changed or edit access denied'; end if;
 if split_part(p_path,'/',1)<>old.project_id::text or split_part(p_path,'/',2)<>old.id::text or not exists(select 1 from storage.objects where bucket_id='attachments' and name=p_path) then raise exception 'Invalid private attachment'; end if;
 insert into public.page_files(path,page_id) values(p_path,p_id) on conflict do nothing;
 update public.pages set content=p_path,version=version+1,updated_at=now() where id=p_id returning * into result;
 return jsonb_build_object('before',jsonb_build_array(to_jsonb(old)),'after',jsonb_build_array(to_jsonb(result)));
end $$;
-- Undo applies only the rows returned by a previous operation and refuses stale versions.
create function public.restore_pages(p_before jsonb,p_after jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; prior jsonb; old public.pages; changed jsonb; ids uuid[];
begin
 perform pg_advisory_xact_lock(74112891);
 select array_agg((value->>'id')::uuid) into ids from jsonb_array_elements(p_after);
 for item in select value from jsonb_array_elements(p_after) loop
  select * into old from public.pages where id=(item->>'id')::uuid;
  if old.id is null or old.version<>(item->>'version')::integer or coalesce(public.project_role(old.project_id),'') not in ('owner','editor') then raise exception 'CONFLICT: an affected page changed or access was lost'; end if;
  select value into prior from jsonb_array_elements(p_before) where value->>'id'=old.id::text;
  if prior is null then
   if exists(select 1 from public.pages where parent_id=old.id and deleted_at is null and not(id=any(ids))) then raise exception 'CONFLICT: this page has new children'; end if;
   update public.pages set deleted_at=now(),version=version+1,updated_at=now() where id=old.id;
  else
   if coalesce(public.project_role((prior->>'project_id')::uuid),'') not in ('owner','editor') then raise exception 'Edit access to the original location is required'; end if;
   if old.kind='file' and coalesce(prior->>'content','')<>'' and not exists(select 1 from public.page_files where page_id=old.id and path=prior->>'content') then raise exception 'Invalid file restore'; end if;
   update public.pages set parent_id=(prior->>'parent_id')::uuid,project_id=(prior->>'project_id')::uuid,title=prior->>'title',content=prior->>'content',x=(prior->>'x')::float8,y=(prior->>'y')::float8,width=(prior->>'width')::float8,height=(prior->>'height')::float8,color=prior->>'color',deleted_at=case when prior->>'deleted_at' is null then null else now() end,version=version+1,updated_at=now() where id=old.id;
  end if;
 end loop;
 if exists(select 1 from public.pages p join public.pages parent on parent.id=p.parent_id where p.project_id<>parent.project_id or (p.deleted_at is null and parent.deleted_at is not null)) then raise exception 'CONFLICT: hierarchy changed'; end if;
 if exists(with recursive tree as(select id,parent_id,array[id] as visited,false as cycle from public.pages where id=any(ids) union all select p.id,p.parent_id,t.visited||p.id,p.id=any(t.visited) from public.pages p join tree t on p.id=t.parent_id where not t.cycle) select 1 from tree where cycle) then raise exception 'A page cannot contain itself'; end if;
 select jsonb_agg(to_jsonb(p)) into changed from public.pages p where id=any(ids);
 return jsonb_build_object('before',p_after,'after',changed);
end $$;
revoke all on function public.create_page(uuid,text,text,text,float8,float8),public.save_pages(jsonb),public.move_page(uuid,integer,uuid,float8,float8),public.trash_pages(jsonb),public.attach_page_file(uuid,integer,text),public.restore_pages(jsonb,jsonb) from public;
grant execute on function public.create_page(uuid,text,text,text,float8,float8),public.save_pages(jsonb),public.move_page(uuid,integer,uuid,float8,float8),public.trash_pages(jsonb),public.attach_page_file(uuid,integer,text),public.restore_pages(jsonb,jsonb) to authenticated;
create function public.duplicate_page(p_id uuid,p_version integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare old public.pages; item record; pid uuid; copied public.pages; mapping jsonb='{}'; changed jsonb='[]'; nid uuid;
begin
 perform pg_advisory_xact_lock(74112891);
 select * into old from public.pages where id=p_id;
 if old.id is null or old.version<>p_version or coalesce(public.page_role(p_id),'') not in ('owner','editor') then raise exception 'CONFLICT: page changed or edit access denied'; end if;
 pid=old.project_id;if old.parent_id is null then pid=public.create_project(old.title||' — copy');end if;
 for item in with recursive tree as(select p.*,0 depth from public.pages p where id=p_id union all select p.*,t.depth+1 from public.pages p join tree t on p.parent_id=t.id where p.deleted_at is null) select * from tree order by depth,id loop
  nid=gen_random_uuid();mapping=mapping||jsonb_build_object(item.id::text,nid::text);
  insert into public.pages(id,parent_id,project_id,title,kind,content,x,y,width,height,color)
  values(nid,case when item.id=p_id then old.parent_id else (mapping->>item.parent_id::text)::uuid end,pid,item.title||case when item.id=p_id then ' — copy' else '' end,item.kind,item.content,item.x+case when item.id=p_id then 35 else 0 end,item.y+case when item.id=p_id then 35 else 0 end,item.width,item.height,item.color) returning * into copied;
  insert into public.page_files(path,page_id) select path,nid from public.page_files where page_id=item.id;
  changed=changed||jsonb_build_array(to_jsonb(copied));
 end loop;
 return jsonb_build_object('before','[]'::jsonb,'after',changed);
end $$;
revoke all on function public.duplicate_page(uuid,integer) from public;
grant execute on function public.duplicate_page(uuid,integer) to authenticated;
notify pgrst, 'reload schema';
-- Cached clients must fail visibly instead of writing into the preserved legacy backup.
revoke insert,update,delete on public.projects,public.boards,public.cards,public.attachments from authenticated;
revoke update(title) on public.projects from authenticated;
revoke update(title,description) on public.boards from authenticated;
revoke execute on function public.create_project(text),public.get_home_canvas(),public.get_project_canvas(uuid),public.save_card(uuid,integer,text,text,float8,float8,float8,float8,text),public.trash_items(text,uuid[],jsonb),public.undo_workspace(jsonb,jsonb),public.move_board(uuid,uuid,uuid) from authenticated;
