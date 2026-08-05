CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`device_token_hash` text NOT NULL,
	`participant_name` text NOT NULL,
	`gender` text,
	`age_group` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_event_device_unique` ON `participants` (`event_id`,`device_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_participants_event_id` ON `participants` (`event_id`);--> statement-breakpoint
CREATE TABLE `stamp_points` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stamp_points_token_unique` ON `stamp_points` (`token`);--> statement-breakpoint
CREATE INDEX `idx_stamp_points_event_position` ON `stamp_points` (`event_id`,`position`);--> statement-breakpoint
CREATE TABLE `stamp_records` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`stamp_point_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stamp_point_id`) REFERENCES `stamp_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stamp_records_participant_point_unique` ON `stamp_records` (`participant_id`,`stamp_point_id`);--> statement-breakpoint
CREATE INDEX `idx_stamp_records_event_participant` ON `stamp_records` (`event_id`,`participant_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `events` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `events` ADD `invite_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `events_invite_token_unique` ON `events` (`invite_token`);