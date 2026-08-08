begin;

-- Align storage bucket limit with the app/Vercel payload budget (4 MB).
update storage.buckets
set file_size_limit = 4000000
where id = 'council-attachments';

-- Drop unused pairwise critique target column; critiques are model-authored, not targeted.
alter table public.model_critiques
  drop column if exists target_model_id;

commit;
