const PHILIPPINES = 'Philippines';

export const normalizePhilippineZipCode = (value) => String(value || '').match(/\b\d{4}\b/)?.[0] || '';

const normalizeLocationName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(city|municipality|province)\b/g, '')
  .replace(/[^a-z0-9]+/g, '')
  .trim();

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
  address.city_district
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

  const findVerifiedResult = (results) => results.find((item) => {
    const address = item?.address || {};
    return normalizePhilippineZipCode(address.postcode)
      && getResultCityNames(address).some((resultCity) => isLocationMatch(resultCity, cityVariants))
      && getResultProvinceNames(address).some((resultProvince) => isLocationMatch(resultProvince, provinceVariants));
  });

  for (const cityVariant of cityVariants) {
    const result = findVerifiedResult(await fetchNominatimResults(new URLSearchParams({
      city: cityVariant,
      state: province,
      country: PHILIPPINES,
      format: 'json',
      addressdetails: '1',
      limit: '10'
    })));
    if (result) return normalizePhilippineZipCode(result.address.postcode);
  }

  // Retry unstructured searches for OSM entries that ignore city/state fields.
  for (const cityVariant of cityVariants) {
    const result = findVerifiedResult(await fetchNominatimResults(new URLSearchParams({
      q: `${cityVariant}, ${province}, ${PHILIPPINES}`,
      format: 'json',
      addressdetails: '1',
      limit: '10'
    })));
    if (result) return normalizePhilippineZipCode(result.address.postcode);
  }

  return '';
};
