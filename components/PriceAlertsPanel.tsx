import React, { useState } from 'react';
import { 
  Bell, 
  BellRing, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  TrendingDown, 
  TrendingUp, 
  X,
  ShieldAlert,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { PriceAlert, AlertBreachStats } from '../types';

interface PriceAlertsPanelProps {
  alerts: PriceAlert[];
  breachStats: Record<string, AlertBreachStats>;
  spotPrice: number;
  onAddAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt'>) => void;
  onToggleAlert: (id: string) => void;
  onDeleteAlert: (id: string) => void;
}

const COLOR_OPTIONS = [
  { name: 'Amber Warning', hex: '#f59e0b' },
  { name: 'Crimson Stop', hex: '#ef4444' },
  { name: 'Neon Emerald', hex: '#10b981' },
  { name: 'Cyan Breakout', hex: '#06b6d4' },
  { name: 'Violet Alpha', hex: '#8b5cf6' },
];

export const PriceAlertsPanel: React.FC<PriceAlertsPanelProps> = ({
  alerts,
  breachStats,
  spotPrice,
  onAddAlert,
  onToggleAlert,
  onDeleteAlert,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [priceInput, setPriceInput] = useState<string>('4000');
  const [labelInput, setLabelInput] = useState<string>('Support Floor');
  const [directionInput, setDirectionInput] = useState<'below' | 'above' | 'either'>('below');
  const [colorInput, setColorInput] = useState<string>('#f59e0b');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const numPrice = parseFloat(priceInput);
    if (isNaN(numPrice) || numPrice <= 0) return;

    onAddAlert({
      price: numPrice,
      label: labelInput.trim() || `Threshold $${numPrice}`,
      direction: directionInput,
      color: colorInput,
      active: true,
    });

    // Reset with smart defaults
    setPriceInput(Math.round(spotPrice).toString());
    setLabelInput('');
  };

  const handleApplyPreset = (price: number, label: string, dir: 'below' | 'above' | 'either', col: string) => {
    onAddAlert({
      price,
      label,
      direction: dir,
      color: col,
      active: true,
    });
  };

  const activeAlertsCount = alerts.filter(a => a.active).length;
  const totalBreachedCount = alerts.filter(a => a.active && breachStats[a.id]?.breachedCount > 0).length;

  return (
    <div className="bg-[#050505] border border-white/15 p-6 relative flex flex-col gap-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BellRing className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400 font-bold">
              Trajectory Risk Monitoring
            </span>
          </div>
          <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-3">
            Custom Price Alert Thresholds
            <span className="text-xs font-mono font-normal text-zinc-500">
              ({activeAlertsCount} Active · {totalBreachedCount} Triggered by Ensemble)
            </span>
          </h3>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/30 text-zinc-300 hover:text-white px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer self-start sm:self-auto"
        >
          <Sliders className="w-3 h-3 text-amber-400" />
          <span>{isOpen ? 'Close Configurator' : '+ Add / Configure Alert'}</span>
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Quick Institutional Presets */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
        <span className="text-zinc-500 uppercase text-[9px] mr-1">Quick Presets:</span>
        <button
          onClick={() => handleApplyPreset(4000, 'Crucial $4,000 Support', 'below', '#f59e0b')}
          className="bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 px-2.5 py-1 transition-all cursor-pointer"
        >
          $4,000 Support Floor
        </button>
        <button
          onClick={() => handleApplyPreset(3500, 'P5 Bear Stress ($3.5K)', 'below', '#ef4444')}
          className="bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-zinc-300 hover:text-red-300 px-2.5 py-1 transition-all cursor-pointer"
        >
          $3,500 Tail-Risk Stress
        </button>
        <button
          onClick={() => handleApplyPreset(4500, 'Median Target Breakout', 'above', '#10b981')}
          className="bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-300 px-2.5 py-1 transition-all cursor-pointer"
        >
          $4,500 Median Target
        </button>
        <button
          onClick={() => handleApplyPreset(5000, '$5,000 Major Psychological', 'above', '#06b6d4')}
          className="bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/40 text-zinc-300 hover:text-cyan-300 px-2.5 py-1 transition-all cursor-pointer"
        >
          $5,000 Milestone
        </button>
      </div>

      {/* Configurator Form (Drawer/Collapsible) */}
      {isOpen && (
        <form onSubmit={handleCreate} className="bg-white/[0.02] border border-white/10 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[11px]">
            {/* Price Input */}
            <div className="space-y-1.5">
              <label className="text-zinc-400 uppercase text-[9px] block">Threshold Price (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-zinc-500">$</span>
                <input
                  type="number"
                  step="1"
                  min="1000"
                  max="15000"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full bg-black border border-white/20 pl-7 pr-3 py-2 text-white font-bold focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. 4000"
                  required
                />
              </div>
            </div>

            {/* Label Input */}
            <div className="space-y-1.5">
              <label className="text-zinc-400 uppercase text-[9px] block">Alert Name / Tag</label>
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                className="w-full bg-black border border-white/20 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                placeholder="e.g. Margin Stop Line"
              />
            </div>

            {/* Direction */}
            <div className="space-y-1.5">
              <label className="text-zinc-400 uppercase text-[9px] block">Crossing Direction</label>
              <select
                value={directionInput}
                onChange={(e) => setDirectionInput(e.target.value as any)}
                className="w-full bg-black border border-white/20 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="below">Cross Below (Downside Breach)</option>
                <option value="above">Cross Above (Upside Breakout)</option>
                <option value="either">Touch Either Direction</option>
              </select>
            </div>

            {/* Color Accent */}
            <div className="space-y-1.5">
              <label className="text-zinc-400 uppercase text-[9px] block">Highlight Color</label>
              <div className="flex items-center gap-2 pt-1.5">
                {COLOR_OPTIONS.map((col) => (
                  <button
                    key={col.hex}
                    type="button"
                    onClick={() => setColorInput(col.hex)}
                    style={{ backgroundColor: col.hex }}
                    className={`w-6 h-6 transition-transform cursor-pointer ${
                      colorInput === col.hex ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                    }`}
                    title={col.name}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-6 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.2)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Threshold Line</span>
            </button>
          </div>
        </form>
      )}

      {/* Active Thresholds List */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="bg-white/[0.01] border border-white/5 p-6 text-center font-mono text-[11px] text-zinc-500">
            No price alerts configured. Click "+ Add / Configure Alert" or select a Quick Preset above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((alert) => {
              const stat = breachStats[alert.id];
              const isBreached = stat && stat.breachedCount > 0;
              const breachPct = stat ? stat.breachProbability : 0;
              const isDanger = breachPct > 50 && alert.direction === 'below';

              return (
                <div
                  key={alert.id}
                  className={`border transition-all p-4 relative ${
                    alert.active
                      ? isBreached
                        ? 'bg-white/[0.03] border-white/20'
                        : 'bg-black border-white/10'
                      : 'opacity-40 bg-black/40 border-white/5'
                  }`}
                >
                  {/* Left Color Indicator Stripe */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: alert.color }}
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: alert.color }}
                      >
                        {isBreached && alert.active && (
                          <span className="w-1.5 h-1.5 bg-black rounded-full animate-ping" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-black text-white">
                            ${alert.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-white/5 text-zinc-400 border border-white/10">
                            {alert.direction === 'below' ? 'Downside' : alert.direction === 'above' ? 'Upside' : 'Touch'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 font-medium">{alert.label}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onToggleAlert(alert.id)}
                        className={`px-2 py-1 font-mono text-[9px] uppercase tracking-wider cursor-pointer border transition-all ${
                          alert.active
                            ? 'bg-green-500/20 text-green-300 border-green-500/40'
                            : 'bg-white/5 text-zinc-500 border-white/10 hover:text-white'
                        }`}
                        title={alert.active ? 'Disable Alert' : 'Enable Alert'}
                      >
                        {alert.active ? 'Active' : 'Muted'}
                      </button>
                      <button
                        onClick={() => onDeleteAlert(alert.id)}
                        className="p-1 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                        title="Delete Alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quantitative Breach Probability HUD */}
                  {alert.active && stat && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                      <div className="flex justify-between items-center font-mono text-[10px]">
                        <span className="text-zinc-500 uppercase flex items-center gap-1">
                          {isBreached ? (
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                          )}
                          Ensemble Breach Probability:
                        </span>
                        <span
                          className={`font-black ${
                            isDanger
                              ? 'text-red-400'
                              : breachPct > 20
                              ? 'text-amber-400'
                              : 'text-green-400'
                          }`}
                        >
                          {breachPct.toFixed(1)}% ({stat.breachedCount.toLocaleString()} / {stat.totalPaths.toLocaleString()} paths)
                        </span>
                      </div>

                      {/* Probability Meter Bar */}
                      <div className="w-full h-1.5 bg-white/5 overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(0, breachPct))}%`,
                            backgroundColor: alert.color
                          }}
                        />
                      </div>

                      <div className="flex justify-between items-center font-mono text-[9px] text-zinc-500">
                        <span>
                          {stat.earliestBreachDay !== null
                            ? `First breach: T+${stat.earliestBreachDay} trading days`
                            : 'Zero path breaches'}
                        </span>
                        <span>
                          {stat.medianCrossed
                            ? 'Median trajectory crosses line'
                            : 'Median trajectory stays clear'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
