ALTER TABLE "school_settings" ADD COLUMN "admission_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "admission_include_year" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "admission_separator" varchar(8) DEFAULT '/' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "admission_digits" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "admission_start_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "roll_digits" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "roll_prefix_section" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "school_settings" ADD COLUMN "roll_start_number" integer DEFAULT 1 NOT NULL;