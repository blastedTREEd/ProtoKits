import React from 'react';

const FIELDS = [
  { id: 1, label: 'Name' },
  { id: 2, label: 'Mobile No.' },
  { id: 4, label: 'Landmark' },
  { id: 5, label: 'Zip Code' },
  { id: 6, label: 'House No.' },
  { id: 7, label: 'Street' },
  { id: 8, label: 'Subdivision' },
  { id: 9, label: 'Barangay' },
  { id: 10, label: 'City' },
  { id: 11, label: 'Province' },
  { id: 12, label: 'Dropoff Pin' },
  { id: 13, label: 'Courier Branch' },
  { id: 14, label: 'Pickup Pin' },
  { id: 15, label: 'Meetup Location' },
];

export default function ShippingFieldsConfig({ 
  requiredFields = [], 
  onChangeFields,
  hiddenFieldIds = [],
  allowedFieldIds = null,
  lockedFieldIds = []
}) {
  const handleToggleField = (id) => {
    let nextFields;
    if (requiredFields.includes(id)) {
      nextFields = requiredFields.filter(f => f !== id);
    } else {
      nextFields = [...requiredFields, id].sort((a, b) => a - b);
    }
    onChangeFields(nextFields);
  };

  return (
    <div className="mt-3 space-y-3 border-t-2 border-black/10 pt-3 text-left dark:border-white/10 animate-in fade-in duration-300">
      <h6 className="text-[13px] font-black uppercase tracking-widest opacity-40">Required Fields Configuration</h6>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {FIELDS.filter(f => (
          !hiddenFieldIds.includes(f.id)
          && (!allowedFieldIds || allowedFieldIds.includes(f.id))
        )).map(f => {
          const isLocked = lockedFieldIds.includes(f.id);
          const isChecked = isLocked || requiredFields.includes(f.id);
          return (
            <label 
              key={f.id} 
              className={`flex items-center gap-2 p-2 rounded-xl border text-[13px] font-black uppercase ${isLocked ? 'cursor-default' : 'cursor-pointer'} select-none transition-all ${
                isChecked 
                  ? 'bg-blue-600/10 text-blue-600 border-blue-600/30' 
                  : 'text-neutral-400 border-transparent hover:bg-black/5 hover:border-black/5 dark:hover:bg-white/5 dark:hover:border-white/5'
              }`}
            >
              <input 
                type="checkbox"
                checked={isChecked}
                disabled={isLocked}
                onChange={() => !isLocked && handleToggleField(f.id)}
                className="hidden"
              />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-neutral-400 bg-transparent'
              }`}>
                {isChecked && (
                  <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 20 20">
                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
                  </svg>
                )}
              </div>
              <span>{f.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
