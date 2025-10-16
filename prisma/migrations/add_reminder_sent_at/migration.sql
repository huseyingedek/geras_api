-- Appointments tablosuna ReminderSentAt kolonu eklenir
-- Bu kolon hatırlatma SMS'inin gönderilme zamanını saklar ve yinelenen gönderimi engeller

ALTER TABLE "Appointments" ADD COLUMN "ReminderSentAt" TIMESTAMP(3);

