import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Settings, ChevronDown, ChevronUp, Plus, Trash2, Check, Pencil, X } from 'lucide-react';
import ShippingFieldsConfig from './ShippingFieldsConfig';

const DEFAULT_METHOD_REQUIRED_FIELDS = {
  'Self-Pickup': [1, 2, 14],
  'Seller Meetup': [1, 2, 15]
};

const BRANCH_DROPOFF_REQUIRED_FIELDS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 13];

export default function ShippingOptions({ 
  shippingMethods, 
  isAddingMethod = false,
  setIsAddingMethod = () => {},
  handleToggleMethod, 
  handleSave,
  setShippingMethods, // Direkta mula sa FulfillmentModal para sa mas simpleng state updates
  persistShippingMethods = null,
  onShippingMethodsChange = null,
  showSave = true,
  hasChanges = false
}) {
  const [newMethodName, setNewMethodName] = useState('');
  const [newSubOptionLabels, setNewSubOptionLabels] = useState({}); // { [method]: label }
  const [expandedConfigs, setExpandedConfigs] = useState({}); // { [methodOrSubKey]: boolean }
  const [editingSubKey, setEditingSubKey] = useState(null); // format: `${method}__${subKey}`
  const [editingSubLabel, setEditingSubLabel] = useState('');
  const justFinishedEditingRef = useRef(false);

  const startEditSubLabel = (method, subKey, currentLabel) => {
    setEditingSubKey(`${method}__${subKey}`);
    setEditingSubLabel(currentLabel || '');
  };

  const handleSaveSubLabel = (method, subKey) => {
    const trimmed = editingSubLabel.trim();
    setEditingSubKey(null);
    justFinishedEditingRef.current = true;
    setTimeout(() => {
      justFinishedEditingRef.current = false;
    }, 200);

    if (trimmed) {
      const currentVal = getSuboptionConfig(method, subKey);
      if (trimmed !== currentVal?.label) {
        updateSuboptionConfig(method, subKey, { label: trimmed }, true);
      }
    }
  };

  const handleCancelSubLabel = () => {
    setEditingSubKey(null);
    setEditingSubLabel('');
    justFinishedEditingRef.current = true;
    setTimeout(() => {
      justFinishedEditingRef.current = false;
    }, 200);
  };

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

  const commitShippingMethods = useCallback((nextMethods) => {
    if (onShippingMethodsChange) {
      return Promise.resolve(onShippingMethodsChange(nextMethods)).catch((error) => {
        console.error('Failed to persist shipping settings:', error);
        alert('Failed to update shipping settings.');
        return false;
      });
    }

    setShippingMethods(nextMethods);
    if (persistShippingMethods) {
      return Promise.resolve(persistShippingMethods(nextMethods)).catch((error) => {
        console.error('Failed to persist shipping settings:', error);
        alert('Failed to update shipping settings.');
      });
    }
    return Promise.resolve(true);
  }, [onShippingMethodsChange, persistShippingMethods, setShippingMethods]);

  // I-update ang suboption config — laging nasa .suboptions[subKey]
  const updateSuboptionConfig = (m, subKey, patch, persist = true) => {
    const methodObj = getMethodConfig(m);
    const suboptions = methodObj.suboptions || {};
    const subObj = suboptions[subKey] || { active: true };
    const nextMethods = {
      ...shippingMethods,
      [m]: {
        ...methodObj,
        suboptions: {
          ...suboptions,
          [subKey]: { ...subObj, ...patch }
        }
      }
    };
    if (persist) {
      commitShippingMethods(nextMethods).catch((error) => {
        console.error('Failed to persist shipping toggle:', error);
        alert('Failed to update shipping settings.');
      });
    }
  };

  const updateMethodConfig = (m, patch, persist = true) => {
    const methodObj = getMethodConfig(m);
    const nextMethods = {
      ...shippingMethods,
      [m]: { ...methodObj, ...patch }
    };
    if (persist) {
      commitShippingMethods(nextMethods).catch((error) => {
        console.error('Failed to persist shipping setting:', error);
        alert('Failed to update shipping settings.');
      });
    }
  };

  // Handling fee — unified read from .handlingFee / .suboptions[subKey].handlingFee.
  // Legacy handlingDiscount data is inverted only as a migration fallback.
  const getHandlingFee = (method, methodVal, subKey = null) => {
    const methodObj = typeof methodVal === 'object' && methodVal !== null ? methodVal : {};
    if (!subKey) {
      if (methodObj.handlingFee !== undefined) return methodObj.handlingFee === true;
      if (methodObj.handlingDiscount !== undefined) return methodObj.handlingDiscount !== true;
      return true;
    }
    const subConfig = methodObj.suboptions?.[subKey];
    if (subConfig?.handlingFee !== undefined) return subConfig.handlingFee === true;
    if (subConfig?.handlingDiscount !== undefined) return subConfig.handlingDiscount !== true;
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
        handlingFee: true,
        suboptions: {
          'standard-delivery': {
            active: true,
            label: 'Standard Delivery',
            requiredFields: [1, 2, 5, 6, 7, 9, 10, 11, 12],
            courierName: '',
            handlingFee: true,
            isSelfBooking: false,
            isPickupRequired: false
          }
        }
      }
    };
    commitShippingMethods(updated);
    setNewMethodName('');
    setIsAddingMethod(false);
  };

  const handleDeleteCustomMethod = (m) => {
    if (!window.confirm(`Are you sure you want to delete "${m}"?`)) return;
    const updated = { ...shippingMethods };
    delete updated[m];
    commitShippingMethods(updated);
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
            handlingFee: true,
            isSelfBooking: false,    // Customer ang mag-bubook ng sarili nilang courier
            isPickupRequired: false // Kailangan mag-select ng pickup point
          }
        }
      }
    };
    commitShippingMethods(updated);
    setNewSubOptionLabels(prev => ({ ...prev, [m]: '' }));
  };

  // Unified delete — lahat ng suboptions ay nasa .suboptions
  const handleDeleteSuboption = (m, subKey) => {
    if (!window.confirm('Are you sure you want to delete this option?')) return;
    const methodObj = getMethodConfig(m);
    const suboptions = { ...(methodObj.suboptions || {}) };
    delete suboptions[subKey];
    commitShippingMethods({
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
        const branchDropoffEnabled = methodConfig.isBranchDropoff === true || (methodConfig.isBranchDropoff === undefined && methodConfig.requiredFields.includes(13));
        const nextRequiredFields = branchDropoffEnabled
          ? methodConfig.requiredFields.filter(fieldId => fieldId !== 4 && fieldId !== 12 && fieldId !== 14 && fieldId !== 15)
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
          const branchDropoffEnabled = subConfig.isBranchDropoff === true || (subConfig.isBranchDropoff === undefined && subConfig.requiredFields.includes(13));
          const orderPickupEnabled = !branchDropoffEnabled && subConfig.isPickupRequired === true;
          const nextRequiredFields = orderPickupEnabled
              ? [1, 2, 14]
              : branchDropoffEnabled
                ? subConfig.requiredFields.filter(fieldId => fieldId !== 4 && fieldId !== 12 && fieldId !== 14 && fieldId !== 15)
                : subConfig.requiredFields.filter(fieldId => fieldId !== 4 && fieldId !== 14 && fieldId !== 15);
          const fieldsChanged = nextRequiredFields.length !== subConfig.requiredFields.length
            || nextRequiredFields.some((fieldId, index) => fieldId !== subConfig.requiredFields[index]);
          const hasBranchConflict = branchDropoffEnabled
            && (subConfig.isPickupRequired || subConfig.isSelfBooking);
          const hasOrderPickupConflict = orderPickupEnabled && subConfig.isSelfBooking;
          const needsBranchFlag = branchDropoffEnabled && subConfig.isBranchDropoff === undefined;
          if (!fieldsChanged && !hasBranchConflict && !hasOrderPickupConflict && !needsBranchFlag) return;
          nextSuboptions[subKey] = {
            ...subConfig,
            requiredFields: nextRequiredFields,
            ...(branchDropoffEnabled
              ? { isBranchDropoff: true, isPickupRequired: false, isSelfBooking: false }
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

    if (hasChanges) {
      commitShippingMethods(nextMethods).catch((error) => {
        console.error('Failed to persist default shipping fields:', error);
      });
    }
  }, [commitShippingMethods, setShippingMethods, shippingMethods]);

  // --- Handling Fee Toggle ---
  const HandlingFeeToggle = ({ method, methodVal, subKey = null }) => {
    const isFeeEnabled = getHandlingFee(method, methodVal, subKey);

    const toggle = () => {
      if (subKey) {
        updateSuboptionConfig(method, subKey, { handlingFee: !isFeeEnabled }, true);
      } else {
        updateMethodConfig(method, { handlingFee: !isFeeEnabled }, true);
      }
    };

    return (
      <button
        type="button"
        onClick={toggle}
        className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
          isFeeEnabled
            ? 'bg-garage-blue text-white border-garage-blue shadow-md shadow-blue-500/20'
            : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
        }`}
      >
        Handling Fee
      </button>
    );
  };

  // Branch drop-off is represented by the courier branch required field (id 13)
  // or explicit isBranchDropoff configuration flag.
  const getBranchDropoff = (methodVal, subKey = null) => {
    const methodObj = typeof methodVal === 'object' && methodVal !== null ? methodVal : {};
    const config = subKey ? methodObj.suboptions?.[subKey] : methodObj;
    if (config?.isBranchDropoff !== undefined) {
      return config.isBranchDropoff === true;
    }
    return Array.isArray(config?.requiredFields) && config.requiredFields.includes(13);
  };

  const BranchDropoffToggle = ({ method, methodVal, subKey = null }) => {
    const isEnabled = getBranchDropoff(methodVal, subKey);

    const toggle = () => {
      const methodObj = typeof methodVal === 'object' && methodVal !== null ? methodVal : {};
      const config = subKey ? methodObj.suboptions?.[subKey] : methodObj;
      const requiredFields = Array.isArray(config?.requiredFields) ? config.requiredFields : [];

      if (!isEnabled) {
        const nextFields = (requiredFields.includes(13)
          ? requiredFields
          : [...requiredFields, 13]
        ).filter(fieldId => fieldId !== 12 && fieldId !== 14 && fieldId !== 15).sort((a, b) => a - b);

        if (subKey) {
          updateSuboptionConfig(method, subKey, {
            isBranchDropoff: true,
            requiredFields: nextFields,
            isPickupRequired: false,
            isSelfBooking: false
          }, true);
        } else {
          updateMethodConfig(method, {
            isBranchDropoff: true,
            requiredFields: nextFields
          }, true);
        }
      } else {
        if (subKey) {
          updateSuboptionConfig(method, subKey, {
            isBranchDropoff: false
          }, true);
        } else {
          updateMethodConfig(method, {
            isBranchDropoff: false
          }, true);
        }
      }
    };

    return (
      <button
        type="button"
        onClick={toggle}
        className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
          isEnabled
            ? 'bg-garage-blue text-white border-garage-blue shadow-md shadow-blue-500/20'
            : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
        }`}
      >
        Branch Dropoff
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
    }, true);
  };


  return (
    <div className="space-y-4 text-left">
      {!isAddingMethod && (
        <>
        {Object.keys(shippingMethods)
          .filter(m => m !== 'Free Shipping')
          .sort((a, b) => {
            const order = { 'Self-Pickup': 0, 'Seller Meetup': 1 };
            const aOrder = order[a] ?? 2;
            const bOrder = order[b] ?? 2;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
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
          .map(([key, val]) => ({
            key,
            label: val.label || key
          }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

        const isMainConfigExpanded = expandedConfigs[m];

          return (
          <div
            key={m}
            role="switch"
            tabIndex={0}
            aria-checked={isActive}
            onClick={(event) => {
              const interactiveTarget = event.target.closest('button, a, input, textarea, select, label, [role="button"], [role="switch"]');
              if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
              handleToggleMethod(m);
            }}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                event.preventDefault();
                handleToggleMethod(m);
              }
            }}
            className={`relative cursor-pointer rounded-3xl border p-5 space-y-4 transition-all ${isActive
              ? 'border-black/5 bg-black/5 shadow-md shadow-blue-500/10 dark:border-white/5 dark:bg-white/5'
              : 'border-black/5 bg-black/5 dark:border-white/5 dark:bg-white/5'}`}
          >
            {/* Custom courier delete control */}
            {!isDefaultMethod(m) && (
              <button
                type="button"
                onClick={() => handleDeleteCustomMethod(m)}
                title="Delete Shipping Method"
                className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
                aria-label={`Delete ${m}`}
              >
                <Trash2 size={15} strokeWidth={2.5} />
              </button>
            )}

            {/* Method Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 pr-10">
              <div className="flex min-w-0 flex-col text-left">
                <span className="text-[14px] font-black uppercase italic text-garage-blue flex items-center gap-2">
                  {m}
                </span>
                <span className="text-[13px] font-bold opacity-45 uppercase">{isActive ? 'Available' : 'Disabled'}</span>
              </div>
              {isActive && !hasSuboptions && (
                <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2 max-lg:mt-1 max-lg:w-full max-lg:flex-none max-lg:basis-full max-lg:justify-start">
                  <HandlingFeeToggle method={m} methodVal={methodVal} />
                  {!isDefaultMethod(m) && (
                    <BranchDropoffToggle method={m} methodVal={methodVal} />
                  )}
                  {isDefaultMethod(m) && (
                    <button
                      type="button"
                      onClick={() => updateMethodConfig(m, { cashEnabled: !methodConfig.cashEnabled }, true)}
                      className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
                        methodConfig.cashEnabled
                          ? 'bg-garage-blue text-white border-garage-blue shadow-md shadow-blue-500/20'
                          : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                      }`}
                    >
                      Cash Payment
                    </button>
                  )}
                </div>
              )}
            </div>

            {isActive && (
              <div className="space-y-4 animate-in slide-in-from-top duration-300">

                {/* Add Suboption Input — always visible for non-default custom methods */}
                {!isDefaultMethod(m) && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="Add New Option (e.g. Standard, COD)"
                      value={newSubOptionLabels[m] || ''}
                      onChange={(e) => setNewSubOptionLabels(prev => ({ ...prev, [m]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-xl border border-black/5 bg-white/5 px-3 py-2 text-[13px] font-bold text-neutral-900 focus:outline-none dark:border-white/5 dark:bg-[var(--color-surface-raised)] dark:text-white"
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
                    {isMainConfigExpanded && (
                      <ShippingFieldsConfig
                        requiredFields={defaultRequiredFields || methodConfig.requiredFields || []}
                        onChangeFields={(next) => updateMethodConfig(m, {
                          requiredFields: next,
                          ...(getBranchDropoff(methodVal) ? { isBranchDropoff: true } : {})
                        }, true)}
                        hiddenFieldIds={defaultRequiredFields
                          ? []
                          : (getBranchDropoff(methodVal) ? [4, 12, 14, 15] : [4, 13, 15])}
                        allowedFieldIds={defaultRequiredFields || null}
                        lockedFieldIds={defaultRequiredFields || []}
                      />
                    )}
                    <div className="flex items-center pt-1">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(m)}
                        className="flex items-center gap-1.5 rounded-xl border border-garage-blue/30 bg-garage-blue/10 px-3 py-2 text-[13px] font-black uppercase text-garage-blue transition-all hover:bg-garage-blue hover:text-white"
                      >
                        <Settings size={12} />
                        {isMainConfigExpanded ? 'Hide Fields Config' : 'Configure Form Fields'}
                        {isMainConfigExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
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
                        const isStandardDelivery = sub.key === 'standard-delivery';
                        const isEditingThisLabel = editingSubKey === `${m}__${sub.key}`;

                        return (
                          <div
                            key={sub.key}
                            role="switch"
                            tabIndex={0}
                            aria-checked={isSubActive}
                            onClick={(event) => {
                              if (justFinishedEditingRef.current) return;
                              const interactiveTarget = event.target.closest('button, a, input, textarea, select, label, [role="button"], [role="switch"]');
                              if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
                              updateSuboptionConfig(m, sub.key, { active: !isSubActive }, true);
                            }}
                            onKeyDown={(event) => {
                              if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                                event.preventDefault();
                                updateSuboptionConfig(m, sub.key, { active: !isSubActive }, true);
                              }
                            }}
                            className={`cursor-pointer space-y-3 rounded-2xl border p-3.5 transition-all ${isSubActive
                              ? 'border-2 border-garage-blue bg-black/5 shadow-md shadow-blue-500/10 dark:bg-white/5'
                              : 'border-black/5 bg-black/5 dark:border-white/5 dark:bg-white/5'}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                {isEditingThisLabel ? (
                                  <div
                                    className="flex items-center gap-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="text"
                                      value={editingSubLabel}
                                      onChange={(e) => setEditingSubLabel(e.target.value)}
                                      onBlur={(e) => {
                                        if (e.currentTarget.parentElement?.contains(e.relatedTarget)) return;
                                        handleSaveSubLabel(m, sub.key);
                                      }}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleSaveSubLabel(m, sub.key);
                                        } else if (e.key === 'Escape') {
                                          e.preventDefault();
                                          handleCancelSubLabel();
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      placeholder="Option name"
                                      className="h-8 min-w-[120px] max-w-[200px] rounded-lg border border-garage-blue bg-white px-2.5 text-[13px] font-black uppercase tracking-wider text-neutral-900 outline-none shadow-sm focus:ring-2 focus:ring-garage-blue/40 dark:border-garage-blue dark:bg-neutral-900 dark:text-white"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSaveSubLabel(m, sub.key);
                                      }}
                                      title="Save name"
                                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
                                    >
                                      <Check size={14} strokeWidth={3} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelSubLabel();
                                      }}
                                      title="Cancel"
                                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/10 text-neutral-600 transition-all hover:bg-black/20 active:scale-95 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/20"
                                    >
                                      <X size={14} strokeWidth={2.5} />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditSubLabel(m, sub.key, sub.label);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        startEditSubLabel(m, sub.key, sub.label);
                                      }
                                    }}
                                    title="Tap to rename option"
                                    className="group/label -ml-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                                  >
                                    <span className="text-[13px] font-black uppercase tracking-wider transition-colors group-hover/label:text-garage-blue">
                                      {sub.label}
                                    </span>
                                    <Pencil size={12} className="text-neutral-400 opacity-40 transition-all group-hover/label:text-garage-blue group-hover/label:opacity-100" />
                                  </div>
                                )}
                              </div>
                              {isSubActive && (
                                <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2 max-lg:mt-1 max-lg:w-full max-lg:flex-none max-lg:basis-full max-lg:justify-start">
                                  <HandlingFeeToggle method={m} methodVal={methodVal} subKey={sub.key} />
                                  {!isDefaultMethod(m) && !isOrderPickupEnabled && (
                                    <BranchDropoffToggle method={m} methodVal={methodVal} subKey={sub.key} />
                                  )}
                                  {!isDefaultMethod(m) && !isBranchDropoffEnabled && (
                                    <button
                                      type="button"
                                      onClick={() => toggleOrderPickup(m, sub.key)}
                                      className={`px-3 py-1.5 rounded-xl text-[13px] font-black uppercase tracking-tighter transition-all border ${
                                        isOrderPickupEnabled
                                          ? 'bg-garage-blue text-white border-garage-blue shadow-md shadow-blue-500/20'
                                          : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                                      }`}
                                    >
                                      Pickup Order
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {isSubActive && (
                              <div className="space-y-3">
                                {isSubExpanded && (
                                  <ShippingFieldsConfig
                                    requiredFields={isOrderPickupEnabled
                                      ? [1, 2, 14]
                                      : (subVal.requiredFields || [])}
                                    onChangeFields={(next) => updateSuboptionConfig(m, sub.key, {
                                      requiredFields: next,
                                      ...(isBranchDropoffEnabled ? { isBranchDropoff: true } : {})
                                    }, true)}
                                    hiddenFieldIds={isOrderPickupEnabled
                                      ? []
                                      : (isBranchDropoffEnabled ? [4, 12, 14, 15] : [4, 13, 14, 15])}
                                    allowedFieldIds={isOrderPickupEnabled
                                      ? [1, 2, 14]
                                      : null}
                                    lockedFieldIds={isOrderPickupEnabled
                                      ? [1, 2, 14]
                                      : []}
                                  />
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              {isSubActive ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(`${m}-${sub.key}`)}
                                  className="flex items-center gap-1 rounded-xl border border-garage-blue/30 bg-garage-blue/10 px-3 py-2 text-[13px] font-black uppercase text-garage-blue transition-all hover:bg-garage-blue hover:text-white"
                                >
                                  <Settings size={12} />
                                  {isSubExpanded ? 'Hide Fields Config' : 'Configure Form Fields'}
                                  {isSubExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                </button>
                              ) : <span />}
                              {!isStandardDelivery && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSuboption(m, sub.key)}
                                  title={`Delete ${sub.label}`}
                                  className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
                                  aria-label={`Delete ${sub.label}`}
                                >
                                  <Trash2 size={15} strokeWidth={2.5} />
                                </button>
                              )}
                            </div>
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
        </>
      )}
      {isAddingMethod && (
      <div className="space-y-4 rounded-3xl border-2 border-dashed border-garage-blue/20 bg-black/5 p-6 text-left dark:bg-white/5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[14px] font-black uppercase italic text-garage-blue">Add New Shipping Method</h4>
          <button
            type="button"
            onClick={() => setIsAddingMethod(false)}
            className="rounded-xl border border-garage-blue/30 bg-garage-blue/10 px-3 py-2 text-[11px] font-black uppercase text-garage-blue transition-all hover:bg-garage-blue hover:text-white"
          >
            Existing Couriers
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="e.g. J&T Express, Fedex"
            value={newMethodName}
            onChange={(e) => setNewMethodName(e.target.value)}
            className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-[13px] font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-garage-blue/50 dark:border-white/5 dark:bg-neutral-800 dark:text-white placeholder:text-neutral-400"
          />
          <button
            onClick={handleAddCustomMethod}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[13px] font-black uppercase tracking-wider transition-all"
          >
            Add New
          </button>
        </div>
      </div>
      )}

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
