CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`event_name` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_event_created` ON `admin_audit_logs` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_actor_created` ON `admin_audit_logs` (`actor_email`,`created_at`);--> statement-breakpoint
ALTER TABLE `events` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `deleted_by` text;--> statement-breakpoint
UPDATE `events` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_events_deleted_event_date` ON `events` (`deleted_at`,`event_date`);--> statement-breakpoint
PRAGMA optimize;
