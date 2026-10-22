-- Back direct project-canvas notes with a private-to-the-project container.
-- It uses the existing note RLS/version/storage rules and is hidden only in navigation.
alter table public.boards add column is_project_canvas boolean not null default false;
create unique index one_live_project_canvas on public.boards(project_id) where is_project_canvas and deleted_at is null;
create function public.get_project_canvas(p_project uuid) returns public.boards language plpgsql security definer set search_path=public as $$
declare result public.boards;
begin
 if public.project_role(p_project) is null or public.project_role(p_project) not in ('owner','editor') then raise exception 'Access denied'; end if;
 insert into public.boards(project_id,title,is_project_canvas) values(p_project,'Project canvas',true)
 on conflict(project_id) where is_project_canvas and deleted_at is null do update set title=public.boards.title returning * into result;
 return result;
end $$;
revoke all on function public.get_project_canvas(uuid) from public;
grant execute on function public.get_project_canvas(uuid) to authenticated;
