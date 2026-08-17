// ============================================================
//  SEOirée, configuration
// ============================================================
//  Colle ici l'URL de ta Realtime Database Firebase.
//  Format attendu :
//    https://seoiree-xxxxx-default-rtdb.europe-west1.firebasedatabase.app
//  (sans slash final)
//
//  Tant que la valeur reste vide, l'appli fonctionne en mode
//  local (localStorage) : pratique pour tester, mais les
//  réponses ne sont pas partagées.
// ============================================================

window.SEOIREE_CONFIG = {
  // URL de la Realtime Database (sans / à la fin)
  dbUrl: "https://seoiree-ad079-default-rtdb.europe-west1.firebasedatabase.app",

  // Nom de l'événement (affiché dans le titre)
  eventName: "SEOirée",

  // Période du calendrier (format AAAA-MM-JJ)
  rangeStart: "2026-09-01",
  rangeEnd: "2026-10-31",

  // Clé de l'édition : change-la pour repartir de zéro
  // (ex. "2027" l'an prochain, les données de 2026 sont conservées)
  edition: "2026",
};
