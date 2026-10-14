// Reference data. Edit freely.
// Branded entries (watts, plug, DMX channels) are approximate placeholders.
// Check each manufacturer's datasheet before relying on them.
// "Generic" entries are nominal values you can adjust.

const MAINS_VOLTAGE = 230;  // UK/EU single phase
const LOAD_LIMIT = 0.8;     // 80% continuous-load rule of thumb

const PLOT_CONFIG = {
  scale: 40,     // pixels per metre on the plot
  gridM: 0.5,    // snap grid in metres
  widthM: 20,    // default plot width
  heightM: 12,   // default plot depth
};

const PLUG_TYPES = [
  { id: "uk15",  label: "15A BS546 (UK bare pin)", amps: 15 },
  { id: "cee16", label: "16A CEE 2P+E",            amps: 16 },
  { id: "cee32", label: "32A CEE 3P+E",            amps: 32 },
  { id: "cee63", label: "63A CEE 3P+E",            amps: 63 },
];

const DIMMER_SIZES = [10, 16, 20, 32];
const PHASES = ["None", "L1", "L2", "L3"];

const FIXTURE_TYPES = [
  "LED Par",
  "Profile (Ellipsoidal)",
  "Fresnel",
  "Moving Head Spot",
  "Moving Head Wash",
  "LED Bar / Batten",
  "Strobe",
  "Follow Spot",
  "Hazer / FX",
  "Other",
];

// id, brand, model, type, watts, plug (default), channels (DMX footprint)
const FIXTURES = [
  // Generic
  { id: "gen-par-rgbw",    brand: "Generic", model: "LED Par 64 RGBW",        type: "LED Par",               watts: 200,  plug: "uk15",  channels: 8 },
  { id: "gen-par-rgb36",   brand: "Generic", model: "LED Par 36 RGB",         type: "LED Par",               watts: 54,   plug: "uk15",  channels: 3 },
  { id: "gen-profile-750", brand: "Generic", model: "Profile 750 W",          type: "Profile (Ellipsoidal)", watts: 750,  plug: "uk15",  channels: 3 },
  { id: "gen-fresnel-1k",  brand: "Generic", model: "Fresnel 1 kW",           type: "Fresnel",               watts: 1000, plug: "uk15",  channels: 1 },
  { id: "gen-mh-spot",     brand: "Generic", model: "Moving Head Spot 300 W", type: "Moving Head Spot",      watts: 300,  plug: "uk15",  channels: 16 },
  { id: "gen-mh-wash",     brand: "Generic", model: "Moving Head Wash 350 W", type: "Moving Head Wash",      watts: 350,  plug: "uk15",  channels: 18 },
  { id: "gen-bar-8",       brand: "Generic", model: "LED Bar 8-cell",         type: "LED Bar / Batten",      watts: 120,  plug: "uk15",  channels: 24 },
  { id: "gen-strobe",      brand: "Generic", model: "Strobe 400 W",           type: "Strobe",                watts: 400,  plug: "uk15",  channels: 2 },
  { id: "gen-followspot",  brand: "Generic", model: "Follow Spot 1.2 kW",     type: "Follow Spot",           watts: 1200, plug: "cee16", channels: 1 },
  { id: "gen-hazer",       brand: "Generic", model: "Hazer 1.2 kW",           type: "Hazer / FX",            watts: 1200, plug: "cee16", channels: 1 },

  // Ayrton (approximate, verify)
  { id: "ayrton-khamsin",  brand: "Ayrton",    model: "Khamsin",           type: "Moving Head Spot",      watts: 1000, plug: "cee16", channels: 28 },
  { id: "ayrton-ghibli",   brand: "Ayrton",    model: "Ghibli",            type: "Moving Head Wash",      watts: 600,  plug: "cee16", channels: 25 },

  // Chauvet Professional (approximate, verify)
  { id: "chauvet-rogue",   brand: "Chauvet",   model: "Rogue R2 Spot",     type: "Moving Head Spot",      watts: 280,  plug: "uk15",  channels: 16 },
  { id: "chauvet-colorado",brand: "Chauvet",   model: "COLORado 1 Quad Zoom", type: "LED Par",            watts: 200,  plug: "uk15",  channels: 8 },

  // Clay Paky (approximate, verify)
  { id: "claypaky-sharpy", brand: "Clay Paky", model: "Sharpy",            type: "Moving Head Spot",      watts: 470,  plug: "cee16", channels: 16 },
  { id: "claypaky-alpha",  brand: "Clay Paky", model: "Alpha Profile 1500", type: "Profile (Ellipsoidal)", watts: 1500, plug: "cee16", channels: 24 },

  // Elation (approximate, verify)
  { id: "elation-platinum",brand: "Elation",   model: "Platinum Spot",     type: "Moving Head Spot",      watts: 380,  plug: "uk15",  channels: 16 },
  { id: "elation-beam5r",  brand: "Elation",   model: "Platinum Beam 5R",  type: "Moving Head Spot",      watts: 300,  plug: "uk15",  channels: 16 },

  // ETC (approximate, verify)
  { id: "etc-source4",     brand: "ETC",       model: "Source Four LED",   type: "Profile (Ellipsoidal)", watts: 300,  plug: "uk15",  channels: 6 },

  // GLP (approximate, verify)
  { id: "glp-x4bar20",     brand: "GLP",       model: "impression X4 Bar 20", type: "LED Bar / Batten",   watts: 200,  plug: "uk15",  channels: 24 },

  // Martin (approximate, verify)
  { id: "martin-aura",     brand: "Martin",    model: "MAC Aura XB",       type: "Moving Head Wash",      watts: 250,  plug: "uk15",  channels: 16 },
  { id: "martin-rush-mh6", brand: "Martin",    model: "Rush MH 6 Spot",    type: "Moving Head Spot",      watts: 1000, plug: "cee16", channels: 18 },

  // Robe (approximate, verify)
  { id: "robe-spiider",    brand: "Robe",      model: "Spiider",           type: "Moving Head Wash",      watts: 1000, plug: "cee16", channels: 26 },
  { id: "robe-pointe",     brand: "Robe",      model: "Pointe",            type: "Moving Head Spot",      watts: 1000, plug: "cee16", channels: 26 },
];
