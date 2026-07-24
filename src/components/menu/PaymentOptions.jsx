import React, { useState } from 'react';
import { CreditCard, Wallet, Plus, Upload, X, BadgeDollarSign, Trash2 } from 'lucide-react';

export default function PaymentOptions({
  paymentSettings,
  handleToggleSetting,
  handleSave,
  updatePaymentData,
  deleteMethod
}) {
  const [newMethod, setNewMethod] = useState('');

  const basePlans = ['full', 'installment'];
  // 'cash' is always present (default, read-only). 'gcash' is only shown if it exists in settings.
  const methodOptions = Array.from(new Set([
    'cash',
    ...Object.keys(paymentSettings?.methods || {}).filter(key => {
      const normalizedKey = key.toLowerCase();
      return !normalizedKey.endsWith('qr') && 
             !normalizedKey.endsWith('fee') && 
             !normalizedKey.endsWith('transferdiscount');
    })
  ]));

  const categories = [
    { id: 'plans', label: 'Payment Plans', icon: CreditCard, options: basePlans },
    { id: 'methods', label: 'Payment Methods', icon: Wallet, options: methodOptions }
  ];

  const handleFileUpload = (e, method) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        updatePaymentData('methods', `${method}Qr`, base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const updateFeeField = (field, value) => {
    const nextValue = value.replace(/\D/g, '');
    updatePaymentData(null, field, nextValue === '' ? '' : Number(nextValue));
  };

  const handleFeeFocus = (field) => {
    if (Number(paymentSettings?.[field] || 0) === 0) updatePaymentData(null, field, '');
  };

  const handleFeeBlur = (field) => {
    if (paymentSettings?.[field] === '') updatePaymentData(null, field, 0);
  };

  const renderFeeInput = (field, title, description) => (
    <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 space-y-2">
      <div className="flex flex-col text-left">
        <span className="text-xs font-black uppercase italic text-garage-blue">{title}</span>
        <span className="text-[8px] font-bold opacity-40 uppercase">{description}</span>
      </div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black opacity-40">₱</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={paymentSettings?.[field] ?? 0}
          onFocus={() => handleFeeFocus(field)}
          onChange={(e) => updateFeeField(field, e.target.value)}
          onBlur={() => handleFeeBlur(field)}
          className="w-full pl-8 pr-4 py-3 bg-white/70 dark:bg-black/20 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-garage-blue/30"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <BadgeDollarSign size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Checkout Settings</h3>
        </div>
        <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 flex justify-between items-center">
          <div className="flex flex-col text-left">
            <span className="text-xs font-black uppercase italic text-garage-blue">Maintenance Mode</span>
            <span className="text-[8px] font-bold opacity-40 uppercase">Put the garage/checkout under maintenance</span>
          </div>
          <button
            onClick={() => updatePaymentData(null, 'maintenanceMode', !paymentSettings?.maintenanceMode)}
            className={`w-14 h-7 rounded-full transition-all duration-300 flex items-center p-1 ${paymentSettings?.maintenanceMode ? 'bg-garage-blue shadow-lg shadow-blue-500/20' : 'bg-neutral-300 dark:bg-white/10'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${paymentSettings?.maintenanceMode ? 'translate-x-7' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <BadgeDollarSign size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Service Charge</h3>
        </div>
        {renderFeeInput('handlingFee', 'Handling fee per item', 'Added to public product prices')}
        {renderFeeInput('installmentFee', 'Installment fee per item', 'Added to public product prices and discounted on full payment')}
        {renderFeeInput('cashInFee', 'Cash In Fee', 'Added to total checkout for Cash payment method')}
        {renderFeeInput('transferFee', 'QR Payment Fee', 'Added to total checkout for QR payment methods')}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <BadgeDollarSign size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Bundle Settings</h3>
        </div>
        <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 space-y-2">
          <div className="flex flex-col text-left">
            <span className="text-xs font-black uppercase italic text-garage-blue">Exclusive Discount %</span>
            <span className="text-[8px] font-bold opacity-40 uppercase">Percentage of bundle discount applied to exclusive kits</span>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={paymentSettings?.exclusiveDiscountPercent ?? 100}
              onFocus={() => handleFeeFocus('exclusiveDiscountPercent')}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                const num = val === '' ? '' : Math.min(100, Number(val));
                updatePaymentData(null, 'exclusiveDiscountPercent', num);
              }}
              onBlur={() => handleFeeBlur('exclusiveDiscountPercent')}
              className="w-full pl-4 pr-10 py-3 bg-white/70 dark:bg-black/20 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-garage-blue/30"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black opacity-40">%</span>
          </div>
        </div>
      </div>

      {categories.map(cat => (
        <div key={cat.id} className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <cat.icon size={16} className="text-garage-blue opacity-60" />
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">{cat.label}</h3>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {cat.options.map(opt => {
              const isActive = paymentSettings?.[cat.id]?.[opt] !== false;
              const hasTransferDiscount = paymentSettings?.[cat.id]?.[`${opt}TransferDiscount`] === true;
              
              return (
                <div key={opt} className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent overflow-hidden">
                  <div className="flex justify-between items-center p-4">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-black uppercase italic text-garage-blue">{opt}</span>
                      <span className="text-[8px] font-bold opacity-40 uppercase">
                        {isActive ? (hasTransferDiscount ? 'Discount Enabled' : 'Enabled') : 'Disabled'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                       {/* Transfer Fee Discount Button - Only show if method is active */}
                       {cat.id === 'methods' && isActive && (
                         <button
                           onClick={() => handleToggleSetting('methods', `${opt}TransferDiscount`)}
                           className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border ${
                             hasTransferDiscount 
                               ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/5' 
                               : 'bg-black/5 dark:bg-white/5 text-neutral-500 border-transparent opacity-40 hover:opacity-100'
                           }`}
                         >
                           {hasTransferDiscount ? 'Discount On' : 'No Discount'}
                         </button>
                       )}

                       {/* Delete Button — only 'cash' is read-only (default); all others including GCash can be deleted */}
                       {cat.id === 'methods' && opt !== 'cash' && (
                         <button
                           onClick={() => deleteMethod(opt)}
                           className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-all"
                           title={`Delete ${opt}`}
                         >
                           <Trash2 size={13} />
                         </button>
                       )}

                       {/* Main Activation Toggle (Blue) */}
                       <button
                         onClick={() => handleToggleSetting(cat.id, opt)}
                         className={`w-14 h-7 rounded-full transition-all duration-300 flex items-center p-1 ${isActive ? 'bg-garage-blue shadow-lg shadow-blue-500/20' : 'bg-neutral-300 dark:bg-white/10'}`}
                       >
                         <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-7' : 'translate-x-0'}`} />
                       </button>
                    </div>
                  </div>

                  {cat.id === 'methods' && isActive && opt !== 'cash' && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
                      {paymentSettings?.methods?.[`${opt}Qr`] ? (
                        <div className="relative w-full h-32 rounded-xl overflow-hidden border border-white/10 bg-white">
                          <img src={paymentSettings.methods[`${opt}Qr`]} alt={`${opt} QR`} className="w-full h-full object-contain" />
                          <button
                            onClick={() => updatePaymentData('methods', `${opt}Qr`, null)}
                            className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-garage-blue/50 transition-colors bg-white/5">
                          <Upload size={20} className="opacity-40" />
                          <span className="text-[9px] font-bold mt-2 opacity-50 uppercase">Upload {opt} QR</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, opt)} />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <Plus size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Add Payment Method</h3>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-xl text-xs font-bold"
            placeholder="e.g. GCash, Maya, UnionBank"
            value={newMethod}
            onChange={(e) => setNewMethod(e.target.value)}
          />
          <button
            onClick={() => {
              const cleanMethod = newMethod.trim();
              if (cleanMethod) {
                updatePaymentData('methods', cleanMethod, true);
                setNewMethod('');
              }
            }}
            className="p-3 bg-garage-blue text-white rounded-xl"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full h-14  py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest transition-all shadow-xl shadow-emerald-500/10 active:scale-95"
      >
        Save Payment Settings
      </button>
    </div>
  );
}
