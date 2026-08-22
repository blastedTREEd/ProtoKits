import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { AlertCircle, Calendar, CheckCircle2, Clock3, Printer, Truck, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTheme } from '../../context/ThemeContext';
import GarageCalendar, { getProjectScheduleDates } from '../calculator/GarageCalendar';
import {
  fromDateKey,
  formatAvailabilityDate,
  getUnavailableDateSet,
  getUnavailableWeekdaySet,
  normalizeAvailabilitySchedule,
  toggleUnavailableDate,
  toggleUnavailableWeekday
} from '../../utils/availabilitySchedule';

const getOrderDate = (value) => {
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const isActiveOrder = (order) => !['cancelled', 'completed'].includes(String(order?.status || '').toLowerCase());

const getQueueProjects = (orders = [], availabilitySchedule) => orders
  .filter(isActiveOrder)
  .flatMap((order) => (order.items || [])
    .filter((item) => item?.type === 'project' || item?.projectData)
    .map((item, index) => {
      const projectDays = Number(item.projectData?.totals?.days || 0);
      const designServiceDays = item.projectData?.selectedDesignService ? 1 : 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const scheduledDateKeys = getProjectScheduleDates(order, item, availabilitySchedule, 'printing');
      return {
        id: `${order.id || order.orderId || 'order'}-${index}`,
        orderId: order.orderId || order.id || 'Project order',
        buyerName: order.buyerName || 'Guest customer',
        projectName: item.name || item.projectData?.projectName || 'Custom print project',
        status: order.status || 'Queued',
        days: (projectDays + designServiceDays) * quantity,
        createdAt: getOrderDate(order.createdAt),
        scheduledDateKeys
      };
    })
  )
  .filter((project) => project.days > 0)
  .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

const scheduleOptions = [
  { id: 'printing', label: 'Printing', icon: Printer },
  { id: 'shipping', label: 'Shipping', icon: Truck }
];

export default function AdminCalendarModal({ isOpen, onClose, embedded = false, visible = true }) {
  const { isDarkMode } = useTheme();
  const shippingSettings = useStore((state) => state.shippingSettings);
  const publishCheckoutSettings = useStore((state) => state.publishCheckoutSettings);
  const orders = useStore((state) => state.orders);
  const subscribeOrders = useStore((state) => state.subscribeOrders);
  const [scheduleType, setScheduleType] = useState('printing');
  const [availabilitySchedule, setAvailabilitySchedule] = useState(() => normalizeAvailabilitySchedule());
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    // Keep the local draft in sync with the public checkout settings snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailabilitySchedule(normalizeAvailabilitySchedule(shippingSettings?.availabilitySchedule));
  }, [shippingSettings?.availabilitySchedule]);

  useEffect(() => {
    if (!isOpen) return undefined;

    return subscribeOrders({ isAdminMode: true });
  }, [isOpen, subscribeOrders]);

  const queueProjects = useMemo(() => getQueueProjects(orders, availabilitySchedule), [orders, availabilitySchedule]);
  const unavailableDates = useMemo(
    () => getUnavailableDateSet(availabilitySchedule, scheduleType),
    [availabilitySchedule, scheduleType]
  );
  const unavailableWeekdays = useMemo(
    () => getUnavailableWeekdaySet(availabilitySchedule, scheduleType),
    [availabilitySchedule, scheduleType]
  );

  const handleToggleUnavailable = async (dateKey) => {
    const nextSchedule = toggleUnavailableDate(availabilitySchedule, scheduleType, dateKey);
    setAvailabilitySchedule(nextSchedule);
    setSaveError('');

    try {
      await publishCheckoutSettings({ availabilitySchedule: nextSchedule });
    } catch (error) {
      console.error('SG LOG: Failed to save availability schedule:', error);
      setAvailabilitySchedule(availabilitySchedule);
      setSaveError('Unable to save this schedule change. Please try again.');
    }
  };

  const handleToggleUnavailableWeekday = async (weekday) => {
    const nextSchedule = toggleUnavailableWeekday(availabilitySchedule, scheduleType, weekday);
    setAvailabilitySchedule(nextSchedule);
    setSaveError('');

    try {
      await publishCheckoutSettings({ availabilitySchedule: nextSchedule });
    } catch (error) {
      console.error('SG LOG: Failed to save recurring availability schedule:', error);
      setAvailabilitySchedule(availabilitySchedule);
      setSaveError('Unable to save this schedule change. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={embedded
          ? `h-full w-full ${visible ? 'block' : 'hidden'}`
          : 'fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm md:p-4 lg:p-12'}>
          <Motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            role="dialog"
            aria-modal="true"
            aria-label="Garage calendar"
            className={`flex ${embedded ? 'h-full w-full' : 'h-full w-full sm:h-auto sm:max-h-[94vh] sm:max-w-6xl sm:rounded-[2rem]'} flex-col overflow-hidden ${embedded ? '' : 'border shadow-2xl'} ${isDarkMode ? 'border-white/10 bg-[#0a0a0a] text-white' : 'border-black/10 bg-white text-neutral-900'}`}
          >
            {!embedded && (
              <header className="flex shrink-0 items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10 sm:px-7">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-600 p-2.5 text-white shadow-lg shadow-blue-600/20">
                    <Calendar size={20} strokeWidth={3} />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-black uppercase italic tracking-tight">Garage Calendar</h2>
                    <p className="text-[13px] font-black uppercase tracking-[0.18em] opacity-45">Queue &amp; availability</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close calendar"
                  className="rounded-full p-2.5 opacity-55 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </header>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid min-h-full grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <section className="border-b border-black/5 dark:border-white/10 lg:border-b-0 lg:border-r">
                  <GarageCalendar
                    orders={orders}
                    availabilitySchedule={availabilitySchedule}
                    adminMode
                    scheduleType={scheduleType}
                    onToggleUnavailable={handleToggleUnavailable}
                    onToggleUnavailableWeekday={handleToggleUnavailableWeekday}
                    className="min-h-[510px]"
                  />
                </section>

                <aside className="space-y-6 p-5 sm:p-7">
                  <div>
                    <p className="mb-3 text-[13px] font-black uppercase tracking-[0.2em] opacity-45">Manage availability</p>
                    <div className="grid grid-cols-2 gap-2">
                      {scheduleOptions.map(({ id, label }) => {
                        const isSelected = scheduleType === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setScheduleType(id)}
                            className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[13px] font-black uppercase tracking-widest transition ${isSelected ? 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'border-black/10 hover:border-blue-500/40 dark:border-white/10'}`}
                          >
                            {id === 'printing' ? <Printer size={15} /> : <Truck size={15} />}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 rounded-2xl bg-blue-500/10 p-3 text-[13px] font-bold leading-relaxed text-blue-700 dark:text-blue-300">
                      Tap a future day to toggle {scheduleType} availability. Tap a weekday header to close that weekday every week. Green days are available; red days are unavailable or occupied.
                    </p>
                    <p className="mt-2 text-[13px] font-black uppercase tracking-widest opacity-45">
                      {unavailableDates.size} date override{unavailableDates.size === 1 ? '' : 's'} · {unavailableWeekdays.size} weekly closure{unavailableWeekdays.size === 1 ? '' : 's'}
                    </p>
                    {saveError && (
                      <p className="mt-2 flex items-center gap-2 text-[13px] font-black uppercase tracking-widest text-red-500">
                        <AlertCircle size={13} />
                        {saveError}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-black uppercase tracking-[0.2em] opacity-45">Print queue</p>
                        <h3 className="text-[15px] font-black italic">{queueProjects.length} scheduled project{queueProjects.length === 1 ? '' : 's'}</h3>
                      </div>
                      <Clock3 size={20} className="text-blue-500" />
                    </div>

                    <div className="space-y-2">
                      {queueProjects.length === 0 ? (
                        <div className="rounded-2xl bg-black/5 p-4 text-[13px] font-black uppercase tracking-widest opacity-50 dark:bg-white/5">No active projects in queue.</div>
                      ) : queueProjects.map((project) => (
                        <div key={project.id} className="rounded-2xl border border-black/5 bg-black/[0.025] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-black uppercase italic">{project.projectName}</p>
                              <p className="mt-1 truncate text-[13px] font-bold uppercase opacity-50">{project.orderId} · {project.buyerName}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-1 text-[13px] font-black uppercase text-blue-600 dark:text-blue-300">{project.days} day{project.days === 1 ? '' : 's'}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-1.5 text-[13px] font-black uppercase tracking-widest opacity-45">
                            <Clock3 size={11} />
                            Queued {formatAvailabilityDate(project.createdAt)}
                          </div>
                          {project.scheduledDateKeys.length > 0 && (() => {
                            const scheduledStart = fromDateKey(project.scheduledDateKeys[0]);
                            const scheduledEnd = fromDateKey(project.scheduledDateKeys[project.scheduledDateKeys.length - 1]);
                            return (
                              <div className="mt-1 text-[13px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-300">
                                Scheduled {formatAvailabilityDate(scheduledStart)}{scheduledEnd && scheduledEnd.getTime() !== scheduledStart?.getTime() ? ` – ${formatAvailabilityDate(scheduledEnd)}` : ''}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[13px] font-bold leading-relaxed text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                    Project occupancy is calculated from active orders, using the same calendar shown in user projects.
                  </div>
                </aside>
              </div>
            </div>
          </Motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
