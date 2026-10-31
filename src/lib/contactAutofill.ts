// Detects contact info (phone, address, city, state, postal code, country) in message text

export type DetectedContactInfo = {
  phone_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

// US state names and abbreviations for matching
const STATE_PATTERNS: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const STATE_NAMES = Object.keys(STATE_PATTERNS);
const STATE_ABBR = Object.values(STATE_PATTERNS);
const ALL_STATES = [...STATE_NAMES, ...STATE_ABBR];

// Country names commonly seen
const COUNTRIES = [
  'United States', 'USA', 'US', 'Canada', 'CA', 'United Kingdom', 'UK', 'GB',
  'Australia', 'AU', 'Germany', 'DE', 'France', 'FR', 'Spain', 'ES',
  'Italy', 'IT', 'Mexico', 'MX', 'India', 'IN', 'Brazil', 'BR', 'Japan', 'JP',
  'China', 'CN', 'Netherlands', 'NL', 'Sweden', 'SE', 'Norway', 'NO',
];

// Match a phone number: +1, (555), 555-1234, 555 1234 patterns
const PHONE_REGEX = /(?:(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4})/g;

// Match a street address: number + street name + suffix
const ADDRESS_REGEX = /(\d{1,6}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Avenu|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Place|Pl|Way|Circle|Cir|Trail|Trl|Parkway|Pkwy|Highway|hwy|Square|Sq)\b\.?)/i;

// Match a ZIP code (5 digits, optionally with -1234)
const ZIP_REGEX = /\b(\d{5}(?:-\d{4})?)\b/g;

const CODE_MARKERS = /<\/?(html|body|div|span|script|style|table|img|a|p)\b[^>]*>|\b(function\s*\w*\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|document\.|console\.|=>)/i;

export function detectContactInfo(text: string): DetectedContactInfo | null {
  if (CODE_MARKERS.test(text)) return null;
  const result: DetectedContactInfo = {};
  let found = false;

  const lowerText = text;

  // Detect phone number — look for patterns like "my number is", "call me at", "phone:"
  const phoneContext = /(?:my\s+(?:phone|number|cell|mobile)\s*(?:is|:)?\s*|call\s+me\s+at\s*|reach\s+me\s+at\s*|phone\s*:?)([\d\s()+\-.]{7,})/i;
  const phoneContextMatch = lowerText.match(phoneContext);
  if (phoneContextMatch) {
    const cleaned = phoneContextMatch[1].trim().replace(/\s+/g, ' ');
    if (cleaned.replace(/\D/g, '').length >= 7) {
      result.phone_number = cleaned;
      found = true;
    }
  }

  // If no contextual phone found, try standalone phone pattern
  if (!result.phone_number) {
    // Look for a string of digits that looks like a phone (7-15 digits)
    const phones = text.match(PHONE_REGEX);
    if (phones) {
      // Pick the one with the most digits that looks like a phone
      const best = phones
        .map(p => p.trim())
        .filter(p => p.replace(/\D/g, '').length >= 10 && p.replace(/\D/g, '').length <= 15)
        .sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0];
      if (best) {
        result.phone_number = best;
        found = true;
      }
    }
  }

  // Detect address — look for "my address is", "I live at", "address:"
  const addressContext = /(?:my\s+address\s*(?:is|:)?\s*|i\s+live\s+at\s*|address\s*:?)([\w\s,#.\-/]+?)(?=\s*(?:,|\.|$|\n|my|i\s))/i;
  const addressMatch = lowerText.match(addressContext);
  if (addressMatch) {
    let addr = addressMatch[1].trim();
    // Check if the address contains a ZIP code at the end
    const zipInAddr = addr.match(ZIP_REGEX);
    if (zipInAddr) {
      result.postal_code = zipInAddr[zipInAddr.length - 1];
      addr = addr.replace(zipInAddr[zipInAddr.length - 1], '').trim().replace(/,\s*$/, '');
    }
    if (addr.length > 5) {
      result.address = addr;
      found = true;
    }
  }

  // If no contextual address, try standalone address pattern
  if (!result.address) {
    const addrMatch2 = text.match(ADDRESS_REGEX);
    if (addrMatch2) {
      result.address = addrMatch2[1].trim();
      found = true;
    }
  }

  // Detect city — look for "I live in", "city is"
  const cityContext = /(?:i\s+live\s+in\s+|my\s+city\s*(?:is|:)?\s*|city\s*:?)([A-Z][a-zA-Z\s]+?)(?=\s*(?:,|\.|$|\n))/i;
  const cityMatch = lowerText.match(cityContext);
  if (cityMatch) {
    const city = cityMatch[1].trim().replace(/\s+/g, ' ');
    if (city.length > 1 && city.length < 50) {
      result.city = city;
      found = true;
    }
  }

  // Detect state — scan for state names/abbreviations in text
  if (!result.state) {
    for (const abbr of STATE_ABBR) {
      const re = new RegExp(`\\b${abbr}\\b`);
      if (re.test(text)) {
        result.state = abbr;
        found = true;
        break;
      }
    }
    if (!result.state) {
      for (const name of STATE_NAMES) {
        const re = new RegExp(`\\b${name}\\b`, 'i');
        if (re.test(text)) {
          result.state = name;
          found = true;
          break;
        }
      }
    }
  }

  // Detect ZIP code standalone
  if (!result.postal_code) {
    const zips = text.match(ZIP_REGEX);
    if (zips) {
      result.postal_code = zips[0];
      found = true;
    }
  }

  // Detect country
  if (!result.country) {
    for (const country of COUNTRIES) {
      if (country.length >= 2) {
        const re = new RegExp(`\\b${country.replace(/\./g, '\\.')}\\b`, 'i');
        if (re.test(text)) {
          result.country = country.length <= 3 ? country.toUpperCase() : country;
          found = true;
          break;
        }
      }
    }
  }

  return found ? result : null;
}

// Check if the detected info has anything new compared to existing profile data
export function hasNewInfo(
  detected: DetectedContactInfo,
  existing: DetectedContactInfo
): boolean {
  if (detected.phone_number && detected.phone_number !== existing.phone_number) return true;
  if (detected.address && detected.address !== existing.address) return true;
  if (detected.city && detected.city !== existing.city) return true;
  if (detected.state && detected.state !== existing.state) return true;
  if (detected.postal_code && detected.postal_code !== existing.postal_code) return true;
  if (detected.country && detected.country !== existing.country) return true;
  return false;
}
