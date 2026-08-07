CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"ciphertext" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"usage_date" timestamp with time zone,
	"disabled_until" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_check_status" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"app_name" text NOT NULL,
	"logo_data_uri" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"project_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"source" text NOT NULL,
	"summary" text,
	"published_at" timestamp with time zone,
	"security" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"ai_sentiment" text,
	"ai_relevance" text,
	"ai_sentiment_reason" text,
	"sentiment_checked_at" timestamp with time zone,
	"sentiment_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_attempts" (
	"email" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sector" text DEFAULT 'banking' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"brand_query" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threat_news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector" text NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"source" text NOT NULL,
	"summary" text,
	"published_at" timestamp with time zone,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_sys_admin" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'Auditor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"argv" text[] DEFAULT '{}' NOT NULL,
	"exit_code" integer,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"url" text NOT NULL,
	"host" text,
	"port" text,
	"scheme" text,
	"title" text,
	"web_server" text,
	"status_code" integer,
	"content_length" integer,
	"tech" text[] DEFAULT '{}' NOT NULL,
	"is_wordpress" integer DEFAULT 0 NOT NULL,
	"is_interesting" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"ip" text NOT NULL,
	"port" integer NOT NULL,
	"protocol" text DEFAULT 'tcp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recon_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"body" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"tools" jsonb NOT NULL,
	"ports" text DEFAULT 'top-100' NOT NULL,
	"severities" text[] DEFAULT '{"critical","high","medium","low"}' NOT NULL,
	"rate" integer,
	"timeout_sec" integer,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"profile_id" uuid,
	"cron" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"profile_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"mode" text DEFAULT 'active' NOT NULL,
	"deep_scan" boolean DEFAULT false NOT NULL,
	"stage" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"tools_override" jsonb,
	"timeout_sec" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"counts" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subdomains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"host" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"predefined_subdomains" text[] DEFAULT '{}' NOT NULL,
	"custom_headers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vulnerabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"severity" integer NOT NULL,
	"type" text,
	"host" text,
	"port" text,
	"url" text,
	"matched_at" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"request" text,
	"response" text,
	"cvss" double precision,
	"cve_ids" text[] DEFAULT '{}' NOT NULL,
	"references" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"remediation" text,
	"status" text DEFAULT 'open' NOT NULL,
	"status_note" text,
	"analyst_note" text,
	"status_changed_at" timestamp with time zone,
	"ai_description" text,
	"ai_impact" text,
	"ai_remediation" text,
	"is_ai_enriched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovered_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_id" uuid,
	"scan_id" uuid,
	"first_scan_id" uuid,
	"host" text,
	"url_text" text NOT NULL,
	"url_sha256" text NOT NULL,
	"sources" text[] DEFAULT '{}' NOT NULL,
	"pathname_extension" text,
	"category_slug" text,
	"external_seen_at" timestamp with time zone,
	"deep_scan_state" text DEFAULT 'skipped' NOT NULL,
	"fetched_at" timestamp with time zone,
	"http_status" integer,
	"content_length" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exposure_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"discovered_url_id" uuid,
	"scan_id" uuid,
	"source" text DEFAULT 'url' NOT NULL,
	"finding_type" text NOT NULL,
	"snippet" text,
	"url_text" text,
	"status" text DEFAULT 'new' NOT NULL,
	"analyst_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extension_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"icon_key" text,
	CONSTRAINT "extension_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extension_suffix_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"suffix" text NOT NULL,
	CONSTRAINT "extension_suffix_rules_suffix_unique" UNIQUE("suffix")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ip_resolution_sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_resolution_id" uuid NOT NULL,
	"scan_id" uuid,
	"hostname" text NOT NULL,
	"last_resolved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ip_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"ip_address" text NOT NULL,
	"latest_resolved_at" timestamp with time zone NOT NULL,
	"hostname_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leakcheck_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"source" text,
	"identifier" text,
	"password" text,
	"origin" text,
	"hash_md5" text NOT NULL,
	"type" text DEFAULT 'domain' NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manual_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"vt_malicious" integer,
	"vt_suspicious" integer,
	"vt_harmless" integer,
	"vt_total" integer,
	"otx_pulses" integer,
	"verdict" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otx_threat_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"indicator" text NOT NULL,
	"pulses" integer DEFAULT 0 NOT NULL,
	"malware_count" integer DEFAULT 0 NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"passive_dns" jsonb,
	"urls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threat_intel_report_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"logo_url" text,
	"brand_color" text,
	"doc_number" text,
	"classification" text,
	"signatory" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threat_intel_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"ai_narrative" text,
	"leak_found" integer,
	"leak_truncated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text DEFAULT 'va' NOT NULL,
	"primary_color" text DEFAULT '#069ec6' NOT NULL,
	"secondary_color" text DEFAULT '#08222b' NOT NULL,
	"company_name" text,
	"company_address" text,
	"company_email" text,
	"company_website" text,
	"document_number" text,
	"classification" text,
	"footer_text" text,
	"language" text DEFAULT 'en' NOT NULL,
	"company_logo" text,
	"show_executive_summary" boolean DEFAULT false NOT NULL,
	"executive_summary" text,
	"executive_summary_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_signatories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"signature_image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" text NOT NULL,
	"kind" text NOT NULL,
	"output" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_cache_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_defaults" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"base_url" text,
	"api_key_ciphertext" text,
	"last_check_status" text,
	"last_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"base_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "network_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"proxy_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"label" text,
	"url" text,
	"telegram_token" text,
	"telegram_chat_id" text,
	"events" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leak_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"daily_limit" integer,
	"monthly_limit" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leak_packages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leak_providers" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"key_ciphertext" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leak_search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"source" text NOT NULL,
	"provider" text NOT NULL,
	"identifier" text,
	"password_ciphertext" text,
	"origin" text,
	"extra" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leak_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"search_type" text,
	"note" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"project_id" uuid,
	"result_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leak_usage" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leak_user_access" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"package_id" uuid,
	"daily_limit_override" integer,
	"monthly_limit_override" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backup_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"repo_type" text DEFAULT 'b2' NOT NULL,
	"repo_redacted" text,
	"keep_daily" integer DEFAULT 7 NOT NULL,
	"keep_weekly" integer DEFAULT 4 NOT NULL,
	"keep_monthly" integer DEFAULT 6 NOT NULL,
	"schedule_enabled" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"last_op_kind" text,
	"last_op_at" timestamp with time zone,
	"last_op_ok" boolean,
	"last_op_output" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_news" ADD CONSTRAINT "brand_news_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commands" ADD CONSTRAINT "commands_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ports" ADD CONSTRAINT "ports_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recon_notes" ADD CONSTRAINT "recon_notes_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_activity" ADD CONSTRAINT "scan_activity_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_profiles" ADD CONSTRAINT "scan_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_profile_id_scan_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."scan_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scans" ADD CONSTRAINT "scans_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scans" ADD CONSTRAINT "scans_profile_id_scan_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."scan_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subdomains" ADD CONSTRAINT "subdomains_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "targets" ADD CONSTRAINT "targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_first_scan_id_scans_id_fk" FOREIGN KEY ("first_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exposure_findings" ADD CONSTRAINT "exposure_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exposure_findings" ADD CONSTRAINT "exposure_findings_discovered_url_id_discovered_urls_id_fk" FOREIGN KEY ("discovered_url_id") REFERENCES "public"."discovered_urls"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exposure_findings" ADD CONSTRAINT "exposure_findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extension_suffix_rules" ADD CONSTRAINT "extension_suffix_rules_category_id_extension_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."extension_categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ip_resolution_sightings" ADD CONSTRAINT "ip_resolution_sightings_ip_resolution_id_ip_resolutions_id_fk" FOREIGN KEY ("ip_resolution_id") REFERENCES "public"."ip_resolutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ip_resolution_sightings" ADD CONSTRAINT "ip_resolution_sightings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ip_resolutions" ADD CONSTRAINT "ip_resolutions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leakcheck_data" ADD CONSTRAINT "leakcheck_data_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "manual_indicators" ADD CONSTRAINT "manual_indicators_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "otx_threat_data" ADD CONSTRAINT "otx_threat_data_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "threat_intel_report_setting" ADD CONSTRAINT "threat_intel_report_setting_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "threat_intel_status" ADD CONSTRAINT "threat_intel_status_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_settings" ADD CONSTRAINT "report_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_signatories" ADD CONSTRAINT "report_signatories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leak_search_results" ADD CONSTRAINT "leak_search_results_search_id_leak_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."leak_searches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leak_searches" ADD CONSTRAINT "leak_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leak_searches" ADD CONSTRAINT "leak_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leak_usage" ADD CONSTRAINT "leak_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leak_user_access" ADD CONSTRAINT "leak_user_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leak_user_access" ADD CONSTRAINT "leak_user_access_package_id_leak_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."leak_packages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_news_project_link_uniq" ON "brand_news" USING btree ("project_id","link");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_user_uniq" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "threat_news_sector_link_uniq" ON "threat_news" USING btree ("sector","link");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threat_news_sector_published_idx" ON "threat_news" USING btree ("sector","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "endpoints_scan_idx" ON "endpoints" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ports_scan_idx" ON "ports" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_activity_scan_idx" ON "scan_activity" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scan_schedules_target_idx" ON "scan_schedules" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scans_project_idx" ON "scans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scans_target_idx" ON "scans" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subdomains_scan_idx" ON "subdomains" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "targets_project_idx" ON "targets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vulnerabilities_scan_idx" ON "vulnerabilities" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discovered_urls_project_url_uniq" ON "discovered_urls" USING btree ("project_id","url_sha256");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_urls_project_idx" ON "discovered_urls" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovered_urls_category_idx" ON "discovered_urls" USING btree ("project_id","category_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exposure_findings_project_idx" ON "exposure_findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exposure_findings_type_idx" ON "exposure_findings" USING btree ("project_id","finding_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exposure_findings_uniq" ON "exposure_findings" USING btree ("project_id","url_text","finding_type","snippet");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ip_sightings_resolution_host_uniq" ON "ip_resolution_sightings" USING btree ("ip_resolution_id","hostname");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_sightings_resolution_idx" ON "ip_resolution_sightings" USING btree ("ip_resolution_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ip_resolutions_project_ip_uniq" ON "ip_resolutions" USING btree ("project_id","ip_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ip_resolutions_project_idx" ON "ip_resolutions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leakcheck_data_project_idx" ON "leakcheck_data" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_indicators_project_idx" ON "manual_indicators" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otx_threat_data_project_idx" ON "otx_threat_data" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ti_report_setting_project_uniq" ON "threat_intel_report_setting" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "threat_intel_status_project_uniq" ON "threat_intel_status" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_settings_project_kind_uniq" ON "report_settings" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leak_search_results_search_idx" ON "leak_search_results" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leak_searches_user_idx" ON "leak_searches" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leak_usage_user_day_uniq" ON "leak_usage" USING btree ("user_id","day");