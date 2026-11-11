export const regionsByCountry: Record<string, readonly string[]> = {
  'United States': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
    'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  ],
  Canada: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
    'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec',
    'Saskatchewan', 'Yukon',
  ],
};

export const postalCodePatterns: Record<string, { pattern: RegExp; hint: string }> = {
  'United States': { pattern: /^\d{5}(-\d{4})?$/, hint: 'Use 12345 or 12345-6789' },
  Canada: { pattern: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, hint: 'Use a format like A1A 1A1' },
};
