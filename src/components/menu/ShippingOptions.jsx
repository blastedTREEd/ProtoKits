import React, { useEffect, useState } from 'react';
import { Settings, ChevronDown, ChevronUp, Plus, Trash2, Check } from 'lucide-react';
import ShippingFieldsConfig from './ShippingFieldsConfig';

const DEFAULT_METHOD_REQUIRED_FIELDS = {
  'Self-Pickup': [1, 14],
  'Seller Meetup': [1, 2, 15]
};

const BRANCH_DROPOFF_REQUIRED_FIELDS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 13];

export default function ShippingOptions({ 
  shippingMethods, 
  handleToggleMethod, 
  handleSave,
  setShippingMethods, // Direkta mula sa FulfillmentModal para sa mas simpleng state updates
  showSave = true,
  hasChanges = false
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
      return methodObj.handlingDiscount === true;
    }
    // Una i-check ang .suboptions[subKey].handlingDiscount
    const subConfig = methodObj.suboptions?.[subKey];
    if (subConfig?.handlingDiscount !== undefined) return subConfig.handlingDiscount;
    return false;
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
        handlingDiscount: false,
        suboptions: {
          'standard-delivery': {
            active: true,
            label: 'Standard Delivery',
            requiredFields: [1, 2, 5, 6, 7, 9, 10, 11, 12],
            courierName: '',
            handlingDiscount: false,
            isSelfBooking: false,
            isPickupRequired: false
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
            handlingDiscount: false,
            isSelfBooking: false,    // Customer ang mag-bubook ng sarili nilang courier
            isPickupRequired: false // Kailangan mag-select ng pickup point
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

  // Keep the two built-in methods locked to their supported checkout fields.
  useEffect(() => {
    if (!shippingMethods || !setShippingMethods) return;

    let hasChanges = false;
    const nextMethods = { ...shippingMethods };

    Object.entries(DEFAULT_METHOD_REQUIRED_FIELDS).forEach(([method, requiredFields]) => {
      if (!Object.prototype.hasOwnProperty.call(shippingMethods, method)) return;

      const currentMethod = shippingMethods[method];
      const methodConfig = typeof currentMethod === 'object' && currentMethod !== null
        ? currentMethod
        : { active: !!currentMethod };
      const currentFields = Array.isArray(methodConfig.requiredFields) ? methodConfig.requiredFields : [];
      const isDifferent = currentFields.length !== requiredFields.length
        || requiredFields.some((fieldId, index) => currentFields[index] !== fieldId);

      if (isDifferent) {
        nextMethods[method] = { ...methodConfig, requiredFields: [...requiredFields] };
        hasChanges = true;
      }
    });

    // Couriers do not use meetup locations. Remove that field from both
    // method-level and suboption configurations, including older saved data.
    Object.entries(shippingMethods).forEach(([method, currentMethod]) => {
      if (method === 'Free Shipping' || isDefaultMethod(method)) return;

      const methodConfig = typeof currentMethod === 'object' && currentMethod !== null
        ? currentMethod
        : { active: !!currentMethod };
      let methodChanged = false;
      const nextConfig = { ...methodConfig };

      if (Array.isArray(methodConfig.requiredFields)) {
        const branchDropoffEnabled = methodConfig.requiredFields.includes(13);
      const nextRequiredFields = branchDropoffEnabled
        ? BRANCH_DROPOFF_REQUIRED_FIELDS
          : methodConfig.requiredFields.filter(fieldId => fieldId !== 4 && fieldId !== 15);
        if (nextRequiredFields.length !== methodConfig.requiredFields.length) {
          nextConfig.requiredFields = nextRequiredFields;
          methodChanged = true;
        }
      }

      if (methodConfig.suboptions && typeof methodConfig.suboptions === 'object') {
        const nextSuboptions = { ...methodConfig.suboptions };
        let suboptionsChanged = false;

        Object.entries(methodConfig.suboptions).forEach(([subKey, subConfig]) => {
          if (!Array.isArray(subConfig?.requiredFields)) return;
          const branchDropoffEnabled = subConfig.requiredFields.includes(13);
          const orderPickupEnabled = !branchDropoffEnabled && subConfig.isPickupRequired === true;
          const nextRequiredFields = orderPickupEnabled
              ? [1, 2, 14]
              : branchDropoffEnabled
                ? BRANCH_DROPOFF_REQUIRED_FIELDS
                : subConfig.requiredFields.filter(fieldId => fieldId !== 4 && fieldId !== 14 && fieldId !== 15);
          const fieldsChanged = nextRequiredFields.length !== subConfig.requiredFields.length
            || nextRequiredFields.some((fieldId, index) => fieldId !== subConfig.requiredFields[index]);
          const hasBranchConflict = branchDropoffEnabled
            && (subConfig.isPickupRequired || subConfig.isSelfBooking);
          const hasOrderPickupConflict = orderPickupEnabled && subConfig.isSelfBooking;
          if (!fieldsChanged && !hasBranchConflict && !hasOrderPickupConflict) return;
          nextSuboptions[subKey] = {
            ...subConfig,
            requiredFields: nextRequiredFields,
            ...(branchDropoffEnabled
              ? { isPickupRequired: false, isSelfBooking: false }
              : orderPickupEnabled
                ? { isSelfBooking: false }
                : {})
          };
          suboptionsChanged = true;
        });

        if (suboptionsChanged) {
          nextConfig.suboptions = nextSuboptions;
          methodChanged = true;
        }
      }

      if (methodChanged) {
        nextMethods[method] = nextConfig;
        hasChanges = true;
      }
    });

    if (hasChanges) setShippingMethods(nextMethods);
  }, [shippingMethods, setShippingMethods]);

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
        className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
          isDiscounted
            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
        }`}
      >
        {isDiscounted ? 'Discount Enabled' : 'Discount Disabled'}
      </button>
    );
  };

  // Branch drop-off is represented by the courier branch required field (id 13).
  const getBranchDropoff = (methodVal, subKey = null) => {
    const methodObj = typeof methodVal === 'object' && methodVal !== null ? methodVal : {};
    const config = subKey ? methodObj.suboptions?.[subKey] : methodObj;
    return Array.isArray(config?.requiredFields) && config.requiredFields.includes(13);
  };

  const BranchDropoffToggle = ({ method, methodVal, subKey = null }) => {
    const isEnabled = getBranchDropoff(methodVal, subKey);

    const toggle = () => {
      const methodObj = typeof methodVal === 'object' && methodVal !== null ? methodVal : {};
      const config = subKey ? methodObj.suboptions?.[subKey] : methodObj;
      const requiredFields = Array.isArray(config?.requiredFields) ? config.requiredFields : [];
      const nextFields = isEnabled
        ? requiredFields.filter(fieldId => fieldId !== 13)
        : BRANCH_DROPOFF_REQUIRED_FIELDS;

      if (subKey) {
        updateSuboptionConfig(method, subKey, {
          requiredFields: nextFields,
          ...(isEnabled ? {} : { isPickupRequired: false, isSelfBooking: false })
        });
      } else {
        updateMethodConfig(method, { requiredFields: nextFields });
      }
    };

    return (
      <button
        type="button"
        onClick={toggle}
        className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
          isEnabled
            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
        }`}
      >
        {isEnabled ? 'Branch Dropoff Enabled' : 'Branch Dropoff Disabled'}
      </button>
    );
  };

  const toggleOrderPickup = (method, subKey) => {
    const methodConfig = getMethodConfig(method);
    const subConfig = methodConfig.suboptions?.[subKey] || {};
    const isEnabled = subConfig.isPickupRequired === true;
    const requiredFields = Array.isArray(subConfig.requiredFields) ? subConfig.requiredFields : [];
    const nextFields = isEnabled
      ? requiredFields.filter(fieldId => ![13, 14, 15].includes(fieldId))
      : [1, 2, 14];

    updateSuboptionConfig(method, subKey, {
      requiredFields: nextFields,
      isPickupRequired: !isEnabled,
      isSelfBooking: false
    });
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
        const defaultRequiredFields = DEFAULT_METHOD_REQUIRED_FIELDS[m] || null;

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
                <span className="text-[14px] font-black uppercase italic text-garage-blue flex items-center gap-2">
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
                <span className="text-[13px] font-bold opacity-45 uppercase">{isActive ? 'Available' : 'Disabled'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleMethod(m)}
                role="switch"
                aria-checked={isActive}
                aria-label={`Toggle ${m}`}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-garage-blue/30 ${isActive ? 'bg-garage-blue' : 'bg-neutral-300'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-300 ease-in-out ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
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
                      className="flex-grow px-3 py-2 rounded-xl text-[13px] font-bold bg-white/5 dark:bg-black/5 border border-black/5 dark:border-white/5 focus:outline-none text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={() => handleAddSuboption(m)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-black uppercase flex items-center gap-1"
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
                        className="flex items-center gap-1.5 text-[13px] font-black uppercase text-blue-600 hover:underline"
                      >
                        <Settings size={12} />
                        {isMainConfigExpanded ? 'Hide Fields Config' : 'Configure Form Fields'}
                        {isMainConfigExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
                    {/* Row 2: Discount + Cash pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <HandlingDiscountToggle method={m} methodVal={methodVal} />
                      {!isDefaultMethod(m) && (
                        <BranchDropoffToggle method={m} methodVal={methodVal} />
                      )}
                      {isDefaultMethod(m) && (
                        <button
                          type="button"
                          onClick={() => updateMethodConfig(m, { cashEnabled: !methodConfig.cashEnabled })}
                          className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
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
                        requiredFields={defaultRequiredFields || methodConfig.requiredFields || []}
                        onChangeFields={(next) => updateMethodConfig(m, { requiredFields: next })}
                        hiddenFieldIds={defaultRequiredFields
                          ? []
                          : (getBranchDropoff(methodVal) ? [4, 12, 14, 15] : [4, 13, 15])}
                        allowedFieldIds={defaultRequiredFields || (getBranchDropoff(methodVal) ? BRANCH_DROPOFF_REQUIRED_FIELDS : null)}
                        lockedFieldIds={defaultRequiredFields || (getBranchDropoff(methodVal) ? BRANCH_DROPOFF_REQUIRED_FIELDS : [])}
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
                        const isBranchDropoffEnabled = getBranchDropoff(methodVal, sub.key);
                        const isOrderPickupEnabled = subVal.isPickupRequired === true;

                        return (
                          <div key={sub.key} className="p-3.5 rounded-2xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-black uppercase tracking-wider">{sub.label}</span>
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
                                type="button"
                                onClick={() => updateSuboptionConfig(m, sub.key, { active: !isSubActive })}
                                role="switch"
                                aria-checked={isSubActive}
                                aria-label={`Toggle ${sub.label}`}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-garage-blue/30 ${isSubActive ? 'bg-garage-blue' : 'bg-neutral-300'}`}
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-300 ease-in-out ${isSubActive ? 'translate-x-5' : 'translate-x-0'}`} />
                              </button>
                            </div>

                            {isSubActive && (
                              <div className="space-y-3">
                                {/* Row 1: Configure Form Fields */}
                                <div className="flex items-center animate-in fade-in duration-200">
                                  <button
                                    onClick={() => toggleExpanded(`${m}-${sub.key}`)}
                                    className="flex items-center gap-1 text-[13px] font-black uppercase text-blue-600 hover:underline"
                                  >
                                    <Settings size={12} />
                                    {isSubExpanded ? 'Hide Fields Config' : 'Configure Form Fields'}
                                    {isSubExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                  </button>
                                </div>

                                {/* Row 2: Discount + behavior flag pills */}
                                <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
                                  <HandlingDiscountToggle method={m} methodVal={methodVal} subKey={sub.key} />
                                  {!isDefaultMethod(m) && !isOrderPickupEnabled && (
                                    <BranchDropoffToggle method={m} methodVal={methodVal} subKey={sub.key} />
                                  )}
                                  {!isDefaultMethod(m) && !isBranchDropoffEnabled && (
                                    <button
                                      type="button"
                                      onClick={() => toggleOrderPickup(m, sub.key)}
                                      className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
                                        isOrderPickupEnabled
                                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                          : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                                      }`}
                                    >
                                      Pickup Order
                                    </button>
                                  )}
                                </div>

                                {isSubExpanded && (
                                  <ShippingFieldsConfig
                                    requiredFields={isOrderPickupEnabled
                                      ? [1, 2, 14]
                                      : (isBranchDropoffEnabled ? BRANCH_DROPOFF_REQUIRED_FIELDS : (subVal.requiredFields || []))}
                                    onChangeFields={(next) => updateSuboptionConfig(m, sub.key, { requiredFields: next })}
                                    hiddenFieldIds={isOrderPickupEnabled
                                      ? []
                                      : (isBranchDropoffEnabled ? [4, 12, 14, 15] : [4, 13, 14, 15])}
                                    allowedFieldIds={isOrderPickupEnabled
                                      ? [1, 2, 14]
                                      : (isBranchDropoffEnabled ? BRANCH_DROPOFF_REQUIRED_FIELDS : null)}
                                    lockedFieldIds={isOrderPickupEnabled
                                      ? [1, 2, 14]
                                      : (isBranchDropoffEnabled ? BRANCH_DROPOFF_REQUIRED_FIELDS : [])}
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

      {/* Add New Shipping Method */}
      <div className="p-6 rounded-3xl border-2 border-dashed border-garage-blue/20 bg-black/5 dark:bg-white/5 space-y-4 text-left">
        <h4 className="text-[14px] font-black uppercase italic text-garage-blue">Add New Shipping Method</h4>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. J&T Express, Fedex"
            value={newMethodName}
            onChange={(e) => setNewMethodName(e.target.value)}
            className="flex-grow px-4 py-3.5 rounded-2xl text-[13px] font-bold bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/5 focus:outline-none focus:ring-2 focus:ring-garage-blue/50 text-neutral-900 dark:text-white placeholder:text-neutral-400"
          />
          <button
            onClick={handleAddCustomMethod}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[13px] font-black uppercase tracking-wider transition-all"
          >
            Add New
          </button>
        </div>
      </div>

      {showSave && (
        <div className="sticky bottom-0 pt-4 pb-1">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black uppercase text-[13px] tracking-wider shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            <Check size={16} strokeWidth={3} /> Save Shipping Settings
          </button>
        </div>
      )}
    </div>
  );
}
