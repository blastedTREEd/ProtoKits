import React, { useCallback, useEffect, useRef } from 'react';
import { 
  User, Phone, Home, Building2, Map, Hash, Navigation, MapPin, Sparkles, MapPinSearch
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { motion } from 'framer-motion';
import {
  lookupPhilippineAddressByZipCode,
  lookupPhilippineZipCodeByCityAndProvince
} from '../../utils/philippineAddress';
import PhilippineAddressSuggestions from '../common/PhilippineAddressSuggestions';

const MAP_MAX_PIN_ZOOM = 19;

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    const currentCenter = map.getCenter();
    const threshold = 0.0001;
    if (Math.abs(currentCenter.lat - center[0]) > threshold || Math.abs(currentCenter.lng - center[1]) > threshold) {
      map.setView(center, MAP_MAX_PIN_ZOOM);
    } else if (map.getZoom() !== MAP_MAX_PIN_ZOOM) {
      map.setZoom(MAP_MAX_PIN_ZOOM);
    }
  }, [center, map]);
  return null;
}

function MapClickHandler({ onMovePin }) {
  useMapEvents({
    click(e) {
      onMovePin(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

function MapRecenterButton({ center }) {
  const map = useMap();
  const recenter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const maxZoom = map.getMaxZoom();
    map.setView(center, Number.isFinite(maxZoom) ? maxZoom : MAP_MAX_PIN_ZOOM, { animate: true });
  };

  return (
    <button
      type="button"
      onClick={recenter}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="absolute right-3 top-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-blue-600 shadow-lg transition hover:scale-105 hover:bg-blue-600 hover:text-white dark:border-white/10 dark:bg-neutral-950"
      title="Back to pin"
      aria-label="Back to pin"
    >
      <MapPinSearch size={18} />
    </button>
  );
}

export default function DynamicShippingForm({
  requiredFields = [],
  deliveryData,
  updateDeliveryData,
  checkoutData,
  updateCheckoutData,
  validationState,
  setValidationState,
  addressStatus,
  setAddressStatus,
  courierName = 'LBC',
  isDarkMode = false
}) {
  const isRequired = (id) => requiredFields.includes(id);

  const getBranchPrefix = useCallback((courier) => {
    const cleanCourier = (courier || 'LBC').trim();
    return `${cleanCourier} Express - `;
  }, []);

  const handlePhoneFocus = () => {
    if (!deliveryData.phoneNumber) {
      updateDeliveryData(prev => ({ ...prev, phoneNumber: '09' }));
    }
  };

  const handlePhoneBlur = () => {
    if (deliveryData.phoneNumber === '09') {
      updateDeliveryData(prev => ({ ...prev, phoneNumber: '' }));
    }
  };

  const markAddressAsEdited = useCallback(() => {
    setAddressStatus(prev => ({ ...prev, isPinConfirmed: false }));
  }, [setAddressStatus]);

  const handlePhoneChange = (val) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 11);
    updateDeliveryData(prev => ({ ...prev, phoneNumber: cleaned }));
  };

  const addressLookupSequence = useRef(0);

  const capitalizeWords = useCallback((str) => {
    if (!str) return "";
    const romanRegex = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/i;
    return str.split(' ').map(word => {
      if (romanRegex.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }, []);

  const performReverseGeocoding = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
      const data = await res.json();
      if (data?.address) {
        const addr = data.address;
        return {
          barangay: addr.barangay || addr.suburb || addr.village || '',
          city: addr.city || addr.town || addr.municipality || '',
          province: addr.state || addr.region || '',
          zipCode: addr.postcode || ''
        };
      }
    } catch (err) {
      console.error("Reverse geocoding failed", err);
    }
    return null;
  }, []);

  const handlePinMove = useCallback(async (lat, lng) => {
    updateDeliveryData(prev => ({ ...prev, lat, lng }));
    setAddressStatus(prev => ({ ...prev, isPinConfirmed: true }));

    const res = await performReverseGeocoding(lat, lng);
    if (res) {
      updateDeliveryData(prev => ({
        ...prev,
        lat,
        lng,
        barangay: res.barangay || prev.barangay,
        city: res.city || prev.city,
        province: res.province || prev.province,
        zipCode: res.zipCode || prev.zipCode
      }));
    }
  }, [performReverseGeocoding, setAddressStatus, updateDeliveryData]);

  const handleZipLookup = useCallback(async (zip) => {
    const lookupSequence = ++addressLookupSequence.current;
    if (zip.length !== 4) return;

    try {
      const result = await lookupPhilippineAddressByZipCode(zip);
      if (!result || lookupSequence !== addressLookupSequence.current) return;

      updateDeliveryData(prev => ({
        ...prev,
        barangay: "",
        city: result.city || prev.city,
        province: result.province || prev.province,
        ...(addressStatus.isPinConfirmed ? {} : {
          lat: result.lat,
          lng: result.lng
        })
      }));
    } catch (err) { console.error("ZIP lookup failed", err); }
  }, [updateDeliveryData, addressStatus.isPinConfirmed]);

  const handleLocationChange = useCallback((field, value) => {
    addressLookupSequence.current += 1;
    markAddressAsEdited();
    updateDeliveryData(prev => ({
      ...prev,
      [field]: capitalizeWords(value),
      zipCode: ''
    }));
  }, [capitalizeWords, markAddressAsEdited, updateDeliveryData]);

  const { barangay: deliveryBarangay, city: deliveryCity, province: deliveryProvince, zipCode: deliveryZipCode } = deliveryData;
  useEffect(() => {
    const city = String(deliveryCity || '').trim();
    const province = String(deliveryProvince || '').trim();
    if (deliveryZipCode || city.length < 3 || province.length < 3) return undefined;

    const timer = setTimeout(async () => {
      const lookupSequence = ++addressLookupSequence.current;
      try {
        const zipCode = await lookupPhilippineZipCodeByCityAndProvince(city, province, deliveryBarangay);
        if (!zipCode || lookupSequence !== addressLookupSequence.current) return;

        updateDeliveryData(prev => (
          prev.zipCode || prev.city?.trim() !== city || prev.province?.trim() !== province
            ? prev
            : { ...prev, zipCode }
        ));
      } catch (err) {
        console.warn('City/province ZIP lookup failed', err);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [deliveryBarangay, deliveryCity, deliveryProvince, deliveryZipCode, updateDeliveryData]);

  const handleBranchFocus = () => {
    const prefix = getBranchPrefix(courierName);
    updateCheckoutData(prev => ({
      ...prev,
      lbcBranch: prev.lbcBranch && prev.lbcBranch.startsWith(prefix) ? prev.lbcBranch : prefix
    }));
  };

  const handleBranchChange = (value) => {
    const prefix = getBranchPrefix(courierName);
    const branchSuffix = value.startsWith(prefix)
      ? value.slice(prefix.length)
      : value.replace(new RegExp(`^${courierName}\\s*(Express)?\\s*-\\s*`, 'i'), '');
    const normalizedSuffix = capitalizeWords(branchSuffix.toLowerCase());
    updateCheckoutData(prev => ({
      ...prev,
      lbcBranch: normalizedSuffix.trim() ? `${prefix}${normalizedSuffix}` : value.startsWith(prefix) ? prefix : ''
    }));
  };

  const handleBranchBlur = () => {
    updateCheckoutData(prev => {
      const prefix = getBranchPrefix(courierName);
      const value = prev.lbcBranch || '';
      if (!value || value.trim() === prefix.trim()) {
        return { ...prev, lbcBranch: '' };
      }
      const cleanValue = value.replace(new RegExp(`^${prefix}`, 'i'), '').trim();
      return {
        ...prev,
        lbcBranch: cleanValue ? `${prefix}${cleanValue}` : ''
      };
    });
  };

  const inputClass = `w-full pl-10 pr-4 py-2.5 rounded-xl text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/50 bg-black/5 dark:bg-white/5 text-neutral-900 dark:text-white`;

  return (
    <div className="space-y-3 animate-in fade-in duration-300 text-left">
      <PhilippineAddressSuggestions idPrefix="checkout-address" province={deliveryData.province} />
      {/* Row 1: Name */}
      {isRequired(1) && (
        <div className="relative">
          <User className="absolute left-3.5 top-3 text-blue-600" size={16} />
          <motion.input 
            whileTap={{ scale: 0.99 }}
            whileFocus={{ scale: 1.01 }}
            transition={{ duration: 0.1 }}
            placeholder="Receiver's Name" 
            value={deliveryData.receiverName || ''} 
            onChange={(e) => updateDeliveryData(prev => ({...prev, receiverName: e.target.value}))} 
            className={inputClass} 
          />
        </div>
      )}

      {/* Row 2: Mobile No. & Zip Code */}
      {(isRequired(2) || isRequired(5)) && (
        <div className={`grid gap-2 ${isRequired(2) && isRequired(5) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {isRequired(2) && (
            <div className="relative">
              <Phone className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="Mobile No." 
                value={deliveryData.phoneNumber || ''} 
                onFocus={handlePhoneFocus} 
                onBlur={handlePhoneBlur} 
                onChange={(e) => handlePhoneChange(e.target.value)} 
                className={`${inputClass} ${deliveryData.phoneNumber && deliveryData.phoneNumber.length > 0 && deliveryData.phoneNumber !== '09' && deliveryData.phoneNumber.length < 11 ? 'border-red-500 !border-2' : ''}`} 
              />
            </div>
          )}
          {isRequired(5) && (
            <div className="relative">
              <Hash className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="Zip Code" 
                value={deliveryData.zipCode || ''} 
                onChange={(e) => { 
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4); 
                  markAddressAsEdited();
                  updateDeliveryData(prev => ({...prev, zipCode: val})); 
                  handleZipLookup(val); 
                }} 
                className={`${inputClass} ${!validationState.zipCode ? 'border-red-500 !border-2' : ''}`} 
              />
            </div>
          )}
        </div>
      )}

      {/* Row 3: Email */}
      {isRequired(3) && (
        <div className="relative">
          <User className="absolute left-3.5 top-3 text-blue-600" size={16} />
          <motion.input 
            whileTap={{ scale: 0.99 }}
            whileFocus={{ scale: 1.01 }}
            transition={{ duration: 0.1 }}
            placeholder="Email Address" 
            type="email"
            value={deliveryData.email || ''} 
            onChange={(e) => updateDeliveryData(prev => ({...prev, email: e.target.value}))} 
            className={inputClass} 
          />
        </div>
      )}

      {/* Row 3: Courier Branch */}
      {isRequired(13) && (
        <div className="relative text-left">
          <Building2 className="absolute left-3.5 top-3 text-blue-600" size={16} />
          <motion.input
            whileTap={{ scale: 0.99 }}
            whileFocus={{ scale: 1.01 }}
            transition={{ duration: 0.1 }}
            placeholder={`${courierName || 'Courier'} Branch`}
            value={checkoutData.lbcBranch || ''}
            onFocus={handleBranchFocus}
            onChange={(e) => handleBranchChange(e.target.value)}
            onBlur={handleBranchBlur}
            className={inputClass}
          />
        </div>
      )}

      {/* Row 4: House No. & Street */}
      {(isRequired(6) || isRequired(7)) && (
        <div className={`grid gap-2 ${isRequired(6) && isRequired(7) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {isRequired(6) && (
            <div className="relative">
              <Home className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="House No." 
                value={deliveryData.houseNo || ''} 
                onChange={(e) => { markAddressAsEdited(); updateDeliveryData(prev => ({...prev, houseNo: e.target.value})); }}
                className={inputClass} 
              />
            </div>
          )}
          {isRequired(7) && (
            <div className="relative">
              <Building2 className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="Street" 
                value={deliveryData.houseDetails || ''} 
                onChange={(e) => { markAddressAsEdited(); updateDeliveryData(prev => ({...prev, houseDetails: capitalizeWords(e.target.value)})); }}
                className={inputClass} 
              />
            </div>
          )}
        </div>
      )}

      {/* Row 5: Subdivision & Landmark */}
      {(isRequired(8) || isRequired(4)) && (
        <div className={`grid gap-2 ${isRequired(8) && isRequired(4) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {isRequired(8) && (
            <div className="relative text-left">
              <Map className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="Subdivision / Village (Optional)" 
                value={deliveryData.subdivision || ''} 
                onChange={(e) => { markAddressAsEdited(); updateDeliveryData(prev => ({...prev, subdivision: capitalizeWords(e.target.value)})); }}
                className={inputClass} 
              />
            </div>
          )}
          {isRequired(4) && (
            <div className="relative text-left">
              <Sparkles className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="Landmark (Optional)" 
                value={deliveryData.landmark || ''} 
                onChange={(e) => { markAddressAsEdited(); updateDeliveryData(prev => ({...prev, landmark: capitalizeWords(e.target.value)})); }}
                className={inputClass} 
              />
            </div>
          )}
        </div>
      )}

      {/* Row 6: Barangay */}
      {isRequired(9) && (
        <div className="relative text-left">
          <MapPin className="absolute left-3.5 top-3 text-blue-600" size={16} />
          <motion.input 
            whileTap={{ scale: 0.99 }}
            whileFocus={{ scale: 1.01 }}
            transition={{ duration: 0.1 }}
            placeholder="Barangay" 
            value={deliveryData.barangay || ''} 
            onChange={(e) => { markAddressAsEdited(); updateDeliveryData(prev => ({...prev, barangay: capitalizeWords(e.target.value)})); }}
            className={`${inputClass} ${!validationState.barangay ? 'border-red-500 !border-2' : ''}`} 
          />
        </div>
      )}

      {/* Row 7: Province & City */}
      {(isRequired(10) || isRequired(11)) && (
        <div className={`grid gap-2 ${isRequired(10) && isRequired(11) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {isRequired(11) && (
            <div className="relative text-left">
              <MapPin className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="Province"
                list="checkout-address-provinces"
                value={deliveryData.province || ''}
                onChange={(e) => handleLocationChange('province', e.target.value)}
                className={`${inputClass} ${!validationState.province ? 'border-red-500 !border-2' : ''}`}
              />
            </div>
          )}
          {isRequired(10) && (
            <div className="relative text-left">
              <Navigation className="absolute left-3.5 top-3 text-blue-600" size={16} />
              <motion.input 
                whileTap={{ scale: 0.99 }}
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.1 }}
                placeholder="City / Town"
                list="checkout-address-cities"
                value={deliveryData.city || ''}
                onChange={(e) => handleLocationChange('city', e.target.value)}
                className={`${inputClass} ${!validationState.city ? 'border-red-500 !border-2' : ''}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Map (Field 12) */}
      {isRequired(12) && addressStatus.isEditingAddress && (
        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-300">
          <div className="relative z-0 isolate h-64 w-full overflow-hidden rounded-2xl border border-black/5 bg-black/[0.03] dark:border-white/5 dark:bg-white/[0.04]">
            <MapContainer center={[deliveryData.lat, deliveryData.lng]} zoom={MAP_MAX_PIN_ZOOM} maxZoom={MAP_MAX_PIN_ZOOM} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAP_MAX_PIN_ZOOM} />
              <Marker
                position={[deliveryData.lat, deliveryData.lng]}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const pos = e.target.getLatLng();
                    handlePinMove(pos.lat, pos.lng);
                  }
                }}
              />
              <ChangeView center={[deliveryData.lat, deliveryData.lng]} />
              <MapRecenterButton center={[deliveryData.lat, deliveryData.lng]} />
              <MapClickHandler onMovePin={handlePinMove} />
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}
