/** The ways a contact can be related to the user. Shared by the server and the screen. */
export const RELATIONS = [
  "mother",
  "father",
  "brother",
  "sister",
  "partner",
  "family",
  "close friend",
  "friend",
  "colleague",
  "manager",
  "client",
  "service provider",
  "acquaintance",
] as const;

/** Relations that are family. When Equal works one of these out, the screen offers to add them to family; it never does so itself. */
export const FAMILY_RELATIONS = new Set(["mother", "father", "brother", "sister", "partner", "family"]);
