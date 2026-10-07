import React from 'react';

export const PlaceholderModule: React.FC<{ title: string; description: string }> = ({
  title,
  description,
}) => {
  return (
    <div className="space-y-6 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-sky-500" />
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
        </div>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">{description}</p>

        <div className="border-t border-slate-800 pt-6">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>Backend API Integration:</span>
            <span className="text-emerald-400 font-semibold">Ready & Enforced</span>
          </div>
        </div>
      </div>
    </div>
  );
};
