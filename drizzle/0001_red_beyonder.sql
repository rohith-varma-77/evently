CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookingCode` varchar(32) NOT NULL,
	`eventId` int NOT NULL,
	`ticketTypeId` int NOT NULL,
	`attendeeId` int,
	`attendeeName` varchar(160) NOT NULL,
	`attendeeEmail` varchar(320) NOT NULL,
	`quantity` int NOT NULL,
	`status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`stripePaymentIntentId` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_bookingCode_unique` UNIQUE(`bookingCode`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizerId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`slug` varchar(220) NOT NULL,
	`category` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`imageUrl` text,
	`venue` varchar(180) NOT NULL,
	`location` varchar(180) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `ticketTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`priceMinor` int NOT NULL DEFAULT 0,
	`quantity` int NOT NULL,
	`available` int NOT NULL,
	`stripePriceId` varchar(120),
	CONSTRAINT `ticketTypes_id` PRIMARY KEY(`id`)
);
