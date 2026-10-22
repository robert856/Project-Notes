-- Home content belongs to a personal project and reuses all existing RLS/storage rules.
alter table public.projects add column home_owner uuid unique references auth.users(id) on delete cascade;
create function public.get_home_canvas() returns public.boards language plpgsql security definer set search_path=public as $$
declare pid uuid; result public.boards;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.projects(title,home_owner) values('Home',auth.uid())
 on conflict(home_owner) do update set deleted_at=null returning id into pid;
 insert into public.project_members(project_id,user_id,role) values(pid,auth.uid(),'owner') on conflict do nothing;
 result=public.get_project_canvas(pid);
 return result;
end $$;
revoke all on function public.get_home_canvas() from public;
grant execute on function public.get_home_canvas() to authenticated;
-- Client project edits are title-only. Home ownership is assigned by the RPC.
revoke update on public.projects from authenticated;
grant update(title) on public.projects to authenticated;
