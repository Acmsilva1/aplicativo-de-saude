-- Allow students without a professor after the linked professor is deleted.
-- Create/update still require a professor in application logic; orphaned
-- students are temporary and surface a Contas badge for reassignment.
alter table public.health_user_roles
  drop constraint if exists health_user_roles_professor_link_check;

alter table public.health_user_roles
  add constraint health_user_roles_professor_link_check check (
    (role = 'student')
    or (role in ('admin', 'professor') and professor_id is null)
  );
