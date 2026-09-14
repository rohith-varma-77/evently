ALTER TABLE `bookings` ADD `paymentReference` varchar(160);--> statement-breakpoint
ALTER TABLE `events` ADD `paymentUpi` varchar(180);--> statement-breakpoint
ALTER TABLE `events` ADD `paymentWhatsapp` varchar(32);--> statement-breakpoint
ALTER TABLE `events` ADD `ticketTheme` varchar(32);