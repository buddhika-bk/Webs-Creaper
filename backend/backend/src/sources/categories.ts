export interface CategoryDef {
  key: string;
  label: string;
  synonyms: string[];
  /** OpenStreetMap tag selectors, e.g. "shop=books". */
  osm: string[];
  keywords: string[];
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'bookshop', label: 'Bookshop', synonyms: ['bookshop', 'book shop', 'book store', 'bookstore', 'books'], osm: ['shop=books'], keywords: ['book', 'bookshop', 'bookstore', 'stationers'] },
  { key: 'salon', label: 'Salon', synonyms: ['salon', 'beauty salon', 'hair salon', 'hairdresser', 'barber', 'barbershop'], osm: ['shop=hairdresser', 'shop=beauty'], keywords: ['salon', 'hair', 'beauty', 'barber', 'unisex'] },
  { key: 'restaurant', label: 'Restaurant', synonyms: ['restaurant', 'eatery', 'diner'], osm: ['amenity=restaurant', 'amenity=fast_food'], keywords: ['restaurant', 'eatery', 'kitchen', 'grill', 'diner'] },
  { key: 'cafe', label: 'Cafe', synonyms: ['cafe', 'coffee shop', 'coffee house'], osm: ['amenity=cafe'], keywords: ['cafe', 'coffee'] },
  { key: 'hotel', label: 'Hotel', synonyms: ['hotel', 'guest house', 'guesthouse', 'resort', 'villa'], osm: ['tourism=hotel', 'tourism=guest_house'], keywords: ['hotel', 'resort', 'inn', 'villa', 'guest'] },
  { key: 'school', label: 'School', synonyms: ['school', 'preschool', 'kindergarten', 'international school'], osm: ['amenity=school', 'amenity=kindergarten'], keywords: ['school', 'college', 'kindergarten', 'montessori'] },
  { key: 'pharmacy', label: 'Pharmacy', synonyms: ['pharmacy', 'chemist', 'drugstore'], osm: ['amenity=pharmacy'], keywords: ['pharmacy', 'chemist', 'drug'] },
  { key: 'garage', label: 'Garage', synonyms: ['garage', 'car repair', 'auto repair', 'mechanic', 'service station'], osm: ['shop=car_repair'], keywords: ['garage', 'motors', 'auto', 'service center', 'tyre'] },
  { key: 'supermarket', label: 'Supermarket', synonyms: ['supermarket', 'grocery', 'grocery store', 'mini market'], osm: ['shop=supermarket', 'shop=convenience'], keywords: ['super', 'market', 'grocery', 'mart', 'stores'] },
  { key: 'clothing', label: 'Clothing store', synonyms: ['clothing store', 'clothes shop', 'boutique', 'fashion store', 'textile'], osm: ['shop=clothes', 'shop=boutique'], keywords: ['clothing', 'fashion', 'boutique', 'textile', 'apparel'] },
  { key: 'electronics', label: 'Electronics store', synonyms: ['electronics store', 'mobile shop', 'computer shop', 'electronics'], osm: ['shop=electronics', 'shop=mobile_phone', 'shop=computer'], keywords: ['electronics', 'mobile', 'computer', 'digital', 'phone'] },
  { key: 'gym', label: 'Gym', synonyms: ['gym', 'fitness centre', 'fitness center'], osm: ['leisure=fitness_centre'], keywords: ['gym', 'fitness'] },
  { key: 'clinic', label: 'Clinic', synonyms: ['clinic', 'dental clinic', 'dentist', 'medical centre', 'medical center', 'doctor'], osm: ['amenity=clinic', 'amenity=dentist', 'amenity=doctors'], keywords: ['clinic', 'dental', 'medical', 'dr.'] },
  { key: 'bakery', label: 'Bakery', synonyms: ['bakery', 'cake shop', 'bake house'], osm: ['shop=bakery'], keywords: ['bakery', 'bake', 'cake'] },
];

const stripPlural = (s: string) => (s.endsWith('ies') ? s.slice(0, -3) + 'y' : s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s);
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function resolveCategory(input: string): CategoryDef | null {
  const q = clean(input);
  const singular = q.split(' ').map(stripPlural).join(' ');
  for (const c of CATEGORIES) {
    if (c.key === q || c.key === singular) return c;
    if (c.synonyms.some((s) => s === q || s === singular || s.split(' ').map(stripPlural).join(' ') === singular)) return c;
  }
  return null;
}

export function normalizeCategory(input: string): { label: string; key: string } {
  const def = resolveCategory(input);
  if (def) return { label: def.label, key: def.key };
  const label = input.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 120);
  return { label, key: clean(input).replace(/\s/g, '-').slice(0, 120) };
}

export const categorySuggestions = () => CATEGORIES.map((c) => c.label);
