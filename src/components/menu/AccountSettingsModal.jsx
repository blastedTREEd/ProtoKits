import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { 
  X, User, Building2, Map, MapPin, Hash, Phone, Sparkles, Home, Loader2, ContactRound
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import { auth, fbProvider, googleProvider } from '../../firebase/firebase';
import { signInWithPopup } from 'firebase/auth';
import L from 'leaflet';

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

const LBC_BRANCH_PREFIX = 'LBC Express - ';

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
      map.setView(center, 16);
    }
  }, [center, map]);
  return null;
}

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { isDarkMode } = useTheme();
  const { user, updateUserProfile, garageInfo, isAdmin, setToastMessage } = useStore();
  const isSyncing = useStore(state => state.isSyncing);
  const isLoggingIn = isSyncing;
  const [authError, setAuthError] = useState(null);
  const scrollRef = useRef(null);
  const [canDrag, setCanDrag] = useState(true);
  const [showFacebook, setShowFacebook] = useState(false);
  const holdTimerRef = useRef(null);
  const timeoutTimerRef = useRef(null);

  const initialFormData = useMemo(() => {
    const details = user?.userDetails || {};
    const primary = user?.deliveryDetails?.[0] || {};
    return {
      receiverName: details.receiverName || user?.displayName || "",
      email: details.email || user?.email || "",
      phoneNumber: details.mobileNo || "",
      landmark: primary.landmark || "",
      houseNo: primary.houseNo || "",
      houseDetails: primary.houseDetails || "",
      subdivision: primary.subdivision || "",
      barangay: primary.barangay || "",
      city: primary.city || "",
      province: primary.province || "",
      zipCode: primary.zipCode || "",
      lbcBranch: primary.lbcBranch || "",
      lat: primary.lat || 14.5995,
      lng: primary.lng || 120.9842,
    };
  }, [user]);

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    console.log("AccountSettingsModal isOpen changed:", isOpen);
    if (!isOpen) {
      console.log("Resetting state...");
      setShowFacebook(false); // Reset to Google
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    // ... rest of the existing useEffect logic if needed
    const handleWindowScroll = () => {
      // Dismiss if user scrolls and NOT in syncing state
      if (isOpen && !isSyncing) {
        onClose();
      }
    };

    if (isOpen && !isSyncing) {
      window.addEventListener('scroll', handleWindowScroll, { passive: true });
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, [isOpen, isSyncing, onClose]);

  useEffect(() => {
    setFormData(initialFormData);
  }, [initialFormData]);

  // Sync completion logic
  useEffect(() => {
    if (isSyncing && user) {
      // Data detected, small delay to ensure store is ready
      const timer = setTimeout(() => {
        useStore.setState({ isSyncing: false });
        setToastMessage("Login Success!");
        onClose();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user, isSyncing, setToastMessage, onClose]);

  const capitalizeWords = (str) => {
    if (!str) return "";
    const romanRegex = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/i;
    return str.split(' ').map(word => {
      if (romanRegex.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  const performGeocoding = useCallback(async (query) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}, Philippines&format=json&addressdetails=1&limit=1`);
      const data = await res.json();
      if (data?.length > 0) {
        const addr = data[0].address;
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), city: addr.city || addr.town || "", province: addr.state || "", zipCode: addr.postcode || "" };
      }
    } catch (err) { console.error("Geocoding failed", err); }
    return null;
  }, []);

  const ensureStreetSuffix = (str) => {
    if (!str) return "";
    const hasSuffix = /\b(St\.?|Street|Ave\.?|Avenue|Rd\.?|Road|Blvd\.?|Boulevard|Lane|Ln\.?|Dr\.?|Drive|Ct\.?|Court)\b/i.test(str);
    return hasSuffix ? str : `${str} St.`;
  };

  const normalizeLbcBranchInput = (value) => {
    if (!value) return LBC_BRANCH_PREFIX;
    if (value.startsWith(LBC_BRANCH_PREFIX)) return value;
    return `${LBC_BRANCH_PREFIX}${value.replace(/^LBC Express\s*-\s*/i, '')}`;
  };

  const getPersistedLbcBranch = (value) => {
    if (!value) return "";
    const normalized = normalizeLbcBranchInput(value).trim();
    const suffix = normalized.startsWith(LBC_BRANCH_PREFIX)
      ? normalized.slice(LBC_BRANCH_PREFIX.length).trim()
      : normalized.trim();
    return suffix ? `${LBC_BRANCH_PREFIX}${suffix}` : "";
  };

  const handleLbcBranchFocus = () => {
    setFormData(prev => ({
      ...prev,
      lbcBranch: prev.lbcBranch ? normalizeLbcBranchInput(prev.lbcBranch) : LBC_BRANCH_PREFIX
    }));
  };

  const handleLbcBranchChange = (value) => {
    const branchSuffix = value.startsWith(LBC_BRANCH_PREFIX)
      ? value.slice(LBC_BRANCH_PREFIX.length)
      : value.replace(/^LBC Express\s*-\s*/i, '');
    const normalizedSuffix = capitalizeWords(branchSuffix);

    setFormData(prev => ({
      ...prev,
      lbcBranch: normalizedSuffix.trim() ? `${LBC_BRANCH_PREFIX}${normalizedSuffix}` : ''
    }));
  };

  const handleLbcBranchBlur = () => {
    setFormData(prev => ({
      ...prev,
      lbcBranch: getPersistedLbcBranch(prev.lbcBranch)
    }));
  };

  const handleBlur = (field, value) => {
    let formattedValue = capitalizeWords(value);
    if (field === 'houseDetails') {
      formattedValue = ensureStreetSuffix(formattedValue);
    }
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
  };

  const [lastGeocoded, setLastGeocoded] = useState({});
  const { zipCode, barangay, city, province, lat, lng } = formData;

  useEffect(() => {
    if (!isOpen) return;

    const handler = setTimeout(async () => {
      const currentAddress = { zipCode, barangay, city, province };

      if (JSON.stringify(currentAddress) === JSON.stringify(lastGeocoded)) return;

      const hasCoordinates = lat && lng && lat !== 14.5995 && lng !== 120.9842;
      
      if (zipCode?.length === 4 && (!city || !province)) {
        const res = await performGeocoding(zipCode);
        if (res) {
          setFormData(prev => ({ ...prev, city: res.city, province: res.province }));
          setLastGeocoded({ ...currentAddress, city: res.city, province: res.province });
        }
      } else if (!hasCoordinates && barangay?.length > 2 && (city?.length > 2 || zipCode?.length === 4)) {
        const query = zipCode?.length === 4 ? `${barangay}, ${zipCode}` : `${barangay}, ${city}, ${province}`;
        const res = await performGeocoding(query);
        if (res) {
          setFormData(prev => ({ ...prev, lat: res.lat, lng: res.lng }));
          setLastGeocoded({ ...currentAddress, lat: res.lat, lng: res.lng });
        }
      }
    }, 1200);
    return () => clearTimeout(handler);
  }, [zipCode, barangay, city, province, lat, lng, isOpen, performGeocoding, lastGeocoded]);

  const handleLogin = async () => {
    try { 
      setAuthError(null); 
      useStore.setState({ isSyncing: true });
      await signInWithPopup(auth, fbProvider); 
    } catch (err) { 
      setAuthError(err.message); 
      useStore.setState({ isSyncing: false });
    }
  };

  const handleGoogleLogin = async () => {
    try { 
      setAuthError(null); 
      useStore.setState({ isSyncing: true });
      await signInWithPopup(auth, googleProvider); 
    } catch (err) { 
      setAuthError(err.message); 
      useStore.setState({ isSyncing: false });
    }
  };

  const handleSave = async () => {
    try {
      const existingPrimary = user?.deliveryDetails?.[0] || {};
      await updateUserProfile(user.uid, { 
        userDetails: { 
          ...user.userDetails, 
          email: formData.email, 
          mobileNo: formData.phoneNumber, 
          receiverName: formData.receiverName,
          welcomeSeen: true
        }, 
        deliveryDetails: [{ ...existingPrimary, ...formData, type: 'delivery', isPrimary: true }] 
      });
      setToastMessage("Profile Updated!");
      onClose();
    } catch (err) { console.error(err); alert("Failed to update profile."); }
  };

  const handleScroll = (e) => {
    setCanDrag(e.target.scrollTop <= 0);
  };

  const mapCenter = [formData.lat, formData.lng];
  const inputClass = `w-full pl-12 pr-4 py-3 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/50 ${isDarkMode ? 'bg-white/5 text-white' : 'bg-black/5 text-neutral-900'}`;

  return (
    <AnimatePresence>
      {isOpen && (
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
            className={`relative w-full md:max-w-2xl h-[92vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}
          >
            {/* Drag Handle for Mobile */}
            <div className="w-full flex justify-center pt-4 pb-2 md:hidden shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-black/10 dark:bg-white/10" />
            </div>

            <div className={`p-4 md:p-8 flex justify-between items-center border-b shadow-sm relative z-10 shrink-0 ${isDarkMode ? 'border-white/5 bg-neutral-900 shadow-black/20' : 'border-black/5 bg-white shadow-black/5'}`}>
               <h2 className="text-lg md:text-xl font-black italic uppercase text-blue-600 ml-2 md:ml-4">Account Settings</h2>
               <button onClick={onClose} className="p-3 rounded-full bg-black/5 hover:bg-red-500/10 transition-all mr-2 md:mr-4"><X size={20} /></button>
            </div>
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar"
            >
              <div className="space-y-6 max-w-xl mx-auto text-left">
                {(!user || isLoggingIn) ? (
                <div className="h-full flex flex-col justify-center items-center text-center space-y-6 py-20">
                   {isAdmin && garageInfo?.logoURL && (
                        <div className="mb-4">
                            <img src={garageInfo.logoURL} alt="Admin Logo" className="w-24 h-24 rounded-full object-cover border-4 border-blue-600" />
                        </div>
                    )}

                   <div className="p-4 rounded-3xl bg-blue-600/10 text-blue-600">
                     <ContactRound size={48} />
                   </div>
                   
                   {isLoggingIn ? (
                     <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 animate-pulse">Syncing User Data...</p>
                     </div>
                   ) : (
                     <div className="flex flex-col gap-3 w-full">
                       {showFacebook ? (
                         <button 
                            onClick={handleLogin} 
                            onPointerUp={(e) => e.stopPropagation()}
                            className="px-8 py-4 rounded-2xl bg-[#1877f2] text-white font-black uppercase text-xs"
                         >
                            Login with Facebook
                         </button>
                       ) : (
                         <button 
                           onPointerDown={() => {
                             holdTimerRef.current = setTimeout(() => {
                               setShowFacebook(true);
                             }, 3000);
                           }}
                           onPointerUp={(e) => {
                             e.stopPropagation();
                             if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                             // Start 5s timeout on release if we are currently showing Facebook
                             if (showFacebook) {
                               timeoutTimerRef.current = setTimeout(() => setShowFacebook(false), 5000);
                             }
                           }}
                           onPointerLeave={() => {
                             if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                           }}
                           onClick={handleGoogleLogin} 
                           className={`px-8 py-4 rounded-2xl font-black uppercase text-xs ${showFacebook ? 'bg-[#1877f2] text-white' : 'bg-white text-neutral-900 border border-neutral-300'}`}>
                           {showFacebook ? 'Login with Facebook' : 'Login with Google'}
                         </button>
                       )}
                     </div>
                   )}

                   {authError && !isLoggingIn && (
                     <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl max-w-xs">
                        <p className="text-xs text-red-500 font-bold">{authError}</p>
                     </div>
                   )}
                </div>
                ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="relative text-left"><User className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Receiver's Name" value={formData.receiverName} onChange={(e) => setFormData(p => ({...p, receiverName: e.target.value}))} onBlur={(e) => handleBlur('receiverName', e.target.value)} className={inputClass} /></div>
                    <div className="relative text-left"><Phone className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Mobile No." value={formData.phoneNumber} onChange={(e) => setFormData(p => ({...p, phoneNumber: e.target.value}))} className={inputClass} /></div>
                  </div>

                  <div className="relative text-left">
                    <Building2 className="absolute left-4 top-3.5 text-blue-600" size={18} />
                    <input
                      placeholder="LBC Branch (Optional for COP)"
                      value={formData.lbcBranch}
                      onFocus={handleLbcBranchFocus}
                      onChange={(e) => handleLbcBranchChange(e.target.value)}
                      onBlur={handleLbcBranchBlur}
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="relative text-left"><Sparkles className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Landmark (Optional)" value={formData.landmark} onChange={(e) => setFormData(p => ({...p, landmark: e.target.value}))} onBlur={(e) => handleBlur('landmark', e.target.value)} className={inputClass} /></div>
                    <div className="relative text-left"><Hash className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Zip Code" value={formData.zipCode} onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 4); setFormData(p => ({...p, zipCode: val})); }} className={inputClass} /></div>
                  </div>

                  <div className="relative text-left"><Home className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="House No." value={formData.houseNo} onChange={(e) => setFormData(p => ({...p, houseNo: e.target.value}))} onBlur={(e) => handleBlur('houseNo', e.target.value)} className={inputClass} /></div>
                  
                  <div className="relative text-left"><Building2 className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Street" value={formData.houseDetails} onChange={(e) => setFormData(p => ({...p, houseDetails: e.target.value}))} onBlur={(e) => handleBlur('houseDetails', e.target.value)} className={inputClass} /></div>

                  <div className="relative text-left"><Map className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Subdivision (Optional)" value={formData.subdivision} onChange={(e) => setFormData(p => ({...p, subdivision: e.target.value}))} onBlur={(e) => handleBlur('subdivision', e.target.value)} className={inputClass} /></div>

                  <div className="relative text-left"><MapPin className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Barangay" value={formData.barangay} onChange={(e) => setFormData(p => ({...p, barangay: e.target.value}))} onBlur={(e) => handleBlur('barangay', e.target.value)} className={inputClass} /></div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="relative text-left"><Building2 className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="City" value={formData.city} onChange={(e) => setFormData(p => ({...p, city: e.target.value}))} onBlur={(e) => handleBlur('city', e.target.value)} className={inputClass} /></div>
                    <div className="relative text-left"><Map className="absolute left-4 top-3.5 text-blue-600" size={18} /><input placeholder="Province" value={formData.province} onChange={(e) => setFormData(p => ({...p, province: e.target.value}))} onBlur={(e) => handleBlur('province', e.target.value)} className={inputClass} /></div>
                  </div>
                  
                  <div className="w-full h-52 rounded-[2.5rem] overflow-hidden border-2 border-blue-600/10 mt-2">
                    <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={mapCenter} draggable={true} eventHandlers={{ dragend: (e) => { const pos = e.target.getLatLng(); setFormData(prev => ({ ...prev, lat: pos.lat, lng: pos.lng })); } }} />
                      <ChangeView center={mapCenter} />
                      <MapClickHandler setFormData={setFormData} />
                    </MapContainer>
                  </div>

                  <button onClick={handleSave} className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] transition-all">Save Changes</button>
                  <button 
                    onClick={onClose} 
                    className="w-full py-4 bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-neutral-200 dark:hover:bg-white/10 transition-all md:hidden"
                  >
                    Close
                  </button>
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
