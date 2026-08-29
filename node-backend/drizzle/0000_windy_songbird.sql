CREATE TABLE `article_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_article_tag` ON `article_tags` (`article_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `article_view_dedup` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`dedup_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_article_dedup` ON `article_view_dedup` (`article_id`,`dedup_key`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`summary` text,
	`content` text NOT NULL,
	`cover_image` text,
	`author_id` integer NOT NULL,
	`author_name` text,
	`category_id` integer,
	`category_name` text,
	`category_slug` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`tags` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_article_slug` ON `articles` (`slug`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`article_id` integer,
	`storage_key` text NOT NULL,
	`url` text NOT NULL,
	`storage` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`parent_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_category_slug` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`user_name` text NOT NULL,
	`parent_id` integer,
	`content` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`rejected_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_favorite` ON `favorites` (`user_id`,`article_id`);--> statement-breakpoint
CREATE TABLE `likes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_like` ON `likes` (`user_id`,`article_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_token_hash` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site_name` text NOT NULL,
	`site_title` text,
	`site_description` text NOT NULL,
	`site_keywords` text,
	`logo_url` text,
	`copyright` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_tag_slug` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`email` text,
	`display_name` text,
	`avatar_url` text,
	`bio` text,
	`level` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_username` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `view_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`last_read_at` integer NOT NULL,
	`progress` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_view_history` ON `view_history` (`user_id`,`article_id`);