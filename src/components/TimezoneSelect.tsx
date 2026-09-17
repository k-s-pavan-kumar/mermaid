import { ZONES, ZONE_REGIONS } from '@/lib/tz/zones';

// Grouped <select> rather than a free-text IANA box — typing
// "America/New_York" by hand is error-prone and a typo silently breaks
// every clock and overlap calculation for that client.
export function TimezoneSelect({ name = 'timezone', defaultValue = 'Asia/Kolkata' }: { name?: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue}>
      {ZONE_REGIONS.map((region) => {
        const zones = ZONES.filter((z) => z.region === region);
        if (zones.length === 0) return null;
        return (
          <optgroup key={region} label={region}>
            {zones.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
