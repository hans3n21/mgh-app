const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Hash für Passwörter
  const adminHash = await bcrypt.hash('mgh123', 10);
  const staffHash = await bcrypt.hash('staff123', 10);

  // Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mgh.local' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@mgh.local',
      passwordHash: adminHash,
      role: 'admin',
    },
  });

  // Staff Users
  const johannes = await prisma.user.upsert({
    where: { email: 'johannes@mgh.local' },
    update: {},
    create: {
      name: 'Johannes',
      email: 'johannes@mgh.local',
      passwordHash: staffHash,
      role: 'staff',
    },
  });

  const lenny = await prisma.user.upsert({
    where: { email: 'lenny@mgh.local' },
    update: {},
    create: {
      name: 'Lenny',
      email: 'lenny@mgh.local',
      passwordHash: staffHash,
      role: 'staff',
    },
  });

  const matze = await prisma.user.upsert({
    where: { email: 'matze@mgh.local' },
    update: {},
    create: {
      name: 'Matze',
      email: 'matze@mgh.local',
      passwordHash: staffHash,
      role: 'staff',
    },
  });

  const patrick = await prisma.user.upsert({
    where: { email: 'patrick@mgh.local' },
    update: {},
    create: {
      name: 'Patrick',
      email: 'patrick@mgh.local',
      passwordHash: staffHash,
      role: 'staff',
    },
  });

  // Customers
  const marcoD = await prisma.customer.upsert({
    where: { id: 'c-marco' },
    update: {},
    create: {
      id: 'c-marco',
      name: 'Marco D.',
      email: 'marco@example.com',
      phone: '+49 151 1234 5678',
    },
  });

  const bjoern = await prisma.customer.upsert({
    where: { id: 'c-bjoern' },
    update: {},
    create: {
      id: 'c-bjoern',
      name: 'Björn',
      email: 'bjoern@example.com',
      phone: '+49 170 222 8899',
    },
  });

  const sara = await prisma.customer.upsert({
    where: { id: 'c-sara' },
    update: {},
    create: {
      id: 'c-sara',
      name: 'Sara',
      email: 'sara@example.com',
      phone: '+49 160 777 1122',
    },
  });

  const erik = await prisma.customer.upsert({
    where: { id: 'c-erik' },
    update: {},
    create: {
      id: 'c-erik',
      name: 'Erik',
      email: 'erik@example.com',
      phone: '+49 172 333 4455',
    },
  });

  // Alle bestehenden Preis-Records zunächst deaktivieren Bei Kunden 
  await prisma.priceItem.updateMany({ data: { active: false } });

  // Price Items (KOMPLETT aus den bereitgestellten HTML-Tabellen)
  const priceItems = [
    // === REPARATUREN ===
    
    // Setup
    { category: 'Setup', label: 'Analyse', description: 'Fehlerquellenanalyse für evtl. weitere Arbeiten', priceText: '–', mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Halskrümmung einstellen', description: 'Justierung des Trussrods', priceText: '(inkludiert)', mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Saitenlage', description: 'Kontrolle/Bundkorrektur, Höhe der Saiten einstellen', priceText: '(inkludiert)', mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Radius einstellen an der Brücke', description: 'Anpassung des Brückenradius', priceText: '(inkludiert)', mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Intonation + stimmen', description: 'Grund-Feineinstellung', priceText: '(inkludiert)', mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Elektronik überprüfen', description: 'Prüfung & Reinigen von Potis/Buchsen (im Setup enthalten)', priceText: '(inkludiert)', mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Komplettsetup', description: 'Umfasst Halskrümmung, Saitenlage, Radius, Intonation, Elektronik-Check', unit: '€', price: 45, mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Komplettsetup Plus +', description: 'Für Gitarren mit Floyd Rose Style oder mit Evertune', unit: '€', price: 85, mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Saitenwechsel (Gitarre/Bass)', description: 'Neue Saiten aufziehen, zzgl. Saiten-Material', unit: '€', price: 25, mainCategory: 'Reparaturen' },
    { category: 'Setup', label: 'Grundreinigung', description: 'Demontage, Reinigung, Montage, defekte oder fehlende Schrauben ersetzen', priceText: '45€', mainCategory: 'Reparaturen' },

    // Kopfplatte
    { category: 'Kopfplatte', label: 'Sattel erneuern', description: 'Sattel entfernen, neu einsetzen und kerben', priceText: 'Kunststoff: 25 € / Knochen: 55 €', mainCategory: 'Reparaturen' },
    { category: 'Kopfplatte', label: 'Mechanikwechsel', description: 'Ausbau alte / Einbau neue Mechaniken, ggf. Bohren/Anpassen', priceText: '25 € zzgl. Material', mainCategory: 'Reparaturen' },
    { category: 'Kopfplatte', label: 'Halsbruch verleimen', description: 'Muss im Vorfeld begutachtet werden, ob reparabel. Einfaches Verleimen oder professionelle Lackretusche', priceText: 'Einfaches Verleimen: 20 € / Professionell: 220 €', mainCategory: 'Reparaturen' },
    { category: 'Kopfplatte', label: 'Sattel nachkerben / auf dickere Saitenstärke anpassen', description: 'Vertiefung / Anpassung der Sattelschlitze', unit: '€', price: 15, mainCategory: 'Reparaturen' },

    // Griffbrett
    { category: 'Griffbrett', label: 'scharfkantige Bundenden verrunden & polieren', description: 'Seitliche Bundenden abrunden und polieren', priceText: '60 € / 90 € Stainless Steel', mainCategory: 'Reparaturen' },
    { category: 'Griffbrett', label: 'Bünde komplett abrichten & polieren', description: 'Komplettes Abrichten (Planfeilen), Polieren, Setup', priceText: 'Schraubhals: 80 € / geleimt/durchgehend: 90 €', mainCategory: 'Reparaturen' },
    { category: 'Griffbrett', label: 'Neubundierung', description: 'Austausch aller Bünde (Nickel-Silber), Abrichten, Polieren, Setup', priceText: 'Schraubhals: 180 € / geleimt: 200 € / mit Binding: +20 € / Stainless Steel: +30€', mainCategory: 'Reparaturen' },
    { category: 'Griffbrett', label: 'Bearbeitung einzelner Bundstäbchen', description: 'Korrigieren / Feilen eines herausstehenden Bundendes', unit: '€', price: 20, mainCategory: 'Reparaturen' },
    { category: 'Griffbrett', label: 'Griffbrett abrichten + Neubundierung', description: 'Griffbrett begradigen, Bundschlitze nachsägen + Neubundierung', unit: '€', price: 280, mainCategory: 'Reparaturen' },

    // Korpus
    { category: 'Korpus', label: 'Grundreinigung', description: 'Demontage, Reinigung, Montage, defekte oder fehlende Schrauben ersetzen', priceText: '45 € zzgl. Material', mainCategory: 'Reparaturen' },
    { category: 'Korpus', label: 'Riss-/Bruchreparatur am Korpus', description: 'Leimen, Verspannen, ggf. Auffüllen, Schleifen (ohne Komplettlackierung)', priceText: 'Riss verfüllen: 25 € / Ausbesserungsarbeiten: 60 €', mainCategory: 'Reparaturen' },
    { category: 'Korpus', label: 'Gurtpin setzen', description: '–', priceText: '10 € zzgl. Material', mainCategory: 'Reparaturen' },

    // Elektronik & Elektrik
    { category: 'Elektronik & Elektrik', label: 'Elektronik-Grundreinigung', description: 'Kontaktprobleme (Potis, Buchse, Schalter) beseitigen, Reinigen & Pflegen der Kontakte', priceText: '30 € – 40 €', mainCategory: 'Reparaturen' },
    { category: 'Elektronik & Elektrik', label: 'Lötarbeiten', description: 'Allgemeine Lötarbeiten an Kabeln, Korrektur defekter Lötstellen (ohne Teile)', priceText: '45 € zzgl. Material', mainCategory: 'Reparaturen' },
    { category: 'Elektronik & Elektrik', label: 'Kleine Lötarbeiten', description: 'z. B. gelöstes Kabel, Klinkenbuchse abgedreht, kleiner Wackler o. Ä.', priceText: 'nach Aufwand (z. B. 10–20 €)', mainCategory: 'Reparaturen' },
    { category: 'Elektronik & Elektrik', label: 'Poti- / Schalter-Tausch', description: 'Aus-/Einbau des Bauteils (ohne Material), Einlöten, Anpassung, Test', priceText: '20 €/Teil zzgl. Material', mainCategory: 'Reparaturen' },
    { category: 'Elektronik & Elektrik', label: 'Tonabnehmer-Tausch (pro Pickup)', description: 'Ausbau des alten / Einbau des neuen, Verlötung & Grundeinstellung', priceText: '20 € zzgl. Material', mainCategory: 'Reparaturen' },
    { category: 'Elektronik & Elektrik', label: 'Aktivelektronik / Preamp', description: 'Nachrüstung: Batteriefach, Schalter, Verkabelung, Verlötung & Test', priceText: '60 € zzgl. Material', mainCategory: 'Reparaturen' },

    // Pickup-Schmiede
    { category: 'Pickup-Schmiede', label: 'Neuwicklung Single-Coil', description: 'Handgewickelt nach Kundenwunsch (Draht, Wicklungen)', unit: '€', price: 45, mainCategory: 'Reparaturen' },
    { category: 'Pickup-Schmiede', label: 'Neuwicklung Humbucker', description: 'Handgewickelt, Alnico oder Keramik-Magnet', unit: '€', price: 80, mainCategory: 'Reparaturen' },
    { category: 'Pickup-Schmiede', label: 'Pickup-Reparatur', description: 'Defekte Wicklung, Wackler, Magnettausch, Aufladen schwacher Magnete, Funktionsprüfung', priceText: '40–50 €', mainCategory: 'Reparaturen' },
    { category: 'Pickup-Schmiede', label: 'Behandlung gegen Mikrofonie (Vakuumbad)', description: 'Imprägnierung zur Reduktion von Mikrofonie', unit: '€', price: 25, mainCategory: 'Reparaturen' },

    // Oberflächenbehandlung
    { category: 'Oberflächenbehandlung', label: 'Deckende Lackierung (Nitro/Poly)', description: 'Body oder Neck einfarbig, Mehrere Lack- & Schleifdurchgänge, Hochglanz oder Matt', priceText: '450 € (Matt) / 550 € (Hochglanz)', mainCategory: 'Reparaturen' },
    { category: 'Oberflächenbehandlung', label: 'Geölt / Gewachst', description: 'Natürliche Holzoberfläche (Öl/Wachs), Seidenmatter Look, spürbare Holzstruktur', priceText: '100 € – 150 €', mainCategory: 'Reparaturen' },
    { category: 'Oberflächenbehandlung', label: 'Beizen + Klarlack (Seidenmatt)', description: 'Holz beizen in Wunschfarbe, Abschließender Schutzlack (Poly)', priceText: '150 € – 250 €', mainCategory: 'Reparaturen' },
    { category: 'Oberflächenbehandlung', label: 'Effekt-Lackierung', description: 'Crackle, Burst, Metallic, Aufwendige Zwischen- & Endschliffe', priceText: '550 € (Matt) / 650 € (Glanz)', mainCategory: 'Reparaturen' },
    { category: 'Oberflächenbehandlung', label: 'Relicing / Aging', description: 'Künstliche Alterung (leicht, mittel, stark), Optional Hardware-Aging', priceText: '150 € – 250 €', mainCategory: 'Reparaturen' },
    { category: 'Oberflächenbehandlung', label: 'Epoxy-Finish / Teil-Guss', description: 'Klarer oder gefärbter Epoxy-Guss (z. B. Top-Schicht), Schleifen, Polieren', priceText: '350 € – 500 €', mainCategory: 'Reparaturen' },
    { category: 'Oberflächenbehandlung', label: 'Lackausbesserung', description: 'Ausbessern von Platzern, Kratzern, Blindstellen (Deckschicht)', unit: '€', price: 80, mainCategory: 'Reparaturen' },

    // Inlays
    { category: 'Inlays', label: 'Dot Inlays ersetzen', description: 'Erneuerung / Upgrade der einfachen Dot-Inlays, z. B. Perlmutt oder Abalone', priceText: '60 € – 100 € (Satz)', mainCategory: 'Reparaturen' },
    { category: 'Inlays', label: 'Block / Sharkfin Inlays', description: 'Auffräsen des Griffbretts, Einsetzen & Verfugen (Perlmutt, Kunststoff etc.)', priceText: '150 € – 250 €', mainCategory: 'Reparaturen' },
    { category: 'Inlays', label: 'Custom Inlay / Design', description: 'Individuelle Formen/Motive, Perlmutt, Abalone oder andere Materialien', priceText: 'ab 200 €', mainCategory: 'Reparaturen' },
    { category: 'Inlays', label: 'Epoxy-Inlay', description: 'Ausfräsen & Gießen mit farbigem/klarem Epoxidharz, Planschleifen, Polieren', priceText: 'ab 150 €', mainCategory: 'Reparaturen' },

    // Custom Gravur & Print
    { category: 'Custom Gravur & Print', label: 'Lasergravur (CO2)', description: 'Gravur von Text / Logo auf Korpus – Bis ca. 10×10 cm (größer gegen Aufpreis)', priceText: '50 € – 80 €', mainCategory: 'Reparaturen' },
    { category: 'Custom Gravur & Print', label: 'Siebdruck (Logo / Artwork)', description: 'Siebdruck auf Korpus oder Pickguard – 1-farbig (mehrfarbig gegen Aufpreis)', priceText: 'ab 70 €', mainCategory: 'Reparaturen' },
    { category: 'Custom Gravur & Print', label: 'Grafik Vektorisieren', description: 'Umwandeln einer Vorlage (z. B. JPG) in vektorbasierte Dateien – Erforderlich für Gravur / Siebdruck mit filigranen Details', priceText: 'ab 30 €', mainCategory: 'Reparaturen' },
    { category: 'Custom Gravur & Print', label: 'Individuelle Motive / Designs', description: 'Kombination Lasergravur, Siebdruck, Lackierung – Beratung & Umsetzung von Custom-Artworks', priceText: 'nach Aufwand', mainCategory: 'Reparaturen' },

    // === GUITAR PARTS ===

    // Necks & Fretboards
    { category: 'Necks & Fretboards', label: 'Neck – blank', description: 'z. B. Maple, Mahagoni; ohne Form & Bohrungen', priceText: '60–100 €', mainCategory: 'Guitar Parts' },
    { category: 'Necks & Fretboards', label: 'Halsrohling', description: 'kein Feinschliff, keine Bünde', priceText: '120–150 €', mainCategory: 'Guitar Parts' },
    { category: 'Necks & Fretboards', label: 'Neck – geformt & geschliffen (unlackiert)', description: 'Ohne Bünde, sofort lackier- oder ölbar', priceText: '150–200 €', mainCategory: 'Guitar Parts' },
    { category: 'Necks & Fretboards', label: 'Neck – fertig (lackiert/geölt & bundiert)', description: 'Spielbereit, Standard-Bundierung (Nickel-Silber)', priceText: '220–350 €', mainCategory: 'Guitar Parts' },
    { category: 'Necks & Fretboards', label: 'Griffbrett – blank', description: 'Rosewood, Maple oder andere Hölzer', priceText: '30–70 €', mainCategory: 'Guitar Parts' },
    { category: 'Necks & Fretboards', label: 'Griffbrett – geschlitzt & radiused', description: 'Vorbereitet für Bundierung (verschiedene Radien möglich)', priceText: '80–120 €', mainCategory: 'Guitar Parts' },

    // Bodies
    { category: 'Bodies', label: 'Body – blank (rough cut)', description: 'z. B. Swamp Ash / Mahagoni, grob vorgeschnitten, keine Fräsungen', priceText: '80–120 €', mainCategory: 'Guitar Parts' },
    { category: 'Bodies', label: 'Body – shaped (unrouted)', description: 'Außenform fertig, keine Pickup-/Elektronikfräsung', priceText: '120–180 €', mainCategory: 'Guitar Parts' },
    { category: 'Bodies', label: 'Body – shaped + Standard-Fräsungen', description: 'z. B. S-S-S, H-S-S, H-H, Elektronikfach, Hals-Tasche', priceText: '180–220 €', mainCategory: 'Guitar Parts' },
    { category: 'Bodies', label: 'Body – komplett geroutet & geschliffen', description: 'Tremolo (Vintage/Standard), spielfertig zum Lackieren', priceText: '220–280 €', mainCategory: 'Guitar Parts' },
    { category: 'Bodies', label: 'Floyd Rose-Fräsung', description: 'Aufwendige Tremoloausfräsung', priceText: '+40–60 €', mainCategory: 'Guitar Parts' },
    { category: 'Bodies', label: 'Binding (einfach)', description: 'Einfräsen & Anbringen eines Bindings', priceText: '+50–80 €', mainCategory: 'Guitar Parts' },
    { category: 'Bodies', label: 'Kanten verrunden (Roundover)', description: 'Absoften der Body-Kanten', priceText: '+20–30 €', mainCategory: 'Guitar Parts' },

    // Knobs & Frames
    { category: 'Knobs & Frames', label: 'Knobs (2er-Set) – Standardform (Holz)', description: 'Aus Holzresten, klassisches Design', priceText: '15–25 €', mainCategory: 'Guitar Parts' },
    { category: 'Knobs & Frames', label: 'Knobs (2er-Set) – individuelle Form', description: 'Custom Shape, Holzart nach Verfügbarkeit', priceText: '25–45 €', mainCategory: 'Guitar Parts' },
    { category: 'Knobs & Frames', label: 'Frame – Humbucker-Rahmen (Standardform)', description: 'Holz-Humbucker-Rahmen, z. B. für Les-Paul-Style', unit: '€', price: 20, mainCategory: 'Guitar Parts' },
    { category: 'Knobs & Frames', label: 'Frame – Humbucker-Rahmen (Custom-Form)', description: 'Individuelle Kontur, Holz nach Wahl', priceText: '30–40 €', mainCategory: 'Guitar Parts' },

    // Custom Pickups
    { category: 'Custom Pickups', label: 'Single Coil – handgewickelt', description: 'Alnico/Keramik-Magnet, Bobbin-Farbe wählbar, inkl. Vacuum-Potting (wachsgetränkt) gegen Mikrofonie', priceText: '60–80 €', mainCategory: 'Guitar Parts' },
    { category: 'Custom Pickups', label: 'Humbucker – handgewickelt', description: 'Draht & Magnet nach Wunsch (Alnico/Keramik), Cover oder offene Bobbins, vakuumimprägniert', priceText: '90–120 €', mainCategory: 'Guitar Parts' },
    { category: 'Custom Pickups', label: 'Pickup-Reparatur', description: 'Defekte Wicklung, Magnettausch, schwache Magnete aufladen – inkl. neuer Wachsimprägnierung', priceText: '40–50 €', mainCategory: 'Guitar Parts' },
    { category: 'Custom Pickups', label: 'Custom Oberflächenbehandlung', description: 'z. B. „Bare Knuckle Style", Gravur, geprägtes Cover, Spezial-Lack etc.', priceText: '+20–50 € (Aufpreis)', mainCategory: 'Guitar Parts' },

    // Pickguards
    { category: 'Pickguards', label: 'Custom Pickguard', description: 'Kopie deines Schlagbrettes in verschiedensten Materialien', priceText: 'ab 28 €', mainCategory: 'Guitar Parts' },
    { category: 'Pickguards', label: 'Trussrodcover', description: 'Abdeckplatte', priceText: 'ab 5 €', mainCategory: 'Guitar Parts' },
    { category: 'Pickguards', label: 'Backplates', description: 'Abdeckplatten der Elektronik', priceText: 'ab 5 €', mainCategory: 'Guitar Parts' }
  ];

  for (const item of priceItems) {
    const slug = item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await prisma.priceItem.upsert({
      where: { id: `price-${slug}` },
      update: {
        category: item.category,
        label: item.label,
        description: item.description || null,
        unit: item.unit || null,
        price: item.price || null,
        min: null, // Vereinfacht: setze immer null
        max: null, // Vereinfacht: setze immer null
        priceText: item.priceText || null,
        mainCategory: item.mainCategory || null,
        active: true,
      },
      create: {
        id: `price-${slug}`,
        category: item.category,
        label: item.label,
        description: item.description || null,
        unit: item.unit || null,
        price: item.price || null,
        min: null,
        max: null,
        priceText: item.priceText || null,
        mainCategory: item.mainCategory || null,
        active: true,
      },
    });
  }

  // Orders
  const orders = [
    {
      id: 'ORD-2025-001',
      title: 'Custom T-Style',
      type: 'GUITAR',
      customerId: marcoD.id,
      assigneeId: johannes.id,
      status: 'in_progress',
      createdAt: new Date('2025-07-31'),
    },
    {
      id: 'ORD-2025-002',
      title: 'P-Bass Pickguard',
      type: 'PICKGUARD',
      customerId: bjoern.id,
      assigneeId: lenny.id,
      status: 'awaiting_customer',
      createdAt: new Date('2025-07-15'),
    },
    {
      id: 'ORD-2025-003',
      title: 'Luke Body HH + Floyd',
      type: 'BODY',
      customerId: erik.id,
      assigneeId: patrick.id,
      status: 'quote',
      createdAt: new Date('2025-08-07'),
    },
    {
      id: 'ORD-2025-004',
      title: 'Setup Plus (Floyd)',
      type: 'REPAIR',
      customerId: bjoern.id,
      assigneeId: matze.id,
      status: 'intake',
      createdAt: new Date('2025-08-01'),
    },
    {
      id: 'ORD-2025-005',
      title: 'HB Set Black',
      type: 'PICKUPS',
      customerId: sara.id,
      assigneeId: johannes.id,
      status: 'in_progress',
      createdAt: new Date('2025-08-08'),
    },
    {
      id: 'ORD-2025-006',
      title: 'Inlay 12. Bund (Wolf)',
      type: 'ENGRAVING',
      customerId: erik.id,
      assigneeId: lenny.id,
      status: 'design_review',
      createdAt: new Date('2025-08-06'),
    },
    {
      id: 'ORD-2025-007',
      title: 'Neck Mahagoni 24 Fret',
      type: 'NECK',
      customerId: marcoD.id,
      assigneeId: patrick.id,
      status: 'quote',
      createdAt: new Date('2025-08-10'),
    },
    {
      id: 'ORD-2025-008',
      title: 'Burst Lackierung',
      type: 'FINISH_ONLY',
      customerId: sara.id,
      assigneeId: lenny.id,
      status: 'intake',
      createdAt: new Date('2025-08-12'),
    },
  ];

  for (const order of orders) {
    await prisma.order.upsert({
      where: { id: order.id },
      update: {},
      create: order,
    });
  }

  // OrderSpecKV für Gitarren-Auftrag
  const guitarSpecs = [
    { key: 'neck_construction', value: 'Long Tenon – Bolt-On' },
    { key: 'neck_profile_progression', value: '40 mm → 57 mm' },
    { key: 'neck_wood', value: 'Riegelahorn – Mahagoni 5-teilig' },
    { key: 'headstock_angle', value: '15°' },
    { key: 'headstock_veneer', value: 'Maple, furniert' },
    { key: 'fretboard_scale', value: '635 mm (PRS)' },
    { key: 'fretboard_radius', value: '16\'' },
    { key: 'fretboard_material', value: 'Maple – Maserung längs' },
    { key: 'nut', value: '41 mm – R2 Locking Nut' },
    { key: 'inlays', value: 'Schwarz, 12. Bund Abstand 30 mm' },
    { key: 'side_dots', value: 'Schwarz' },
    { key: 'frets', value: '24 Jumbo' },
    { key: 'neck_shape', value: 'Flat C – 20 mm durchgehend' },
    { key: 'body_material', value: 'Mahagoni, Ahorn-Top' },
    { key: 'body_thickness', value: '50 mm' },
    { key: 'body_binding', value: 'Ja' },
    { key: 'body_top_thickness', value: '12–14 mm Wölbung' },
    { key: 'body_bellycut', value: 'Ja (siehe Skizze)' },
    { key: 'bridge_type', value: 'Floyd Rose Low-Pro FRTP2000' },
    { key: 'pickups_config', value: '2× Humbucker + Frame Mount' },
    { key: 'electronics_switch', value: '3-Way (AP0032)' },
    { key: 'electronics_pots', value: '1× Push-Pull Volume (Split Coil – äußere Spulen)' },
    { key: 'finish_body', value: 'Dark Blue Burst, Back Mahagoni natur – Rostbraun' },
    { key: 'finish_neck', value: 'Oil/Wax, Headstock Klarlack' },
    { key: 'hardware_color', value: 'Schwarz' },
    { key: 'tuners', value: 'Gotoh SG381-07 MG-T 6L' },
    { key: 'strings', value: '.009–.042, Standard Tuning' },
    { key: 'action_12th', value: '1.5 mm' },
    { key: 'strap_pins', value: 'Standard' },
    { key: 'notes', value: '' },
    { key: 'price', value: '3020 €' },
  ];

  for (const spec of guitarSpecs) {
    await prisma.orderSpecKV.upsert({
      where: { id: `spec-ORD-2025-001-${spec.key}` },
      update: {},
      create: {
        id: `spec-ORD-2025-001-${spec.key}`,
        orderId: 'ORD-2025-001',
        key: spec.key,
        value: spec.value,
      },
    });
  }

  // Procurement Items
  const procurementItems = [
    {
      name: 'Floyd Rose (Original, Chrome)',
      qty: 2,
      unit: 'Stk',
      status: 'offen',
      note: 'für ORD-2025-003',
      createdBy: johannes.id,
    },
    {
      name: 'Trussrod 2-way 460mm',
      qty: 10,
      unit: 'Stk',
      status: 'bestellt',
      createdBy: matze.id,
    },
    {
      name: 'Pickup Cover Set (Chrom)',
      qty: 5,
      unit: 'Set',
      status: 'offen',
      note: 'für Custom Pickups',
      createdBy: lenny.id,
    },
    {
      name: 'Mahagoni Rohling 50mm',
      qty: 3,
      unit: 'Stk',
      status: 'archiviert',
      note: 'bereits eingetroffen und verwendet',
      createdBy: patrick.id,
      archivedAt: new Date('2025-07-20'),
    },
  ];

  for (const item of procurementItems) {
    await prisma.procurementItem.create({
      data: item,
    });
  }

  // Beispielbilder für Demo-Zwecke hinzufügen
  const sampleImages = [
    {
      orderId: 'ORD-2025-001',
      path: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
      comment: 'Referenzbild für Custom T-Style',
      position: 0,
      attach: false,
      scope: 'body',
    },
    {
      orderId: 'ORD-2025-001', 
      path: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=400',
      comment: 'Hals-Design Inspiration',
      position: 1,
      attach: false,
      scope: 'neck',
    },
    {
      orderId: 'ORD-2025-003',
      path: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
      comment: 'Luke Body Referenz',
      position: 0,
      attach: false,
      scope: 'body',
    },
    {
      orderId: 'ORD-2025-005',
      path: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
      comment: 'Humbucker Pickup Design',
      position: 0,
      attach: false,
      scope: 'pickups',
    }
  ];

  for (const imageData of sampleImages) {
    await prisma.orderImage.create({
      data: imageData,
    });
  }

  console.log('✅ Database seeded successfully');
  console.log(`👤 Admin: admin@mgh.local / mgh123`);
  console.log(`👥 Staff: johannes@mgh.local / staff123`);
  console.log(`📦 Created ${orders.length} orders`);
  console.log(`🏷️ Created ${priceItems.length} price items`);
  console.log(`🛒 Created ${procurementItems.length} procurement items`);
  console.log(`🖼️ Created ${sampleImages.length} sample images`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });