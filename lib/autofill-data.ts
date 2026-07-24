// Autofill-Vorgaben für Spec-Felder.
// Stand 2026-07: Optionen anhand der real genutzten Werte aus der Produktions-DB
// überarbeitet (häufigste Schreibweisen zuerst, ungenutzte Fantasie-Optionen entfernt,
// MGH-eigene Modelle/Profile ergänzt). Ja/Nein-Felder haben bewusst eine kurze Liste,
// damit die Schreibweise einheitlich bleibt.
export const AUTO_FIELDS = new Set<string>([
  // Body
  'body_shape','string_count','body_material','body_thickness','body_has_top','body_top',
  'body_top_thickness','body_binding','body_shaping','neck_construction','bridge_type',
  'pickups_routes','pickup_mount_direct','pickup_mount_frame','body_electronics_layout',
  'body_surface_treatment','pickguard','battery_compartment','neck_pocket','customer_provides_neck',
  // Neck
  'headstock_type','neck_wood','neck_shape','fretboard_scale','fretboard_radius','fretboard_material',
  'inlays','frets','nut','side_dots','action_12th','tuners','neck_binding','spokewheel',
  'finish_neck','headstock_finish','headstock_logo','neck_foot','customer_provides_body',
  // Finish / Allgemein
  'finish_body','finish_body_top','finish_body_back','electronics','hardware_color','strap_pins','strings','tuning',
  // Oberflächenbehandlung
  'objekt','oberflaeche_typ','farbe','aged','speziallack',
  // Tonabnehmer
  'pickup_type','bobbin_1','bobbin_2','magnet_type','wire','cover','pickup_surface_treatment',
  // Reparatur
  'repair_type','repair_area','repair_priority',
  // Pickguard
  'pg_material','pg_thickness','pg_shielding',
  // Gravur
  'engraving_material','engraving_depth_technique','vectorization_needed',
]);

const JA_NEIN = ['Ja', 'Nein'];

export const AUTOFILL_OPTIONS: Record<string,string[]> = {
  // Body fields
  body_shape: ['MGH Evil','MGH Demon','Crusader','Naz','Metalcaster','Telecaster','Stratocaster','Les Paul','SG','Explorer','Flying V','Jazzmaster','RG','PRS Doublecut','Superstrat','Headless','Custom nach Zeichnung/Bild'],
  string_count: ['6','7','8','4','5','12'],
  body_material: ['Erle','Esche','Mahagoni','Swamp Ash','Ahorn','Walnuss/Nussbaum','Basswood','Korina','Bubinga','Ovangkol','Zeder','Koa','Poplar'],
  body_thickness: ['32 mm','36 mm','38 mm','40 mm','42 mm','44 mm','45 mm','46 mm','50 mm'],
  body_has_top: JA_NEIN,
  neck_construction: ['Bolt-On','Set-Neck','Long Tenon Set-Neck','Neck-Through','Scarf Joint'],
  body_top: ['Riegelahorn (Flamed Maple)','Quilted Maple','Spalted Maple','Birdseye Maple','Figured Walnut','Burl Walnut','Buckeye Burl','Redwood Burl','Poplar Burl','Koa','Ziricote','Wenge','Padauk','Kein Top'],
  body_top_thickness: ['5 mm','6 mm','8 mm','10 mm','12 mm','14 mm','Solid'],
  body_binding: ['Nein','Creme','Weiß','Schwarz','Custom'],
  body_shaping: ['Bauchfräsung (Belly Cut)','Armauflage (Forearm Contour)','Belly Cut + Armauflage','Carved Top','Abgerundete Kanten','Standard','Custom (siehe Bild)'],
  bridge_type: ['Hardtail','Hardtail String-Through','Hipshot Hardtail','TOM','Floyd Rose (Gotoh 1996T)','Floyd Rose Original','Schaller Lockmeister','Ibanez Lo-Pro Edge','Evertune','Vintage Trem 2-Point','Gotoh 510 (2-Point)','Monorail-Einzelreiter','Headless-Bridge','Bigsby','Kunde liefert'],
  pickups_routes: ['HH','HH Direct Mount','HH Frame Mount','HSS','SSS','HSH','HS','Single H','P90','Custom'],
  pickup_mount_direct: JA_NEIN,
  pickup_mount_frame: JA_NEIN,
  body_electronics_layout: ['1x Vol','1x Vol, 1x Toggle','1x Vol, 1x Tone, 3-Way Toggle','1x Vol, 1x Tone, 3-Way Blade','1x Vol, 1x Tone, 5-Way Blade','2x Vol, 2x Tone, 3-Way Toggle (Les Paul)','1x Vol (Push/Pull Coil Split), 3-Way','Zusätzlicher Killswitch','Custom (siehe Notizen)'],
  body_surface_treatment: ['Oil/Wax','High Gloss','Satin','Matt','Grobschliff (Kunde behandelt selbst)','Feinschliff (Kunde behandelt selbst)','Raw','Custom'],
  pickguard: ['Nein','1-lagig Schwarz','3-lagig Schwarz','1-lagig Weiß','3-lagig Weiß','Mint Green','Custom'],
  battery_compartment: JA_NEIN,
  neck_pocket: ['Fender-Standard','Gibson-Style','PRS-Pattern','Custom'],
  customer_provides_neck: JA_NEIN,

  // Neck fields
  headstock_type: ['MGH Classic','MGH Classic Reversed','MGH Demon','MGH Sharp Reversed','Headless','6 in Line','6 in Line Reversed','7 in Line','3+3','Paddle','Fender-Style','Gibson-Style','PRS-Style','Custom (siehe Bild)'],
  neck_wood: ['Ahorn','Roasted Maple','Riegelahorn','Mahagoni','Ahorn 3-teilig','5-teilig Ahorn/Walnuss','Wenge','Ovangkol','Bubinga','Padauk'],
  neck_shape: ['Slim Taper','Modern C','Flat C','Flat D','Thin U','Wizard','Super Wizard','Asymmetric','Vintage V','Fat U (Baseball Bat)','MGH Classic','MGH Slim','Custom'],
  fretboard_scale: ['648 mm / 25.5" (Fender)','628 mm / 24.75" (Gibson)','635 mm / 25" (PRS)','610 mm / 24"','660 mm / 25.98"','686 mm / 27" (Bariton)','711 mm / 28" (Bariton)','762 mm / 30" (Bariton)','Multi-Scale (Fanned Frets)'],
  fretboard_radius: ['7.25" (184 mm)','9.5" (241 mm)','10" (254 mm)','12" (305 mm)','14" (356 mm)','16" (406 mm)','17" (430 mm)','20" (508 mm)','Compound 9.5"-14"','Compound 10"-16"'],
  fretboard_material: ['Ebenholz','Palisander','Ahorn','Roasted Maple','Birdseye Maple','Figured Maple','Pau Ferro','Richlite','Pale Moon Ebony','Macassar','Ziricote','Cocobolo'],
  inlays: ['Keine','Dots','Offset Dots','Black Dots','Perlmutt Dots','Luminlay','Blocks','Trapezoids','Sharkfin','Custom (siehe Anhang)'],
  frets: ['22 Medium','22 Medium Jumbo','22 Jumbo','24 Medium','24 Medium Jumbo','24 Jumbo','24 Jumbo Stainless Steel','24 Extra Jumbo Stainless Steel','21 Vintage','Fretless'],
  nut: ['Bone','Bone 42mm','Bone 43mm','Tusq','Graphtech Black Tusq XL','Locking Nut 42mm','Locking Nut (Floyd Rose R2/R3)','Headless-Sattel','Corian','Custom'],
  side_dots: ['Standard','Luminlay','Luminlay Grün','Schwarz','Weiß','Keine','Custom'],
  action_12th: ['1.5 mm / 0.059"','1.8 mm / 0.071"','2.0 mm / 0.079"','2.2 mm / 0.087"','2.5 mm / 0.098"','Custom Setup'],
  tuners: ['6R in Line','6L in Line','6R in Line Locking','6L in Line Locking','7R in Line Locking','3L+3R','3L+3R Locking','Gotoh SG381 MG-T Locking','Schaller Locking','Headless (Steinberger-Style)','4L+2R','Kunde liefert'],
  neck_binding: ['Nein','Weiß','Creme','Schwarz','Custom'],
  spokewheel: JA_NEIN,
  finish_neck: ['Oil/Wax','Natural Satin','Satin','Gloss','Raw Wood','Vintage Tint Nitro','Lackiert wie Body','Custom'],
  headstock_finish: ['Matching Headstock','Schwarz Matt','Schwarz High Gloss','Natural','Satin','Gloss','Oil/Wax','Custom'],
  headstock_logo: ['Altes Logo','Neues Logo','Eigenes Logo','Kein Logo'],
  neck_foot: ['Fender-Standard','Gibson-Style','PRS-Pattern','Custom'],
  customer_provides_body: JA_NEIN,

  // Finish fields
  finish_body: ['Oil/Wax','High Gloss','Satin','Matt','Burst (Farbe in Notizen)','Deckend lackiert','Beize + Klarlack','Relic/Aged','Grobschliff (Kunde lackiert selbst)','Natural','Custom Graphic'],
  finish_body_top: ['Oil/Wax','High Gloss','Satin','Matt','Burst (Farbe in Notizen)','Deckend lackiert','Beize + Klarlack','Relic/Aged','Grobschliff (Kunde lackiert selbst)','Natural','Custom Graphic'],
  finish_body_back: ['Oil/Wax','High Gloss','Satin','Matt','Burst (Farbe in Notizen)','Deckend lackiert','Beize + Klarlack','Relic/Aged','Grobschliff (Kunde lackiert selbst)','Natural','Custom Graphic'],
  electronics: ['1x Vol','1x Vol, 1x Toggle','1x Vol, 1x Tone, 3-Way','1x Vol, 1x Tone, 5-Way','2x Vol, 2x Tone, 3-Way (Les Paul)','Push/Pull Coil Split','Zusätzlicher Killswitch','Custom Wiring'],
  hardware_color: ['Black','Chrome','Gold','Nickel','Cosmo Black','Black Nickel','Aged Nickel','Satin Chrome'],
  strap_pins: ['Standard','Schaller Security Locks','Dunlop Straploks','Dunlop Flush Mount','Schwarz','Custom'],
  strings: ['.009-.042','.010-.046','.010-.052','.011-.049','.012-.054','Custom Gauge'],
  tuning: ['E-Standard','Eb-Standard','Drop D','Drop C#','Drop C','Drop A','D-Standard','C-Standard','DADGAD','Open G','Custom'],

  // Oberflächenbehandlung fields
  objekt: ['Gitarre komplett','Body','Hals','Headstock','Pickguard','Hardware','Sonstiges'],
  oberflaeche_typ: ['Nitro-Lack','Acryl-Lack','Polyurethan','Öl/Wachs','Shellac','2K-Lack','Wasserlack','Gravur','Lasergravur','Brandgravur'],
  farbe: ['Schwarz','Weiß','Rot','Blau','Grün','Gelb','Sunburst','Cherry Burst','Tobacco Burst','Natural','Transparent','Custom RAL'],
  aged: ['Nein','Light Aged','Medium Aged','Heavy Aged','Custom Relic','Road Worn'],
  speziallack: ['Nein','Burst','Risslack','Metallic','Perlmutt','Candy','Flip-Flop','Hammerschlag','Antik-Finish'],

  // Tonabnehmer fields
  pickup_type: ['Humbucker Set (77B/77N)','Humbucker Set (7TB/5N)','Single Coil Set','P90 Set','Einzelner Humbucker Bridge','Einzelner Humbucker Neck','Custom'],
  bobbin_1: ['Schwarz','Creme','Weiß','Zebra'],
  bobbin_2: ['Schwarz','Creme','Weiß','Zebra'],
  magnet_type: ['AlNiCo 5','AlNiCo 2','AlNiCo 8','Keramik','Custom'],
  wire: ['AWG 42','AWG 43','AWG 44'],
  cover: ['Open Coil','Chromkappe','Nickelkappe','Schwarz','Custom'],
  pickup_surface_treatment: ['Standard','Aged','Custom'],

  // Reparatur fields
  repair_type: ['Neubundierung','Setup/Einstellung','Elektronik','Lackausbesserung','Bruchreparatur','Umbau','Sonstiges'],
  repair_area: ['Hals','Bünde','Body','Headstock','Elektronik','Hardware','Komplett'],
  repair_priority: ['Normal','Hoch','Express'],

  // Pickguard fields
  pg_material: ['Kunststoff 1-lagig','Kunststoff 3-lagig','Metall/Alu','Holz','Kunde liefert'],
  pg_thickness: ['2 mm','2.5 mm','3 mm'],
  pg_shielding: JA_NEIN,

  // Gravur fields
  engraving_material: ['Holz','Metall','Kunststoff/Pickguard','Leder'],
  engraving_depth_technique: ['Lasergravur','CNC-Fräsung','Brandgravur'],
  vectorization_needed: JA_NEIN,
};
