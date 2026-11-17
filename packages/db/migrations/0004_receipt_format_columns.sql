ALTER TABLE "fee_head" ADD COLUMN "receipt_order" integer;--> statement-breakpoint
ALTER TABLE "fee_head" ADD COLUMN "receipt_label" text;--> statement-breakpoint
ALTER TABLE "number_series" ADD COLUMN "start_value" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_series" varchar(64);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_seq" integer;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "header_subtitle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "udise_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "registration_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "receipt_include_year" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "receipt_digits" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_series_seq" ON "payment" USING btree ("receipt_series","receipt_seq");