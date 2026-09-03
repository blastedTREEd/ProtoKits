import React, { useMemo } from 'react';
import {
  getPhilippineCityOptions,
  getPhilippineProvinceOptions
} from '../../utils/philippineAddress.js';

export default function PhilippineAddressSuggestions({ idPrefix, province }) {
  const provinceOptions = useMemo(() => getPhilippineProvinceOptions(), []);
  const cityOptions = useMemo(() => getPhilippineCityOptions(province), [province]);
  const provinceListId = `${idPrefix}-provinces`;
  const cityListId = `${idPrefix}-cities`;

  return (
    <>
      <datalist id={provinceListId}>
        {provinceOptions.map((option) => <option key={option} value={option} />)}
      </datalist>
      <datalist id={cityListId}>
        {cityOptions.map(({ city, zipCode }) => (
          <option key={`${city}-${zipCode}`} value={city} label={`ZIP ${zipCode}`} />
        ))}
      </datalist>
    </>
  );
}
