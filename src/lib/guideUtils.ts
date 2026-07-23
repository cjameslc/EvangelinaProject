// Deep-link builders for the Digital Guidebook's interactive actions —
// pure functions, no fetch/API calls, safe for client components.

/** A Google Maps search for a named place — lets Maps compute the real
 * distance/time itself rather than this app fabricating an estimate. */
export function mapsSearchUrl(place: string, context = "Cubao, Quezon City"): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, ${context}`)}`;
}

export function wazeUrl(place: string, context = "Cubao, Quezon City"): string {
  return `https://waze.com/ul?q=${encodeURIComponent(`${place}, ${context}`)}&navigate=yes`;
}

/** Grab has no public place-specific deep link without merchant/geo IDs this
 * app doesn't have — links to the Grab PH site, which app-banners into the
 * installed app on mobile rather than risking a broken custom URI scheme. */
export const GRAB_URL = "https://www.grab.com/ph/";

export function messengerUrl(username: string): string {
  return `https://m.me/${username}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Escapes the special characters the WIFI: QR payload format reserves
 * (`\`, `;`, `,`, `:`) per the de facto spec every phone's camera scanner
 * follows. Unescaped, a password containing e.g. a semicolon would corrupt
 * the payload's field boundaries. */
function escapeWifiField(v: string): string {
  return v.replace(/([\\;,:])/g, "\\$1");
}

/** Standard Wi-Fi QR payload — scanning it offers to join the network
 * directly, no typing required. `hidden` defaults false (this app has no
 * way to know if a network is SSID-broadcast-hidden). */
export function wifiQrPayload(ssid: string, password: string, hidden = false): string {
  return `WIFI:T:WPA;S:${escapeWifiField(ssid)};P:${escapeWifiField(password)};H:${hidden ? "true" : "false"};;`;
}

/** Philippines' single nationwide emergency hotline — a verifiable public
 * fact (National Emergency Hotline), not business-specific data, so it's
 * safe to always show regardless of whether Admin has set their own
 * property-specific emergencyContactPhone/emergencyContacts. */
export const PH_NATIONAL_EMERGENCY_HOTLINE = "911";
