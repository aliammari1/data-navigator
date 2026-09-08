CREATE TABLE `analytics_snapshot_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`label` text NOT NULL,
	`file_name` text,
	`saved_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`size_bytes` integer NOT NULL,
	`total_transactions` integer DEFAULT 0 NOT NULL,
	`success_rate` real DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_snapshot_history_table_saved_idx` ON `analytics_snapshot_history` (`table_name`,`saved_at`);--> statement-breakpoint
CREATE TABLE `app_setting` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`namespace`, `key`)
);
--> statement-breakpoint
CREATE INDEX `app_setting_namespace_idx` ON `app_setting` (`namespace`);