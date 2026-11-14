CREATE TYPE "public"."enrollment_status" AS ENUM('studying', 'promoted', 'left', 'passed_out');--> statement-breakpoint
CREATE TABLE "student_enrollment" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"academic_year_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"section_id" integer,
	"roll_no" varchar(16),
	"status" "enrollment_status" DEFAULT 'studying' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "academic_year_id" integer;--> statement-breakpoint
ALTER TABLE "student_enrollment" ADD CONSTRAINT "student_enrollment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollment" ADD CONSTRAINT "student_enrollment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollment" ADD CONSTRAINT "student_enrollment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollment" ADD CONSTRAINT "student_enrollment_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_student_year" ON "student_enrollment" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "enrollment_year_class" ON "student_enrollment" USING btree ("academic_year_id","class_id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_year_idx" ON "payment" USING btree ("academic_year_id");--> statement-breakpoint
-- Backfill: tag every existing payment with the academic year its date falls in.
UPDATE "payment" p SET "academic_year_id" = y."id" FROM "academic_year" y WHERE p."academic_year_id" IS NULL AND p."date" BETWEEN y."start_date" AND y."end_date";
--> statement-breakpoint
-- Backfill: enrol every existing student in the current year with their current class.
INSERT INTO "student_enrollment" ("student_id", "academic_year_id", "class_id", "section_id", "roll_no", "status")
SELECT s."id", y."id", s."class_id", s."section_id", s."roll_no",
  (CASE s."status" WHEN 'active' THEN 'studying' WHEN 'left' THEN 'left' ELSE 'passed_out' END)::enrollment_status
FROM "student" s CROSS JOIN "academic_year" y WHERE y."is_current"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Backfill: any other year in which a student already has bills gets an enrolment too (same class, marked promoted).
INSERT INTO "student_enrollment" ("student_id", "academic_year_id", "class_id", "section_id", "roll_no", "status")
SELECT DISTINCT i."student_id", i."academic_year_id", s."class_id", s."section_id", s."roll_no", 'promoted'::enrollment_status
FROM "invoice" i JOIN "student" s ON s."id" = i."student_id"
ON CONFLICT DO NOTHING;
