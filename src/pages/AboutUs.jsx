import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';
import { FaLinkedin, FaFacebook, FaGithub } from 'react-icons/fa';
import { isPortfolioApp } from '../appConfig';
import PortfolioProfile from './PortfolioProfile';

export default function AboutUs() {
  const { isDarkMode } = useTheme();

  if (isPortfolioApp) return <PortfolioProfile />;

  const cardClass = isDarkMode
    ? 'bg-neutral-900 border-neutral-800'
    : 'bg-neutral-50 border-neutral-200';

  const headingClass = isDarkMode ? 'text-white' : 'text-neutral-900';
  const bodyClass = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';
  const strongClass = isDarkMode ? 'text-white' : 'text-neutral-900';

  const linkClass = isDarkMode
    ? 'border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-neutral-700'
    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-900 hover:text-white hover:border-neutral-900';

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className={`max-w-3xl mx-auto p-6 md:p-12 text-left space-y-6 ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
        {/* HEADER */}
        <div>
          <h1 className={`text-3xl font-black uppercase tracking-tighter ${headingClass}`}>
            ABOUT LIQUIKITS
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
            A personal Gunpla collection showcase and developer portfolio project by Brayan Daive Vargas (blastedTREED)
          </p>
          <p className={`text-base mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400'
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            🏎️ <strong className={strongClass}>LiquiKits</strong> is a dedicated storefront for Gunpla builders—part personal backlog showcase, part hobbyist marketplace, and part living developer portfolio.
          </p>
        </div>

        {isPortfolioApp && (
          <div className={`p-4 rounded-xl border space-y-4 ${cardClass}`}>
            <div>
              <h2 className={`font-bold text-lg ${headingClass}`}>Product family directory</h2>
              <p className={`mt-2 ${bodyClass}`}>
                Daivevargas presents the applications built from the SnorlaxGarage foundation.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['SnorlaxGarage', 'The combined collector and 3D-printing storefront.', 'https://snorlaxgarage.vercel.app/'],
                ['LIQUIKITS', 'The kit-focused storefront and checkout.', 'https://liquikits.vercel.app/'],
                ['KOMIPRINTS', 'The print-project and ready-to-print storefront.', 'https://komiprints.vercel.app/'],
                ['GARAGECORE', 'The admin operations and reporting console.', 'https://garagecore.vercel.app/']
              ].map(([name, description, href]) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-xl border p-4 transition-colors hover:border-blue-500 ${linkClass}`}
                >
                  <div className={`font-black uppercase tracking-wider ${headingClass}`}>{name}</div>
                  <div className={`mt-1 text-sm ${bodyClass}`}>{description}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* COLLECTION & PRINTING */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
          <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${headingClass}`}>
              📦 Our Collection
            </h2>
            <p className={bodyClass}>
              Rooted in the <strong className={strongClass}>SnorlaxGarage</strong> community, LiquiKits features authentic Gunpla sourced directly from a real builder&apos;s private vault. As projects evolve, space shifts, or building plans change, select kits—built, unbuilt, and everything between—are made available for fellow hobbyists with full transparency on condition and pricing.
            </p>
          </div>

          <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${headingClass}`}>
              🖨️ Need 3D Prints?
            </h2>
            <p className={bodyClass}>
              While LiquiKits focuses strictly on model kits and backlog items, our custom 3D printing and commission work have moved to <strong className={strongClass}>KomiPrints</strong>! Together, both platforms represent an ongoing journey to build clean, functional e-commerce web applications tailored specifically for the collector community.
            </p>
          </div>
        </div>

        {/* CONNECT */}
        <div className={`p-4 rounded-xl border space-y-3 ${cardClass}`}>
          <h2 className={`font-bold flex items-center gap-1.5 text-lg ${headingClass}`}>
            🤝 Connect With Me
          </h2>
          <p className={bodyClass}>
            For inquiries regarding our collection, 3D printing commissions, or professional developer opportunities, please feel free to reach out through my official channels:
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href="https://linkedin.com/in/brayan-daive-vargas-773469222"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-medium tracking-tight text-sm transition-all hover:bg-blue-600 hover:text-white hover:border-blue-600 ${linkClass}`}
            >
              <FaLinkedin size={16} /> LinkedIn Profile
            </a>

            <a
              href="https://github.com/blastedTREED"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-medium tracking-tight text-sm transition-all ${linkClass}`}
            >
              <FaGithub size={16} /> GitHub (@blastedTREED)
            </a>

            <a
              href="https://www.facebook.com/profile.php?id=61576855103826"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-medium tracking-tight text-sm transition-all hover:bg-blue-500 hover:text-white hover:border-blue-500 ${linkClass}`}
            >
              <FaFacebook size={16} /> SnorlaxGarage Facebook Page
            </a>
          </div>
        </div>
      </div>
    </PageTemplate>
  );
}
