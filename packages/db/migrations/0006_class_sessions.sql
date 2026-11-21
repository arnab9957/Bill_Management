CREATE TABLE "class_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "class_session_dates" CHECK ("class_session"."end_date" > "class_session"."start_date")
);
--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_session_year_class" ON "class_session" USING btree ("academic_year_id","class_id");