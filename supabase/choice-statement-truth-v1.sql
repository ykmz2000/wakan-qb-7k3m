ALTER TABLE public.choices ADD COLUMN IF NOT EXISTS statement_is_true boolean;
COMMENT ON COLUMN public.choices.statement_is_true IS 'Content truth independent of exam answer key. NULL means unknown or context-dependent; never infer from is_correct.';
