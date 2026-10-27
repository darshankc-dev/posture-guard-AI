import React, { useState } from 'react';
import { Terminal, Copy, Check, ShieldCheck, Cpu, PackageCheck, AlertCircle } from 'lucide-react';

export function WindowsSetupGuide() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyCommand = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const steps = [
    {
      title: '01. Setup Virtual Environment in PowerShell',
      desc: 'Isolates Python dependencies for clean development and PyInstaller packaging.',
      cmd: `cd PostureGuard-AI\npython -m venv .venv\n.\\.venv\\Scripts\\Activate.ps1`,
    },
    {
      title: '02. Install Required Dependencies',
      desc: 'Installs PySide6 (Qt 6), OpenCV, Google MediaPipe, NumPy, and PyInstaller.',
      cmd: `python -m pip install --upgrade pip\npip install -r requirements.txt`,
    },
    {
      title: '03. Synthesize Notification Audio Assets',
      desc: 'Generates the harmonic D5/A5 chime (assets/sounds/chime.wav) using built-in wave synthesis.',
      cmd: `python generate_assets.py`,
    },
    {
      title: '04. Run Automated Unit Tests',
      desc: 'Executes the 12 unit tests covering posture geometry, hysteresis, calibration, and SQLite storage.',
      cmd: `python tests\\run_tests.py`,
    },
    {
      title: '05. Launch Native Desktop Application',
      desc: 'Launches the native PySide6 desktop window with webcam access and live monitoring.',
      cmd: `python main.py`,
    },
    {
      title: '06. Package into Standalone Windows Executable (.exe)',
      desc: 'Compiles all dependencies and assets into a portable Windows binary (dist/PostureGuard AI.exe).',
      cmd: `.\\build_windows_exe.bat\n# Or directly via PyInstaller:\npyinstaller pyinstaller.spec --clean --noconfirm`,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#EAE6F6] p-4 rounded-2xl shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EEECFA] text-[#5B4FE9] flex items-center justify-center shrink-0">
            <Cpu size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1E1B3A]">Windows 10 &amp; 11 Ready</h4>
            <p className="text-xs text-[#6E6A86] mt-1 leading-relaxed">
              Native Qt 6 (PySide6) GUI with DirectShow camera pipeline for instant webcam wake-up.
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#EAE6F6] p-4 rounded-2xl shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1E1B3A]">100% On-Device Compute</h4>
            <p className="text-xs text-[#6E6A86] mt-1 leading-relaxed">
              Zero cloud dependencies. No external API key or network requests required.
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#EAE6F6] p-4 rounded-2xl shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EEECFA] text-[#5B4FE9] flex items-center justify-center shrink-0">
            <PackageCheck size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1E1B3A]">PyInstaller Bundling</h4>
            <p className="text-xs text-[#6E6A86] mt-1 leading-relaxed">
              Includes custom spec file and 1-click batch build script for distributable .exe creation.
            </p>
          </div>
        </div>
      </div>

      {/* Step by Step Commands */}
      <div className="bg-white border border-[#EAE6F6] rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-bold text-[#1E1B3A] flex items-center gap-2">
            <Terminal className="text-[#5B4FE9]" size={18} /> Windows PowerShell Setup &amp; Build Guide
          </h3>
          <p className="text-xs text-[#6E6A86] mt-1">
            Follow these commands in Windows PowerShell to install, test, and package PostureGuard AI on your laptop.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((step, idx) => (
            <div key={idx} className="bg-[#FAF9FE] border border-[#EAE6F6] rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-[#1E1B3A]">{step.title}</h4>
                  <p className="text-[11px] text-[#6E6A86] mt-0.5">{step.desc}</p>
                </div>

                <button
                  onClick={() => copyCommand(step.cmd, idx)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#5B4FE9] bg-[#EEECFA] hover:bg-[#E2DDF8] font-semibold px-2.5 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  {copiedIndex === idx ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-[#1E1B3A] p-3 rounded-lg font-mono text-xs text-[#DCD8F8] whitespace-pre overflow-x-auto">
                {step.cmd}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Troubleshooting Matrix */}
      <div className="bg-white border border-[#EAE6F6] rounded-2xl p-6 shadow-sm">
        <h4 className="text-sm font-bold text-[#1E1B3A] mb-3 flex items-center gap-2">
          <AlertCircle className="text-amber-500" size={16} /> Windows Camera &amp; Environment Troubleshooting
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EAE6F6] text-[#6E6A86] font-semibold">
                <th className="py-2.5 px-3">Scenario</th>
                <th className="py-2.5 px-3">Root Cause</th>
                <th className="py-2.5 px-3">Recommended Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EEFA] text-[#3F3B5C]">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#1E1B3A]">Phone Link / Virtual Camera Opens</td>
                <td className="py-2.5 px-3 text-[#6E6A86]">Windows registers Samsung / Phone Link as camera device #0.</td>
                <td className="py-2.5 px-3 text-[#5B4FE9] font-medium">PostureGuard AI automatically skips virtual cameras, or use the camera selector.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#1E1B3A]">Camera In Use Error</td>
                <td className="py-2.5 px-3 text-[#6E6A86]">Another app (Zoom, Teams) holds an exclusive hardware lock.</td>
                <td className="py-2.5 px-3 text-[#5B4FE9] font-medium">Close other video software and click Retry Camera.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-[#1E1B3A]">PowerShell Execution Policy</td>
                <td className="py-2.5 px-3 text-[#6E6A86]">Default Windows policy blocks venv script activation.</td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-[#5B4FE9]">Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
