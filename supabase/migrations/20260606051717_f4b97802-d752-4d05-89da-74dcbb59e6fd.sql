CREATE TABLE public.noc_records (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  container_number text not null,
  bl_number text,
  invoice_number text,
  generated_date timestamp with time zone not null default now(),
  status text not null default 'Pending Approval',
  approval_date timestamp with time zone,
  expiry_date timestamp with time zone,
  arrived_date timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.noc_records TO authenticated;
GRANT ALL ON public.noc_records TO service_role;

ALTER TABLE public.noc_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own noc records" ON public.noc_records
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own noc records" ON public.noc_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own noc records" ON public.noc_records
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own noc records" ON public.noc_records
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_noc_records_updated_at
  BEFORE UPDATE ON public.noc_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_noc_records_user ON public.noc_records(user_id);
CREATE INDEX idx_noc_records_container ON public.noc_records(container_number);