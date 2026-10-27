import React, { useState } from 'react';
import { DESKTOP_FILES, DesktopFile } from '../data/desktopFiles';
import { FileCode, Folder, Download, Copy, Check } from 'lucide-react';
import JSZip from 'jszip';

export function DesktopProjectExplorer() {
  const [selectedFile, setSelectedFile] = useState<DesktopFile>(DESKTOP_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Files (18)' },
    { id: 'core', label: 'Core & State' },
    { id: 'cv', label: 'Vision & Engine' },
    { id: 'gui', label: 'PySide6 GUI' },
    { id: 'tests', label: 'Unit Tests' },
    { id: 'config', label: 'Packaging' },
  ];

  const filteredFiles =
    filterCategory === 'all'
      ? DESKTOP_FILES
      : DESKTOP_FILES.filter(f => f.category === filterCategory);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('PostureGuard-AI');

      DESKTOP_FILES.forEach(file => {
        folder?.file(file.path, file.content);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'PostureGuard-AI.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate zip:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-white border border-[#EAE6F6] rounded-2xl shadow-sm overflow-hidden flex flex-col h-[700px]">
      {/* Top Header & Actions */}
      <div className="bg-[#F6F4FC] border-b border-[#EAE6F6] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1E1B3A] flex items-center gap-2">
            <Folder className="text-[#5B4FE9]" size={16} /> PostureGuard-AI — Native Windows Python Repository (18 Files)
          </h3>
          <p className="text-xs text-[#6E6A86] mt-0.5">
            Complete Windows desktop codebase with PySide6, OpenCV, MediaPipe, SQLite, and PyInstaller bundling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadZip}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 bg-[#5B4FE9] hover:bg-[#4B3FD8] text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download size={14} className={isDownloading ? 'animate-bounce' : ''} />
            {isDownloading ? 'Packaging .ZIP...' : 'Download PostureGuard-AI.zip'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-[#FAF9FE] border-b border-[#EAE6F6] px-4 py-2 flex items-center gap-1.5 overflow-x-auto text-xs">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filterCategory === cat.id
                ? 'bg-[#E8E4FA] text-[#5B4FE9]'
                : 'text-[#6E6A86] hover:text-[#1E1B3A] hover:bg-[#F3F1FA]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main Split: Left Tree, Right Editor */}
      <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
        {/* Left File List (4 cols) */}
        <div className="md:col-span-4 border-r border-[#EAE6F6] bg-[#FAF9FE] overflow-y-auto p-2.5 space-y-1">
          {filteredFiles.map(file => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file)}
              className={`w-full text-left p-2.5 rounded-xl flex items-start gap-2.5 transition-all text-xs cursor-pointer ${
                selectedFile.path === file.path
                  ? 'bg-[#E8E4FA] text-[#1E1B3A] font-semibold'
                  : 'text-[#4A4665] hover:bg-[#F1EEFA]'
              }`}
            >
              <FileCode
                size={15}
                className={`mt-0.5 shrink-0 ${
                  selectedFile.path === file.path ? 'text-[#5B4FE9]' : 'text-[#8C87A6]'
                }`}
              />
              <div className="overflow-hidden">
                <span className="font-mono font-medium block truncate">{file.path}</span>
                <span className="text-[11px] text-[#736E8C] line-clamp-1 mt-0.5 font-normal">
                  {file.description}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Right Code Display (8 cols) */}
        <div className="md:col-span-8 flex flex-col bg-[#1A1829] overflow-hidden">
          {/* File Header Bar */}
          <div className="bg-[#232038] border-b border-[#322E4D] px-4 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="font-mono text-white font-semibold truncate">
                {selectedFile.path}
              </span>
              <span className="text-[11px] text-[#A59Online] text-[#B4B0CC]">
                · {selectedFile.language}
              </span>
            </div>

            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs text-white bg-[#5B4FE9] hover:bg-[#4B3FD8] px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
          </div>

          {/* Code Viewer */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-[#E6E3F5] leading-relaxed">
            <pre className="whitespace-pre">{selectedFile.content}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
