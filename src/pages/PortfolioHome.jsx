import React from 'react';
import { ArrowUpRight, Box, BriefcaseBusiness, Printer, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';

const projects = [
  {
    name: 'SNORLAXGARAGE',
    eyebrow: 'COLLECTOR STOREFRONT',
    description: 'The original combined catalog for garage kits, projects, orders, and custom printing.',
    href: 'https://snorlaxgarage.vercel.app/',
    icon: BriefcaseBusiness,
    gradient: 'from-blue-600 to-cyan-400',
    accent: 'GARAGE / KITS / PRINTS'
  },
  {
    name: 'LIQUIKITS',
    eyebrow: 'KIT STOREFRONT',
    description: 'A focused kit catalog with the shared SnorlaxGarage cart and checkout experience.',
    href: 'https://liquikits.vercel.app/',
    icon: Box,
    gradient: 'from-cyan-500 to-blue-500',
    accent: 'KITS / CART / CHECKOUT'
  },
  {
    name: 'KOMIPRINTS',
    eyebrow: 'PRINT PROJECTS',
    description: 'A focused home for printable projects, 3D-printed work, and project orders.',
    href: 'https://komiprints.vercel.app/',
    icon: Printer,
    gradient: 'from-orange-500 to-rose-500',
    accent: 'PROJECTS / PRINTS / ORDERS'
  },
  {
    name: 'GARAGECORE',
    eyebrow: 'OPERATIONS CONSOLE',
    description: 'The read-only or authenticated-admin operations view for both product markets.',
    href: 'https://garagecore.vercel.app/',
    icon: ShieldCheck,
    gradient: 'from-violet-500 to-indigo-500',
    accent: 'KITS / PRINTS / OPERATIONS'
  }
];

export default function PortfolioHome() {
  const { isDarkMode } = useTheme();
  const muted = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';
  const surface = isDarkMode ? 'bg-neutral-900/80 border-white/10' : 'bg-white/80 border-black/10';

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen px-5 py-12 md:px-10 md:py-16">
        <section className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.32em] text-blue-500">DAIVEVARGAS / PROJECT SNAPSHOTS</p>
            <h1 className={`mt-4 text-5xl font-black italic uppercase tracking-[-0.07em] leading-[0.9] sm:text-7xl ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>
              BUILT FROM<br /><span className="text-blue-500">ONE GARAGE.</span>
            </h1>
            <p className={`mt-6 max-w-2xl text-base leading-relaxed md:text-lg ${muted}`}>
              A living snapshot of the products, storefronts, and operations tools designed and built by Brayan Daive Vargas.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
            {projects.map(({ name, eyebrow, description, href, icon: projectIcon, gradient, accent }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative overflow-hidden rounded-[2rem] border p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/60 ${surface}`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
                <div className="flex items-start justify-between gap-5">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg`}>
                    {React.createElement(projectIcon, { size: 26 })}
                  </div>
                  <ArrowUpRight className="text-neutral-400 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" size={22} />
                </div>
                <p className="mt-8 text-[11px] font-black uppercase tracking-[0.26em] text-blue-500">{eyebrow}</p>
                <h2 className={`mt-2 text-3xl font-black italic uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>{name}</h2>
                <p className={`mt-3 min-h-14 text-sm leading-relaxed ${muted}`}>{description}</p>
                <div className={`mt-6 border-t pt-4 text-[10px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'border-white/10 text-neutral-500' : 'border-black/10 text-neutral-500'}`}>
                  {accent}
                </div>
              </a>
            ))}
          </div>

          <div className={`mt-8 rounded-[2rem] border p-6 md:p-8 ${surface}`}>
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-500">THE PERSON BEHIND THE BUILDS</p>
                <h2 className={`mt-2 text-2xl font-black italic uppercase ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>Want to know me?</h2>
                <p className={`mt-2 max-w-2xl text-sm ${muted}`}>Open the ME tab for the developer profile, background, and ways to connect.</p>
              </div>
              <Link to="/about-us" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-blue-500">
                Open ME <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </PageTemplate>
  );
}
