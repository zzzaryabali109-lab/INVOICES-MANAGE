-- Create verification codes table
CREATE TABLE public.verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Users can view their own codes (for checking if verified)
CREATE POLICY "Users can view their own verification codes" ON public.verification_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Add email_verified field to profiles
ALTER TABLE public.profiles ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Index for quick lookups
CREATE INDEX idx_verification_codes_user_email ON public.verification_codes(user_id, email);
CREATE INDEX idx_verification_codes_expires ON public.verification_codes(expires_at);