-- Legacy Base44 imports left several Title rows without identifiers. Give
-- those rows stable IDs and ensure newly created tiers receive a UUID by default.
UPDATE public."Title"
SET id = gen_random_uuid()::text
WHERE id IS NULL;

ALTER TABLE public."Title"
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN id SET NOT NULL;
