-- Add INSERT policy for verification_codes (managed by edge functions with service role)
-- These policies enable server-side management of verification codes

-- Users can insert their own verification codes
CREATE POLICY "Users can insert their own verification codes"
  ON public.verification_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own verification codes (mark as verified)
CREATE POLICY "Users can update their own verification codes"
  ON public.verification_codes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own verification codes
CREATE POLICY "Users can delete their own verification codes"
  ON public.verification_codes
  FOR DELETE
  USING (auth.uid() = user_id);