ALTER TABLE public."NoticeBoard"
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public."NoticeBoard"
  ADD CONSTRAINT "NoticeBoard_attachments_array_check"
  CHECK (jsonb_typeof(attachments) = 'array');

CREATE INDEX IF NOT EXISTS "NoticeBoard_pinned_created_date_idx"
  ON public."NoticeBoard" (is_pinned DESC, created_date DESC);

-- Keep announcement attachments private and available only to chat members.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('notice-attachments', 'notice-attachments', false, 26214400)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Members can read notice attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notice-attachments' AND public.is_chat_member());

CREATE POLICY "Admins can upload notice attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'notice-attachments'
    AND public.is_chat_admin()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
