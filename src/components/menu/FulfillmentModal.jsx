import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { 
  X, Home, Users, Truck, Settings, Building2, Map, Sparkles, MapPin, Hash
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import L from 'leaflet';
import ShippingOptions from './ShippingOptions';

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

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    const currentCenter = map.getCenter();
    const threshold = 0.0001;
    if (Math.abs(currentCenter.lat - center[0]) > threshold || Math.abs(currentCenter.lng - center[1]) > threshold) {
      map.panTo(center); // Uses panTo to avoid resetting zoom
    }
  }, [center, map]);
  return null;
}

const buildPlaceAddress = (place = {}, { includeHouseNo = true } = {}) => {
  const streetLine = [
    includeHouseNo ? place.houseNo : '',
    place.houseDetails || place.street
  ].filter(Boolean).join(' ').trim();

  return [
    place.landmark,
    streetLine,
    place.subdivision,
    place.barangay,
    place.city,
    place.province,
    place.zipCode
  ].filter(Boolean).join(', ');
};

export default function FulfillmentModal({ isOpen, onClose }) {
  const { isDarkMode } = useTheme();
  const { user, updateShippingSettings, shippingSettings } = useStore();
  const [selectedCategory, setSelectedPickupCategory] = useState('methods');
  const [formData, setFormData] = useState(null);
  const scrollRef = useRef(null);
  const [canDrag, setCanDrag] = useState(true);

  const initialFormData = useMemo(() => {
    const isMeetupCat = selectedCategory === 'meetup';
    const isPickupCat = selectedCategory === 'pickup-point';
    const categoryKey = selectedCategory === 'methods' ? 'pickup-point' : selectedCategory;
    const dataForCategory = (isMeetupCat || isPickupCat) ? {} : (shippingSettings?.pickupDetails?.[categoryKey] || {});
    // Huwag nang gamitin ang defaultMethods bilang base — Firestore lang ang source of truth.
    // Dati nagse-seed ng LBC/Lalamove/SPX Express kahit deleted na sa Firebase.
    
    const meetupPlaces = shippingSettings?.pickupDetails?.meetup?.places || [];
    const rawPickup = shippingSettings?.pickupDetails?.['pickup-point'] || {};
    const pickupPlaces = rawPickup.places || (rawPickup.landmark ? [rawPickup] : []);

    return {
      houseNo: dataForCategory.houseNo || "",
      houseDetails: dataForCategory.houseDetails || "",
      landmark: dataForCategory.landmark || "",
      subdivision: dataForCategory.subdivision || "",
      barangay: dataForCategory.barangay || "",
      city: dataForCategory.city || "",
      province: dataForCategory.province || "",
      zipCode: dataForCategory.zipCode || "",
      meetupPlaces,
      pickupPlaces,
      shippingMethods: { ...(shippingSettings?.shippingMethods || {}) },
      lat: dataForCategory.lat || 14.5995,
      lng: dataForCategory.lng || 120.9842,
      activeMeetupIndex: null,
      activePickupIndex: null
    };
  }, [shippingSettings, selectedCategory]);

  useEffect(() => {
    setFormData(initialFormData);
  }, [initialFormData]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleScroll = (e) => {
    setCanDrag(e.target.scrollTop <= 0);
  };

  const categories = [
    { id: 'methods', label: 'Shipping Methods', icon: Settings },
    { id: 'pickup-point', label: 'Pickup Point', icon: Truck },
    { id: 'meetup', label: 'Meetup Places', icon: Users }
  ];
const handleDeletePlace = async (type, index = null) => {
  if (!window.confirm("Are you sure you want to delete this place?")) return;

  try {
    const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
    const updatedPlaces = formData[listKey].filter((_, i) => i !== index);

    await updateShippingSettings(user.uid, {
      pickupDetails: {
        ...shippingSettings?.pickupDetails,
        [type]: {
          ...shippingSettings?.pickupDetails?.[type],
          places: updatedPlaces
        }
      }
    });
    // State is updated automatically via the useStore subscription to shippingSettings
  } catch (err) { console.error(err); alert("Failed to delete place."); }
};

  const handleTogglePlaceAvailability = async (type, index = null) => {
    try {
      const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
      const updatedPlaces = [...formData[listKey]];
      updatedPlaces[index] = { 
        ...updatedPlaces[index], 
        isActive: updatedPlaces[index].isActive === false ? true : false 
      };
      
      await updateShippingSettings(user.uid, {
        pickupDetails: {
          ...shippingSettings?.pickupDetails,
          [type]: {
            ...shippingSettings?.pickupDetails?.[type],
            places: updatedPlaces
          }
        }
      });
      // State is updated automatically via the useStore subscription
    } catch (err) { console.error(err); alert("Failed to toggle availability."); }
  };

  const handleSave = async () => {
    try {
      const type = selectedCategory;
      if (type === 'methods') {
        await updateShippingSettings(user.uid, { shippingMethods: formData.shippingMethods });
      } else {
        const listKey = type === 'meetup' ? 'meetupPlaces' : 'pickupPlaces';
        let updatedPlaces = [...formData[listKey]];
        
        const cleanPlace = {
          landmark: formData.landmark,
          houseNo: formData.houseNo,
          houseDetails: formData.houseDetails,
          subdivision: formData.subdivision,
          barangay: formData.barangay,
          city: formData.city,
          province: formData.province,
          zipCode: formData.zipCode,
          lat: formData.lat,
          lng: formData.lng,
          isActive: formData.isActive !== false
        };
        cleanPlace.address = buildPlaceAddress(cleanPlace, { includeHouseNo: true });
        cleanPlace.publicAddress = buildPlaceAddress(cleanPlace, { includeHouseNo: false });

        const activeIndex = type === 'meetup' ? formData.activeMeetupIndex : formData.activePickupIndex;

        if (activeIndex !== null) {
          updatedPlaces[activeIndex] = { ...cleanPlace };
        } else {
          updatedPlaces.push({ ...cleanPlace });
        }

      await updateShippingSettings(user.uid, { 
          shippingMethods: formData.shippingMethods, 
          pickupDetails: { 
            ...shippingSettings?.pickupDetails, 
            [type]: { 
              ...shippingSettings?.pickupDetails?.[type],
              places: updatedPlaces
            } 
          } 
        });
      }
      onClose();
    } catch (err) { console.error(err); alert("Failed to update."); }
  };

  const handleToggleMethod = (m, subKey = null) => {
    setFormData(p => {
      const currentMethodValue = p.shippingMethods[m];
      const methodObj = typeof currentMethodValue === 'object' ? currentMethodValue : { active: !!currentMethodValue };

      if (subKey) {
        // Lahat ng suboptions ay naka-store na sa .suboptions[subKey] — unified format
        const suboptions = methodObj.suboptions || {};
        const subVal = suboptions[subKey];
        const isSubActive = subVal === undefined ? true
          : typeof subVal === 'object' && subVal !== null ? subVal.active !== false
          : subVal !== false;
        return {
          ...p,
          shippingMethods: {
            ...p.shippingMethods,
            [m]: {
              ...methodObj,
              suboptions: {
                ...suboptions,
                [subKey]: { ...(typeof subVal === 'object' ? subVal : {}), active: !isSubActive }
              }
            }
          }
        };
      }

      // Method-level toggle
      const isCurrentlyActive = typeof currentMethodValue === 'object' ? currentMethodValue.active !== false : !!currentMethodValue;
      if (typeof currentMethodValue === 'object') {
        return {
          ...p,
          shippingMethods: { ...p.shippingMethods, [m]: { ...currentMethodValue, active: !isCurrentlyActive } }
        };
      }
      return {
        ...p,
        shippingMethods: { ...p.shippingMethods, [m]: !isCurrentlyActive }
      };
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
    handleAddressChange({ [field]: capitalizeWords(value) });
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
        if (zipCode?.length === 4 && (!city || !province)) {
          const res = await performGeocoding(zipCode);
          if (res) {
            handleAddressChange({ city: res.city, province: res.province });
            setLastGeocoded({ ...currentAddress, city: res.city, province: res.province });
          }
        } 
        // 3. Lookup Coordinates via Address fields
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
  const inputClass = `w-full pl-12 pr-4 py-3 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-garage-blue/50 ${isDarkMode ? 'bg-white/5 text-white' : 'bg-black/5 text-neutral-900'}`;

  return (
    <AnimatePresence>
      {isOpen && formData && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden">
          <Motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            onClick={onClose} 
          />
          <Motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            drag={canDrag ? "y" : false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className={`relative w-full md:max-w-4xl h-[92vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            {/* Drag Handle for Mobile */}
            <div className="w-full flex justify-center pt-4 pb-2 md:hidden shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10" />
            </div>

            <div className={`p-4 md:p-8 flex justify-between items-center border-b shadow-sm relative z-10 shrink-0 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}>
               <h2 className="text-lg md:text-xl font-black italic uppercase text-garage-blue ml-2 md:ml-4">Shipping Options</h2>
               <button onClick={onClose} className="p-3 rounded-full bg-black/5 hover:bg-red-500/10 transition-all mr-2 md:mr-4"><X size={20} /></button>
            </div>
            <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden custom-scrollbar">
              <div className="w-full md:w-64 p-4 md:p-8 bg-black/5 flex flex-col gap-6 flex-shrink-0">
                {categories.map(cat => (
                  <div key={cat.id} className="space-y-2">
                    <button 
                      onClick={() => {
                        setSelectedPickupCategory(cat.id);
                        if (cat.id === 'meetup' || cat.id === 'pickup-point') {
                          setFormData(prev => ({
                            ...prev,
                            houseNo: '', houseDetails: '', landmark: '', subdivision: '', barangay: '', city: '', province: '', zipCode: '', 
                            lat: 14.5995, lng: 120.9842, activeMeetupIndex: null, activePickupIndex: null
                          }));
                          setLastGeocoded({});
                        }
                      }} 
                      className={`w-full p-4 rounded-2xl font-black uppercase text-[10px] text-left flex justify-between items-center ${selectedCategory === cat.id ? 'bg-garage-blue text-white' : 'opacity-60'}`}
                    >
                      {cat.label}
                      <span className="bg-white/20 px-2 py-0.5 rounded-full text-[9px]">
                        {cat.id === 'methods' ? Object.values(formData.shippingMethods).filter(Boolean).length :
                         cat.id === 'pickup-point' ? formData.pickupPlaces.length :
                         cat.id === 'meetup' ? formData.meetupPlaces.length : 0}
                      </span>
                    </button>
                    {(cat.id === 'pickup-point' || cat.id === 'meetup') && selectedCategory === cat.id && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        {(cat.id === 'pickup-point' ? formData.pickupPlaces : formData.meetupPlaces).map((place, idx) => {
                          const isActiveIndex = cat.id === 'pickup-point' ? formData.activePickupIndex === idx : formData.activeMeetupIndex === idx;
                          return (
                            <div key={idx} className="group relative">
                              <button 
                                onClick={() => setFormData(prev => ({
                                  ...prev, ...place, 
                                  meetupPlaces: prev.meetupPlaces, pickupPlaces: prev.pickupPlaces,
                                  [cat.id === 'pickup-point' ? 'activePickupIndex' : 'activeMeetupIndex']: idx 
                                }))}
                                className={`w-full px-4 py-3 rounded-xl text-[9px] font-bold uppercase text-left truncate transition-all ${isActiveIndex ? 'bg-garage-blue text-white shadow-lg' : 'bg-black/5 opacity-70 hover:opacity-100'} ${place.isActive === false ? 'opacity-30 grayscale' : ''}`}
                              >
                                {place.landmark || `${cat.label} ${idx + 1}`}
                              </button>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleTogglePlaceAvailability(cat.id, idx); }}
                                  className={`w-8 h-4 rounded-full transition-all flex items-center p-0.5 ${place.isActive !== false ? 'bg-emerald-500' : 'bg-neutral-400'}`}
                                >
                                  <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${place.isActive !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div 
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 md:overflow-y-auto p-4 md:p-8 custom-scrollbar"
              >
                {selectedCategory === 'methods' ? (
                  <ShippingOptions 
                    shippingMethods={formData.shippingMethods}
                    handleToggleMethod={handleToggleMethod}
                    handleSave={handleSave}
                    setShippingMethods={(newMethods) => setFormData(p => ({ ...p, shippingMethods: newMethods }))}
                  />
                ) : (
                    <div className="space-y-4 max-w-lg mx-auto text-left">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative text-left"><Sparkles className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Landmark" value={formData.landmark} onChange={(e) => handleAddressChange({ landmark: e.target.value })} onBlur={(e) => handleBlur('landmark', e.target.value)} className={inputClass} /></div>
                        <div className="relative text-left"><Hash className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Zip Code" value={formData.zipCode} onChange={(e) => handleAddressChange({ zipCode: e.target.value })} className={inputClass} /></div>
                      </div>
                      {selectedCategory !== 'meetup' && (
                        <div className="relative text-left"><Home className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="House No." value={formData.houseNo} onChange={(e) => handleAddressChange({ houseNo: e.target.value })} onBlur={(e) => handleBlur('houseNo', e.target.value)} className={inputClass} /></div>
                      )}
                      <div className="relative text-left"><Building2 className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder={selectedCategory === 'meetup' ? "Street (Optional)" : "Street"} value={formData.houseDetails} onChange={(e) => handleAddressChange({ houseDetails: e.target.value })} onBlur={(e) => handleBlur('houseDetails', e.target.value)} className={inputClass} /></div>
                      <div className="relative text-left"><Map className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Subdivision (Optional)" value={formData.subdivision} onChange={(e) => handleAddressChange({ subdivision: e.target.value })} onBlur={(e) => handleBlur('subdivision', e.target.value)} className={inputClass} /></div>
                      <div className="relative text-left"><MapPin className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Barangay" value={formData.barangay} onChange={(e) => handleAddressChange({ barangay: e.target.value })} onBlur={(e) => handleBlur('barangay', e.target.value)} className={inputClass} /></div>
                      <div className="relative text-left"><Building2 className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="City" value={formData.city} onChange={(e) => handleAddressChange({ city: e.target.value })} onBlur={(e) => handleBlur('city', e.target.value)} className={inputClass} /></div>
                      <div className="relative text-left"><Map className="absolute left-4 top-3.5 text-garage-blue" size={18} /><input placeholder="Province" value={formData.province} onChange={(e) => handleAddressChange({ province: e.target.value })} onBlur={(e) => handleBlur('province', e.target.value)} className={inputClass} /></div>
                      
                      <div className="w-full h-40 rounded-2xl overflow-hidden mt-4">
                        <MapContainer center={mapCenter} zoom={16} minZoom={12} maxZoom={18} style={{ height: '100%', width: '100%' }} dragging={true} scrollWheelZoom={true} zoomControl={true}>
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <Marker 
                            position={mapCenter} draggable={true}
                            eventHandlers={{
                              dragend: async (e) => {
                                const marker = e.target;
                                const position = marker.getLatLng();
                                setFormData(prev => ({ ...prev, lat: position.lat, lng: position.lng }));
                                const res = await performReverseGeocoding(position.lat, position.lng);
                                if (res) {
                                  handleAddressChange({ barangay: res.barangay, city: res.city, province: res.province, zipCode: res.zipCode });
                                }
                              },
                            }}
                          />
                          <ChangeView center={mapCenter} />
                          <MapClickHandler setFormData={setFormData} />
                        </MapContainer>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button onClick={handleSave} className="flex-1 py-4 bg-garage-blue text-white rounded-2xl font-black uppercase text-xs">Save {selectedCategory === 'meetup' ? 'Meetup Place' : 'Pickup Point'}</button>
                        {(selectedCategory === 'pickup-point' ? formData.activePickupIndex !== null : formData.activeMeetupIndex !== null) && (
                          <button onClick={() => handleDeletePlace(selectedCategory, selectedCategory === 'pickup-point' ? formData.activePickupIndex : formData.activeMeetupIndex)} className="px-6 py-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl font-black uppercase text-xs transition-all">Delete</button>
                        )}
                      </div>
                    </div>
                )}
              </div>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
