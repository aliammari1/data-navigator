CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer,
	`metadata` text,
	`timestamp` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_category_idx` ON `audit_log` (`category`);--> statement-breakpoint
CREATE INDEX `audit_log_timestamp_idx` ON `audit_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `query_analytics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_id` text NOT NULL,
	`sql_query` text NOT NULL,
	`row_count` integer NOT NULL,
	`execution_time_ms` real NOT NULL,
	`is_cached` integer DEFAULT false NOT NULL,
	`error` text,
	`timestamp` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `query_analytics_dataset_idx` ON `query_analytics` (`dataset_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `query_analytics_timestamp_idx` ON `query_analytics` (`timestamp`);