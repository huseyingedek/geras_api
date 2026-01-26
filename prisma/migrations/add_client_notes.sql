-- Add ClientNotes table for customer notes management
-- Safe migration - does not affect existing data

CREATE TABLE IF NOT EXISTS "ClientNotes" (
    "NoteID" SERIAL PRIMARY KEY,
    "AccountID" INTEGER NOT NULL,
    "ClientID" INTEGER NOT NULL,
    "StaffID" INTEGER NOT NULL,
    "NoteText" TEXT NOT NULL,
    "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "ClientNotes_AccountID_fkey" FOREIGN KEY ("AccountID") 
        REFERENCES "Accounts"("AccountID") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientNotes_ClientID_fkey" FOREIGN KEY ("ClientID") 
        REFERENCES "Clients"("ClientID") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientNotes_StaffID_fkey" FOREIGN KEY ("StaffID") 
        REFERENCES "Staff"("StaffID") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_client_notes_client" ON "ClientNotes"("ClientID");
CREATE INDEX IF NOT EXISTS "idx_client_notes_staff" ON "ClientNotes"("StaffID");
CREATE INDEX IF NOT EXISTS "idx_client_notes_created" ON "ClientNotes"("CreatedAt");
