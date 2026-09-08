CREATE TABLE `moudir_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`dataset_id` text,
	`model` text
);
--> statement-breakpoint
CREATE INDEX `moudir_conversation_updated_idx` ON `moudir_conversation` (`pinned`,`updated_at`);--> statement-breakpoint
CREATE TABLE `moudir_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`parts` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moudir_message_conversation_idx` ON `moudir_message` (`conversation_id`,`id`);