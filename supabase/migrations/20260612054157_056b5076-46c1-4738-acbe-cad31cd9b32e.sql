
-- Lock down verification_codes: remove client-side access; all verification logic must run server-side via service_role
DROP POLICY IF EXISTS "Users can view their own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can update their own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can insert their own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can delete their own verification codes" ON public.verification_codes;

REVOKE ALL ON public.verification_codes FROM anon, authenticated;
GRANT ALL ON public.verification_codes TO service_role;

-- Restrict SECURITY DEFINER trigger function: only trigger system / service_role should call it
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
