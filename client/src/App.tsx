export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-2xl font-bold tracking-tight text-white">FlowSuite</h1>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          Day 1 Foundation established. React + Vite + TypeScript + Tailwind CSS client initialized.
        </p>
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>Client Framework:</span>
            <span className="text-sky-400">React 18 + Vite</span>
          </div>
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>Styling:</span>
            <span className="text-sky-400">Tailwind CSS</span>
          </div>
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>Status:</span>
            <span className="text-emerald-400">Ready for development</span>
          </div>
        </div>
      </div>
    </div>
  );
}
