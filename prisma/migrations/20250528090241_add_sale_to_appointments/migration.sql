-- AlterTable
ALTER TABLE `appointments` ADD COLUMN `SaleID` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Appointments` ADD CONSTRAINT `Appointments_SaleID_fkey` FOREIGN KEY (`SaleID`) REFERENCES `Sales`(`SaleID`) ON DELETE SET NULL ON UPDATE CASCADE;
