-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- DropIndex
DROP INDEX `Clients_AccountID_Email_key` ON `clients`;

-- DropIndex
DROP INDEX `Clients_AccountID_Phone_key` ON `clients`;

-- DropIndex
DROP INDEX `Staff_AccountID_Email_key` ON `staff`;

-- DropIndex
DROP INDEX `Staff_AccountID_Phone_key` ON `staff`;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;
