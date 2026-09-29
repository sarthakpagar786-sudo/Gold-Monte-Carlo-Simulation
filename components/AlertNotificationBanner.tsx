import React, { useState } from 'react';
import { AlertTriangle, Bell, ChevronRight, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { PriceAlert, AlertBreachStats } from '../types';

interface AlertNotificationBannerProps {
  alerts: PriceAlert[];
  breachStats: Record<string, AlertBreachStats>;
  onDismissAlert?: (id: string) => void;
}

export const AlertNotificationBanner: React.FC<AlertNotificationBannerProps> = ({
  alerts,
  breachStats,
}) => {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Filter alerts that are active, breached, and not dismissed
  const triggeredAlerts = alerts.filter(
    (a) => a.active && breachStats[a.id]?.breachedCount > 0 && !dismissedIds.includes(a.id)
  );

  if (triggeredAlerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4 animate-fade-in">
      {triggeredAlerts.map((alert) => {
        const stat = breachStats[alert.id];
        const isCritical = stat.breachProbability > 50 && alert.direction === 'below';

        return (
          <div
            key={alert.id}
            className={`border px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-[11px] transition-all relative overflow-hidden ${
              isCritical
                ? 'bg-red-500/10 border-red-500/40 text-red-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
            }`}
          >
            {/* Visual Pulse Accent Line */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: alert.color }}
            />

            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <span
                  className="w-2.5 h-2.5 rounded-full block"
                  style={{ backgroundColor: alert.color }}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full absolute inset-0 animate-ping opacity-75"
                  style={{ backgroundColor: alert.color }}
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black uppercase tracking-wider text-[10px] text-white">
                    PRICE THRESHOLD BREACH: ${alert.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 bg-black/40 border border-white/10 text-zinc-300">
                    {alert.label}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-300 mt-0.5">
                  <span className="font-bold text-white">{stat.breachProbability.toFixed(1)}%</span> of stochastic paths ({stat.breachedCount.toLocaleString()} / {stat.totalPaths.toLocaleString()}) cross this level.{' '}
                  {stat.earliestBreachDay !== null && (
                    <span className="text-zinc-400">Earliest breach at <strong className="text-white">T+{stat.earliestBreachDay}</strong> trading days.</span>
                  )}
                  {stat.medianCrossed && (
                    <span className="ml-1 text-amber-200 underline decoration-amber-500/50">Expected median path crosses line.</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
              <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 bg-black/60 border border-white/15 text-white font-bold">
                {stat.breachProbability >= 80 ? 'HIGH PROBABILITY' : 'TAIL BREACH'}
              </span>
              <button
                onClick={() => setDismissedIds((prev) => [...prev, alert.id])}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                title="Dismiss Notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
