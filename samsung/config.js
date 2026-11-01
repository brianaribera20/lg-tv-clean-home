// Samsung version of launcher/config.js. Apps are named by their title on the TV; tizen-boot.js
// turns each title into the TV's Samsung app id at start-up (names[] lists other spellings).
window.CONFIG = {columns: 5, dockApps: ["YouTube TV", "Prime Video", "Apple TV", "YouTube", "Netflix"], hiddenApps: []};
// Kept apart: these stay hidden even over the layout the TV saves.
window.CONFIG_HIDDEN = [];
// Idle clock after an hour without a button press (clock.js). Off: Home just stays as it is.
window.IDLE_CLOCK = false;
// Order right after the dock (row two); everything else follows A-Z.
window.CONFIG_ORDER = ["Hulu", "Peacock", "Disney+"];
// Title matching and full-colour tiles: art is the LG app id whose make-tiles.py tile is reused.
window.SAMSUNG_APPS = {
  "YouTube TV": {"names": ["YouTube TV"], "art": "youtube.leanback.ytv.v1"},
  "Prime Video": {"names": ["Prime Video", "Amazon Prime Video"], "art": "amazon"},
  "Apple TV": {"names": ["Apple TV", "Apple TV+"], "art": "com.apple.appletv"},
  "YouTube": {"names": ["YouTube"], "art": "youtube.leanback.v4"},
  "Netflix": {"names": ["Netflix"], "art": "netflix"},
  "Hulu": {"names": ["Hulu"], "art": "hulu"},
  "Peacock": {"names": ["Peacock", "Peacock TV"], "art": "com.peacock.tv"},
  "Disney+": {"names": ["Disney+", "Disney Plus"], "art": "com.disney.disneyplus-prod"}
};
