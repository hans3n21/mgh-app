export enum OrderType {
  GUITAR = "GUITAR",
  BODY = "BODY",
  NECK = "NECK",
  REPAIR = "REPAIR",
  PICKGUARD = "PICKGUARD",
  PICKUPS = "PICKUPS",
  ENGRAVING = "ENGRAVING",
  FINISH_ONLY = "FINISH_ONLY",
}

export type CategoryKey =
  | "body" | "neck" | "finish" | "oberflaeche"
  | "repair" | "pickguard" | "pickups" | "engraving";

export type ImageScope =
  | "body" | "neck" | "finish" | "oberflaeche"
  | "repair" | "pickguard" | "pickups" | "engraving";

type Preset = {
  categories: CategoryKey[];
  fields: Record<CategoryKey, string[]>;     // Reihenfolge je Kategorie
  required?: Partial<Record<CategoryKey, string[]>>;
  imageScopes: ImageScope[];
};

export const SPEC_PRESETS: Record<OrderType, Preset> = {
  GUITAR: {
    categories: ["body","neck","finish"],
    fields: {
      body: ["body_shape","body_material","body_thickness","neck_construction","body_binding","body_top_thickness","body_shaping","bridge_type","pickups_routes","body_electronics_layout","body_surface_treatment","body_extras"],
      neck: ["headstock_type","neck_wood","neck_shape","fretboard_scale","fretboard_radius","fretboard_material","inlays","frets","nut","side_dots","action_12th","tuners","finish_neck","neck_extras"],
      finish: ["finish_body","electronics","hardware_color","strap_pins","strings","notes"],
      oberflaeche: [],
      repair: [],
      pickguard: [],
      pickups: [],
      engraving: []
    },
    required: {
      body: ["body_shape"],
      neck: ["headstock_type"],
      finish: ["finish_body"]
    },
    imageScopes: ["body","neck","finish"],
  },
  BODY: {
    categories: ["body","finish"],
    fields: {
      body: ["body_shape","body_material","body_thickness","neck_construction","body_binding","body_top_thickness","body_shaping","bridge_type","pickups_routes","body_electronics_layout","body_surface_treatment","body_extras"],
      neck: [],
      finish: ["finish_body","hardware_color","notes"],
      oberflaeche: [],
      repair: [],
      pickguard: [],
      pickups: [],
      engraving: []
    },
    required: { body: ["body_shape"] },
    imageScopes: ["body","finish"],
  },
  NECK: {
    categories: ["neck","finish"],
    fields: {
      body: [],
      neck: ["headstock_type","neck_wood","neck_shape","fretboard_scale","fretboard_radius","fretboard_material","inlays","frets","nut","side_dots","action_12th","tuners","finish_neck","neck_extras"],
      finish: ["finish_body","notes"],
      oberflaeche: [],
      repair: [],
      pickguard: [],
      pickups: [],
      engraving: []
    },
    required: { neck: ["headstock_type"] },
    imageScopes: ["neck","finish"],
  },
  REPAIR: {
    categories: ["repair"],
    fields: {
      repair: ["repair_type","repair_area","repair_description","repair_materials_needed","repair_priority","repair_extras"],
      body: [], 
      neck: [], 
      finish: [],
      oberflaeche: [],
      pickguard: [],
      pickups: [],
      engraving: []
    },
    required: { repair: ["repair_type","repair_area"] },
    imageScopes: ["repair"],
  },
  PICKGUARD: {
    categories: ["pickguard"],
    fields: {
      pickguard: ["pg_model","pg_material","pg_color_finish","pg_thickness","pg_shielding","pg_notes"],
      body: [], 
      neck: [], 
      finish: [],
      oberflaeche: [],
      repair: [],
      pickups: [],
      engraving: []
    },
    required: { pickguard: ["pg_model","pg_material"] },
    imageScopes: ["pickguard"],
  },
  PICKUPS: {
    categories: ["pickups"],
    fields: {
      pickups: ["pickup_type","bobbin_1","bobbin_2","magnet_type","wire","dc_resistance_target","cover","pickup_surface_treatment","pickup_notes"],
      body: [], 
      neck: [], 
      finish: [],
      oberflaeche: [],
      repair: [],
      pickguard: [],
      engraving: []
    },
    required: { pickups: ["pickup_type","magnet_type"] },
    imageScopes: ["pickups"],
  },
  ENGRAVING: {
    categories: ["engraving"],
    fields: {
      engraving: ["engraving_material","engraving_area","engraving_depth_technique","engraving_vector_file","vectorization_needed","engraving_notes"],
      body: [], 
      neck: [], 
      finish: [],
      oberflaeche: [],
      repair: [],
      pickguard: [],
      pickups: []
    },
    required: { engraving: ["engraving_material","engraving_area"] },
    imageScopes: ["engraving"],
  },
  FINISH_ONLY: {
    categories: ["oberflaeche"],
    fields: {
      oberflaeche: ["objekt","oberflaeche_typ","farbe","aged","speziallack","notes"],
      body: [], 
      neck: [],
      finish: [],
      repair: [],
      pickguard: [],
      pickups: [],
      engraving: []
    },
    required: { oberflaeche: ["objekt","oberflaeche_typ"] },
    imageScopes: ["oberflaeche"],
  },
};

// Field labels for UI display (German)
export const FIELD_LABELS: Record<string, string> = {
  // Body fields
  body_shape: "Korpusform",
  body_material: "Korpusmaterial",
  body_binding: "Korpus Binding",
  body_top_thickness: "Decken-Dicke",
  body_shaping: "Shaping",
  bridge_type: "Brücken-Typ",
  body_thickness: "Korpus-Dicke",
  pickups_routes: "Tonabnehmer-Fräsungen",
  body_electronics_switch: "Elektronik-Schalter",
  body_electronics_layout: "Elektronik-Layout",
  body_surface_treatment: "Oberflächenbehandlung",
  body_extras: "Korpus-Extras",

  // Neck fields
  headstock_type: "Headstock-Typ",
  neck_construction: "Hals-Konstruktion",
  neck_wood: "Hals-Holz",
  fretboard_scale: "Mensur",
  fretboard_radius: "Griffbrett-Radius",
  fretboard_material: "Griffbrett-Material",
  inlays: "Inlays",
  frets: "Bünde",
  nut: "Sattel",
  side_dots: "Side-Dots",
  neck_shape: "Halsform",
  action_12th: "Saitenlage 12. Bund",
  tuners: "Mechaniken",
  finish_neck: "Hals-Finish",
  neck_extras: "Hals-Extras",

  // Finish fields
  finish_body: "Korpus-Finish",
  electronics: "Elektronik",
  hardware_color: "Hardware-Farbe",
  strap_pins: "Gurtpins",
  strings: "Saiten",
  notes: "Notizen",

  // Repair fields
  repair_type: "Reparatur-Typ",
  repair_area: "Reparatur-Bereich",
  repair_description: "Reparatur-Beschreibung",
  repair_materials_needed: "Benötigte Materialien",
  repair_priority: "Priorität",
  repair_extras: "Reparatur-Extras",

  // Pickguard fields
  pg_model: "Pickguard-Modell",
  pg_material: "Material",
  pg_color_finish: "Farbe/Finish",
  pg_thickness: "Dicke",
  pg_shielding: "Abschirmung",
  pg_notes: "Notizen",

  // Pickups fields
  pickup_type: "Tonabnehmer-Typ",
  bobbin_1: "Bobbin 1",
  bobbin_2: "Bobbin 2",
  magnet_type: "Magnet-Typ",
  wire: "Draht",
  dc_resistance_target: "DC-Widerstand Ziel",
  cover: "Cover",
  pickup_surface_treatment: "Oberflächenbehandlung",
  pickup_notes: "Notizen",

  // Engraving fields
  engraving_material: "Gravur-Material",
  engraving_area: "Gravur-Bereich",
  engraving_depth_technique: "Tiefe/Technik",
  engraving_vector_file: "Vektor-Datei",
  vectorization_needed: "Vektorisierung benötigt",
  engraving_notes: "Notizen",

  // Oberflächenbehandlung fields
  objekt: "Zu behandelndes Objekt",
  oberflaeche_typ: "Oberflächenbehandlung",
  farbe: "Farbe/Farbton",
  aged: "Aged/Relic",
  speziallack: "Speziallack",
  notes: "Notizen",
};

// Category labels for UI display (German)
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  body: "Korpus",
  neck: "Hals",
  finish: "Finish",
  oberflaeche: "Oberflächenbehandlung",
  repair: "Reparatur",
  pickguard: "Pickguard",
  pickups: "Tonabnehmer",
  engraving: "Gravur",
};

// Helper functions
export function getPresetForOrderType(orderType: string): Preset {
  return SPEC_PRESETS[orderType as OrderType] || SPEC_PRESETS.GUITAR;
}

export function getCategoriesForOrderType(orderType: string): CategoryKey[] {
  const preset = getPresetForOrderType(orderType);
  return preset.categories;
}

export function getFieldsForCategory(orderType: string, category: CategoryKey): string[] {
  const preset = getPresetForOrderType(orderType);
  return preset.fields[category] || [];
}

export function getRequiredFieldsForCategory(orderType: string, category: CategoryKey): string[] {
  const preset = getPresetForOrderType(orderType);
  return preset.required?.[category] || [];
}

export function getImageScopesForOrderType(orderType: string): ImageScope[] {
  const preset = getPresetForOrderType(orderType);
  return preset.imageScopes;
}

export function isFieldRequired(orderType: string, category: CategoryKey, fieldKey: string): boolean {
  const requiredFields = getRequiredFieldsForCategory(orderType, category);
  return requiredFields.includes(fieldKey);
}

// Bedingte Felder basierend auf Oberflächenbehandlung
export function getConditionalFields(oberflaeche_typ: string): string[] {
  const baseFields = ["objekt", "oberflaeche_typ"];
  
  // Default auf Nitro-Lack wenn leer
  if (!oberflaeche_typ) {
    return [...baseFields, "farbe", "aged", "speziallack", "notes"];
  }
  
  // Felder die bei Gravur-Arten nicht benötigt werden
  const gravurTypes = ["Gravur", "Lasergravur", "Brandgravur"];
  if (gravurTypes.includes(oberflaeche_typ)) {
    return [...baseFields, "notes"];
  }
  
  // Felder die bei Öl/Wachs nicht benötigt werden
  if (oberflaeche_typ === "Öl/Wachs") {
    return [...baseFields, "aged", "notes"];
  }
  
  // Standard Lackier-Felder
  return [...baseFields, "farbe", "aged", "speziallack", "notes"];
}

// Standard-Werte für neue FINISH_ONLY Aufträge
export function getDefaultValues(orderType: string): Record<string, string> {
  if (orderType === 'FINISH_ONLY') {
    return {
      oberflaeche_typ: 'Nitro-Lack'
    };
  }
  return {};
}

export function shouldShowField(fieldKey: string, oberflaeche_typ: string): boolean {
  const conditionalFields = getConditionalFields(oberflaeche_typ);
  return conditionalFields.includes(fieldKey);
}
