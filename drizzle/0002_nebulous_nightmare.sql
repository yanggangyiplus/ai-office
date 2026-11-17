CREATE TABLE "connections" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"token" text NOT NULL,
	CONSTRAINT "connections_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "joined_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" DROP COLUMN "notion_token";--> statement-breakpoint
ALTER TABLE "offices" DROP COLUMN "github_token";