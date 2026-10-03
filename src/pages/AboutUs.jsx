import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';
import { FaLinkedin, FaFacebook, FaGithub } from 'react-icons/fa';
import { APP_CONFIG, isPortfolioApp } from '../appConfig';

export default function AboutUs() {
  const { isDarkMode } = useTheme();

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
            {isPortfolioApp ? 'About Daivevargas' : `About ${APP_CONFIG.label}`}
          </h1>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
            {isPortfolioApp
              ? 'Behind the project, product family, and developer portfolio by Brayan Daive Vargas (blastedTREED)'
              : 'A personal collection journey and portfolio project by Brayan Daive Vargas (blastedTREED)'}
          </p>
          <p className={`text-base mt-3 p-3 rounded-lg border inline-block ${
            isDarkMode
              ? 'bg-neutral-900 border-neutral-800 text-neutral-400'
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            🏎️ <strong className={strongClass}>{isPortfolioApp ? 'Daivevargas' : APP_CONFIG.label}</strong> is {isPortfolioApp
              ? 'the developer portfolio and product-family directory behind SnorlaxGarage, LIQUIKITS, KOMIPRINTS, and GARAGECORE.'
              : 'a dedicated storefront for collectors — part private collection, part 3D printing service, and part living developer portfolio.'}
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
              SnorlaxGarage started as a personal collection journey. The items listed here are part of a private collection. We are currently letting go of select items, including duplicates in our collection or kits that no longer fit our current building plans.
            </p>
          </div>

          <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${headingClass}`}>
              🖨️ 3D Printing Services
            </h2>
            <p className={bodyClass}>
              Beyond our collection, we also offer 3D printing commission services. If you have a project or a specific print you need, we are here to help bring your designs to life with quality and precision.
            </p>
          </div>
        </div>

        {/* DEVELOPER PORTFOLIO */}
        <div className={`p-4 rounded-xl border space-y-4 ${cardClass}`}>
          <div>
            <h2 className={`font-bold flex items-center gap-1.5 text-lg ${headingClass}`}>
              💻 Behind the Project & Developer Portfolio
            </h2>
            <p className={`mt-2 ${bodyClass}`}>
              Hi! I&apos;m <strong className={strongClass}>Brayan Daive Vargas</strong>, a <strong className={strongClass}>Computer Engineering graduate from Mapúa MCL</strong> and the person behind <strong className={strongClass}>SnorlaxGarage</strong>. While this platform is a dedicated storefront for collectors, it also serves as my living developer portfolio.
            </p>
          </div>

          <p className={bodyClass}>
            I independently architected and built this application from scratch using <strong className={strongClass}>ReactJS and Firebase</strong>. The system design is heavily guided by my <strong className={strongClass}>2.5+ years of end-to-end enterprise experience at Accenture</strong> across diverse global tracks:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
              <h3 className={`font-bold flex items-center gap-1.5 text-base ${headingClass}`}>
                🚀 Dev (AEM & Tailwind)
              </h3>
              <p className={`text-sm ${bodyClass}`}>
                Enhanced <strong className={strongClass}>frontend UI enterprise features</strong> while collaborating across offshore Scrum teams.
              </p>
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
              <h3 className={`font-bold flex items-center gap-1.5 text-base ${headingClass}`}>
                ⚙️ DevOps & Release
              </h3>
              <p className={`text-sm ${bodyClass}`}>
                Maintained and troubleshot <strong className={strongClass}>microservices pods and containers</strong> to support complex deployments.
              </p>
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
              <h3 className={`font-bold flex items-center gap-1.5 text-base ${headingClass}`}>
                🌐 QA Tester (Global Rollout)
              </h3>
              <p className={`text-sm ${bodyClass}`}>
                Executed <strong className={strongClass}>manual and feature testing</strong> for high-impact production rollouts across international markets.
              </p>
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${cardClass}`}>
              <h3 className={`font-bold flex items-center gap-1.5 text-base ${headingClass}`}>
                🤖 Vibe Coding
              </h3>
              <p className={`text-sm ${bodyClass}`}>
                Leveraged <strong className={strongClass}>GPT-5.5</strong>, <strong className={strongClass}>Gemini 5.5</strong>, and AI coding assistants such as <strong className={strongClass}>Codex and Antigravity</strong> to accelerate development, solve complex logic, and improve code quality.
              </p>
            </div>
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
