-- Preserve permission and concurrency checks when undoing project renames.
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
