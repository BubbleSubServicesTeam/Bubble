// Detects contact info a person explicitly shares in chat. A message only counts when it has a clear
// cue ("my address is", "this is my number") or is a short, complete street address, so ordinary
// chat (words like "IN", "CA", or stray numbers) is never flagged.

export type ContactField = 'phone_number' | 'address' | 'city' | 'state' | 'postal_code' | 'country';

export type DetectedContactInfo = Partial<Record<ContactField, string>>;

const CODE_MARKERS = /<\/?(html|body|div|span|script|style|table|img|a|p)\b[^>]*>|\b(function\s*\w*\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|document\.|console\.|=>)/i;

const PHONE_CUE = /\b(?:my\s+(?:phone|cell|mobile|number)(?:\s+number)?\s*(?:is|:)|this\s+is\s+my\s+(?:phone|cell|mobile|number)|call\s+me\s+at|reach\s+me\s+at)\s*(\+?\d[\d\s().-]{6,20}\d)/i;
const ADDRESS_CUE = /\b(?:this\s+is\s+my\s+address|my\s+(?:home\s+)?address\s*(?:is|:)|i\s+live\s+at|address\s*:)\s*([^\n.!?]+)/i;
const STREET_ADDRESS = /\b\d{1,6}\s+(?:[A-Za-z]+\.?\s+){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Place|Pl|Way|Circle|Cir|Trail|Trl|Parkway|Pkwy|Highway|Hwy|Square|Sq)\b\.?[^\n]*/i;
const CITY_CUE = /\b(?:i\s+live\s+in|my\s+city\s+is|city\s*:)\s*([A-Za-z][A-Za-z .'-]{1,40})/i;
const STATE_CUE = /\b(?:my\s+state\s+is|state\s*:)\s*([A-Za-z][A-Za-z .]{1,30})/i;
const COUNTRY_CUE = /\b(?:my\s+country\s+is|country\s*:)\s*([A-Za-z][A-Za-z .]{1,40})/i;
const ZIP_CUE = /\b(?:zip(?:\s*code)?|postal\s*code)\s*(?:is|:)?\s*(\d{5}(?:-\d{4})?)\b/i;
const ZIP_IN_TEXT = /\b(\d{5})(?:-\d{4})?\b/;

function parseAddress(addressText: string, result: DetectedContactInfo) {
  const parts = addressText.split(',').map(p => p.trim()).filter(Boolean);
  if (parts[0] && parts[0].length > 3) result.address = parts[0];
  if (parts[1] && /^[A-Za-z][A-Za-z .'-]*$/.test(parts[1])) result.city = parts[1];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const stateZip = last.match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (stateZip) result.state = stateZip[1].toUpperCase();
  const zip = addressText.match(ZIP_IN_TEXT);
  if (zip) result.postal_code = zip[1];
}

export function detectContactInfo(text: string): DetectedContactInfo | null {
  if (CODE_MARKERS.test(text)) return null;
  const result: DetectedContactInfo = {};

  const phone = text.match(PHONE_CUE)?.[1]?.trim();
  if (phone && phone.replace(/\D/g, '').length >= 7) result.phone_number = phone;

  const addressCue = text.match(ADDRESS_CUE)?.[1]?.trim();
  const standaloneStreet = text.length <= 160 ? text.match(STREET_ADDRESS)?.[0].trim() : undefined;
  const addressText = addressCue || standaloneStreet;
  if (addressText) parseAddress(addressText, result);

  const city = text.match(CITY_CUE)?.[1]?.trim();
  if (city && !result.city) result.city = city;

  const state = text.match(STATE_CUE)?.[1]?.trim();
  if (state && !result.state) result.state = state;

  const country = text.match(COUNTRY_CUE)?.[1]?.trim();
  if (country && !result.country) result.country = country;

  const zipCue = text.match(ZIP_CUE)?.[1];
  if (zipCue && !result.postal_code) result.postal_code = zipCue;

  return Object.keys(result).length > 0 ? result : null;
}

// True when the message contains a value that is not already saved for this contact
export function hasNewInfo(
  detected: DetectedContactInfo,
  existing: Partial<Record<ContactField, string | null>>,
): boolean {
  return (Object.keys(detected) as ContactField[]).some(
    key => !!detected[key] && detected[key] !== (existing[key] ?? null),
  );
}
