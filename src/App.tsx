import React, { useState } from 'react';
import {
  Home,
  Video,
  BarChart2,
  Settings,
  ArrowRight,
  Minus,
  Square,
  X,
} from 'lucide-react';
import { LiveCameraMonitor, WorkspaceSection } from './components/LiveCameraMonitor';

export default function App() {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('dashboard');

  const navItems: Array<{
    id: WorkspaceSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={18} /> },
    { id: 'monitoring', label: 'Live Monitoring', icon: <Video size={18} /> },
    { id: 'history', label: 'Session History', icon: <BarChart2 size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <div className="min-h-screen p-0 sm:p-2 md:p-3 flex items-center justify-center">
      {/* Desktop Window Shell matching reference image */}
      <div className="w-full max-w-[1400px] bg-[#FAF9FE] sm:rounded-[28px] shadow-2xl border border-white/80 overflow-hidden flex flex-col md:flex-row">
        {/* LEFT SIDEBAR */}
        <aside className="w-full md:w-64 shrink-0 bg-[#F3F1FA] border-b md:border-b-0 md:border-r border-[#E6E2F4] flex flex-col justify-between p-4 sm:p-5">
          <div className="space-y-5">
            {/* Brand Lockup: Purple Leaf + PostureGuard AI */}
            <div className="flex items-center gap-3 px-1 pt-0.5">
              <div className="w-10 h-10 rounded-2xl bg-[#E5E0FA] flex items-center justify-center text-[#5B4FE9] shrink-0 shadow-xs">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
                </svg>
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-tight text-[#1E1B3A] leading-tight">
                  PostureGuard AI
                </h1>
                <p className="text-xs text-[#736E8C] font-medium">Sit Better. Do More.</p>
              </div>
            </div>

            {/* Primary Sidebar Navigation */}
            <nav aria-label="Main Navigation" className="space-y-1">
              {navItems.map(item => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-[#E4DFFA] text-[#1E1B3A] shadow-2xs'
                        : 'text-[#4A4665] hover:bg-[#EAE6F7] hover:text-[#1E1B3A]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#5B4FE9]" />
                    )}
                    <span className={isActive ? 'text-[#5B4FE9]' : 'text-[#6E6A86]'}>
                      {item.icon}
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Lower Sidebar Wave Illustration + Inspirational Quote + Daily Goal Card */}
          <div className="hidden md:flex flex-col gap-3.5 pt-4">
            {/* Soft Lavender Layered Wave Graphic */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#F3F1FA] to-[#E6E1FA] pt-2">
              <svg
                viewBox="0 0 240 110"
                className="w-full h-20 block"
                preserveAspectRatio="none"
              >
                <path
                  d="M0,45 C65,10 135,85 240,25 L240,110 L0,110 Z"
                  fill="#9E94F9"
                  fillOpacity="0.35"
                />
                <path
                  d="M0,65 C80,95 150,20 240,55 L240,110 L0,110 Z"
                  fill="#6C5CE7"
                  fillOpacity="0.45"
                />
                <path
                  d="M0,80 C95,45 170,95 240,70 L240,110 L0,110 Z"
                  fill="#5B4FE9"
                  fillOpacity="0.3"
                />
              </svg>
            </div>

            <div className="px-1">
              <p className="text-sm font-extrabold text-[#1E1B3A] leading-snug">
                Better posture
                <br />
                for a brighter you.
              </p>
              <p className="text-xs text-[#6E6A86] mt-1 leading-relaxed">
                Small changes.
                <br />
                Big progress.
              </p>
            </div>

            {/* Daily Goal Widget */}
            <button
              type="button"
              onClick={() => setActiveSection('history')}
              className="w-full bg-[#EAE5F9] hover:bg-[#E1DBF6] transition-colors rounded-2xl p-3 flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                    <circle
                      cx="20"
                      cy="20"
                      r="15"
                      fill="none"
                      stroke="#D3CCF2"
                      strokeWidth="4.5"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="15"
                      fill="none"
                      stroke="#4B3FD8"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeDasharray={94.2}
                      strokeDashoffset={47.1}
                    />
                  </svg>
                </div>
                <div>
                  <span className="text-[11px] font-medium text-[#64607D] block">
                    Daily Goal
                  </span>
                  <span className="text-xs font-extrabold text-[#1E1B3A] tabular-nums">
                    2/4 hrs
                  </span>
                </div>
              </div>
              <ArrowRight size={15} className="text-[#4A4665]" />
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9FE]">
          {/* Subtle Desktop Window Controls Bar */}
          <div className="hidden sm:flex items-center justify-end gap-4 px-6 pt-3 pb-0.5 text-[#64607D]">
            <Minus size={15} className=" opacity-70" />
            <Square size={13} className=" opacity-70" />
            <X size={16} className=" opacity-70" />
          </div>

          {/* Main Workspace Content */}
          <main className="flex-1 px-4 sm:px-6 pb-5 pt-1 overflow-y-auto">
            <LiveCameraMonitor
              activeSection={activeSection}
              onNavigate={sec => setActiveSection(sec)}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
