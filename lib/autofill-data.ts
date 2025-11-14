export const AUTO_FIELDS = new Set<string>([
  'body_shape','body_material','body_thickness','neck_construction','body_top','body_top_thickness',
  'body_shaping','bridge_type','pickups_routes','body_electronics_layout','body_surface_treatment',
  'headstock_type','neck_wood','neck_shape','fretboard_scale','fretboard_radius','fretboard_material',
  'inlays','frets','nut','side_dots','action_12th','tuners','finish_neck',
  'finish_body','electronics','hardware_color','strap_pins','strings',
  'objekt','oberflaeche_typ','farbe','aged','speziallack'
]);

export const AUTOFILL_OPTIONS: Record<string,string[]> = {
  // Body fields
  body_shape: ['RG','Strat','Tele','PRS','Warlock','V','Dinky','SLY17','Hammer V','Les Paul','Explorer','Jazzmaster','SG','Flying V','Firebird'],
  body_material: ['Mahagoni','Esche','Erle','Swamp Ash','Walnuss','Ahorn','Bubinga','Korina','Ovangkol','Basswood','Zeder','Wenge','Koa','Poplar'],
  body_thickness: ['38 mm','40 mm','42 mm','45 mm','47 mm','50 mm','52 mm','55 mm'],
  neck_construction: ['Bolt-On','Set-Neck','Neck-Through','Long Tenon','Scarf Joint'],
  body_top: ['Flamed Maple','Quilted Maple','Spalted Maple','Birdseye Maple','Curly Maple','Figured Walnut','Burl Walnut','Buckeye Burl','Redwood Burl','Poplar Burl','Koa','Ziricote','Wenge','Padauk','Purpleheart','Keine Top'],
  body_top_thickness: ['6 mm','8 mm','10 mm','12 mm','14 mm','16 mm','18 mm','Solid'],
  body_shaping: ['Bauchfräsung','Armkontur','Beides','Standard','Custom Contouring'],
  bridge_type: ['Hardtail','TOM','Floyd Rose','Hipshot','Vintage Trem 2-Point','Kluson 3D4','Schaller Hannes','Bigsby','Kahler','Wilkinson'],
  pickups_routes: ['HH','HSS','SSS','HSH','HHH','P90','Single H','Custom'],
  body_electronics_layout: ['Standard','Swimming Pool','F-Hole Access','Back Access','Side Access'],
  body_surface_treatment: ['Standard','Carved Top','Flamed Top','Quilted Top','Bookmatched','Plain'],

  // Neck fields
  headstock_type: ['Standard','Reversed','Angled','Straight','PRS-Style','Fender-Style','Gibson-Style','Custom','3+3','6-Inline','4+2'],
  neck_wood: ['Mahagoni','Ahorn','Riegelahorn','Walnuss','Ovangkol','Wenge','Rosenholz','Bubinga','Padauk','Purpleheart'],
  neck_shape: ['C','D','U','V','Asymmetric','Flat C','Round C','Modern C','Vintage V','Baseball Bat'],
  fretboard_scale: ['635 mm (PRS)','648 mm (Fender)','628 mm (Gibson)','650 mm','25.5"','24.75"','Multi-Scale'],
  fretboard_radius: ['7.25"','9.5"','10"','12"','14"','16"','20"','Compound 10"-16"','Compound 9.5"-14"'],
  fretboard_material: ['Ebenholz','Palisander','Ahorn','Maple (Flamed)','Pau Ferro','Macassar','Ziricote','Cocobolo'],
  inlays: ['Dots','Blocks','Trapezoids','Birds','Abalone','MOP','Custom','Blank','Shark Tooth','Crown'],
  frets: ['22 Medium','22 Jumbo','24 Medium','24 Jumbo','21 Vintage','Stainless Steel','Gold','21 Medium'],
  nut: ['Bone','Tusq','Graphite','Locking','Floyd Rose','41mm','42mm','43mm','44mm','Corian'],
  side_dots: ['Standard','Abalone','MOP','Black','White','LED','Custom','None'],
  action_12th: ['1.5 mm','1.8 mm','2.0 mm','2.2 mm','2.5 mm','Custom Setup'],
  tuners: ['3L + 3R','6 Inline','4 Inline','3L + 3R Locking','6 Inline Locking','4L + 2R','Custom'],
  finish_neck: ['Oil/Wax','Satin','Gloss','Tinted Oil','Raw Wood','Vintage Tint'],

  // Finish fields
  finish_body: ['Oil/Wax','Lackiert','High Gloss','Satin','Nitro','Poly','Relic','Cherry Burst','Tobacco Burst','Sunburst','Natural'],
  electronics: ['3-Way','5-Way','Push-Pull','Coil Split','Phase Switch','Kill Switch','Custom Wiring'],
  hardware_color: ['Black','Chrome','Gold','Nickel','Cosmo Black','Aged Nickel','Satin Chrome','Antique Brass'],
  strap_pins: ['Standard','Schaller','Dunlop','Flush Mount','Custom'],
  strings: ['.009-.042','.010-.046','.011-.049','.012-.054','Custom Gauge','Drop Tuning Set'],

  // Oberflächenbehandlung fields
  objekt: ['Gitarre komplett','Body','Hals','Headstock','Pickguard','Hardware','Sonstiges'],
  oberflaeche_typ: ['Nitro-Lack','Acryl-Lack','Polyurethan','Öl/Wachs','Shellac','2K-Lack','Wasserlack','Gravur','Lasergravur','Brandgravur'],
  farbe: ['Schwarz','Weiß','Rot','Blau','Grün','Gelb','Sunburst','Cherry Burst','Tobacco Burst','Natural','Transparent','Custom RAL'],
  aged: ['Nein','Light Aged','Medium Aged','Heavy Aged','Custom Relic','Road Worn'],
  speziallack: ['Nein','Risslack','Metallic','Perlmutt','Candy','Flip-Flop','Hammerschlag','Antik-Finish'],
};
