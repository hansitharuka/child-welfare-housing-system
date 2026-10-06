/**
 * Made-up people for the load-test data (SEC-11): names, NICs and phone numbers
 * that belong to nobody. They come from a small seeded random number generator, so the same seed
 * always gives the same people.
 */

export type Share<T> = readonly (readonly [T, number])[];

/** A small seeded random number generator (mulberry32), so the same seed gives the same data. */
export function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    int,
    chance: (p: number) => next() < p,
    pick: <T>(list: readonly T[]): T => list[int(0, list.length - 1)],
    weighted: <T>(shares: Share<T>): T => {
      let roll = next() * shares.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [value, weight] of shares) if ((roll -= weight) < 0) return value;
      return shares[shares.length - 1][0];
    },
  };
}

export type Random = ReturnType<typeof generator>;

/** A made-up NIC: mostly the 12-digit form, sometimes the old 9 digits and V (CASE-2). */
export function madeUpNic(r: Random): string {
  const year = r.int(1960, 2006);
  const day = String(r.int(1, 366) + (r.chance(0.5) ? 500 : 0)).padStart(3, "0");
  if (year < 2000 && r.chance(0.3)) return `${String(year).slice(2)}${day}${r.int(1000, 9999)}V`;
  return `${year}${day}${r.int(10000, 99999)}`;
}

export function madeUpPhone(r: Random): string {
  return `07${r.pick([0, 1, 2, 4, 5, 6, 7, 8])}${r.int(1_000_000, 9_999_999)}`;
}

export const GIVEN_NAMES = [
  "නිමල්",
  "සුනිල්",
  "කමල්",
  "අජිත්",
  "රුවන්",
  "චමින්ද",
  "ප්‍රසාද්",
  "දිනේෂ්",
  "සමන්",
  "තුෂාර",
  "කසුන්",
  "නුවන්",
  "ලහිරු",
  "ඉසුරු",
  "සචින්",
  "නිලූකා",
  "සඳමාලි",
  "දිල්රුක්ෂි",
  "අනෝජා",
  "චතුරිකා",
  "ඉරේෂා",
  "හංසිකා",
  "සෙව්වන්දි",
  "තරුෂි",
  "මධුෂිකා",
  "කාවින්දි",
  "නෙත්මි",
  "සඳුනි",
  "පියුමි",
  "ශාලිනි",
];
export const SURNAMES = [
  "පෙරේරා",
  "සිල්වා",
  "ප්‍රනාන්දු",
  "බණ්ඩාර",
  "ජයසූරිය",
  "ගුණවර්ධන",
  "හේරත්",
  "රත්නායක",
  "කුමාරසිංහ",
  "වීරසේකර",
  "අබේසේකර",
  "කරුණාරත්න",
  "දසනායක",
  "විජේසිංහ",
  "මුණසිංහ",
  "ලියනගේ",
  "සමරසිංහ",
  "සෙල්වරාජා",
  "කන්දසාමි",
  "ශිවලිංගම්",
];
export const ROADS = ["ප්‍රධාන පාර", "පන්සල් පාර", "පාසල් මාවත", "දෙවන පටුමග", "ගංගා පාර", "මල් පාර"];
