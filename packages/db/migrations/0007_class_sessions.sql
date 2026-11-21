-- Per-class session dates. Written to be safe on databases that already have this table
-- (it was first shipped as an earlier 0006 migration on one branch before the merge).
CREATE TABLE IF NOT EXISTS "class_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "class_session_dates" CHECK ("class_session"."end_date" > "class_session"."start_date")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session" ADD CONSTRAINT "class_session_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session" ADD CONSTRAINT "class_session_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_session_year_class" ON "class_session" USING btree ("academic_year_id","class_id");
