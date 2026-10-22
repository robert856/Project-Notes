-- Deletion is reversible; retain rows and memberships for authorized undo.
alter table public.projects add column deleted_at timestamptz;
alter table public.boards add column deleted_at timestamptz;
alter table public.cards add column deleted_at timestamptz;
create or replace function public.project_role(p_id uuid) returns text language sql stable security definer set search_path=public as $$select m.role from public.project_members m join public.projects p on p.id=m.project_id where m.project_id=p_id and m.user_id=auth.uid() and p.deleted_at is null$$;
create or replace function public.board_role(p_id uuid) returns text language sql stable security definer set search_path=public as $$select public.project_role(project_id) from public.boards where id=p_id and deleted_at is null$$;
drop policy boards_read on public.boards;
create policy boards_read on public.boards for select to authenticated using(deleted_at is null and public.project_role(project_id) is not null);
drop policy cards_read on public.cards;
create policy cards_read on public.cards for select to authenticated using(deleted_at is null and public.board_role(board_id) is not null);
create or replace function public.storage_role(p_path text) returns text language sql stable security definer set search_path=public as $$select public.project_role(p.id) from public.projects p where p.id::text=split_part(p_path,'/',1)$$;
-- Keep attachment records and blobs for undo; restrict records hidden by a deleted note.
drop policy attachments_read on public.attachments;
create policy attachments_read on public.attachments for select to authenticated using(public.project_role(project_id) is not null and exists(select 1 from public.cards c where c.id=card_id and c.deleted_at is null and public.board_role(c.board_id) is not null));
create or replace function public.save_card(p_id uuid,p_version integer,p_title text,p_content text,p_x double precision,p_y double precision,p_width double precision,p_height double precision,p_color text) returns public.cards language plpgsql security definer set search_path=public as $$
declare result public.cards;
begin
 update public.cards set title=p_title,content=p_content,x=p_x,y=p_y,width=greatest(210,p_width),height=greatest(150,p_height),color=p_color,version=version+1,updated_at=now()
 where id=p_id and version=p_version and deleted_at is null and public.board_role(board_id) in ('owner','editor') returning * into result;
 if result.id is null then raise exception 'CONFLICT: note changed or access denied'; end if;
 return result;
end $$;
create function public.trash_items(p_kind text,p_ids uuid[],p_versions jsonb default '{}'::jsonb) returns uuid[] language plpgsql security definer set search_path=public as $$
declare removed uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_kind='projects' then
   with changed as (update public.projects set deleted_at=now() where id=any(p_ids) and public.project_role(id)='owner' returning id) select coalesce(array_agg(id),'{}') into removed from changed;
 elsif p_kind='boards' then
   with changed as (update public.boards set deleted_at=now() where id=any(p_ids) and deleted_at is null and public.project_role(project_id) in ('owner','editor') returning id) select coalesce(array_agg(id),'{}') into removed from changed;
 elsif p_kind='cards' then
   with changed as (update public.cards set deleted_at=now(),version=version+1,updated_at=now() where id=any(p_ids) and deleted_at is null and version=(p_versions->>id::text)::integer and public.board_role(board_id) in ('owner','editor') returning id) select coalesce(array_agg(id),'{}') into removed from changed;
 else raise exception 'Invalid item type'; end if;
 return removed;
end $$;
revoke all on function public.trash_items(text,uuid[],jsonb) from public;
grant execute on function public.trash_items(text,uuid[],jsonb) to authenticated;
-- Undo is atomic: a failed permission/version check rolls back the entire operation.
-- Payloads are untrusted; only known fields of authorized existing rows can change.
create function public.undo_workspace(p_before jsonb,p_after jsonb) returns void language plpgsql security definer set search_path=public as $$
declare item jsonb; after_item jsonb; kind text; row_id uuid; pid uuid; allowed text; current_card public.cards;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 -- Restore ancestors first. Restoring a parent reveals existing descendants as they are,
 -- preserving memberships, attachments, and any newer descendant changes.
 foreach kind in array array['projects','boards','cards'] loop
   for item in select value from jsonb_array_elements(p_before->kind) loop
     row_id=(item->>'id')::uuid;
     select value into after_item from jsonb_array_elements(p_after->kind) where value->>'id'=item->>'id';
     if after_item is null then
       if kind='projects' then
         select role into allowed from public.project_members where project_id=row_id and user_id=auth.uid();
         if allowed is distinct from 'owner' then raise exception 'Access denied'; end if;
         update public.projects set deleted_at=null where id=row_id;
       elsif kind='boards' then
         select project_id into pid from public.boards where id=row_id;
         if public.project_role(pid) is null or public.project_role(pid) not in ('owner','editor') then raise exception 'Access denied'; end if;
         update public.boards set deleted_at=null where id=row_id;
       else
         select * into current_card from public.cards where id=row_id;
         if public.board_role(current_card.board_id) is null or public.board_role(current_card.board_id) not in ('owner','editor') then raise exception 'Access denied'; end if;
         update public.cards set deleted_at=null,version=version+1,updated_at=now() where id=row_id and deleted_at is not null;
       end if;
     elsif kind='cards' and (item - array['version','updated_at','deleted_at']) is distinct from (after_item - array['version','updated_at','deleted_at']) then
       perform public.save_card(row_id,(after_item->>'version')::integer,item->>'title',item->>'content',(item->>'x')::double precision,(item->>'y')::double precision,(item->>'width')::double precision,(item->>'height')::double precision,item->>'color');
     elsif kind='boards' and item->>'title' is distinct from after_item->>'title' then
       update public.boards set title=item->>'title' where id=row_id and title=after_item->>'title' and deleted_at is null and public.project_role(project_id) in ('owner','editor');
       if not found then raise exception 'CONFLICT: note changed or access denied'; end if;
     end if;
   end loop;
 end loop;
 -- Undo creations last, descendants before parents.
 foreach kind in array array['cards','boards','projects'] loop
   for after_item in select value from jsonb_array_elements(p_after->kind) loop
     if not exists(select 1 from jsonb_array_elements(p_before->kind) where value->>'id'=after_item->>'id') then
       row_id=(after_item->>'id')::uuid;
       if kind='cards' then
         if cardinality(public.trash_items(kind,array[row_id],jsonb_build_object(row_id::text,(after_item->>'version')::integer)))<>1 then raise exception 'CONFLICT: note changed or access denied'; end if;
       elsif cardinality(public.trash_items(kind,array[row_id]))<>1 then raise exception 'Access denied'; end if;
     end if;
   end loop;
 end loop;
end $$;
revoke all on function public.undo_workspace(jsonb,jsonb) from public;
grant execute on function public.undo_workspace(jsonb,jsonb) to authenticated;
