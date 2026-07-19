import React from 'react';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';
import { FaLinkedin, FaFacebook, FaGithub } from 'react-icons/fa';

export default function AboutUs() {
  const { isDarkMode } = useTheme();
  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="max-w-3xl mx-auto p-6 md:p-12 text-left space-y-8">
        
        {/* Header Section */}
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">
            About SnorlaxGarage
          </h1>
          <p className="text-sm opacity-70 italic">
            A personal collection journey and portfolio project by Brayan Daive Vargas (blastedTREED)
          </p>
        </div>

        <hr className="border-t opacity-20" />

        {/* Original Functional Sections */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-tight">Our Collection</h2>
          <p>
            SnorlaxGarage started as a personal collection journey. The items listed here are part of a private collection. We are currently letting go of select items, including duplicates in our collection or kits that no longer fit our current building plans.
          </p>
        </section>
        
        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-tight">3D Printing Services</h2>
          <p>
            Beyond our collection, we also offer 3D printing commission services. If you have a project or a specific print you need, we are here to help bring your designs to life with quality and precision.
          </p>
        </section>

        <hr className="border-t opacity-20" />

<section className="space-y-6 text-neutral-200">
      <div>
        <h2 className="text-xl font-bold uppercase tracking-tight text-blue-500">
          Behind the Project & Developer Portfolio
        </h2>
        <p className="mt-3 text-md leading-relaxed text-neutral-400">
          Hi! I'm <strong className="text-white">Brayan Daive Vargas</strong>, a <strong className="text-white">Computer Engineering graduate from Mapúa MCL</strong> and the person behind <strong className="text-white">SnorlaxGarage</strong>. While this platform is a dedicated storefront for collectors, it also serves as my living developer portfolio.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-md leading-relaxed text-neutral-300">
          I independently architected and built this application from scratch using <strong className="text-white">ReactJS and Firebase</strong>. The system design is heavily guided by my <strong className="text-white">2.5+ years of end-to-end enterprise experience at Accenture</strong> across diverse global tracks:
        </p>
        
        {/* 2x2 Grid Layout for Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Development Track */}
          <div className="p-5 border border-neutral-800 rounded-xl bg-neutral-900/50 hover:border-blue-500/40 hover:bg-neutral-900/80 transition-all duration-300">
            <h4 className="font-bold text-white text-md mb-2 inline-flex items-center gap-1.5">
              🚀 Dev (AEM & Tailwind)
            </h4>
            <p className="text-neutral-400 text-md leading-relaxed">
              Enhanced <strong className="text-white">frontend UI enterprise features</strong> while collaborating across offshore Scrum teams.
            </p>
          </div>

          {/* Card 2: DevOps & Infrastructure Track */}
          <div className="p-5 border border-neutral-800 rounded-xl bg-neutral-900/50 hover:border-blue-500/40 hover:bg-neutral-900/80 transition-all duration-300">
            <h4 className="font-bold text-white text-md mb-2 inline-flex items-center gap-1.5">
              ⚙️ DevOps & Release
            </h4>
            <p className="text-neutral-400 text-md leading-relaxed">
              Maintained and troubleshot <strong className="text-white"> microservices pods and containers</strong> to support complex deployments.
            </p>
          </div>

          {/* Card 3: Quality Assurance Track */}
<div className="p-5 border border-neutral-800 rounded-xl bg-neutral-900/50 hover:border-blue-500/40 hover:bg-neutral-900/80 transition-all duration-300">
  <h4 className="font-bold text-white text-md mb-2 inline-flex items-center gap-1.5">
    🌐 QA Tester (Global Rollout)
  </h4>
  <p className="text-neutral-400 text-md leading-relaxed">
    Executed <strong className="text-white"> manual and feature testing</strong> for high-impact production rollouts across international markets.
  </p>
</div>

          {/* Card 4: FIX - Maikli, saktong haba, at hindi misleading */}
<div className="p-5 border border-neutral-800 rounded-xl bg-neutral-900/50 hover:border-blue-500/40 hover:bg-neutral-900/80 transition-all duration-300">
  <h4 className="font-bold text-white text-md mb-2 inline-flex items-center gap-1.5">
    🤖 Vibe Coding
  </h4>
  <p className="text-neutral-400 text-md leading-relaxed">
    Applied <strong className="text-white"> prompt engineering</strong> to co-pilot complex logic, solve difficult edge cases, and enhance code efficiency.
  </p>
</div>

        </div>
      </div>
    </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-tight">
            Connect With Me
          </h2>
          <p>
            For inquiries regarding our collection, 3D printing commissions, or professional developer opportunities, please feel free to reach out through my official channels:
          </p>
          
          {/* Flex container para sa mga links/buttons */}
        <div className="flex flex-wrap gap-4 pt-2">
          <a 
            href="https://linkedin.com/in/brayan-daive-vargas-773469222" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 border rounded-lg font-medium tracking-tight text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
          >
            <FaLinkedin size={16} /> LinkedIn Profile
          </a>
          
          <a 
            href="https://github.com/blastedTREED" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 border rounded-lg font-medium tracking-tight text-sm hover:bg-neutral-800 hover:text-white hover:border-neutral-800 transition-all"
          >
            <FaGithub size={16} /> GitHub (@blastedTREED)
          </a>

          <a 
            href="https://www.facebook.com/profile.php?id=61576855103826" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 border rounded-lg font-medium tracking-tight text-sm hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all"
          >
            <FaFacebook size={16} /> SnorlaxGarage Facebook Page
          </a>
        </div>
        </section>

      </div>
    </PageTemplate>
  );
}