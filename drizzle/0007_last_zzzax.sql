ALTER TABLE `events` ADD `stamp_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `events` SET `stamp_enabled` = 1
WHERE EXISTS (SELECT 1 FROM `clubs` WHERE `clubs`.`event_id` = `events`.`id`)
   OR EXISTS (SELECT 1 FROM `stamp_points` WHERE `stamp_points`.`event_id` = `events`.`id`);--> statement-breakpoint
ALTER TABLE `participants` ADD `contact_info` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD `affiliation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD `visited_at` text;--> statement-breakpoint
ALTER TABLE `participants` ADD `record_source` text DEFAULT 'qr' NOT NULL;
