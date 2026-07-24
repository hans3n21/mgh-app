UPDATE "EmailTemplate"
SET "isActive" = FALSE,
    "updatedAt" = NOW()
WHERE "key" IN (
  'pickguard-anfrage',
  'pickguard-info',
  'customfertigung-info',
  'customfertigung-info-2',
  'pickguard-anfrage-absage-alt',
  'pickguard-preise'
);

UPDATE "EmailTemplate"
SET "sortOrder" = 20,
    "updatedAt" = NOW()
WHERE "key" = 'pickguard-anfrage-absage';

INSERT INTO "EmailTemplate" (
  "id",
  "mailAccountId",
  "key",
  "name",
  "subject",
  "body",
  "placeholders",
  "isActive",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  'tpl-pickguard-angebot-standard',
  "mailAccountId",
  'pickguard-angebot-standard',
  'Pickguard Angebot Standard',
  NULL,
  $template$
Hallo [Name],

ich fasse nochmal zusammen:
Pickguard fuer [Modell/Instrument]
Material/Design: [Material/Design]

diese Customfertigung kostet [passender Pickguard-Preis aus PriceItem] zzgl. [passende Versandkosten aus PriceItem] Porto/Verpackung.
Wenn kein Zielland genannt ist, nutze den Deutschland-Wert und formuliere "innerhalb Deutschlands".

Einfach das alte oder defekte Teil zu uns senden, wir tasten es mit unseren Maschinen ab und erstellen davon eine Schablone.
Auf diese Schablone befestigen wir das gewuenschte Material und fraesen 1:1 das neue Pickguard.

Als Service bieten wir an, dir eine Versandmarke via E-Mail zukommen zu lassen, um uns deine Vorlage zu senden.
Wenn du damit einverstanden bist, sende uns bitte in der Folgemail deine Versandadresse zu.

Bitte fuege deiner Lieferung ein Begleitschreiben mit allen Eckdaten bei.

Viele Gruesse
Johannes
MGH Guitars

Bitte beachte, dass es sich bei Customfertigungen um speziell auf Kundenwunsch gefertigte Produkte handelt und somit vom Umtausch/Rueckgaberecht ausgeschlossen ist.
$template$,
  ARRAY['Name', 'Modell/Instrument', 'Material/Design', 'Pickguard-Preis', 'Porto/Verpackung', 'Versandadresse'],
  TRUE,
  0,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT "mailAccountId"
  FROM "EmailTemplate"
  WHERE "key" IN (
    'pickguard-anfrage',
    'pickguard-info',
    'customfertigung-info',
    'customfertigung-info-2',
    'pickguard-anfrage-absage',
    'pickguard-anfrage-absage-alt',
    'pickguard-preise'
  )
) accounts
ON CONFLICT ("mailAccountId", "key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "subject" = EXCLUDED."subject",
  "body" = EXCLUDED."body",
  "placeholders" = EXCLUDED."placeholders",
  "isActive" = TRUE,
  "sortOrder" = 0,
  "updatedAt" = NOW();
