import React, { useState } from 'react';
import { Settings, ChevronDown, ChevronUp, Plus, Trash2, Check } from 'lucide-react';
import ShippingFieldsConfig from './ShippingFieldsConfig';

export default function ShippingOptions({ 
  shippingMethods, 
  handleToggleMethod, 
  handleSave,
  setShippingMethods // Direkta mula sa FulfillmentModal para sa mas simpleng state updates
}) {
  const [newMethodName, setNewMethodName] = useState('');
  const [newSubOptionLabels, setNewSubOptionLabels] = useState({}); // { [method]: label }
  const [expandedConfigs, setExpandedConfigs] = useState({}); // { [methodOrSubKey]: boolean }

  const toggleExpanded = (key) => {
    setExpandedConfigs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // --- Unified Config Helpers ---
  // Lahat ng methods ay gumagamit ng iisang format, walang special-casing para sa courier names.

  const getMethodConfig = (m) => {
    const current = shippingMethods[m];
    return typeof current === 'object' && current !== null ? current : { active: !!current };
  };

  // Lahat ng suboptions ay naka-store sa .suboptions[subKey] — walang flat-key exceptions
  const getSuboptionConfig = (m, subKey) => {
    const methodObj = getMethodConfig(m);
    return methodObj.suboptions?.[subKey] || { active: true };
  };

  // I-update ang suboption config — laging nasa .suboptions[subKey]
  const updateSuboptionConfig = (m, subKey, patch) => {
    const methodObj = getMethodConfig(m);
    const suboptions = methodObj.suboptions || {};
    const subObj = suboptions[subKey] || { active: true };
    setShippingMethods({
      ...shippingMethods,
      [m]: {
        ...methodObj,
        suboptions: {
          ...suboptions,
          [subKey]: { ...subObj, ...patch }
        }
      }
    });
  };

  const updateMethodConfig = (m, patch) => {
    const methodObj = getMethodConfig(m);
    setShippingMethods({
      ...shippingMethods,
      [m]: { ...methodObj, ...patch }
    });
  };

  // Handling discount — unified read from .suboptions[subKey].handlingDiscount
  const getHandlingDiscount = (method, methodVal, subKey = null) => {
    const methodObj = typeof methodVal === 'object' && methodVal !== null ? methodVal : {};
    if (!subKey) {
      return methodObj.handlingDiscount !== undefined ? methodObj.handlingDiscount : true;
    }
    // Una i-check ang .suboptions[subKey].handlingDiscount
    const subConfig = methodObj.suboptions?.[subKey];
    if (subConfig?.handlingDiscount !== undefined) return subConfig.handlingDiscount;
    // Default: true (may discount)
    return true;
  };

  // --- CRUD Handlers ---

  const handleAddCustomMethod = () => {
    if (!newMethodName.trim()) return;
    const name = newMethodName.trim();
    if (shippingMethods[name]) {
      alert('Shipping method already exists!');
      return;
    }
    const updated = {
      ...shippingMethods,
      [name]: {
        active: true,
        requiredFields: [1, 2, 5, 6, 7, 9, 10, 11, 12], // default fields
        courierName: '',
        handlingDiscount: true,
        suboptions: {
          'standard-delivery': {
            active: true,
            label: 'Standard Delivery',
            requiredFields: [1, 2, 5, 6, 7, 9, 10, 11, 12],
            courierName: '',
            handlingDiscount: true,
            isSelfBooking: false,
            isPickupRequired: false,
            hasSchedule: false
          }
        }
      }
    };
    setShippingMethods(updated);
    setNewMethodName('');
  };

  const handleDeleteCustomMethod = (m) => {
    if (!window.confirm(`Are you sure you want to delete "${m}"?`)) return;
    const updated = { ...shippingMethods };
    delete updated[m];
    setShippingMethods(updated);
  };

  const handleAddSuboption = (m) => {
    const label = newSubOptionLabels[m] || '';
    if (!label.trim()) return;
    const methodObj = getMethodConfig(m);
    const suboptions = methodObj.suboptions || {};
    const subKey = label.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (suboptions[subKey]) {
      alert('Option already exists!');
      return;
    }

    const updated = {
      ...shippingMethods,
      [m]: {
        ...methodObj,
        suboptions: {
          ...suboptions,
          [subKey]: {
            active: true,
            label: label,
            requiredFields: [1, 2, 5, 6, 7, 9, 10, 11, 12], // default fields
            courierName: '',
            handlingDiscount: true,
            isSelfBooking: false,    // Customer ang mag-bubook ng sarili nilang courier
            isPickupRequired: false, // Kailangan mag-select ng pickup point
            hasSchedule: false       // Ipakita ang schedule picker
          }
        }
      }
    };
    setShippingMethods(updated);
    setNewSubOptionLabels(prev => ({ ...prev, [m]: '' }));
  };

  // Unified delete — lahat ng suboptions ay nasa .suboptions
  const handleDeleteSuboption = (m, subKey) => {
    if (!window.confirm('Are you sure you want to delete this option?')) return;
    const methodObj = getMethodConfig(m);
    const suboptions = { ...(methodObj.suboptions || {}) };
    delete suboptions[subKey];
    setShippingMethods({
      ...shippingMethods,
      [m]: { ...methodObj, suboptions }
    });
  };

  // Ang Seller Meetup at Self-Pickup ay default na hindi matatanggal
  const isDefaultMethod = (m) => ['Seller Meetup', 'Self-Pickup'].includes(m);

  // --- Handling Discount Toggle ---
  const HandlingDiscountToggle = ({ method, methodVal, subKey = null }) => {
    const isDiscounted = getHandlingDiscount(method, methodVal, subKey);

    const toggle = () => {
      if (subKey) {
        updateSuboptionConfig(method, subKey, { handlingDiscount: !isDiscounted });
      } else {
        updateMethodConfig(method, { handlingDiscount: !isDiscounted });
      }
    };

    return (
      <button
        type="button"
        onClick={toggle}
        className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border ${
          isDiscounted
            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
        }`}
      >
        {isDiscounted ? 'Discount Enabled' : 'Discount Disabled'}
      </button>
    );
  };


  return (
    <div className="space-y-6 text-left">
      {Object.keys(shippingMethods)
        .filter(m => m !== 'Free Shipping')
        .sort((a, b) => {
          const order = { 'Self-Pickup': 0, 'Seller Meetup': 1 };
          const aOrder = order[a] ?? 2;
          const bOrder = order[b] ?? 2;
          return aOrder - bOrder;
        })
        .map(m => {
        const methodVal = shippingMethods[m];
        const methodConfig = getMethodConfig(m);
        const isActive = methodConfig.active !== false;

        // hasSuboptions ay awtomatikong nakukuha mula sa bilang ng suboptions — walang toggle na kailangan
        const hasSuboptions = Object.keys(methodConfig.suboptions || {}).length > 0;

        // Suboptionlist — unified: laging mula sa .suboptions, sorted standard-delivery first
        const subOptionsList = Object.entries(methodConfig.suboptions || {})
          .sort(([aKey], [bKey]) => {
            if (aKey === 'standard-delivery') return -1;
            if (bKey === 'standard-delivery') return 1;
            return 0;
          })
          .map(([key, val]) => ({
            key,
            label: val.label || key
          }));

        const isMainConfigExpanded = expandedConfigs[m];

        return (
          <div key={m} className="p-5 rounded-3xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 space-y-4">
            {/* Method Header */}
            <div className="flex justify-between items-center">
              <div className="flex flex-col text-left">
                <span className="text-sm font-black uppercase italic text-garage-blue flex items-center gap-2">
                  {m}
                  {/* Ang Seller Meetup at Self-Pickup lang ang hindi matatanggal */}
                  {!isDefaultMethod(m) && (
                    <button
                      onClick={() => handleDeleteCustomMethod(m)}
                      className="text-red-500 hover:text-red-600 transition-colors p-1"
                      title="Delete Shipping Method"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
                <span className="text-[8px] font-bold opacity-45 uppercase">{isActive ? 'Available' : 'Disabled'}</span>
              </div>
              <button
                onClick={() => handleToggleMethod(m)}
                className={`w-12 h-6.5 rounded-full transition-all duration-300 flex items-center p-1 ${isActive ? 'bg-garage-blue' : 'bg-neutral-300'}`}
              >
                <div className={`w-4.5 h-4.5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-5.5' : 'translate-x-0'}`} />
              </button>
            </div>

            {isActive && (
              <div className="space-y-4 animate-in slide-in-from-top duration-300">

                {/* Add Suboption Input — always visible for non-default custom methods */}
                {!isDefaultMethod(m) && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add New Suboption (e.g. Standard, COD)"
                      value={newSubOptionLabels[m] || ''}
                      onChange={(e) => setNewSubOptionLabels(prev => ({ ...prev, [m]: e.target.value }))}
                      className="flex-grow px-3 py-2 rounded-xl text-[10px] font-bold bg-white/5 dark:bg-black/5 border border-black/5 dark:border-white/5 focus:outline-none text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={() => handleAddSuboption(m)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                )}

                {/* Case 1: No suboptions — method-level discount + form fields */}
                {!hasSuboptions && (
                  <div className="space-y-3 pl-2">
                    {/* Row 1: Configure Form Fields */}
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleExpanded(m)}
                        className="flex items-center gap-1.5 text-[8px] font-black uppercase text-blue-600 hover:underline"
                      >
                        <Settings size={12} />
                        {isMainConfigExpanded ? 'Hide Fields Config' : 'Configure Form Fields'}
                        {isMainConfigExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
                    {/* Row 2: Discount + Cash pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <HandlingDiscountToggle method={m} methodVal={methodVal} />
                      {isDefaultMethod(m) && (
                        <button
                          type="button"
                          onClick={() => updateMethodConfig(m, { cashEnabled: !methodConfig.cashEnabled })}
                          className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border ${
                            methodConfig.cashEnabled
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                          }`}
                        >
                          {methodConfig.cashEnabled ? 'Cash Enabled' : 'Cash Disabled'}
                        </button>
                      )}
                    </div>
                    {isMainConfigExpanded && (
                      <ShippingFieldsConfig
                        requiredFields={methodConfig.requiredFields || []}
                        onChangeFields={(next) => updateMethodConfig(m, { requiredFields: next })}
                      />
                    )}
                  </div>
                )}

                {/* Case 2: Has suboptions */}
                {hasSuboptions && (
                  <div className="space-y-4 pl-2">
                    {/* Suboptions List — unified: lahat mula sa .suboptions */}
                    <div className="grid grid-cols-1 gap-3">
                      {subOptionsList.map(sub => {
                        const subVal = getSuboptionConfig(m, sub.key);
                        const isSubActive = subVal.active !== false;
                        const isSubExpanded = expandedConfigs[`${m}-${sub.key}`];

                        return (
                          <div key={sub.key} className="p-3.5 rounded-2xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider">{sub.label}</span>
                                {/* Lahat ng suboptions ay matatanggal */}
                                <button
                                  onClick={() => handleDeleteSuboption(m, sub.key)}
                                  className="text-red-500 hover:text-red-600 transition-colors p-1"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              {/* Suboption active toggle — laging gumagamit ng updateSuboptionConfig */}
                              <button
                                onClick={() => updateSuboptionConfig(m, sub.key, { active: !isSubActive })}
                                className={`w-8 h-5.5 rounded-full transition-all flex items-center p-0.5 ${isSubActive ? 'bg-blue-600' : 'bg-neutral-300'}`}
                              >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${isSubActive ? 'translate-x-3' : 'translate-x-0'}`} />
                              </button>
                            </div>

                            {isSubActive && (
                              <div className="space-y-3">
                                {/* Row 1: Configure Form Fields */}
                                <div className="flex items-center animate-in fade-in duration-200">
                                  <button
                                    onClick={() => toggleExpanded(`${m}-${sub.key}`)}
                                    className="flex items-center gap-1 text-[8px] font-black uppercase text-blue-600 hover:underline"
                                  >
                                    <Settings size={12} />
                                    {isSubExpanded ? 'Hide Fields Config' : 'Configure Form Fields'}
                                    {isSubExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                  </button>
                                </div>

                                {/* Row 2: Discount + behavior flag pills */}
                                <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
                                  <HandlingDiscountToggle method={m} methodVal={methodVal} subKey={sub.key} />
                                  <button
                                    type="button"
                                    onClick={() => updateSuboptionConfig(m, sub.key, { isSelfBooking: !subVal.isSelfBooking })}
                                    className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border ${
                                      subVal.isSelfBooking
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                        : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                                    }`}
                                  >
                                    Self-Booking
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateSuboptionConfig(m, sub.key, { isPickupRequired: !subVal.isPickupRequired })}
                                    className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border ${
                                      subVal.isPickupRequired
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                        : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                                    }`}
                                  >
                                    Pickup Point
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateSuboptionConfig(m, sub.key, { hasSchedule: !subVal.hasSchedule })}
                                    className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border ${
                                      subVal.hasSchedule
                                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                        : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                                    }`}
                                  >
                                    Schedule Picker
                                  </button>
                                </div>

                                {isSubExpanded && (
                                  <ShippingFieldsConfig
                                    requiredFields={subVal.requiredFields || []}
                                    onChangeFields={(next) => updateSuboptionConfig(m, sub.key, { requiredFields: next })}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add Custom Shipping Method */}
      <div className="p-6 rounded-3xl border-2 border-dashed border-garage-blue/20 bg-black/5 dark:bg-white/5 space-y-4 text-left">
        <h4 className="text-xs font-black uppercase italic text-garage-blue">Add Custom Shipping Method</h4>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. J&T Express, Fedex"
            value={newMethodName}
            onChange={(e) => setNewMethodName(e.target.value)}
            className="flex-grow px-4 py-3.5 rounded-2xl text-xs font-bold bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/5 focus:outline-none focus:ring-2 focus:ring-garage-blue/50 text-neutral-900 dark:text-white placeholder:text-neutral-400"
          />
          <button
            onClick={handleAddCustomMethod}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
          >
            Add Method
          </button>
        </div>
      </div>

      <div className="sticky bottom-0 pt-4 pb-1">
        <button
          onClick={handleSave}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black uppercase text-xs tracking-wider shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
        >
          <Check size={16} strokeWidth={3} /> Save Shipping Settings
        </button>
      </div>
    </div>
  );
}