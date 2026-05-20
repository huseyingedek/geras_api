-- Migration: add_survey_system
-- Müşteri Değerlendirme Anketi sistemi

-- Accounts tablosuna SurveyEnabled sütunu ekle
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "SurveyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AppointmentReviews tablosu oluştur
CREATE TABLE IF NOT EXISTS "AppointmentReviews" (
  "ReviewID"      SERIAL PRIMARY KEY,
  "AppointmentID" INTEGER NOT NULL UNIQUE,
  "AccountID"     INTEGER NOT NULL,
  "ClientID"      INTEGER,
  "Token"         TEXT NOT NULL UNIQUE,
  "Rating"        INTEGER CHECK ("Rating" >= 1 AND "Rating" <= 5),
  "Comment"       TEXT,
  "SmsSentAt"     TIMESTAMP,
  "SubmittedAt"   TIMESTAMP,
  "CreatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT "fk_review_appointment" FOREIGN KEY ("AppointmentID")
    REFERENCES "Appointments"("AppointmentID") ON DELETE CASCADE,
  CONSTRAINT "fk_review_account" FOREIGN KEY ("AccountID")
    REFERENCES "Accounts"("AccountID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_review_account" ON "AppointmentReviews"("AccountID");
CREATE INDEX IF NOT EXISTS "idx_review_token"   ON "AppointmentReviews"("Token");
