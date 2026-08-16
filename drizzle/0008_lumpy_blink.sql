CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`logged_in_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_login_events_user_logged_in` ON `login_events` (`user_id`,`logged_in_at`);--> statement-breakpoint
CREATE INDEX `idx_login_events_logged_in` ON `login_events` (`logged_in_at`);--> statement-breakpoint
CREATE TABLE `user_daily_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_date` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_daily_activity_user_date_unique` ON `user_daily_activity` (`user_id`,`activity_date`);--> statement-breakpoint
CREATE INDEX `idx_user_daily_activity_date` ON `user_daily_activity` (`activity_date`);