-- Evaluations that score some prompts before a timeout or cancel stay resumable.
alter type public.run_status add value if not exists 'partial';
