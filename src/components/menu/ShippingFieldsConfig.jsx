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
  { id: 12, label: 'Map Pin' },
  { id: 13, label: 'Courier Branch' },
  { id: 14, label: 'Pickup Point' },
  { id: 15, label: 'Meetup Location' },
];

export default function ShippingFieldsConfig({ 
  requiredFields = [], 
  onChangeFields
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
    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl space-y-4 text-left border border-black/5 dark:border-white/5 animate-in fade-in duration-300">
      <h6 className="text-[10px] font-black uppercase tracking-widest opacity-40">Required Fields Configuration</h6>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {FIELDS.map(f => {
          const isChecked = requiredFields.includes(f.id);
          return (
            <label 
              key={f.id} 
              className={`flex items-center gap-2 p-2 rounded-xl border text-[9px] font-black uppercase cursor-pointer select-none transition-all ${
                isChecked 
                  ? 'bg-blue-600/10 text-blue-600 border-blue-600/30' 
                  : 'bg-black/5 text-neutral-400 border-transparent hover:opacity-80'
              }`}
            >
              <input 
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggleField(f.id)}
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
