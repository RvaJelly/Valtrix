-- is_trainer() only reads the caller's own profile, which RLS already allows,
-- so it does not need elevated rights.
alter function public.is_trainer() security invoker;
