import React, { useState } from 'react';
import { CreditCard, Wallet, Plus, Upload, X, BadgeDollarSign, Trash2, Package, Printer } from 'lucide-react';

export default function PaymentOptions({
  paymentSettings,
  handleToggleSetting,
  handleSave,
  updatePaymentData,
  deleteMethod,
  persistPaymentSetting,
  showSave = true,
  hasChanges = false
}) {
  const [newMethod, setNewMethod] = useState('');
  const [qrDrafts, setQrDrafts] = useState({});

  const basePlans = ['full', 'installment'];
  // 'cash' is always present (default, read-only). 'gcash' is only shown if it exists in settings.
  const methodOptions = Array.from(new Set([
    'cash',
    ...Object.keys(paymentSettings?.methods || {}).filter(key => {
      const normalizedKey = key.toLowerCase();
      return !normalizedKey.endsWith('qr') && 
             !normalizedKey.endsWith('fee') && 
             !normalizedKey.endsWith('transferdiscount') &&
             !normalizedKey.endsWith('discountamount');
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
        setQrDrafts(prev => ({ ...prev, [method]: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const getQrValue = (method) => (
    Object.prototype.hasOwnProperty.call(qrDrafts, method)
      ? qrDrafts[method]
      : paymentSettings?.methods?.[`${method}Qr`] || null
  );

  const hasQrDraft = (method) => Object.prototype.hasOwnProperty.call(qrDrafts, method);

  const cancelQrChange = (method) => {
    setQrDrafts(prev => {
      const next = { ...prev };
      delete next[method];
      return next;
    });
  };

  const saveQrChange = async (method) => {
    if (!hasQrDraft(method)) return;

    const nextQr = qrDrafts[method] || null;
    updatePaymentData('methods', `${method}Qr`, nextQr);
    const persisted = persistPaymentSetting
      ? await persistPaymentSetting('methods', `${method}Qr`, nextQr)
      : true;

    if (persisted !== false) {
      cancelQrChange(method);
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
    const nextValue = paymentSettings?.[field] === ''
      ? 0
      : Math.max(0, Number(paymentSettings?.[field] || 0));
    updatePaymentData(null, field, nextValue);
    persistPaymentSetting?.(null, field, nextValue);
  };

  const renderFeeInput = (field, title, description) => (
    <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 space-y-2">
      <div className="flex flex-col text-left">
        <span className="text-[14px] font-black uppercase italic text-garage-blue">{title}</span>
        <span className="text-[13px] font-bold opacity-40 uppercase">{description}</span>
      </div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-black opacity-40">₱</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={paymentSettings?.[field] ?? 0}
          onFocus={() => handleFeeFocus(field)}
          onChange={(e) => updateFeeField(field, e.target.value)}
          onBlur={() => handleFeeBlur(field)}
          className="w-full pl-8 pr-4 py-3 bg-white/70 dark:bg-[var(--color-surface-raised)] rounded-xl text-[13px] font-black outline-none focus:ring-2 focus:ring-garage-blue/30"
        />
      </div>
    </div>
  );

  const renderDaysInput = (field, title, description) => (
    <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 space-y-2">
      <div className="flex flex-col text-left">
        <span className="text-[14px] font-black uppercase italic text-garage-blue">{title}</span>
        <span className="text-[13px] font-bold opacity-40 uppercase">{description}</span>
      </div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={paymentSettings?.[field] ?? 10}
          onFocus={() => {
            if (Number(paymentSettings?.[field] || 0) === 0) updatePaymentData(null, field, '');
          }}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            updatePaymentData(null, field, val === '' ? '' : Number(val));
          }}
          onBlur={() => {
            const nextValue = paymentSettings?.[field] === '' || paymentSettings?.[field] === undefined
              ? 10
              : Math.max(1, Number(paymentSettings?.[field] || 10));
            updatePaymentData(null, field, nextValue);
            persistPaymentSetting?.(null, field, nextValue);
          }}
            className="w-full pl-4 pr-16 py-3 bg-white/70 dark:bg-[var(--color-surface-raised)] rounded-xl text-[13px] font-black outline-none focus:ring-2 focus:ring-garage-blue/30"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-black opacity-40">Days</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <BadgeDollarSign size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[13px] font-black uppercase tracking-widest opacity-40">Checkout Settings</h3>
        </div>
        <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 flex justify-between items-center">
          <div className="flex flex-col text-left">
            <span className="text-[14px] font-black uppercase italic text-garage-blue">Maintenance Mode</span>
            <span className="text-[13px] font-bold opacity-40 uppercase">Put the garage/checkout under maintenance</span>
          </div>
          <button
            onClick={async () => {
              const nextValue = !paymentSettings?.maintenanceMode;
              updatePaymentData(null, 'maintenanceMode', nextValue);
              const persisted = persistPaymentSetting
                ? await persistPaymentSetting(null, 'maintenanceMode', nextValue)
                : true;
              if (persisted === false) {
                updatePaymentData(null, 'maintenanceMode', !nextValue);
              }
            }}
            className={`w-14 h-7 rounded-full transition-all duration-300 flex items-center p-1 ${paymentSettings?.maintenanceMode ? 'bg-garage-blue shadow-lg shadow-blue-500/20' : 'bg-neutral-300 dark:bg-white/10'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${paymentSettings?.maintenanceMode ? 'translate-x-7' : 'translate-x-0'}`} />
          </button>
        </div>
        {paymentSettings?.maintenanceMode && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'kit', label: 'Kit' },
                { id: 'prints', label: 'Prints' }
              ].map(({ id, label }) => {
                const isActive = paymentSettings?.maintenanceInvalidTypes?.[id] !== false;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={async () => {
                      const nextValue = !isActive;
                      updatePaymentData('maintenanceInvalidTypes', id, nextValue);
                      const persisted = persistPaymentSetting
                        ? await persistPaymentSetting('maintenanceInvalidTypes', id, nextValue)
                        : true;
                      if (persisted === false) {
                        updatePaymentData('maintenanceInvalidTypes', id, isActive);
                      }
                    }}
                    className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] font-black uppercase tracking-widest transition-all border ${
                      isActive
                        ? 'bg-red-500/10 text-red-500 border-red-500/20 shadow-lg shadow-red-500/5'
                        : 'bg-black/5 dark:bg-white/5 text-neutral-400 border-transparent'
                    }`}
                  >
                    {id === 'kit' ? <Package size={14} /> : <Printer size={14} />}
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent p-4 flex justify-between items-center">
              <div className="flex flex-col text-left">
                <span className="text-[14px] font-black uppercase italic text-garage-blue">Viewport Orientation Tag</span>
                <span className="text-[13px] font-bold opacity-40 uppercase">Show the viewport size and orientation badge</span>
              </div>
              <button
                type="button"
                aria-label="Toggle viewport orientation tag"
                aria-pressed={paymentSettings?.showViewportTag !== false}
                onClick={async () => {
                  const nextValue = paymentSettings?.showViewportTag === false;
                  updatePaymentData(null, 'showViewportTag', nextValue);
                  const persisted = await persistPaymentSetting?.(null, 'showViewportTag', nextValue);
                  if (persisted === false) updatePaymentData(null, 'showViewportTag', !nextValue);
                }}
                className={`w-14 h-7 rounded-full transition-all duration-300 flex items-center p-1 shrink-0 ${paymentSettings?.showViewportTag !== false ? 'bg-garage-blue shadow-lg shadow-blue-500/20' : 'bg-neutral-300 dark:bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${paymentSettings?.showViewportTag !== false ? 'translate-x-7' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <BadgeDollarSign size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[13px] font-black uppercase tracking-widest opacity-40">Service Charge</h3>
        </div>
        {renderFeeInput('handlingFee', 'Handling fee per order', 'Added once to the selected checkout order')}
        {renderFeeInput('installmentFee', 'Reservation fee per item', 'Added to each item for the Reservation payment plan')}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <BadgeDollarSign size={16} className="text-garage-blue opacity-60" />
          <h3 className="text-[13px] font-black uppercase tracking-widest opacity-40">Balance Settlement Deadlines</h3>
        </div>
        {renderDaysInput('reservationSettleDays', 'Reservation Balance Settle Days (On-hand)', 'Days allowed for customer to settle on-hand reservations')}
        {renderDaysInput('preOrderSettleDays', 'Pre-order Balance Settle Days', 'Days allowed for customer to settle pre-orders after arrival')}
        {renderDaysInput('projectSettleDays', 'Project Balance Settle Days', 'Days allowed for customer to settle completed custom projects')}
      </div>

      {categories.map(cat => (
        <div key={cat.id} className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <cat.icon size={16} className="text-garage-blue opacity-60" />
            <h3 className="text-[13px] font-black uppercase tracking-widest opacity-40">{cat.label}</h3>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {cat.options.map(opt => {
              const isActive = paymentSettings?.[cat.id]?.[opt] !== false;
              const cashTransferFee = paymentSettings?.[cat.id]?.[`${opt}CashTransferFee`] ?? 0;
              
              return (
                <div key={opt} className="bg-black/5 dark:bg-white/5 rounded-2xl border border-transparent overflow-hidden">
                  <div className="flex justify-between items-center p-4">
                    <div className="flex flex-col text-left">
                      <span className="text-[14px] font-black uppercase italic text-garage-blue">{opt}</span>
                      <span className="text-[13px] font-bold opacity-40 uppercase">
                        {isActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
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

                  {cat.id === 'methods' && isActive && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300 space-y-3">
                      <div className="rounded-xl bg-white/60 dark:bg-[var(--color-surface-raised)] p-3">
                        <label className="mb-2 block text-[13px] font-black uppercase tracking-widest opacity-40">
                          Cash Transfer Fee
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-black opacity-40">₱</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={cashTransferFee}
                            onFocus={() => {
                              if (Number(cashTransferFee || 0) === 0) updatePaymentData('methods', `${opt}CashTransferFee`, '');
                            }}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              updatePaymentData('methods', `${opt}CashTransferFee`, val === '' ? '' : Number(val));
                            }}
                            onBlur={() => {
                              const nextValue = paymentSettings?.methods?.[`${opt}CashTransferFee`] === ''
                                ? 0
                                : Math.max(0, Number(paymentSettings?.methods?.[`${opt}CashTransferFee`] ?? cashTransferFee) || 0);
                              if (paymentSettings?.methods?.[`${opt}CashTransferFee`] === '') {
                                updatePaymentData('methods', `${opt}CashTransferFee`, nextValue);
                              }
                              persistPaymentSetting?.('methods', `${opt}CashTransferFee`, nextValue);
                            }}
                            className="w-full rounded-xl bg-white/80 py-3 pl-7 pr-4 text-[13px] font-black outline-none focus:ring-2 focus:ring-garage-blue/30 dark:bg-[var(--color-surface-raised)]"
                          />
                        </div>
                      </div>
                      {opt !== 'cash' && (getQrValue(opt) ? (
                        <div className="space-y-2">
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-white/10 bg-white">
                            <img src={getQrValue(opt)} alt={`${opt} QR`} className="w-full h-full object-contain" />
                            <button
                              type="button"
                              onClick={() => setQrDrafts(prev => ({ ...prev, [opt]: null }))}
                              className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors"
                              aria-label={`Remove ${opt} QR`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                          {hasQrDraft(opt) && (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => cancelQrChange(opt)}
                                className="rounded-lg border border-black/10 px-4 py-2 text-[12px] font-black uppercase dark:border-white/10"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveQrChange(opt)}
                                className="rounded-lg bg-garage-blue px-4 py-2 text-[12px] font-black uppercase text-white"
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-garage-blue/50 transition-colors bg-white/5">
                            <Upload size={20} className="opacity-40" />
                            <span className="text-[13px] font-bold mt-2 opacity-50 uppercase">Upload {opt} QR</span>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, opt)} />
                          </label>
                          {hasQrDraft(opt) && (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => cancelQrChange(opt)}
                                className="rounded-lg border border-black/10 px-4 py-2 text-[12px] font-black uppercase dark:border-white/10"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveQrChange(opt)}
                                className="rounded-lg bg-garage-blue px-4 py-2 text-[12px] font-black uppercase text-white"
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
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
          <h3 className="text-[13px] font-black uppercase tracking-widest opacity-40">Add Payment Method</h3>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-xl text-[13px] font-bold"
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

      {showSave && (
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="w-full h-14 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.5rem] font-black uppercase text-[13px] tracking-widest transition-all shadow-xl shadow-emerald-500/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-600"
        >
          Save Payment Settings
        </button>
      )}
    </div>
  );
}
