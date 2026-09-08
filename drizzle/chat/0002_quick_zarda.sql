CREATE TABLE `moudir_message_embedding` (
	`message_id` integer PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`dim` integer NOT NULL,
	`vector` blob NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `moudir_conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `moudir_message_embedding_conv_idx` ON `moudir_message_embedding` (`conversation_id`);