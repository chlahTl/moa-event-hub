CREATE TABLE `club_stamp_records` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`club_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `club_stamp_records_participant_club_unique` ON `club_stamp_records` (`participant_id`,`club_id`);--> statement-breakpoint
CREATE INDEX `idx_club_stamp_records_event_participant` ON `club_stamp_records` (`event_id`,`participant_id`);