-- Online randevu için PENDING statüsü ekleniyor
-- IF NOT EXISTS sayesinde defalarca çalıştırılabilir, mevcut veriye dokunmaz

ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
