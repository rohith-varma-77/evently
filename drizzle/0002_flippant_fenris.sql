CREATE TABLE `eventStaff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`userId` int NOT NULL,
	`assignedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `eventStaff_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticketPasses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookingId` int NOT NULL,
	`eventId` int NOT NULL,
	`ticketTypeId` int NOT NULL,
	`passId` varchar(80) NOT NULL,
	`status` enum('ACTIVE','CHECKED_IN','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
	`checkedInAt` timestamp,
	`checkedInBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticketPasses_id` PRIMARY KEY(`id`),
	CONSTRAINT `ticketPasses_passId_unique` UNIQUE(`passId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','organizer','staff','admin') NOT NULL DEFAULT 'user';