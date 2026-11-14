CREATE TYPE "public"."channel" AS ENUM('sms', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."cheque_status" AS ENUM('pending', 'cleared', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."concession_kind" AS ENUM('percent', 'flat');--> statement-breakpoint
CREATE TYPE "public"."fee_head_type" AS ENUM('recurring', 'one_time', 'optional');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('monthly', 'quarterly', 'half_yearly', 'annual', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'partial', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."late_fee_kind" AS ENUM('flat', 'per_day', 'percent');--> statement-breakpoint
CREATE TYPE "public"."line_kind" AS ENUM('fee', 'late_fee', 'misc', 'opening', 'bounce_charge');--> statement-breakpoint
CREATE TYPE "public"."notify_event" AS ENUM('BILL_GENERATED', 'DUE_UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PAYMENT_RECEIVED', 'CHEQUE_BOUNCED', 'LATE_FEE_APPLIED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash', 'upi', 'cheque', 'card', 'bank_transfer', 'dd');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('valid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'ACCOUNTANT', 'CASHIER', 'PRINCIPAL');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'left', 'alumni');--> statement-breakpoint
CREATE TABLE "academic_year" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(16) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	CONSTRAINT "academic_year_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer,
	"action" varchar(64) NOT NULL,
	"table_name" varchar(64) NOT NULL,
	"record_id" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"file_path" text NOT NULL,
	"size_bytes" bigint,
	"ok" boolean NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheque" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"cheque_no" varchar(32) NOT NULL,
	"bank" text NOT NULL,
	"cheque_date" date NOT NULL,
	"status" "cheque_status" DEFAULT 'pending' NOT NULL,
	"bounce_charge" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "cheque_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(32) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "class_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "concession_type" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "concession_kind" NOT NULL,
	"value" integer NOT NULL,
	"fee_head_id" integer,
	CONSTRAINT "concession_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "credit_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_note_no" varchar(40) NOT NULL,
	"student_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_credit_note_no_unique" UNIQUE("credit_note_no")
);
--> statement-breakpoint
CREATE TABLE "day_close" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"user_id" integer NOT NULL,
	"system_total" bigint DEFAULT 0 NOT NULL,
	"system_cash" bigint DEFAULT 0 NOT NULL,
	"counted_cash" bigint DEFAULT 0 NOT NULL,
	"denominations" jsonb NOT NULL,
	"difference" bigint NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_head" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"type" "fee_head_type" DEFAULT 'recurring' NOT NULL,
	"is_refundable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fee_head_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "fee_structure_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"structure_id" integer NOT NULL,
	"fee_head_id" integer NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"frequency" "frequency" NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"applicable_months" jsonb,
	CONSTRAINT "amount_nonneg" CHECK ("fee_structure_item"."amount" >= 0),
	CONSTRAINT "due_day_range" CHECK ("fee_structure_item"."due_day" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "fee_structure" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"class_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"relation" varchar(32) DEFAULT 'Parent' NOT NULL,
	"mobile" varchar(10) NOT NULL,
	"whatsapp_no" varchar(10),
	"email" text,
	"preferred_language" varchar(8) DEFAULT 'en' NOT NULL,
	"notify_sms" boolean DEFAULT true NOT NULL,
	"notify_whatsapp" boolean DEFAULT true NOT NULL,
	"notify_email" boolean DEFAULT true NOT NULL,
	"messaging_consent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrity_issue" (
	"id" serial PRIMARY KEY NOT NULL,
	"check_name" text NOT NULL,
	"detail" text NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"fee_head_id" integer,
	"kind" "line_kind" DEFAULT 'fee' NOT NULL,
	"description" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"credited" bigint DEFAULT 0 NOT NULL,
	"net" bigint DEFAULT 0 NOT NULL,
	"paid" bigint DEFAULT 0 NOT NULL,
	"late_fee_step" integer,
	CONSTRAINT "line_paid_ok" CHECK ("invoice_line"."paid" >= 0 and "invoice_line"."paid" <= "invoice_line"."net")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_no" varchar(40) NOT NULL,
	"student_id" integer NOT NULL,
	"academic_year_id" integer NOT NULL,
	"period" varchar(32) NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"gross" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"late_fee" bigint DEFAULT 0 NOT NULL,
	"net" bigint DEFAULT 0 NOT NULL,
	"paid" bigint DEFAULT 0 NOT NULL,
	"credited" bigint DEFAULT 0 NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"cancel_reason" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_invoice_no_unique" UNIQUE("invoice_no"),
	CONSTRAINT "invoice_balance_ok" CHECK ("invoice"."status" = 'cancelled' or ("invoice"."balance" = "invoice"."net" - "invoice"."paid" and "invoice"."balance" >= 0))
);
--> statement-breakpoint
CREATE TABLE "late_fee_rule" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"kind" "late_fee_kind" NOT NULL,
	"amount" integer NOT NULL,
	"max_cap" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "late_fee_rule_academic_year_id_unique" UNIQUE("academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"idempotency_key" text NOT NULL,
	"event" "notify_event" NOT NULL,
	"channel" "channel" NOT NULL,
	"recipient" text NOT NULL,
	"guardian_id" integer,
	"student_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invoice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"provider_template_id" text,
	"template_params" jsonb,
	"attachment_path" text,
	"status" "outbox_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"provider_msg_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notification_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" "notify_event" NOT NULL,
	"channel" "channel" NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"provider_template_id" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_series" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocation" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"invoice_line_id" integer NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_no" varchar(40) NOT NULL,
	"student_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"unallocated" bigint DEFAULT 0 NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"reference_no" text,
	"bank" text,
	"received_by" integer NOT NULL,
	"status" "payment_status" DEFAULT 'valid' NOT NULL,
	"cancel_reason" text,
	"cancelled_by" integer,
	"print_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipt_no_unique" UNIQUE("receipt_no"),
	CONSTRAINT "payment_amount_pos" CHECK ("payment"."amount" > 0),
	CONSTRAINT "payment_unalloc_ok" CHECK ("payment"."unallocated" >= 0 and "payment"."unallocated" <= "payment"."amount")
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"reason" text NOT NULL,
	"approved_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'My School' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"logo_path" text,
	"upi_id" text,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"receipt_prefix" text DEFAULT 'RCT' NOT NULL,
	"quiet_start" varchar(5) DEFAULT '09:00' NOT NULL,
	"quiet_end" varchar(5) DEFAULT '20:00' NOT NULL,
	"reminder_days_before" integer DEFAULT 3 NOT NULL,
	"overdue_steps" jsonb DEFAULT '[3,7,15]'::jsonb NOT NULL,
	"backup_path" text,
	"usb_backup_last_at" timestamp with time zone,
	"provider_config_enc" text,
	"default_language" varchar(8) DEFAULT 'en' NOT NULL,
	CONSTRAINT "single_row" CHECK ("school_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"name" varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "student_concession" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"concession_type_id" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_guardian" (
	"student_id" integer NOT NULL,
	"guardian_id" integer NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_wallet" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "wallet_nonneg" CHECK ("student_wallet"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" serial PRIMARY KEY NOT NULL,
	"admission_no" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"dob" date,
	"gender" varchar(8),
	"class_id" integer NOT NULL,
	"section_id" integer,
	"roll_no" varchar(16),
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"admission_date" date NOT NULL,
	"leaving_date" date,
	"transport_route_id" integer,
	"photo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_admission_no_unique" UNIQUE("admission_no")
);
--> statement-breakpoint
CREATE TABLE "transport_route" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stops" text DEFAULT '' NOT NULL,
	"monthly_fee" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "transport_route_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concession_type" ADD CONSTRAINT "concession_type_fee_head_id_fee_head_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_head"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_close" ADD CONSTRAINT "day_close_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_item" ADD CONSTRAINT "fee_structure_item_structure_id_fee_structure_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."fee_structure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_item" ADD CONSTRAINT "fee_structure_item_fee_head_id_fee_head_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_head"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure" ADD CONSTRAINT "fee_structure_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure" ADD CONSTRAINT "fee_structure_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_fee_head_id_fee_head_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_head"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_rule" ADD CONSTRAINT "late_fee_rule_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_guardian_id_guardian_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_invoice_line_id_invoice_line_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_received_by_app_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_cancelled_by_app_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concession" ADD CONSTRAINT "student_concession_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concession" ADD CONSTRAINT "student_concession_concession_type_id_concession_type_id_fk" FOREIGN KEY ("concession_type_id") REFERENCES "public"."concession_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concession" ADD CONSTRAINT "student_concession_approved_by_app_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_guardian_id_guardian_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_wallet" ADD CONSTRAINT "student_wallet_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_transport_route_id_transport_route_id_fk" FOREIGN KEY ("transport_route_id") REFERENCES "public"."transport_route"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_year" ON "academic_year" USING btree ("is_current") WHERE "academic_year"."is_current";--> statement-breakpoint
CREATE INDEX "audit_table_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "day_close_once" ON "day_close" USING btree ("date","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structure_item_head" ON "fee_structure_item" USING btree ("structure_id","fee_head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_year_class" ON "fee_structure" USING btree ("academic_year_id","class_id");--> statement-breakpoint
CREATE INDEX "guardian_mobile_idx" ON "guardian" USING btree ("mobile");--> statement-breakpoint
CREATE UNIQUE INDEX "late_fee_step_once" ON "invoice_line" USING btree ("invoice_id","late_fee_step");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_student_period" ON "invoice" USING btree ("student_id","academic_year_id","period");--> statement-breakpoint
CREATE INDEX "invoice_due_idx" ON "invoice" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "outbox_pick_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "template_event_channel_lang" ON "notification_template" USING btree ("event","channel","language");--> statement-breakpoint
CREATE INDEX "alloc_payment_idx" ON "payment_allocation" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "alloc_invoice_idx" ON "payment_allocation" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_student_idx" ON "payment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "payment_date_idx" ON "payment" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "section_class_name" ON "section" USING btree ("class_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardian_pk" ON "student_guardian" USING btree ("student_id","guardian_id");--> statement-breakpoint
CREATE INDEX "student_name_idx" ON "student" USING btree ("name");--> statement-breakpoint
CREATE INDEX "student_class_idx" ON "student" USING btree ("class_id");