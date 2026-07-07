-- Reply-To Header separat speichern, damit Kontaktformular-Mails (From: eigene
-- Adresse, Reply-To: echte Kundenadresse) beim Antworten die richtige Adresse
-- vorschlagen statt der eigenen.
ALTER TABLE "Mail" ADD COLUMN "replyToEmail" TEXT;
