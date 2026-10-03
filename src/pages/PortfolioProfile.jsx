import React, { useRef, useState } from 'react';
import { Camera, Check, Loader2, Mail, MapPin, Upload } from 'lucide-react';
import { FaFacebook, FaGithub, FaLinkedin } from 'react-icons/fa';
import PageTemplate from './PageTemplate';
import { useTheme } from '../context/ThemeContext';
import { useStore } from '../store/useStore';

const resizeProfilePhoto = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Unable to read that image.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('That file is not a valid image.'));
    image.onload = () => {
      const maxSize = 720;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function PortfolioProfile() {
  const { isDarkMode } = useTheme();
  const { garageInfo, isAdmin, updateGarageSettings, setToastMessage } = useStore();
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const profilePhotoURL = garageInfo?.profilePhotoURL || '';
  const surface = isDarkMode ? 'bg-neutral-900/85 border-white/10' : 'bg-white/85 border-black/10';
  const muted = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';
  const heading = isDarkMode ? 'text-white' : 'text-neutral-950';

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Please choose an image smaller than 8 MB.');
      return;
    }

    setError('');
    setIsUploading(true);
    try {
      const compressedPhoto = await resizeProfilePhoto(file);
      await updateGarageSettings({ profilePhotoURL: compressedPhoto });
      setToastMessage('Profile photo updated!');
    } catch (uploadError) {
      console.error('Profile photo upload failed:', uploadError);
      setError(uploadError.message || 'Profile photo upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <PageTemplate isDarkMode={isDarkMode}>
      <div className="min-h-screen px-5 py-10 md:px-10 md:py-14">
        <section className="mx-auto max-w-4xl">
          <div className={`overflow-hidden rounded-[2rem] border shadow-2xl ${surface}`}>
            <div className="h-32 bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 md:h-44" />
            <div className="px-6 pb-8 md:px-10">
              <div className="-mt-16 flex flex-col gap-5 sm:-mt-20 sm:flex-row sm:items-end sm:justify-between">
                <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-[var(--color-bg)] bg-gradient-to-br from-blue-600 to-cyan-400 shadow-2xl sm:h-40 sm:w-40">
                  {profilePhotoURL ? (
                    <img src={profilePhotoURL} alt="Brayan Daive Vargas" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl font-black text-white">DV</div>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      disabled={isUploading}
                      className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-full bg-black/70 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm disabled:opacity-60"
                    >
                      {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                      {isUploading ? 'Saving' : 'Photo'}
                    </button>
                  )}
                  <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href="https://linkedin.com/in/brayan-daive-vargas-773469222" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-blue-500 hover:bg-blue-500/10"><FaLinkedin size={14} /> LinkedIn</a>
                  <a href="https://github.com/blastedTREED" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wider ${muted}`}><FaGithub size={14} /> GitHub</a>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <h1 className={`text-3xl font-black italic uppercase tracking-tight ${heading}`}>Brayan Daive Vargas</h1>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white"><Check size={13} strokeWidth={3} /></span>
                </div>
                <p className="mt-1 text-sm font-bold text-blue-500">@blastedTREED · Computer Engineer</p>
                <p className={`mt-4 max-w-2xl leading-relaxed ${muted}`}>
                  I build focused digital storefronts and practical tools for collectors, makers, and small operations — from the original SnorlaxGarage to its product-family apps.
                </p>
                <div className={`mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold ${muted}`}>
                  <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> Philippines</span>
                  <span className="inline-flex items-center gap-1.5"><BriefcaseIcon /> Open to thoughtful collaborations</span>
                </div>
                {error && <p className="mt-3 text-sm font-bold text-red-500">{error}</p>}
                {isAdmin && !error && <p className={`mt-3 text-xs ${muted}`}><Upload size={12} className="mr-1 inline" /> Tap Photo to update the public profile image.</p>}
              </div>

              <div className={`mt-8 grid grid-cols-3 gap-2 border-y py-5 text-center ${isDarkMode ? 'border-white/10' : 'border-black/10'}`}>
                <div><div className={`text-xl font-black ${heading}`}>4</div><div className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Products</div></div>
                <div><div className={`text-xl font-black ${heading}`}>1</div><div className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Foundation</div></div>
                <div><div className={`text-xl font-black ${heading}`}>∞</div><div className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Ideas</div></div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className={`rounded-[2rem] border p-6 ${surface}`}>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-blue-500">ME / BACKGROUND</p>
              <h2 className={`mt-3 text-2xl font-black italic uppercase ${heading}`}>Building with curiosity.</h2>
              <p className={`mt-3 text-sm leading-relaxed ${muted}`}>
                I am a Computer Engineering graduate from Mapúa MCL with 2.5+ years of enterprise experience at Accenture across frontend development, DevOps support, QA, and global rollouts.
              </p>
            </section>
            <section className={`rounded-[2rem] border p-6 ${surface}`}>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-blue-500">CONTACT</p>
              <h2 className={`mt-3 text-2xl font-black italic uppercase ${heading}`}>Let&apos;s connect.</h2>
              <p className={`mt-3 text-sm leading-relaxed ${muted}`}>For storefront projects, 3D-printing work, or professional opportunities, reach out through any of the channels below.</p>
              <a href="mailto:brayan.daive.vargas@gmail.com" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-500 hover:underline"><Mail size={15} /> Email me</a>
              <a href="https://www.facebook.com/profile.php?id=61576855103826" target="_blank" rel="noopener noreferrer" className="ml-4 inline-flex items-center gap-2 text-sm font-black text-blue-500 hover:underline"><FaFacebook size={15} /> Facebook</a>
            </section>
          </div>
        </section>
      </div>
    </PageTemplate>
  );
}

function BriefcaseIcon() {
  return <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[8px]">✦</span>;
}
