ALTER TABLE `bookings` ADD `idempotencyKey` varchar(96) NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_idempotencyKey_unique` UNIQUE(`idempotencyKey`);