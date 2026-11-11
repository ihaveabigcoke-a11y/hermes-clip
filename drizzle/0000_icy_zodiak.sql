CREATE TABLE `lab_records` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `lab_owner_kind` ON `lab_records` (`owner_id`,`kind`);