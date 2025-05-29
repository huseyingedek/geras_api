-- CreateTable
CREATE TABLE `Accounts` (
    `AccountID` INTEGER NOT NULL AUTO_INCREMENT,
    `BusinessName` VARCHAR(255) NOT NULL,
    `ContactPerson` VARCHAR(255) NULL,
    `Email` VARCHAR(255) NULL,
    `Phone` VARCHAR(50) NULL,
    `BusinessType` ENUM('SessionBased', 'NonSessionBased') NOT NULL DEFAULT 'SessionBased',
    `SubscriptionPlan` VARCHAR(100) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `IsActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Accounts_Email_key`(`Email`),
    PRIMARY KEY (`AccountID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Appointments` (
    `AppointmentID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `CustomerName` VARCHAR(255) NOT NULL,
    `ClientID` INTEGER NULL,
    `ServiceID` INTEGER NOT NULL,
    `StaffID` INTEGER NOT NULL,
    `AppointmentDate` DATETIME(3) NOT NULL,
    `Status` ENUM('PLANNED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `Notes` TEXT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`AppointmentID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Clients` (
    `ClientID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `FirstName` VARCHAR(100) NOT NULL,
    `LastName` VARCHAR(100) NOT NULL,
    `Phone` VARCHAR(50) NULL,
    `Email` VARCHAR(255) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`ClientID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sales` (
    `SaleID` INTEGER NOT NULL AUTO_INCREMENT,
    `ClientID` INTEGER NOT NULL,
    `ServiceID` INTEGER NOT NULL,
    `SaleDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `TotalAmount` DECIMAL(10, 2) NOT NULL,
    `RemainingSessions` INTEGER NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`SaleID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payments` (
    `PaymentID` INTEGER NOT NULL AUTO_INCREMENT,
    `SaleID` INTEGER NOT NULL,
    `PaymentDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `AmountPaid` DECIMAL(10, 2) NOT NULL,
    `PaymentMethod` ENUM('CASH', 'CREDIT_CARD', 'TRANSFER', 'OTHER') NOT NULL DEFAULT 'CASH',
    `Notes` TEXT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`PaymentID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Services` (
    `ServiceID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `ServiceName` VARCHAR(255) NOT NULL,
    `Description` TEXT NULL,
    `Price` DECIMAL(10, 2) NOT NULL,
    `DurationMinutes` INTEGER NULL,
    `IsSessionBased` BOOLEAN NOT NULL DEFAULT false,
    `SessionCount` INTEGER NOT NULL DEFAULT 1,
    `IsActive` BOOLEAN NOT NULL DEFAULT true,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Services_AccountID_ServiceName_key`(`AccountID`, `ServiceName`),
    PRIMARY KEY (`ServiceID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sessions` (
    `SessionID` INTEGER NOT NULL AUTO_INCREMENT,
    `SaleID` INTEGER NOT NULL,
    `StaffID` INTEGER NULL,
    `SessionDate` DATETIME(3) NOT NULL,
    `Status` ENUM('SCHEDULED', 'COMPLETED', 'MISSED') NOT NULL DEFAULT 'SCHEDULED',
    `Notes` TEXT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`SessionID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Staff` (
    `StaffID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `FullName` VARCHAR(255) NOT NULL,
    `Role` VARCHAR(100) NULL,
    `Phone` VARCHAR(50) NULL,
    `Email` VARCHAR(255) NULL,
    `IsActive` BOOLEAN NOT NULL DEFAULT true,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UserID` INTEGER NULL,

    UNIQUE INDEX `Staff_UserID_key`(`UserID`),
    PRIMARY KEY (`StaffID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkingHours` (
    `WorkingHourID` INTEGER NOT NULL AUTO_INCREMENT,
    `StaffID` INTEGER NOT NULL,
    `DayOfWeek` INTEGER NOT NULL,
    `StartTime` DATETIME(3) NOT NULL,
    `EndTime` DATETIME(3) NOT NULL,
    `IsWorking` BOOLEAN NOT NULL DEFAULT true,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WorkingHours_StaffID_DayOfWeek_key`(`StaffID`, `DayOfWeek`),
    PRIMARY KEY (`WorkingHourID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `role` ENUM('EMPLOYEE', 'OWNER', 'ADMIN') NOT NULL DEFAULT 'EMPLOYEE',
    `accountId` INTEGER NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permissions` (
    `PermissionID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `Name` VARCHAR(100) NOT NULL,
    `Description` TEXT NULL,
    `Resource` VARCHAR(100) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Permissions_AccountID_Name_Resource_key`(`AccountID`, `Name`, `Resource`),
    PRIMARY KEY (`PermissionID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffPermissions` (
    `StaffPermissionID` INTEGER NOT NULL AUTO_INCREMENT,
    `StaffID` INTEGER NOT NULL,
    `PermissionID` INTEGER NOT NULL,
    `CanView` BOOLEAN NOT NULL DEFAULT false,
    `CanCreate` BOOLEAN NOT NULL DEFAULT false,
    `CanEdit` BOOLEAN NOT NULL DEFAULT false,
    `CanDelete` BOOLEAN NOT NULL DEFAULT false,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffPermissions_StaffID_PermissionID_key`(`StaffID`, `PermissionID`),
    PRIMARY KEY (`StaffPermissionID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notifications` (
    `NotificationID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `UserID` INTEGER NULL,
    `Title` VARCHAR(255) NOT NULL,
    `Message` TEXT NOT NULL,
    `Type` ENUM('APPOINTMENT', 'PAYMENT', 'SESSION', 'SYSTEM', 'MARKETING') NOT NULL DEFAULT 'SYSTEM',
    `IsRead` BOOLEAN NOT NULL DEFAULT false,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ReferenceID` INTEGER NULL,
    `ReferenceType` VARCHAR(50) NULL,

    PRIMARY KEY (`NotificationID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationSettings` (
    `SettingID` INTEGER NOT NULL AUTO_INCREMENT,
    `UserID` INTEGER NOT NULL,
    `AccountID` INTEGER NOT NULL,
    `NotificationType` ENUM('APPOINTMENT', 'PAYMENT', 'SESSION', 'SYSTEM', 'MARKETING') NOT NULL,
    `EmailEnabled` BOOLEAN NOT NULL DEFAULT true,
    `PushEnabled` BOOLEAN NOT NULL DEFAULT true,
    `SMSEnabled` BOOLEAN NOT NULL DEFAULT false,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NotificationSettings_UserID_AccountID_NotificationType_key`(`UserID`, `AccountID`, `NotificationType`),
    PRIMARY KEY (`SettingID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reports` (
    `ReportID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NOT NULL,
    `Name` VARCHAR(255) NOT NULL,
    `Type` ENUM('SALES', 'APPOINTMENTS', 'SESSIONS', 'CLIENTS', 'STAFF', 'FINANCIAL', 'CUSTOM') NOT NULL DEFAULT 'SALES',
    `Parameters` TEXT NULL,
    `CreatedBy` INTEGER NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `CompletedAt` DATETIME(3) NULL,
    `Status` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `ResultURL` TEXT NULL,

    PRIMARY KEY (`ReportID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportTemplates` (
    `TemplateID` INTEGER NOT NULL AUTO_INCREMENT,
    `AccountID` INTEGER NULL,
    `Name` VARCHAR(255) NOT NULL,
    `Description` TEXT NULL,
    `Type` ENUM('SALES', 'APPOINTMENTS', 'SESSIONS', 'CLIENTS', 'STAFF', 'FINANCIAL', 'CUSTOM') NOT NULL,
    `Parameters` TEXT NULL,
    `Query` TEXT NOT NULL,
    `OutputFormat` VARCHAR(20) NOT NULL DEFAULT 'PDF',
    `IsActive` BOOLEAN NOT NULL DEFAULT true,
    `IsSystem` BOOLEAN NOT NULL DEFAULT false,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`TemplateID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Appointments` ADD CONSTRAINT `Appointments_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointments` ADD CONSTRAINT `Appointments_ClientID_fkey` FOREIGN KEY (`ClientID`) REFERENCES `Clients`(`ClientID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointments` ADD CONSTRAINT `Appointments_ServiceID_fkey` FOREIGN KEY (`ServiceID`) REFERENCES `Services`(`ServiceID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointments` ADD CONSTRAINT `Appointments_StaffID_fkey` FOREIGN KEY (`StaffID`) REFERENCES `Staff`(`StaffID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Clients` ADD CONSTRAINT `Clients_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sales` ADD CONSTRAINT `Sales_ClientID_fkey` FOREIGN KEY (`ClientID`) REFERENCES `Clients`(`ClientID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sales` ADD CONSTRAINT `Sales_ServiceID_fkey` FOREIGN KEY (`ServiceID`) REFERENCES `Services`(`ServiceID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payments` ADD CONSTRAINT `Payments_SaleID_fkey` FOREIGN KEY (`SaleID`) REFERENCES `Sales`(`SaleID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Services` ADD CONSTRAINT `Services_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sessions` ADD CONSTRAINT `Sessions_SaleID_fkey` FOREIGN KEY (`SaleID`) REFERENCES `Sales`(`SaleID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sessions` ADD CONSTRAINT `Sessions_StaffID_fkey` FOREIGN KEY (`StaffID`) REFERENCES `Staff`(`StaffID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Staff` ADD CONSTRAINT `Staff_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Staff` ADD CONSTRAINT `Staff_UserID_fkey` FOREIGN KEY (`UserID`) REFERENCES `Users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkingHours` ADD CONSTRAINT `WorkingHours_StaffID_fkey` FOREIGN KEY (`StaffID`) REFERENCES `Staff`(`StaffID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Users` ADD CONSTRAINT `Users_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Accounts`(`AccountID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Permissions` ADD CONSTRAINT `Permissions_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffPermissions` ADD CONSTRAINT `StaffPermissions_StaffID_fkey` FOREIGN KEY (`StaffID`) REFERENCES `Staff`(`StaffID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffPermissions` ADD CONSTRAINT `StaffPermissions_PermissionID_fkey` FOREIGN KEY (`PermissionID`) REFERENCES `Permissions`(`PermissionID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notifications` ADD CONSTRAINT `Notifications_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notifications` ADD CONSTRAINT `Notifications_UserID_fkey` FOREIGN KEY (`UserID`) REFERENCES `Users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationSettings` ADD CONSTRAINT `NotificationSettings_UserID_fkey` FOREIGN KEY (`UserID`) REFERENCES `Users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationSettings` ADD CONSTRAINT `NotificationSettings_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reports` ADD CONSTRAINT `Reports_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reports` ADD CONSTRAINT `Reports_CreatedBy_fkey` FOREIGN KEY (`CreatedBy`) REFERENCES `Users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportTemplates` ADD CONSTRAINT `ReportTemplates_AccountID_fkey` FOREIGN KEY (`AccountID`) REFERENCES `Accounts`(`AccountID`) ON DELETE SET NULL ON UPDATE CASCADE;
