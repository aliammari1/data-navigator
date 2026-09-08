PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_moudir_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`parts` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `moudir_conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_moudir_message`("id", "conversation_id", "role", "content", "parts", "created_at") SELECT "id", "conversation_id", "role", "content", "parts", "created_at" FROM `moudir_message`;--> statement-breakpoint
DROP TABLE `moudir_message`;--> statement-breakpoint
ALTER TABLE `__new_moudir_message` RENAME TO `moudir_message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `moudir_message_conversation_idx` ON `moudir_message` (`conversation_id`,`id`);--> statement-breakpoint
CREATE INDEX `moudir_message_conversation_fk_idx` ON `moudir_message` (`conversation_id`);