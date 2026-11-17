CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" serial NOT NULL,
	"office_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"checked_in_at" timestamp DEFAULT now() NOT NULL,
	"checked_out_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "notion_page_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "status" text DEFAULT 'working' NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;