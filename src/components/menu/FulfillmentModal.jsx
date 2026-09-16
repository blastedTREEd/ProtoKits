import React, { forwardRef, useImperativeHandle, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { 
  X, Trash2, Home, Users, Bike, Settings, Building2, Map, Sparkles, MapPin, MapPinCheck, MapPinSearch, Hash, Plus, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import L from 'leaflet';
import ShippingOptions from './ShippingOptions';
import {
  lookupPhilippineAddressByZipCode,
  lookupPhilippineZipCodeByCityAndProvince
} from '../../utils/philippineAddress';
import PhilippineAddressSuggestions from '../common/PhilippineAddressSuggestions';

import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapClickHandler({ setFormData }) {
  useMapEvents({
    click(e) {
      setFormData(prev => ({ ...prev, lat: e.latlng.lat, lng: e.latlng.lng }));
    },
  });
  return null;
}

function ChangeView({ center, zoom = 16 }) {
  const map = useMap();
  useEffect(() => {
    const currentCenter = map.getCenter();
    const threshold = 0.0001;
    if (Math.abs(currentCenter.lat - center[0]) > threshold || Math.abs(currentCenter.lng - center[1]) > threshold) {
      map.setView(center, zoom);
    } else if (map.getZoom() !== zoom) {
      map.setZoom(zoom);
    }
  }, [center, map, zoom]);
  return null;
}

const MAP_MAX_PIN_ZOOM = 19;

const ensureStreetSuffix = (street) => {
  if (!street) return '';
  const hasSuffix = /\b(St\.?|Street|Ave\.?|Avenue|Rd\.?|Road|Blvd\.?|Boulevard|Lane|Ln\.?|Dr\.?|Drive|Ct\.?|Court)\b/i.test(street);
  return hasSuffix ? street : `${street} St.`;
};

const buildPlaceAddress = (place = {}, { includeHouseNo = true } = {}) => {
  const street = ensureStreetSuffix(place.houseDetails || place.street);
  const streetLine = [
    includeHouseNo ? place.houseNo : '',
    street
  ].filter(Boolean).join(' ').trim();

  return [
    streetLine,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};

const getPlaceCardAddress = (place = {}) => {
  const address = buildPlaceAddress(place) || place.address || '';
  const label = String(place.landmark || '').trim();
  if (!address || !label || !address.toLowerCase().startsWith(label.toLowerCase())) return address;
  return address.slice(label.length).replace(/^[,\s]+/, '');
};

const FulfillmentModal = forwardRef(function FulfillmentModal({ isOpen, onClose, embedded = false, visible = true, onChangesChange = null }, ref) {
  const { isDarkMode } = useTheme();
  const { user, updateShippingSettings, shippingSettings } = useStore();
  const [selectedCategory, setSelectedPickupCategory] = useState('methods');
  const [formData, setFormData] = useState(null);
  const [placeEditSnapshot, setPlaceEditSnapshot] = useState(null);
  const scrollRef = useRef(null);
  const [isOverMap, setIsOverMap] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [expandedSection, setExpandedSection] = useState('pickup-point');
  const [isAddingShippingMethod, setIsAddingShippingMethod] = useState(false);
  const wasOpenRef = useRef(false);
  const shippingMethodsRef = useRef({});
  const shippingMethodsWriteQueueRef = useRef(Promise.resolve());
  const pickupDetailsRef = useRef({});
  const pickupDetailsWriteQueueRef = useRef(Promise.resolve());
  const areShippingMethodsExpanded = expandedSection === 'methods';
  const canDrag = !isOverMap && !isScrolled;

  const initialFormData = useMemo(() => {
    // Huwag nang gamitin ang defaultMethods bilang base — Firestore lang ang source of truth.
    // Dati nagse-seed ng LBC/Lalamove/SPX Express kahit deleted na sa Firebase.
    
    const meetupPlaces = shippingSettings?.pickupDetails?.meetup?.places || [];
    const rawPickup = shippingSettings?.pickupDetails?.['pickup-point'] || {};
    const pickupPlaces = rawPickup.places || (rawPickup.landmark ? [rawPickup] : []);

    return {
      houseNo: "",
      houseDetails: "",
      landmark: "",
      subdivision: "",
      barangay: "",
      city: "",
      province: "",
      zipCode: "",
      meetupPlaces,
      pickupPlaces,
      shippingMethods: { ...(shippingSettings?.shippingMethods || {}) },
      lat: 14.5995,
      lng: 120.9842,
      activeMeetupIndex: null,
      activePickupIndex: null
    };
  }, [shippingSettings]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (!shippingSettings) return;
    if (!wasOpenRef.current || !formData) {
      setFormData(initialFormData);
    }
    wasOpenRef.current = true;
  }, [formData, initialFormData, isOpen, shippingSettings]);

  useEffect(() => {
    shippingMethodsRef.current = formData?.shippingMethods || {};
  }, [formData?.shippingMethods]);

  useEffect(() => {
    if (shippingSettings?.pickupDetails) {
      pickupDetailsRef.current = shippingSettings.pickupDetails;
    }
  }, [shippingSettings?.pickupDetails]);

  useEffect(() => {
    if (isOpen && !embedded) {
      document.body.style.overflow = 'hidden';
    } else if (!embedded) {
      document.body.style.overflow = 'unset';
    }
    return () => {
      if (!embedded) document.body.style.overflow = 'unset';
    };
  }, [isOpen, embedded]);

  const handleScroll = (e) => {
    setIsScrolled(e.target.scrollTop > 0);
  };

  const cleanPlace = (source) => {
    const place = {
      landmark: source.landmark,
      houseNo: source.houseNo,
      houseDetails: ensureStreetSuffix(source.houseDetails),
      subdivision: source.subdivision,
      barangay: source.barangay,
      city: source.city,
      province: source.province,
      zipCode: source.zipCode,
      lat: source.lat,
      lng: source.lng,
      isActive: source.isActive !== false
    };
    if (source.pickupAddressMode === 'actual-pin' || source.pickupAddressMode === 'rate-checking') {
      place.pickupAddressMode = source.pickupAddressMode;
    }
    place.address = buildPlaceAddress(place, { includeHouseNo: true });
    place.publicAddress = buildPlaceAddress(place, { includeHouseNo: false });
    return place;
  };

  const buildShippingPayload = () => {
    const existingPickupDetails = shippingSettings?.pickupDetails || {};
    const pickupDetails = {
      ...existingPickupDetails,
      'pickup-point': {
        ...(existingPickupDetails['pickup-point'] || {}),
        places: [...(formData?.pickupPlaces || [])]
      },
      meetup: {
        ...(existingPickupDetails.meetup || {}),
        places: [...(formData?.meetupPlaces || [])]
      }
    };

    // Commit the currently edited place too, so switching between the
    // shipping tabs cannot silently discard a pickup/meetup edit.
    if (selectedCategory === 'pickup-point' || selectedCategory === 'meetup') {
      const listKey = selectedCategory === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
      const activeKey = selectedCategory === 'meetup' ? 'activeMeetupIndex' : 'activePickupIndex';
      const currentPlace = cleanPlace(formData || {});
      const hasPlaceInput = [
        currentPlace.landmark, currentPlace.houseNo, currentPlace.houseDetails,
        currentPlace.subdivision, currentPlace.barangay, currentPlace.city,
        currentPlace.province, currentPlace.zipCode
      ].some(Boolean);
      if (hasPlaceInput) {
        const places = [...(formData?.[listKey] || [])];
        if (formData?.[activeKey] !== null && formData?.[activeKey] !== undefined) {
          places[formData[activeKey]] = currentPlace;
        } else {
          places.push(currentPlace);
        }
        pickupDetails[selectedCategory] = {
          ...(existingPickupDetails[selectedCategory] || {}),
          places
        };
      }
    }

    return {
      shippingMethods: { ...(formData?.shippingMethods || {}) },
      pickupDetails
    };
  };

  const persistPlaceList = async (type, places) => {
    const currentPickupDetails = pickupDetailsRef.current || {};
    const nextPickupDetails = {
      ...currentPickupDetails,
      [type]: {
        ...currentPickupDetails[type],
        places: [...places]
      }
    };
    pickupDetailsRef.current = nextPickupDetails;

    const write = pickupDetailsWriteQueueRef.current
      .catch(() => undefined)
      .then(() => updateShippingSettings(user.uid, { pickupDetails: nextPickupDetails }));
    pickupDetailsWriteQueueRef.current = write.catch(() => undefined);

    return write.catch((error) => {
      if (pickupDetailsRef.current === nextPickupDetails) {
        pickupDetailsRef.current = currentPickupDetails;
      }
      throw error;
    });
  };

  const handleDeletePlace = async (type, index = null) => {
    if (!window.confirm("Are you sure you want to delete this place?")) return;

    const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
    const previousPlaces = [...(formData?.[listKey] || [])];
    const updatedPlaces = previousPlaces.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      [listKey]: updatedPlaces,
      [type === 'meetup' ? 'activeMeetupIndex' : 'activePickupIndex']: null
    }));

    try {
      await persistPlaceList(type, updatedPlaces);
    } catch (err) {
      console.error(err);
      setFormData(prev => ({ ...prev, [listKey]: previousPlaces }));
      alert("Failed to delete place.");
    }
  };

  const handleTogglePlaceAvailability = async (type, index = null) => {
    const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
    const previousPlaces = [...(formData?.[listKey] || [])];
    const updatedPlaces = [...previousPlaces];
    updatedPlaces[index] = {
      ...updatedPlaces[index],
      isActive: updatedPlaces[index].isActive === false ? true : false
    };
    setFormData(prev => ({ ...prev, [listKey]: updatedPlaces }));

    try {
      await persistPlaceList(type, updatedPlaces);
    } catch (err) {
      console.error(err);
      setFormData(prev => ({ ...prev, [listKey]: previousPlaces }));
      alert("Failed to toggle availability.");
    }
  };

  const handleTogglePickupAddressMode = async (index) => {
    const previousPlaces = [...(formData?.pickupPlaces || [])];
    const updatedPlaces = [...previousPlaces];
    const currentPlace = updatedPlaces[index];
    if (!currentPlace) return;

    updatedPlaces[index] = {
      ...currentPlace,
      pickupAddressMode: currentPlace.pickupAddressMode === 'actual-pin' ? 'rate-checking' : 'actual-pin'
    };

    setFormData(prev => ({ ...prev, pickupPlaces: updatedPlaces }));

    try {
      await persistPlaceList('pickup-point', updatedPlaces);
    } catch (err) {
      console.error(err);
      setFormData(prev => ({ ...prev, pickupPlaces: previousPlaces }));
      alert("Failed to update pickup address mode.");
    }
  };

  const getShippingSavingsState = (methods = {}) => JSON.stringify(
    Object.fromEntries(
      Object.keys(methods).sort().map(method => {
        const value = methods[method];
        const config = typeof value === 'object' && value !== null ? value : { active: !!value };
        const suboptions = Object.fromEntries(
          Object.keys(config.suboptions || {}).sort().map(key => [
            key,
            config.suboptions[key]?.handlingFee === true
          ])
        );
        return [method, {
          handlingFee: config.handlingFee === true,
          suboptions
        }];
      })
    )
  );

  const hasShippingSavingsChange = () => (
    getShippingSavingsState(formData?.shippingMethods) !== getShippingSavingsState(shippingSettings?.shippingMethods)
  );

  const getShippingComparisonState = (payload = {}) => {
    const pickupDetails = payload.pickupDetails || {};
    const pickupPoint = pickupDetails['pickup-point'] || {};
    const meetup = pickupDetails.meetup || {};

    return JSON.stringify({
      shippingMethods: payload.shippingMethods || {},
      pickupDetails: {
        ...pickupDetails,
        'pickup-point': { ...pickupPoint, places: pickupPoint.places || [] },
        meetup: { ...meetup, places: meetup.places || [] }
      }
    });
  };

  const hasShippingChange = () => (
    getShippingComparisonState(buildShippingPayload()) !== getShippingComparisonState({
      shippingMethods: shippingSettings?.shippingMethods || {},
      pickupDetails: shippingSettings?.pickupDetails || {}
    })
  );

  useEffect(() => {
    if (!onChangesChange) return;
    onChangesChange(hasShippingChange());
    // buildShippingPayload intentionally captures the active place draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, selectedCategory, shippingSettings, onChangesChange]);

  const handleSave = async ({ skipSavingsConfirmation = false } = {}) => {
    if (!skipSavingsConfirmation && hasShippingSavingsChange() && !window.confirm('This will change shipping savings available to customers. Do you want to continue?')) {
      return false;
    }

    try {
      await updateShippingSettings(user.uid, buildShippingPayload());
      if (!embedded) onClose();
      return true;
    } catch (err) { console.error(err); alert("Failed to update."); }
  };

  const commitShippingMethods = useCallback((nextMethods) => {
    const previousMethods = shippingMethodsRef.current;
    shippingMethodsRef.current = nextMethods;
    setFormData(prev => ({ ...prev, shippingMethods: nextMethods }));

    // Serialize writes so a suboption toggle followed immediately by a
    // method/Self-Pickup toggle cannot overwrite the previous write with a
    // stale Firestore snapshot.
    const write = shippingMethodsWriteQueueRef.current
      .catch(() => undefined)
      .then(() => updateShippingSettings(user.uid, { shippingMethods: nextMethods }));
    shippingMethodsWriteQueueRef.current = write.catch(() => undefined);

    return write.catch((error) => {
      // Do not roll back a newer edit that has already replaced this payload.
      if (shippingMethodsRef.current === nextMethods) {
        shippingMethodsRef.current = previousMethods;
        setFormData(prev => ({ ...prev, shippingMethods: previousMethods }));
      }
      throw error;
    });
  }, [updateShippingSettings, user?.uid]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    hasChanges: hasShippingChange,
    hasSavingsChange: hasShippingSavingsChange
  }));

  const handleToggleMethod = (m, subKey = null) => {
    const currentMethods = shippingMethodsRef.current || {};
    const currentMethodValue = currentMethods[m];
    const methodObj = typeof currentMethodValue === 'object' && currentMethodValue !== null
      ? currentMethodValue
      : { active: !!currentMethodValue };
    let nextMethods;

    if (subKey) {
      // Lahat ng suboptions ay naka-store na sa .suboptions[subKey] — unified format
      const suboptions = methodObj.suboptions || {};
      const subVal = suboptions[subKey];
      const isSubActive = subVal === undefined ? true
        : typeof subVal === 'object' && subVal !== null ? subVal.active !== false
        : subVal !== false;
      nextMethods = {
        ...currentMethods,
        [m]: {
          ...methodObj,
          suboptions: {
            ...suboptions,
            [subKey]: { ...(typeof subVal === 'object' ? subVal : {}), active: !isSubActive }
          }
        }
      };
    } else {
      // Method-level toggle
      const isCurrentlyActive = typeof currentMethodValue === 'object'
        ? currentMethodValue.active !== false
        : !!currentMethodValue;
      nextMethods = {
        ...currentMethods,
        [m]: typeof currentMethodValue === 'object'
          ? { ...currentMethodValue, active: !isCurrentlyActive }
          : !isCurrentlyActive
      };
    }

    commitShippingMethods(nextMethods).catch((error) => {
      console.error('Failed to persist shipping toggle:', error);
      alert('Failed to update shipping settings.');
    });
  };

  const capitalizeWords = (str) => {
    if (!str) return "";
    const romanRegex = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/i;
    return str.split(' ').map(word => {
      if (romanRegex.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  const handleAddressChange = useCallback((fields, index = null) => {
    setFormData(prev => {
        const next = { ...prev, ...fields };
        if (index !== null) {
            const listKey = selectedCategory === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
            const list = [...prev[listKey]];
            list[index] = { ...list[index], ...fields };
            return { ...prev, [listKey]: list };
        }
        return next;
    });
  }, [selectedCategory]);

  const handleBlur = (field, value) => {
    const formattedValue = capitalizeWords(value);
    handleAddressChange({ [field]: field === 'houseDetails' ? ensureStreetSuffix(formattedValue) : formattedValue });
  };

  const [lastGeocoded, setLastGeocoded] = useState({});
  const { zipCode, barangay, city, province, lat, lng } = formData || {};

  const performGeocoding = useCallback(async (query) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}, Philippines&format=json&addressdetails=1&limit=1`);
      const data = await res.json();
      if (data?.length > 0) {
        const addr = data[0].address;
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), city: addr.city || addr.town || addr.municipality || "", province: addr.state || addr.region || "", zipCode: addr.postcode || "" };
      }
    } catch (err) { console.error("Geocoding failed", err); }
    return null;
  }, []);

  const performReverseGeocoding = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
      const data = await res.json();
      if (data?.address) {
        const addr = data.address;
        return { 
          barangay: addr.barangay || addr.suburb || "",
          city: addr.city || addr.town || addr.municipality || "", 
          province: addr.state || addr.region || "", 
          zipCode: addr.postcode || "" 
        };
      }
    } catch (err) { console.error("Reverse geocoding failed", err); }
    return null;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handler = setTimeout(async () => {
      const currentAddress = { zipCode, barangay, city, province };
      if (JSON.stringify(currentAddress) === JSON.stringify(lastGeocoded)) return;

      if (selectedCategory === 'pickup-point' || selectedCategory === 'meetup') {
        
        // 1. If coordinates changed significantly, do Reverse Geocoding
        const hasCoordinates = lat && lng && lat !== 14.5995 && lng !== 120.9842;
        if (hasCoordinates && (!barangay || !city)) {
          const res = await performReverseGeocoding(lat, lng);
          if (res) {
             handleAddressChange({ barangay: res.barangay, city: res.city, province: res.province, zipCode: res.zipCode });
             setLastGeocoded({ ...currentAddress, ...res });
             return;
          }
        }

        // 2. Lookup City/Province via ZIP
        if (zipCode?.length === 4) {
          const res = await lookupPhilippineAddressByZipCode(zipCode);
          if (res) {
            handleAddressChange({ city: res.city, province: res.province });
            setLastGeocoded({ ...currentAddress, city: res.city, province: res.province });
          }
        } 
        // 3. Lookup ZIP via City/Province. Keep this independent from
        // coordinate lookup so Santa/Sta./Santo/Sto. aliases are supported.
        else if (!zipCode && city?.length > 2 && province?.length > 2) {
          const generatedZipCode = await lookupPhilippineZipCodeByCityAndProvince(city, province);
          if (generatedZipCode) {
            handleAddressChange({ zipCode: generatedZipCode });
            setLastGeocoded({ ...currentAddress, zipCode: generatedZipCode });
          }
        }
        // 4. Lookup Coordinates via Address fields
        else if (barangay?.length > 2 && city?.length > 2) {
          const query = `${barangay}, ${city}, ${province || ''}`;
          const res = await performGeocoding(query);
          if (res) {
            handleAddressChange({ lat: res.lat, lng: res.lng, zipCode: res.zipCode || zipCode });
            setLastGeocoded({ ...currentAddress, lat: res.lat, lng: res.lng, zipCode: res.zipCode });
          }
        }
      }
    }, 1200);
    return () => clearTimeout(handler);
  }, [zipCode, barangay, city, province, lat, lng, isOpen, performGeocoding, performReverseGeocoding, selectedCategory, lastGeocoded, handleAddressChange]);

  const mapCenter = formData ? [formData.lat, formData.lng] : [14.5995, 120.9842];
  const inputClass = `w-full pl-12 pr-4 py-3 rounded-2xl text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-garage-blue/50 ${isDarkMode ? 'bg-white/5 text-white' : 'bg-black/5 text-neutral-900'}`;

  const capturePlaceEditSnapshot = () => (formData ? {
    ...formData,
    meetupPlaces: [...(formData.meetupPlaces || [])],
    pickupPlaces: [...(formData.pickupPlaces || [])]
  } : null);

  const handleAddNewPlace = (type) => {
    if (type === 'pickup-point' && (formData?.pickupPlaces || []).length >= 3) return;
    setPlaceEditSnapshot(capturePlaceEditSnapshot());
    setExpandedSection(type);
    setSelectedPickupCategory(type);
    setFormData(prev => ({
      ...prev,
      houseNo: '',
      houseDetails: '',
      landmark: '',
      subdivision: '',
      barangay: '',
      city: '',
      province: '',
      zipCode: '',
      lat: 14.5995,
      lng: 120.9842,
      activeMeetupIndex: null,
      activePickupIndex: null
    }));
    setLastGeocoded({});
  };

  const handleSelectPlace = (type, place, index) => {
    setPlaceEditSnapshot(capturePlaceEditSnapshot());
    setExpandedSection(type);
    setSelectedPickupCategory(type);
    setFormData(prev => ({
      ...prev,
      ...place,
      meetupPlaces: prev.meetupPlaces,
      pickupPlaces: prev.pickupPlaces,
      activeMeetupIndex: type === 'meetup' ? index : null,
      activePickupIndex: type === 'pickup-point' ? index : null
    }));
    setLastGeocoded({});
  };

  const handleCancelPlaceEdit = () => {
    if (placeEditSnapshot) setFormData(placeEditSnapshot);
    setPlaceEditSnapshot(null);
    setSelectedPickupCategory('methods');
  };

  const handleSavePlace = async (type) => {
    const saved = await handleSave();
    if (!saved) return;

    const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
    const activeKey = type === 'meetup' ? 'activeMeetupIndex' : 'activePickupIndex';
    const currentPlace = cleanPlace(formData || {});
    const updatedPlaces = [...(formData?.[listKey] || [])];
    if (formData?.[activeKey] !== null && formData?.[activeKey] !== undefined) {
      updatedPlaces[formData[activeKey]] = currentPlace;
    } else if (Object.values(currentPlace).some(Boolean)) {
      updatedPlaces.push(currentPlace);
    }

    setFormData(prev => ({
      ...prev,
      [listKey]: updatedPlaces,
      [activeKey]: null
    }));
    setPlaceEditSnapshot(null);
    setSelectedPickupCategory('methods');
  };

  const renderPlaceEditor = (type) => {
    const isMeetup = type === 'meetup';
    const activeIndex = isMeetup ? formData.activeMeetupIndex : formData.activePickupIndex;
    const title = isMeetup ? 'Meetup Place' : 'Pickup Point';
    const canSavePlace = true;
    const mapZoom = isMeetup ? 16 : MAP_MAX_PIN_ZOOM;
    const mapMaxZoom = isMeetup ? 18 : MAP_MAX_PIN_ZOOM;

    return (
      <div className="space-y-4 rounded-3xl border border-garage-blue/15 bg-garage-blue/[0.03] p-4 md:p-6">
        <PhilippineAddressSuggestions idPrefix="fulfillment-address" province={formData.province} />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-[14px] font-black uppercase italic text-garage-blue">
              {activeIndex === null ? `New ${title}` : `Edit ${title}`}
            </h4>
            <p className="mt-1 text-[13px] font-bold uppercase opacity-50">Configure the address and map location</p>
          </div>
          {activeIndex !== null && (
            <button
              type="button"
              onClick={() => handleAddNewPlace(type)}
              className="rounded-xl bg-garage-blue/10 px-3 py-2 text-[13px] font-black uppercase text-garage-blue"
            >
              <Plus size={12} className="mr-1 inline" /> New
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative text-left"><Sparkles className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Landmark" value={formData.landmark} onChange={(e) => handleAddressChange({ landmark: e.target.value })} onBlur={(e) => handleBlur('landmark', e.target.value)} className={inputClass} /></div>
          <div className="relative text-left"><Hash className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Zip Code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={formData.zipCode} onChange={(e) => handleAddressChange({ zipCode: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={inputClass} /></div>
        </div>
        {!isMeetup && (
          <div className="relative text-left"><Home className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="House No. (Optional)" value={formData.houseNo} onChange={(e) => handleAddressChange({ houseNo: e.target.value })} onBlur={(e) => handleBlur('houseNo', e.target.value)} className={inputClass} /></div>
        )}
        <div className="relative text-left"><Building2 className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder={isMeetup ? 'Street (Optional)' : 'Street'} value={formData.houseDetails} onChange={(e) => handleAddressChange({ houseDetails: e.target.value })} onBlur={(e) => handleBlur('houseDetails', e.target.value)} className={inputClass} /></div>
        <div className="relative text-left"><Map className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Subdivision (Optional)" value={formData.subdivision} onChange={(e) => handleAddressChange({ subdivision: e.target.value })} onBlur={(e) => handleBlur('subdivision', e.target.value)} className={inputClass} /></div>
        <div className="relative text-left"><MapPin className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Barangay" value={formData.barangay} onChange={(e) => handleAddressChange({ barangay: e.target.value })} onBlur={(e) => handleBlur('barangay', e.target.value)} className={inputClass} /></div>
        <div className="relative text-left"><Map className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input list="fulfillment-address-provinces" placeholder="Province" value={formData.province} onChange={(e) => handleAddressChange({ province: e.target.value, zipCode: '' })} onBlur={(e) => handleBlur('province', e.target.value)} className={inputClass} /></div>
        <div className="relative text-left"><Building2 className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input list="fulfillment-address-cities" placeholder="City / Town" value={formData.city} onChange={(e) => handleAddressChange({ city: e.target.value, zipCode: '' })} onBlur={(e) => handleBlur('city', e.target.value)} className={inputClass} /></div>

        <div
          className="h-48 w-full overflow-hidden rounded-2xl"
          style={{ touchAction: 'none' }}
          onMouseEnter={() => setIsOverMap(true)}
          onMouseLeave={() => setIsOverMap(false)}
          onTouchStart={() => setIsOverMap(true)}
          onTouchEnd={() => setIsOverMap(false)}
          onTouchCancel={() => setIsOverMap(false)}
        >
          <MapContainer center={mapCenter} zoom={mapZoom} minZoom={12} maxZoom={mapMaxZoom} style={{ height: '100%', width: '100%' }} dragging scrollWheelZoom zoomControl>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={mapMaxZoom} />
            <Marker
              position={mapCenter}
              draggable
              eventHandlers={{
                dragend: async (e) => {
                  const position = e.target.getLatLng();
                  setFormData(prev => ({ ...prev, lat: position.lat, lng: position.lng }));
                  const res = await performReverseGeocoding(position.lat, position.lng);
                  if (res) handleAddressChange({ barangay: res.barangay, city: res.city, province: res.province, zipCode: res.zipCode });
                }
              }}
            />
            <ChangeView center={mapCenter} zoom={mapZoom} />
            <MapClickHandler setFormData={setFormData} />
          </MapContainer>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancelPlaceEdit}
            className="flex-1 rounded-2xl bg-black/5 py-4 text-[13px] font-black uppercase text-neutral-700 transition-all hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSavePlace(type)}
            disabled={!hasShippingChange() || !canSavePlace}
            className="flex-1 rounded-2xl bg-garage-blue py-4 text-[13px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save {title}
          </button>
          {activeIndex !== null && !embedded && (
            <button type="button" onClick={() => handleDeletePlace(type, activeIndex)} className="rounded-2xl bg-red-500/10 px-6 py-4 text-[13px] font-black uppercase text-red-500 transition-all hover:bg-red-500 hover:text-white">Delete</button>
          )}
        </div>
      </div>
    );
  };

  const renderPlaceSection = (type, title, sectionIcon) => {
    const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
    const activeIndex = type === 'meetup' ? formData.activeMeetupIndex : formData.activePickupIndex;
    const places = formData[listKey] || [];
    const isPickupPointLimitReached = type === 'pickup-point' && places.length >= 3;
    const isEditingPlace = selectedCategory === type && activeIndex !== null;
    const isExpanded = expandedSection === type;

    return (
      <section className="space-y-4 rounded-3xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02] md:p-6">
        <div className={`flex items-center gap-2 ${isExpanded ? 'border-b border-black/5 pb-3 dark:border-white/5' : ''}`}>
          <button
            type="button"
            onClick={() => setExpandedSection(prev => (prev === type ? null : type))}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {React.createElement(sectionIcon, { size: 18, className: 'shrink-0 text-garage-blue' })}
            <span className="min-w-0 flex-1 text-[14px] font-black uppercase italic text-garage-blue">{title}</span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {isExpanded && (
              <button
                type="button"
                onClick={() => handleAddNewPlace(type)}
                disabled={isPickupPointLimitReached}
                aria-label={`Add ${title.toLowerCase()}`}
                title={isPickupPointLimitReached ? 'Maximum of 3 pickup points reached' : `Add ${title.toLowerCase()}`}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-garage-blue transition-all hover:border-garage-blue/30 hover:bg-garage-blue/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpandedSection(prev => (prev === type ? null : type))}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `Collapse ${title.toLowerCase()}` : `Expand ${title.toLowerCase()}`}
              title={isExpanded ? `Collapse ${title.toLowerCase()}` : `Expand ${title.toLowerCase()}`}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-garage-blue transition-all hover:border-garage-blue/30 hover:bg-garage-blue/10"
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <>
            {!isEditingPlace && places.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {places.map((place, index) => {
                  const isSelected = activeIndex === index && selectedCategory === type;
                  const isPlaceActive = place.isActive !== false;
                  const placeLabel = place.landmark || `${title} ${index + 1}`;
                  const pickupAddressMode = place.pickupAddressMode === 'actual-pin' ? 'actual-pin' : 'rate-checking';
                  return (
                    <div
                      key={`${type}-${index}`}
                      role="switch"
                      tabIndex={0}
                      aria-checked={isPlaceActive}
                      onClick={(event) => {
                        if (event.target.closest('button, a, input, textarea, select, [role="button"]')) return;
                        handleTogglePlaceAvailability(type, index);
                      }}
                      onKeyDown={(event) => {
                        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                          event.preventDefault();
                          handleTogglePlaceAvailability(type, index);
                        }
                      }}
                      className={`flex h-full cursor-pointer flex-col rounded-2xl border p-3 transition-all ${isPlaceActive
                        ? 'border-2 border-garage-blue bg-white shadow-md shadow-blue-500/20 dark:bg-neutral-900'
                        : isSelected
                          ? 'border-garage-blue bg-garage-blue/5 shadow-md'
                          : 'border-black/5 bg-white dark:border-white/5 dark:bg-neutral-900'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => handleSelectPlace(type, place, index)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-[13px] font-black uppercase">{placeLabel}</span>
                          <span className="mt-1 block line-clamp-2 text-[13px] font-bold opacity-55">{getPlaceCardAddress(place)}</span>
                        </button>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                        {type === 'pickup-point' ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePickupAddressMode(index)}
                            className="flex items-center gap-1.5 rounded-xl border border-garage-blue/30 bg-garage-blue/10 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-garage-blue transition-all"
                          >
                            {pickupAddressMode === 'actual-pin' ? <MapPinCheck size={14} strokeWidth={2.5} /> : <MapPinSearch size={14} strokeWidth={2.5} />}
                            {pickupAddressMode === 'actual-pin' ? 'ACTUAL PIN' : 'RATE CHECKING'}
                          </button>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() => handleDeletePlace(type, index)}
                          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
                          aria-label={`Delete ${placeLabel}`}
                        >
                          <Trash2 size={15} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !isEditingPlace ? (
              <div className="rounded-2xl border border-dashed border-garage-blue/20 px-4 py-6 text-center text-[13px] font-bold uppercase opacity-50">No {title.toLowerCase()} configured yet.</div>
            ) : null}

            {selectedCategory === type && renderPlaceEditor(type)}
          </>
        )}
      </section>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && formData && (
        <div className={embedded
          ? `h-full w-full ${visible ? 'block' : 'hidden'}`
          : 'fixed inset-0 z-[200] flex items-end justify-center overflow-hidden p-0 md:items-center md:p-4'}>
          {!embedded && (
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={onClose}
            />
          )}
          <Motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            drag={!embedded && canDrag ? "y" : false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => {
              if (!embedded && info.offset.y > 100) onClose();
            }}
            className={`relative flex h-full w-full flex-col overflow-hidden ${embedded ? 'rounded-none shadow-none' : 'h-[92vh] rounded-t-[2.5rem] shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded-[2.5rem]'} ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            {/* Drag Handle for Mobile */}
            <div className={`${embedded ? 'hidden' : 'flex'} w-full shrink-0 justify-center pb-2 pt-4 md:hidden`}>
              <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10" />
            </div>

            <div className={`${embedded ? 'hidden' : 'flex'} relative z-10 shrink-0 items-center justify-between border-b p-4 shadow-sm md:p-8 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}>
               <h2 className="text-[15px] font-black italic uppercase text-garage-blue ml-2 md:ml-4">Shipping Options</h2>
               <button onClick={onClose} className="p-3 rounded-full bg-black/5 hover:bg-red-500/10 transition-all mr-2 md:mr-4"><X size={20} /></button>
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              data-modal-scroll-container
              className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar md:p-8"
            >
              <div className="mx-auto max-w-5xl space-y-8 text-left">
                {renderPlaceSection('pickup-point', 'Pickup Points', Bike)}
                {renderPlaceSection('meetup', 'Meetup Places', Users)}

                <section className="space-y-4 rounded-3xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02] md:p-6">
                  <div className={`flex items-center gap-2 ${areShippingMethodsExpanded ? 'border-b border-black/5 pb-3 dark:border-white/5' : ''}`}>
                    <Settings size={18} className="text-garage-blue" />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[14px] font-black uppercase italic text-garage-blue">Shipping Methods</h3>
                        <p className="text-[13px] font-bold uppercase opacity-50">Configure couriers, suboptions, discounts, and required fields</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {areShippingMethodsExpanded && (
                          <button
                            type="button"
                            onClick={() => setIsAddingShippingMethod(true)}
                            aria-label="Add shipping method"
                            title="Add shipping method"
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-garage-blue transition-all hover:border-garage-blue/30 hover:bg-garage-blue/10"
                          >
                            <Plus size={18} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedSection(prev => (prev === 'methods' ? null : 'methods'))}
                          aria-expanded={areShippingMethodsExpanded}
                          aria-label={areShippingMethodsExpanded ? 'Collapse shipping methods' : 'Expand shipping methods'}
                          title={areShippingMethodsExpanded ? 'Collapse shipping methods' : 'Expand shipping methods'}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-garage-blue transition-all hover:border-garage-blue/30 hover:bg-garage-blue/10"
                        >
                          {areShippingMethodsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {areShippingMethodsExpanded && (
                    <ShippingOptions
                      shippingMethods={formData.shippingMethods}
                      isAddingMethod={isAddingShippingMethod}
                      setIsAddingMethod={setIsAddingShippingMethod}
                      handleToggleMethod={handleToggleMethod}
                      handleSave={handleSave}
                      showSave={!embedded}
                      hasChanges={hasShippingChange()}
                      setShippingMethods={(newMethods) => setFormData(p => ({ ...p, shippingMethods: newMethods }))}
                      onShippingMethodsChange={commitShippingMethods}
                    />
                  )}
                </section>
              </div>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default FulfillmentModal;
