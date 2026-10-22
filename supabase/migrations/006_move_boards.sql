-- Move a board and its attachment ownership in one transaction.
-- Blob paths stay stable; access follows the attachment's current board.
-- Keep a durable binding so deleting metadata cannot restore access to a former project.
create table public.attachment_board_paths(path text primary key,board_id uuid not null);
alter table public.attachment_board_paths enable row level security;
revoke all on public.attachment_board_paths from anon,authenticated;
create or replace function public.storage_role(p_path text) returns text language plpgsql stable security definer set search_path=public as $$
declare result text;
begin
 if exists(select 1 from public.attachment_board_paths where path=p_path) then
   return (select public.board_role(r.board_id) from public.attachment_board_paths r where r.path=p_path and exists(select 1 from public.cards c where c.board_id=r.board_id and c.content=p_path and c.deleted_at is null));
 end if;
 if exists(select 1 from public.attachments where path=p_path) then
   select public.board_role(c.board_id) into result from public.attachments a join public.cards c on c.id=a.card_id where a.path=p_path and c.deleted_at is null;
   return result;
 end if;
 return (select public.project_role(p.id) from public.projects p where p.id::text=split_part(p_path,'/',1));
end $$;
create function public.move_board(p_board uuid,p_from uuid,p_to uuid) returns public.boards language plpgsql security definer set search_path=public as $$
declare result public.boards;
begin
 select * into result from public.boards where id=p_board for update;
 if result.id is null or result.deleted_at is not null or result.is_project_canvas or result.project_id<>p_from then raise exception 'CONFLICT: board moved or no longer available'; end if;
 if coalesce(public.project_role(p_from),'') not in ('owner','editor') or coalesce(public.project_role(p_to),'') not in ('owner','editor') then raise exception 'You need edit access to both projects'; end if;
 insert into public.attachment_board_paths(path,board_id)
 select path,p_board from public.attachments where card_id in(select id from public.cards where board_id=p_board)
 on conflict(path) do update set board_id=excluded.board_id;
 update public.boards set project_id=p_to where id=p_board returning * into result;
 update public.attachments set project_id=p_to where card_id in(select id from public.cards where board_id=p_board);
 return result;
end $$;
revoke all on function public.move_board(uuid,uuid,uuid) from public;
grant execute on function public.move_board(uuid,uuid,uuid) to authenticated;
-- Cross-project moves must use the atomic function, including attachment ownership.
revoke update on public.boards from authenticated;
grant update(title,description) on public.boards to authenticated;

create or replace function public.undo_workspace(p_before jsonb,p_after jsonb) returns void language plpgsql security definer set search_path=public as $$
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
     elsif kind='projects' and item->>'title' is distinct from after_item->>'title' then
       update public.projects set title=item->>'title' where id=row_id and title=after_item->>'title' and deleted_at is null and public.project_role(id)='owner';
       if not found then raise exception 'CONFLICT: project title changed or access denied'; end if;
     elsif kind='boards' and item->>'project_id' is distinct from after_item->>'project_id' then
       perform public.move_board(row_id,(after_item->>'project_id')::uuid,(item->>'project_id')::uuid);
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
