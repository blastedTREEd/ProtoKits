import { PHILIPPINE_ZIP_CODE_ROWS } from './philippineZipCodes.js';

const PHILIPPINES = 'Philippines';

// Nominatim often returns an administrative boundary for a municipality
// without a postcode. Keep the PHLPost municipality mappings for the
// San-prefixed locations affected by that response shape. The province is
// part of each key because names such as San Mateo and San Jose are reused.
const SAN_PREFIX_ZIP_FALLBACKS = new Map([
  ['abra|sanisidro', '2809'],
  ['abra|sanjuan', '2823'],
  ['abra|sanquintin', '2808'],
  ['agusandelsur|sanfrancisco', '8501'],
  ['agusandelsur|sanluis', '8511'],
  ['aurora|sanluis', '3201'],
  ['batangas|sanjose', '4227'],
  ['batangas|sanjuan', '4226'],
  ['batangas|sanluis', '4210'],
  ['batangas|sannicolas', '4207'],
  ['batangas|sanpascual', '4204'],
  ['bukidnon|sanfernando', '8711'],
  ['bulacan|sanildefonso', '3010'],
  ['bulacan|sanjosedelmonte', '3023'],
  ['bulacan|sanmiguel', '3011'],
  ['bulacan|sanrafael', '3008'],
  ['camarinesnorte|sanlorenzoruiz', '4610'],
  ['camarinesnorte|sanvicente', '4609'],
  ['camarinessur|sanfernando', '4415'],
  ['camarinessur|sanjose', '4423'],
  ['catanduanes|sanandres', '4810'],
  ['catanduanes|sanmiguel', '4802'],
  ['davaodelnorte|sanisidro', '8121'],
  ['davaooriental|sanisidro', '8209'],
  ['dinagatislands|sanjose', '8427'],
  ['isabela|sanagustin', '3314'],
  ['isabela|sanguillermo', '3308'],
  ['isabela|sanisidro', '3310'],
  ['isabela|sanmanuel', '3317'],
  ['isabela|sanmariano', '3332'],
  ['isabela|sanmateo', '3318'],
  ['isabela|sanpablo', '3329'],
  ['laguna|sanpablo', '4000'],
  ['laguna|sanpedro', '4023'],
  ['masbate|sanfernando', '5416'],
  ['masbate|sanjacinto', '5417'],
  ['masbate|sanpascual', '5420'],
  ['nuevaecija|sanantonio', '3108'],
  ['nuevaecija|sanisidro', '3106'],
  ['nuevaecija|sanjose', '3121'],
  ['nuevaecija|sanleonardo', '3102'],
  ['occidentalmindoro|sanjose', '5100'],
  ['orientalmindoro|santeodoro', '5202'],
  ['palawan|sanvicente', '5309'],
  ['pampanga|sanfernando', '2000'],
  ['pampanga|sanluis', '2014'],
  ['pampanga|sansimon', '2015'],
  ['pangasinan|sancarlos', '2420'],
  ['pangasinan|sanfabian', '2433'],
  ['pangasinan|sanjacinto', '2431'],
  ['pangasinan|sanmanuel', '2438'],
  ['pangasinan|sannicolas', '2447'],
  ['pangasinan|sanquintin', '2444'],
  ['quezon|sanandres', '4314'],
  ['quezon|sanantonio', '4324'],
  ['quezon|sanfrancisco', '4315'],
  ['quezon|sannarciso', '4313'],
  ['rizal|sanmateo', '1850'],
  ['romblon|sanagustin', '5501'],
  ['romblon|sanandres', '5504'],
  ['romblon|sanfernando', '5513'],
  ['romblon|sanjose', '5510'],
  ['samar|sanjorge', '6707'],
  ['samar|sanjosedebuan', '6723'],
  ['samar|sansebastian', '6714'],
  ['surigaodelnorte|sanbenito', '8423'],
  ['surigaodelnorte|sanfrancisco', '8401'],
  ['surigaodelnorte|sanisidro', '8421'],
  ['surigaodelsur|sanagustin', '8305'],
  ['surigaodelsur|sanmiguel', '8301'],
  ['tarlac|sanclemente', '2305'],
  ['tarlac|sanjose', '2318'],
  ['tarlac|sanmanuel', '2309'],
  ['zambales|sanantonio', '2206'],
  ['zambales|sanfelipe', '2204'],
  ['zambales|sanmarcelino', '2207'],
  ['zambales|sannarciso', '2205']
]);

// Some Metro Manila districts are returned by Nominatim as suburbs of the
// city, and some districts have more than one postal area.
const METRO_MANILA_ZIP_FALLBACKS = new Map([
  ['manila|santacruz', '1003'],
  ['manila|santacruzsouth', '1003'],
  ['manila|santacruznorth', '1014'],
  ['metromanila|santacruz', '1003'],
  ['metromanila|santacruzsouth', '1003'],
  ['metromanila|santacruznorth', '1014'],
  ['nationalcapitalregion|santacruz', '1003'],
  ['nationalcapitalregion|santacruzsouth', '1003'],
  ['nationalcapitalregion|santacruznorth', '1014'],
  ['ncr|santacruz', '1003'],
  ['ncr|santacruzsouth', '1003'],
  ['ncr|santacruznorth', '1014']
]);

// Keep municipality-level fallbacks for locations where Nominatim's
// administrative boundary does not carry a postcode.
const MUNICIPALITY_ZIP_FALLBACKS = new Map([
  ['cavite|dasmarinas', '4114'],
  ['nuevaecija|cabanatuan', '3100'],
  ['zamboangadelsur|zamboanga', '7000']
]);

// Common user-entered/administrative name variants that otherwise prevent a
// verified geocoder result from matching the selected city and province.
const LOCATION_NAME_ALIASES = new Map([
  ['caranatuan', 'cabanatuan'],
  ['cabanatuancity', 'cabanatuan'],
  ['ncr', 'metromanila'],
  ['nationalcapitalregion', 'metromanila']
]);

export const normalizePhilippineZipCode = (value) => String(value || '').match(/\b\d{4}\b/)?.[0] || '';

const normalizeLocationName = (value) => {
  const normalized = String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  // Geocoding results commonly return names such as "City of San Jose" or
  // "Province of Cavite" while users enter "San Jose" or "Cavite".
  .replace(/\b(city|municipality|province)\s+of\b/g, '')
  .replace(/\b(city|municipality|province)\b/g, '')
  .replace(/\([^)]*\)/g, '')
  .replace(/[^a-z0-9]+/g, '')
  .trim();
  return LOCATION_NAME_ALIASES.get(normalized) || normalized;
};

const PHILIPPINE_ZIP_CODE_MAP = new Map();
PHILIPPINE_ZIP_CODE_ROWS.forEach(([province, city, zipCode]) => {
  const key = `${normalizeLocationName(province)}|${normalizeLocationName(city)}`;
  if (!PHILIPPINE_ZIP_CODE_MAP.has(key)) PHILIPPINE_ZIP_CODE_MAP.set(key, zipCode);
});

export const getPhilippineProvinceOptions = () => [...new Set(
  PHILIPPINE_ZIP_CODE_ROWS.map(([province]) => province).filter(Boolean)
)].sort((a, b) => a.localeCompare(b));

export const getPhilippineCityOptions = (province = '') => {
  const normalizedProvince = normalizeLocationName(province);
  if (!normalizedProvince) return [];

  const options = new Map();
  PHILIPPINE_ZIP_CODE_ROWS.forEach(([rowProvince, city, zipCode]) => {
    if (normalizeLocationName(rowProvince) !== normalizedProvince || !city || !zipCode) return;
    const key = normalizeLocationName(city);
    if (!options.has(key)) options.set(key, { city, zipCode });
  });
  return [...options.values()].sort((a, b) => a.city.localeCompare(b.city));
};

const getLocationVariants = (value) => {
  const location = String(value || '').trim().replace(/\s+/g, ' ');
  if (!location) return [];

  const variants = new Set([location]);
  const prefixMatch = location.match(/^(santa|santo|sta\.?|sto\.?|st\.?)\s+(.+)$/i);
  if (!prefixMatch) return [...variants];

  const suffix = prefixMatch[2];
  const prefix = prefixMatch[1].toLowerCase().replace('.', '');
  // Nominatim commonly recognizes local Santa/Santo names under the "St" form.
  if (prefix === 'santa' || prefix === 'sta') {
    variants.add(`St ${suffix}`);
    variants.add(`St. ${suffix}`);
    variants.add(`Santa ${suffix}`);
    variants.add(`Sta. ${suffix}`);
  } else if (prefix === 'santo' || prefix === 'sto') {
    variants.add(`St ${suffix}`);
    variants.add(`St. ${suffix}`);
    variants.add(`Santo ${suffix}`);
    variants.add(`Sto. ${suffix}`);
  } else {
    variants.add(`Santa ${suffix}`);
    variants.add(`Santo ${suffix}`);
    variants.add(`Sta. ${suffix}`);
    variants.add(`Sto. ${suffix}`);
    variants.add(`St ${suffix}`);
    variants.add(`St. ${suffix}`);
  }
  return [...variants];
};

const getSanPrefixZipFallback = (city, province) => {
  const cityName = normalizeLocationName(city);
  if (!cityName.startsWith('san')) return '';

  const provinceName = normalizeLocationName(province)
    .replace(/camsur$/, '')
    .replace(/province$/, '');
  return SAN_PREFIX_ZIP_FALLBACKS.get(`${provinceName}|${cityName}`) || '';
};

const getMetroManilaZipFallback = (city, province) => {
  const provinceName = normalizeLocationName(province);
  if (!['manila', 'metromanila', 'nationalcapitalregion', 'ncr'].includes(provinceName)) return '';
  return getLocationVariants(city)
    .map(normalizeLocationName)
    .map((cityName) => METRO_MANILA_ZIP_FALLBACKS.get(`${provinceName}|${cityName}`))
    .find(Boolean) || '';
};

const getMunicipalityZipFallback = (city, province) => (
  MUNICIPALITY_ZIP_FALLBACKS.get(`${normalizeLocationName(province)}|${normalizeLocationName(city)}`) || ''
);

const getOfficialPhilippineZipFallback = (city, province) => (
  PHILIPPINE_ZIP_CODE_MAP.get(`${normalizeLocationName(province)}|${normalizeLocationName(city)}`) || ''
);

const isLocationMatch = (value, variants) => {
  const normalizedValue = normalizeLocationName(value);
  return Boolean(normalizedValue) && variants.some((variant) => (
    normalizeLocationName(variant) === normalizedValue
  ));
};

const getResultCityNames = (address = {}) => [
  address.city,
  address.town,
  address.municipality,
  address.village,
  address.city_district,
  address.suburb,
  address.quarter,
  address.neighbourhood
].filter(Boolean);

const getResultProvinceNames = (address = {}) => [
  address.province,
  address.county,
  address.state_district,
  address.state,
  address.region
].filter(Boolean);

const fetchNominatimResults = async (params) => {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Nominatim request failed with ${response.status}`);
  return response.json();
};

export const lookupPhilippineAddressByZipCode = async (zipCode) => {
  const normalizedZipCode = normalizePhilippineZipCode(zipCode);
  if (!normalizedZipCode) return null;

  const results = await fetchNominatimResults(new URLSearchParams({
    postalcode: normalizedZipCode,
    country: PHILIPPINES,
    format: 'json',
    addressdetails: '1',
    limit: '10'
  }));
  const result = results.find((item) => (
    normalizePhilippineZipCode(item?.address?.postcode) === normalizedZipCode
  ));
  if (!result?.address) return null;

  const address = result.address;
  return {
    city: address.city || address.town || address.municipality || address.village || '',
    province: address.province || address.county || address.state_district || address.state || address.region || '',
    lat: Number.parseFloat(result.lat),
    lng: Number.parseFloat(result.lon),
    zipCode: normalizedZipCode
  };
};

export const lookupPhilippineZipCodeByCityAndProvince = async (city, province) => {
  const cityVariants = getLocationVariants(city);
  const provinceVariants = getLocationVariants(province);
  if (!cityVariants.length || !provinceVariants.length) return '';

  // Santa Cruz, Manila has two postal areas and the city/province form does
  // not include enough detail to choose between them. Use the standard
  // Santa Cruz South code unless North/South is explicitly entered.
  const metroFallback = getMetroManilaZipFallback(city, province);
  if (metroFallback) return metroFallback;

  // Prefer verified local municipality mappings so known Philippine ZIPs do
  // not depend on a live geocoder response.
  const localFallback = getSanPrefixZipFallback(city, province)
    || getMunicipalityZipFallback(city, province)
    || getOfficialPhilippineZipFallback(city, province);
  if (localFallback) return localFallback;

  const findVerifiedResult = (results) => results.find((item) => {
    const address = item?.address || {};
    const resultCityNames = getResultCityNames(address);
    const resultProvinceNames = getResultProvinceNames(address);
    const provinceMatches = resultProvinceNames.some((resultProvince) => (
      isLocationMatch(resultProvince, provinceVariants)
    )) || (
      provinceVariants.some((variant) => ['manila', 'metromanila', 'nationalcapitalregion', 'ncr'].includes(normalizeLocationName(variant)))
      && [...resultCityNames, ...resultProvinceNames].some((resultLocation) => (
        ['manila', 'metromanila', 'nationalcapitalregion', 'ncr', 'capitaldistrict'].includes(normalizeLocationName(resultLocation))
      ))
    );
    return normalizePhilippineZipCode(address.postcode)
      && resultCityNames.some((resultCity) => isLocationMatch(resultCity, cityVariants))
      && provinceMatches;
  });

  for (const cityVariant of cityVariants) {
    let results = [];
    try {
      results = await fetchNominatimResults(new URLSearchParams({
        city: cityVariant,
        state: province,
        country: PHILIPPINES,
        format: 'json',
        addressdetails: '1',
        limit: '10'
      }));
    } catch (error) {
      console.warn('SG LOG: City/province ZIP lookup unavailable; using local fallbacks.', error);
    }
    const result = findVerifiedResult(results);
    if (result) return normalizePhilippineZipCode(result.address.postcode);
  }

  // Retry unstructured searches for OSM entries that ignore city/state fields.
  for (const cityVariant of cityVariants) {
    let results = [];
    try {
      results = await fetchNominatimResults(new URLSearchParams({
        q: `${cityVariant}, ${province}, ${PHILIPPINES}`,
        format: 'json',
        addressdetails: '1',
        limit: '10'
      }));
    } catch (error) {
      console.warn('SG LOG: Unstructured ZIP lookup unavailable; using local fallbacks.', error);
    }
    const result = findVerifiedResult(results);
    if (result) return normalizePhilippineZipCode(result.address.postcode);
  }

  // Administrative boundaries frequently have no postcode in OSM. Fall back
  // to the province-qualified postal mappings for those locations.
  return '';
};
