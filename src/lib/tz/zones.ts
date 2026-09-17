// Curated IANA timezone list grouped by region. Deliberately not the full
// 400+ tzdb list — these are the zones a studio actually bills against, and
// a shorter list is faster to scan than a complete one is to search.
export interface ZoneOption { value: string; label: string; region: string; }

export const ZONES: ZoneOption[] = [
  { value: 'Asia/Kolkata', label: 'India — Hyderabad / Mumbai / Bengaluru (IST)', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'UAE — Dubai (GST)', region: 'Asia' },
  { value: 'Asia/Karachi', label: 'Pakistan — Karachi (PKT)', region: 'Asia' },
  { value: 'Asia/Dhaka', label: 'Bangladesh — Dhaka (BST)', region: 'Asia' },
  { value: 'Asia/Colombo', label: 'Sri Lanka — Colombo (+0530)', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', region: 'Asia' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo (JST)', region: 'Asia' },
  { value: 'Asia/Seoul', label: 'South Korea — Seoul (KST)', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'China — Shanghai / Beijing (CST)', region: 'Asia' },
  { value: 'Asia/Jakarta', label: 'Indonesia — Jakarta (WIB)', region: 'Asia' },
  { value: 'Asia/Manila', label: 'Philippines — Manila (PST)', region: 'Asia' },
  { value: 'Asia/Jerusalem', label: 'Israel — Tel Aviv (IST)', region: 'Asia' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia — Riyadh (AST)', region: 'Asia' },

  { value: 'Europe/London', label: 'UK — London (GMT/BST)', region: 'Europe' },
  { value: 'Europe/Dublin', label: 'Ireland — Dublin (GMT/IST)', region: 'Europe' },
  { value: 'Europe/Lisbon', label: 'Portugal — Lisbon (WET)', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Spain — Madrid (CET)', region: 'Europe' },
  { value: 'Europe/Paris', label: 'France — Paris (CET)', region: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Netherlands — Amsterdam (CET)', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Germany — Berlin (CET)', region: 'Europe' },
  { value: 'Europe/Zurich', label: 'Switzerland — Zurich (CET)', region: 'Europe' },
  { value: 'Europe/Stockholm', label: 'Sweden — Stockholm (CET)', region: 'Europe' },
  { value: 'Europe/Oslo', label: 'Norway — Oslo (CET)', region: 'Europe' },
  { value: 'Europe/Copenhagen', label: 'Denmark — Copenhagen (CET)', region: 'Europe' },
  { value: 'Europe/Warsaw', label: 'Poland — Warsaw (CET)', region: 'Europe' },
  { value: 'Europe/Kyiv', label: 'Ukraine — Kyiv (EET)', region: 'Europe' },
  { value: 'Europe/Istanbul', label: 'Türkiye — Istanbul (TRT)', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Russia — Moscow (MSK)', region: 'Europe' },

  { value: 'America/New_York', label: 'US East — New York (ET)', region: 'Americas' },
  { value: 'America/Chicago', label: 'US Central — Chicago (CT)', region: 'Americas' },
  { value: 'America/Denver', label: 'US Mountain — Denver (MT)', region: 'Americas' },
  { value: 'America/Phoenix', label: 'US Arizona — Phoenix (MST, no DST)', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'US West — Los Angeles (PT)', region: 'Americas' },
  { value: 'America/Toronto', label: 'Canada — Toronto (ET)', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Canada — Vancouver (PT)', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico — Mexico City (CST)', region: 'Americas' },
  { value: 'America/Bogota', label: 'Colombia — Bogotá (COT)', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'Brazil — São Paulo (BRT)', region: 'Americas' },
  { value: 'America/Buenos_Aires', label: 'Argentina — Buenos Aires (ART)', region: 'Americas' },

  { value: 'Australia/Sydney', label: 'Australia — Sydney (AEST/AEDT)', region: 'Oceania' },
  { value: 'Australia/Melbourne', label: 'Australia — Melbourne (AEST/AEDT)', region: 'Oceania' },
  { value: 'Australia/Brisbane', label: 'Australia — Brisbane (AEST, no DST)', region: 'Oceania' },
  { value: 'Australia/Perth', label: 'Australia — Perth (AWST)', region: 'Oceania' },
  { value: 'Pacific/Auckland', label: 'New Zealand — Auckland (NZST/NZDT)', region: 'Oceania' },

  { value: 'Africa/Cairo', label: 'Egypt — Cairo (EET)', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'Nigeria — Lagos (WAT)', region: 'Africa' },
  { value: 'Africa/Nairobi', label: 'Kenya — Nairobi (EAT)', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: 'South Africa — Johannesburg (SAST)', region: 'Africa' },

  { value: 'UTC', label: 'UTC', region: 'Other' },
];

export const ZONE_REGIONS = ['Asia', 'Europe', 'Americas', 'Oceania', 'Africa', 'Other'] as const;

export function zoneLabel(value: string): string {
  return ZONES.find((z) => z.value === value)?.label ?? value;
}
