-- Receipt numbers are now issued from explicit counters named "RECEIPT:<prefix>" (continuous)
-- or "RECEIPT:<prefix>:<academic year>" (restarts every year), and every receipt records which
-- counter and which number it used, independent of how the number is printed.

-- 1. Existing per-year counters ("RECEIPT:2026-27") become "RECEIPT:<current receipt prefix>:2026-27".
UPDATE "number_series"
SET "key" = 'RECEIPT:' || COALESCE((SELECT "receipt_prefix" FROM "school_settings" WHERE "id" = 1), 'RCT') || ':' || substring("key" from 9)
WHERE "key" ~ '^RECEIPT:[0-9]{4}-[0-9]{2}$';
--> statement-breakpoint
-- 2. Existing receipts (numbers like RCT/2026-27/000123) record their counter and number.
UPDATE "payment"
SET "receipt_series" = 'RECEIPT:' || split_part("receipt_no", '/', 1) || ':' || split_part("receipt_no", '/', 2),
    "receipt_seq" = split_part("receipt_no", '/', 3)::integer
WHERE "receipt_series" IS NULL AND "receipt_no" ~ '^[^/]+/[0-9]{4}-[0-9]{2}/[0-9]+$';
--> statement-breakpoint
-- 3. The school's fee heads and their fixed rows on receipts and bills (same list as packages/db/src/seed.ts).
-- Existing heads keep their name and amounts; only receipt settings that are still empty are filled in.
INSERT INTO "fee_head" ("code", "name", "type", "is_refundable", "sort_order", "receipt_order", "receipt_label") VALUES
  ('TUITION', 'Tuition Fee', 'recurring', false, 1, 1, 'Tuition Fees'),
  ('COMPUTER', 'Computer Fee', 'recurring', false, 5, 2, 'Computer fees'),
  ('LATE_FEE', 'Late Fee', 'optional', false, 90, 3, 'Charges on fine'),
  ('ADMISSION', 'Admission Fee', 'one_time', false, 2, 4, 'Admission fees'),
  ('FESTIVAL', 'Festival Fee', 'recurring', false, 10, 5, 'Festival fees'),
  ('DEVELOPMENT', 'Development Fee', 'recurring', false, 11, 6, 'Development fees'),
  ('EXAM', 'Examination Fee', 'recurring', false, 4, 7, 'Examination fees'),
  ('SPORTS', 'Sports Fee', 'recurring', false, 12, 8, 'Sports fees'),
  ('ELECTRIC', 'Electric Fee', 'recurring', false, 13, 9, 'Electric fees'),
  ('BADGE', 'Badge', 'optional', false, 20, 10, NULL),
  ('TIE', 'Tie', 'optional', false, 21, 11, NULL),
  ('BELT', 'Belt', 'optional', false, 22, 12, NULL),
  ('ID_CARD', 'ID Card', 'optional', false, 23, 13, NULL),
  ('BOOK_KHATA_DIARY', 'Book+Khata+Diary', 'optional', false, 24, 14, NULL),
  ('T_CERTIFICATE', 'T.Certificate', 'optional', false, 25, 15, NULL),
  ('FORM', 'Form', 'optional', false, 26, 16, NULL),
  ('MISC', 'Miscellaneous', 'optional', false, 91, 17, NULL)
ON CONFLICT ("code") DO UPDATE SET
  "receipt_order" = COALESCE("fee_head"."receipt_order", EXCLUDED."receipt_order"),
  "receipt_label" = COALESCE("fee_head"."receipt_label", EXCLUDED."receipt_label");
