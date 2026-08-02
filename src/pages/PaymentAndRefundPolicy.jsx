import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';

export default function PaymentRefund() {
  const { isDarkMode } = useTheme();
  const shippingSettings = useStore((state) => state.shippingSettings);
  const paymentSettings = shippingSettings?.paymentSettings || {};
  const preOrderSettleDays = Number(paymentSettings.preOrderSettleDays ?? 10);
  const reservationSettleDays = Number(paymentSettings.reservationSettleDays ?? 10);
  const projectSettleDays = Number(paymentSettings.projectSettleDays ?? 10);

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-8 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        {/* HEADER */}
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>
            Payment &amp; Refund Policy
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>Last Updated: July 15, 2025</p>
        </div>

        {/* SECTION 1: PAYMENT OPTIONS */}
        <section className="space-y-3">
          <h2 className={`font-bold flex items-center gap-1.5 text-lg border-b pb-1 ${
            isDarkMode ? 'text-white border-neutral-800' : 'text-neutral-900 border-neutral-200'
          }`}>
            💰 Payment Options
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-base">
            {/* Card 1 */}
            <div className={`p-4 rounded-xl border ${
              isDarkMode 
                ? 'bg-neutral-900/20 border-neutral-800' 
                : 'bg-neutral-50 border-neutral-200'
            }`}>
              <h3 className={`font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Full Payment</h3>
              <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
                Available for all items. Required to immediately secure stock or start production.
              </p>
            </div>
            
            {/* Card 2 */}
            <div className={`p-4 rounded-xl border flex flex-col justify-between ${
              isDarkMode 
                ? 'bg-neutral-900/20 border-neutral-800' 
                : 'bg-neutral-50 border-neutral-200'
            }`}>
              <div>
                <h3 className={`font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>📌 Reservation</h3>
                <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
                  For pre-orders &amp; standard shipping. Requires downpayment.
                </p>
              </div>
              <em className={`text-sm block mt-2 font-medium border-t pt-1 ${
                isDarkMode ? 'text-red-400 border-neutral-800' : 'text-red-600 border-neutral-200'
              }`}>
                Not available for COD/COP.
              </em>
            </div>

            {/* Card 3 */}
            <div className={`p-4 rounded-xl border ${
              isDarkMode 
                ? 'bg-neutral-900/20 border-neutral-800' 
                : 'bg-neutral-50 border-neutral-200'
            }`}>
              <h3 className={`font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>📦 Partial Payment</h3>
              <p className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}>
                For 3D Printed projects and COD/COP orders. Balance due upon delivery or completion.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 2: DEADLINES & FORFEITURE */}
        <section className="space-y-3">
          <h2 className={`font-bold flex items-center gap-1.5 text-lg border-b pb-1 ${
            isDarkMode ? 'text-white border-neutral-800' : 'text-neutral-900 border-neutral-200'
          }`}>
            ⏳ Balance Settlement &amp; Forfeiture
          </h2>
          <p className={`text-base ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Remaining balances must be settled within these strict periods:
          </p>
          
          {/* TABLE CONTAINER */}
          <div className={`overflow-x-auto rounded-xl border text-base ${
            isDarkMode ? 'border-neutral-800 bg-neutral-900/20' : 'border-neutral-200 bg-neutral-50'
          }`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b font-semibold ${
                  isDarkMode 
                    ? 'border-neutral-800 bg-neutral-900/60 text-neutral-300' 
                    : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                }`}>
                  <th className="p-3">Order Type</th>
                  <th className="p-3">Settlement Window</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${
                isDarkMode ? 'divide-neutral-800 text-neutral-400' : 'divide-neutral-200 text-neutral-600'
              }`}>
                <tr>
                  <td className={`p-3 font-medium ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Reservations (On-hand)</td>
                  <td className="p-3">Within <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>{reservationSettleDays} calendar days</strong> from reservation date.</td>
                </tr>
                <tr>
                  <td className={`p-3 font-medium ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Reservations (Pre-order)</td>
                  <td className="p-3">Within <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>{preOrderSettleDays} calendar days</strong> from item&apos;s arrival.</td>
                </tr>
                <tr>
                  <td className={`p-3 font-medium ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Custom Projects</td>
                  <td className="p-3">Within <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>{projectSettleDays} calendar days</strong> from project completion.</td>
                </tr>
                <tr>
                  <td className={`p-3 font-medium ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Partial Payment (COD/COP)</td>
                  <td className="p-3">Strictly <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>at the point of delivery or pickup</strong>.</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* WARNING CARD */}
          <div className={`p-5 border rounded-xl space-y-3 text-base ${
            isDarkMode 
              ? 'bg-red-950/20 border-red-900/40' 
              : 'bg-red-50 border-red-200'
          }`}>
            <p className={`font-bold text-lg flex items-center gap-1.5 ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>
              ⚠️ Overdue Balance Consequences:
            </p>
            <ul className={`list-disc pl-5 space-y-2 text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              <li>Automatic forfeiture of the order; items/slots will be released to other buyers.</li>
              <li>The minimum reservation fee/downpayment is <strong className={isDarkMode ? 'text-red-400' : 'text-red-600'}>strictly non-refundable</strong>.</li>
              <li>Only payments made <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>in excess of the minimum downpayment</strong> are eligible for a refund.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 3: REFUND POLICY */}
        <section className="space-y-3">
          <h2 className={`font-bold flex items-center gap-1.5 text-lg border-b pb-1 ${
            isDarkMode ? 'text-white border-neutral-800' : 'text-neutral-900 border-neutral-200'
          }`}>
            🛡️ Refund Policy
          </h2>
          <p className={`text-base ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Refunds are <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>only eligible</strong> under the following conditions:
          </p>
          <ul className={`list-disc pl-6 text-base space-y-2 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <li>The supplier cancels the item order or production.</li>
            <li>The item is out of stock and we are unable to fulfill your paid order.</li>
          </ul>

          {/* NOTE BLOCK */}
          <div className={`p-4 rounded-xl border text-sm ${
            isDarkMode 
              ? 'bg-neutral-900/30 border-neutral-800 text-neutral-400' 
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>Note on 3D Designing &amp; Cancellations:</strong> Outside these conditions, all payments are strictly non-refundable. If a client cancels a 3D Designing Service, the base price paid is automatically forfeited.
          </div>
        </section>
      </div>
    </PageTemplate>
  );
}