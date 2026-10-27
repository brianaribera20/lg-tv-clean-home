window.CONFIG = {columns: 5, dockApps: ["youtube.leanback.ytv.v1", "amazon", "com.apple.appletv", "youtube.leanback.v4", "com.webos.app.hdmi1"], hiddenApps: ["com.gathin.tvhome", "com.local.nativehome", "com.miniclip.eightballpool", "com.webos.app.lgchannels", "com.lgtvod.us.app", "epoxyaisports", "webos.day", "com.lgtravel.app", "com.volley.lgshell", "com.palmdts.devmode", "com.webos.app.roomconnect", "com.webos.app.sportsteamsettings", "com.disney.disneyplus-prod", "com.webos.app.homeconnect"]};
// Kept apart: a saved profile on the TV replaces CONFIG, but these always stay hidden.
window.CONFIG_HIDDEN = window.CONFIG.hiddenApps.slice();
// Idle clock after an hour without a button press (clock.js). Off: Home just stays as it is.
window.IDLE_CLOCK = false;
// Order right after the dock (row two): Netflix, Hulu, Peacock, Alexa; everything else follows A-Z.
window.CONFIG_ORDER = ["netflix", "hulu", "com.peacock.tv", "amazon.alexa.view"];
