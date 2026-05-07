alter table public.generation_jobs
  add column if not exists provider_http_status integer,
  add column if not exists provider_error_category text;
