/*
  Warnings:

  - A unique constraint covering the columns `[AccountID,Email]` on the table `Clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[AccountID,Phone]` on the table `Clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[AccountID,Email]` on the table `Staff` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[AccountID,Phone]` on the table `Staff` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `AccountID` to the `Sales` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `clients` ADD COLUMN `IsActive` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `sales` ADD COLUMN `AccountID` INTEGER NOT NULL,
    ADD COLUMN `IsDeleted` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `Clients_AccountID_Email_key` ON `Clients`(`AccountID`, `Email`);

-- CreateIndex
CREATE UNIQUE INDEX `Clients_AccountID_Phone_key` ON `Clients`(`AccountID`, `Phone`);

-- CreateIndex
CREATE UNIQUE INDEX `Staff_AccountID_Email_key` ON `Staff`(`AccountID`, `Email`);

-- CreateIndex
CREATE UNIQUE INDEX `Staff_AccountID_Phone_key` ON `Staff`(`AccountID`, `Phone`);

-- AddForeignKey
ALTER TABLE `Sales` ADD CONSTRAINT `Sales_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;
