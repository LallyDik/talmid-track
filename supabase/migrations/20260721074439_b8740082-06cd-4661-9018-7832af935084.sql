
-- Switch policy-helper functions from SECURITY DEFINER to SECURITY INVOKER.
-- Authenticated users can already read their own profile row and their own user_roles rows via RLS,
-- so these functions no longer need elevated privileges.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.get_my_yeshiva_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT yeshiva_id FROM public.profiles WHERE id = auth.uid() $$;
