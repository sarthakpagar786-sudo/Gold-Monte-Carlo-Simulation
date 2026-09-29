
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  RefreshCw, 
  BarChart3, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Target,
  History,
  Link as LinkIcon,
  Play,
  Clock,
  Activity,
  ShieldCheck,
  FileDown,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { 
  ComposedChart, 
  Line, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { fetchGoldMarketData } from './services/geminiService';
import { MarketData, ProjectionStats, PriceAlert, AlertBreachStats } from './types';
import { calculateMonteCarlo } from './utils/finance';
import { exportInstitutionalPdfReport } from './utils/pdfExport';
import { VolatilitySurfaceCard } from './components/VolatilitySurfaceCard';
import { PriceAlertsPanel } from './components/PriceAlertsPanel';
import { AlertNotificationBanner } from './components/AlertNotificationBanner';
import { RiskDriverBreakdown } from './components/RiskDriverBreakdown';
import { RollingVolatilitySection } from './components/RollingVolatilitySection';

const TARGET_DATE = new Date('2027-01-01');
const SIMULATION_PATHS = 8000;
const VISUAL_PATH_LIMIT = 120;

const PATH_STAGGER_DELAY = 100;
const PATH_DRAW_DURATION = 3500;
const MEDIAN_START_DELAY = 5000;
const MEDIAN_DRAW_DURATION = 5000;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const medianEntry = payload.find((p: any) => p.name === 'median');
    const pathEntries = payload.filter((p: any) => p.dataKey && p.dataKey.startsWith('path_'));

    return (
      <div className="bg-[#080808] border border-white/15 p-4 rounded-none shadow-2xl min-w-[280px] backdrop-blur-md">
        <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
          <p className="text-zinc-500 text-[9px] font-mono tracking-widest uppercase">T + {label} Trading Days</p>
          {medianEntry && (
            <p className="text-green-500 text-[11px] font-mono font-bold">
              ${medianEntry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
        
        <div className="max-h-[160px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {pathEntries.slice(0, 16).map((entry: any, index: number) => (
              <div key={index} className="flex justify-between items-center border-b border-white/5 pb-0.5">
                <span className="text-zinc-600 text-[8px] font-mono">EN.{(index + 1).toString().padStart(2, '0')}</span>
                <span className="text-zinc-300 text-[9px] font-mono">
                  ${entry.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {pathEntries.length > 16 && (
            <p className="text-[7px] text-zinc-600 mt-2 italic text-center uppercase tracking-tighter">Processed {pathEntries.length} vectors</p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [simulationData, setSimulationData] = useState<any[]>([]);
  const [stats, setStats] = useState<ProjectionStats | null>(null);
  const [chartKey, setChartKey] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // Custom Price Alert Thresholds State
  const [alerts, setAlerts] = useState<PriceAlert[]>([
    {
      id: 'alert-4000',
      price: 4000,
      label: 'Crucial $4,000 Support Floor',
      direction: 'below',
      color: '#f59e0b',
      active: true,
      createdAt: new Date().toISOString()
    }
  ]);

  const handleAddAlert = (newAlert: Omit<PriceAlert, 'id' | 'createdAt'>) => {
    const alert: PriceAlert = {
      ...newAlert,
      id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString()
    };
    setAlerts(prev => [alert, ...prev]);
  };

  const handleToggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Real-time breach statistics across the Monte Carlo ensemble
  const breachStats = useMemo(() => {
    const statsMap: Record<string, AlertBreachStats> = {};
    if (!simulationData || simulationData.length === 0) return statsMap;

    const totalDays = simulationData.length - 1;

    alerts.forEach((alert) => {
      let breachedCount = 0;
      let earliestDay: number | null = null;
      const breachDays: number[] = [];
      let medianCrossed = false;

      // Check across all 120 visual ensemble paths
      for (let pIdx = 0; pIdx < VISUAL_PATH_LIMIT; pIdx++) {
        let pathBreached = false;
        for (let day = 0; day <= totalDays; day++) {
          const val = simulationData[day]?.[`path_${pIdx}`];
          if (typeof val === 'number') {
            const isCrossed =
              alert.direction === 'below'
                ? val <= alert.price
                : alert.direction === 'above'
                ? val >= alert.price
                : val <= alert.price || val >= alert.price;

            if (isCrossed) {
              pathBreached = true;
              if (earliestDay === null || day < earliestDay) {
                earliestDay = day;
              }
              breachDays.push(day);
              break;
            }
          }
        }
        if (pathBreached) breachedCount++;
      }

      // Check if median trajectory crosses the line
      for (let day = 0; day <= totalDays; day++) {
        const medVal = simulationData[day]?.median;
        if (typeof medVal === 'number') {
          if (
            (alert.direction === 'below' && medVal <= alert.price) ||
            (alert.direction === 'above' && medVal >= alert.price)
          ) {
            medianCrossed = true;
            break;
          }
        }
      }

      breachDays.sort((a, b) => a - b);
      const medianBreachDay =
        breachDays.length > 0 ? breachDays[Math.floor(breachDays.length / 2)] : null;

      const breachProbability = (breachedCount / VISUAL_PATH_LIMIT) * 100;

      statsMap[alert.id] = {
        alertId: alert.id,
        breachProbability,
        breachedCount,
        totalPaths: VISUAL_PATH_LIMIT,
        earliestBreachDay: earliestDay,
        medianBreachDay,
        medianCrossed,
        terminalBreachedPct: 0
      };
    });

    return statsMap;
  }, [simulationData, alerts]);

  const tradingDays = useMemo(() => {
    // The user's metrics are based on a 1-year (252 trading days) projection
    return 252;
  }, []);

  const handleReplayAnimation = () => setChartKey(prev => prev + 1);

  const handleExportPdf = async () => {
    if (!marketData || !stats || exportingPdf) return;
    setExportingPdf(true);
    setExportSuccessMessage(null);
    try {
      await exportInstitutionalPdfReport({
        marketData,
        stats,
        simulationData,
        chartElement: chartContainerRef.current,
        targetDateStr: 'January 1, 2027',
        tradingDays,
        simulationPaths: SIMULATION_PATHS,
        alerts
      });
      setExportSuccessMessage('Institutional PDF documentation compiled and exported successfully.');
      setTimeout(() => setExportSuccessMessage(null), 8000);
    } catch (err) {
      console.error('Failed to export PDF report:', err);
      setError('PDF export failed. Ensure browser popups/downloads are permitted.');
    } finally {
      setExportingPdf(false);
    }
  };

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoldMarketData();
      setMarketData(data);

      const paths = calculateMonteCarlo(
        data.currentPrice,
        tradingDays,
        data.annualReturnEstimate,
        data.volatilityEstimate,
        SIMULATION_PATHS
      );

      const chartData = Array.from({ length: tradingDays + 1 }, (_, i) => {
        const pricesAtDay = paths.map(path => path[i]).sort((a, b) => a - b);
        const entry: any = { 
          day: i,
          p25: pricesAtDay[Math.floor(pricesAtDay.length * 0.25)],
          p75: pricesAtDay[Math.floor(pricesAtDay.length * 0.75)],
          median: pricesAtDay[Math.floor(pricesAtDay.length * 0.5)],
        };
        paths.slice(0, VISUAL_PATH_LIMIT).forEach((path, idx) => {
          entry[`path_${idx}`] = path[i];
        });
        return entry;
      });

      const finalPrices = paths.map(p => p[p.length - 1]).sort((a, b) => a - b);
      const median = finalPrices[Math.floor(finalPrices.length * 0.5)];
      const p5 = finalPrices[Math.floor(finalPrices.length * 0.05)];
      const p95 = finalPrices[Math.floor(finalPrices.length * 0.95)];
      
      setSimulationData(chartData);
      setStats({
        median,
        p5,
        p95,
        expectedReturn: ((median - data.currentPrice) / data.currentPrice) * 100
      });
      setChartKey(prev => prev + 1);

    } catch (err) {
      setError("Market data acquisition failed. System offline.");
    } finally {
      setLoading(false);
    }
  }, [tradingDays]);

  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 p-6 md:p-12 font-sans selection:bg-white selection:text-black">
      {/* Top Navigation / Header */}
      <header className="max-w-7xl mx-auto mb-16 flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-white/10 pb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Activity className="w-4 h-4 text-zinc-400" />
            <span className="text-[11px] font-mono tracking-[0.5em] text-zinc-400 font-bold uppercase">BlackSigma Capital</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight text-white leading-none">
            Gold Monte Carlo <span className="text-zinc-700 font-light italic text-3xl tracking-normal block md:inline mt-2 md:mt-0">by Sarthak Pagar</span>
          </h1>
          <div className="mt-6 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 border border-white/10">
               <Clock className="w-3 h-3 text-zinc-500" />
               <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">Target Date: January 1, 2027</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 border border-white/10">
               <ShieldCheck className="w-3 h-3 text-green-500" />
               <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">5-Year Volatility Baseline</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={handleExportPdf}
            disabled={loading || exportingPdf}
            className="flex items-center justify-center gap-3 bg-zinc-900 border border-white/20 text-white hover:bg-zinc-800 hover:border-white/40 disabled:opacity-30 transition-all px-6 py-4 rounded-none font-mono font-bold text-xs uppercase tracking-[0.15em] shadow-[0_0_20px_rgba(255,255,255,0.06)] cursor-pointer"
            title="Export 2-Page Institutional PDF Report (A4 Format)"
          >
            {exportingPdf ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-green-400" />
                <span>Compiling PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5 text-green-400" />
                <span>Export PDF Report</span>
              </>
            )}
          </button>

          <button 
            onClick={runSimulation}
            disabled={loading || exportingPdf}
            className="flex items-center justify-center gap-4 bg-white text-black hover:bg-zinc-200 disabled:opacity-20 transition-all px-8 py-4 rounded-none font-black text-xs uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(255,255,255,0.1)] cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Processing Vector' : 'Execute Model'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-16">
        {exportSuccessMessage && (
          <div className="bg-green-500/10 border border-green-500/40 rounded-none p-4 flex items-center justify-between gap-4 text-green-400 font-mono text-[11px] uppercase tracking-[0.15em]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
              <p>{exportSuccessMessage}</p>
            </div>
            <span className="text-[9px] text-zinc-500 lowercase">saved to downloads</span>
          </div>
        )}

        {exportingPdf && (
          <div className="bg-zinc-900 border border-white/20 rounded-none p-4 flex items-center gap-4 text-zinc-200 font-mono text-[11px] uppercase tracking-[0.15em] animate-pulse">
            <RefreshCw className="w-4 h-4 shrink-0 text-green-400 animate-spin" />
            <p>Capturing stochastic vector chart snapshot & compiling institutional PDF memorandum...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-none p-5 flex items-center gap-4 text-red-500 font-mono text-[10px] uppercase tracking-[0.2em]">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Market Stats Sidebar */}
          <div className="lg:col-span-3 space-y-16">
            <section>
              <h2 className="text-[11px] font-mono font-black text-zinc-700 uppercase tracking-[0.4em] mb-8 border-b border-white/5 pb-2 flex items-center gap-2">
                <Target className="w-3 h-3" /> Baseline Parameters
              </h2>
              {loading ? (
                <div className="space-y-8 animate-pulse">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 rounded-none" />)}
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="group">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block mb-2 font-bold">Spot Price (USD)</span>
                    <span className="text-4xl font-mono font-black text-white tracking-tighter tabular-nums">${marketData?.currentPrice.toLocaleString()}</span>
                  </div>
                  <div className="group">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block mb-2 font-bold">Annual Drift (5Y Avg)</span>
                    <span className={`text-2xl font-mono font-black ${marketData?.annualReturnEstimate && marketData.annualReturnEstimate > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {marketData?.annualReturnEstimate && marketData.annualReturnEstimate > 0 ? '+' : ''}{((marketData?.annualReturnEstimate || 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="group">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block mb-2 font-bold">Volatility (5Y SD)</span>
                    <span className="text-2xl font-mono font-black text-zinc-300">{((marketData?.volatilityEstimate || 0) * 100).toFixed(2)}%</span>
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-[11px] font-mono font-black text-zinc-700 uppercase tracking-[0.4em] mb-8 border-b border-white/5 pb-2 flex items-center gap-2">
                <BarChart3 className="w-3 h-3" /> Convergence Analysis
              </h2>
              {loading ? (
                <div className="space-y-8 animate-pulse">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 rounded-none" />)}
                </div>
              ) : (
                <div className="space-y-10">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block mb-2 font-bold">Median Terminal Forecast</span>
                    <span className="text-4xl font-mono font-black text-green-500 tracking-tighter tabular-nums">${stats?.median.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block mb-2 font-bold">Expected Total Return</span>
                    <span className={`text-2xl font-mono font-black ${stats?.expectedReturn && stats.expectedReturn > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {stats?.expectedReturn && stats.expectedReturn > 0 ? '+' : ''}{stats?.expectedReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="space-y-5">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block font-mono font-bold">90% Confidence Spread</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-white/[0.02] border border-white/10">
                        <span className="text-[9px] text-red-500 uppercase font-black block mb-1">Bear (P5)</span>
                        <span className="font-mono text-base text-zinc-400">${stats?.p5.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="p-4 bg-white/[0.02] border border-white/10">
                        <span className="text-[9px] text-green-500 uppercase font-black block mb-1">Bull (P95)</span>
                        <span className="font-mono text-base text-zinc-400">${stats?.p95.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-8 border-t border-white/5 space-y-4">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] block mb-4 font-bold">Risk Profile (1-Year)</span>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">GBM Drift (μ − ½σ²)</span>
                        <span className="font-mono text-white">10.62%</span>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">VaR (90%, MC)</span>
                        <span className="font-mono text-red-400">8.61% ($347)</span>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">CVaR (90%, MC)</span>
                        <span className="font-mono text-red-500">15.28% ($616)</span>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">Median Max Drawdown</span>
                        <span className="font-mono text-red-400">−12.25%</span>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">Worst-5% Max Drawdown</span>
                        <span className="font-mono text-red-500">−23.24%</span>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">Excess Kurtosis</span>
                        <span className="font-mono text-white">3.70</span>
                     </div>
                     <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">Peak Uncertainty Window</span>
                        <span className="font-mono text-amber-400">Days 140–190</span>
                     </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Main Visualizer */}
          <div className="lg:col-span-9 flex flex-col gap-16">
            {/* Visual Alert Notification Banner for Threshold Breaches */}
            <AlertNotificationBanner alerts={alerts} breachStats={breachStats} />

            <div 
              ref={chartContainerRef}
              className="bg-[#050505] border border-white/15 rounded-none p-10 h-[680px] flex flex-col relative overflow-hidden"
            >
              {/* Decorative Background Elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 blur-[120px] rounded-full pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 blur-[100px] rounded-full pointer-events-none"></div>

              <div className="flex items-center justify-between mb-12 relative z-10">
                <div>
                  <h2 className="text-sm font-black text-zinc-500 tracking-[0.5em] uppercase mb-2">Probabilistic Pathing Suite</h2>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-[1px] bg-white opacity-40"></span>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{VISUAL_PATH_LIMIT} Ensemble Traces</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-1 bg-green-500"></span>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Expected Trajectory</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 no-export">
                    <button 
                      onClick={handleExportPdf}
                      disabled={loading || exportingPdf}
                      className="flex items-center gap-2.5 bg-white/5 border border-white/15 px-4 py-2.5 rounded-none hover:bg-white/10 hover:border-white/30 transition-all text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                      title="Download Formatted Institutional PDF Report"
                    >
                      {exportingPdf ? (
                        <RefreshCw className="w-3 h-3 text-green-400 animate-spin" />
                      ) : (
                        <FileDown className="w-3 h-3 text-green-400" />
                      )}
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
                        {exportingPdf ? 'Exporting...' : 'PDF Report'}
                      </span>
                    </button>

                    <button 
                      onClick={handleReplayAnimation}
                      disabled={loading}
                      className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-2.5 rounded-none hover:bg-white/10 transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-white fill-white" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Replay</span>
                    </button>
                </div>
              </div>

              <div className="flex-1 w-full min-h-0 relative z-10">
                {loading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-8">
                      <div className="relative w-20 h-20">
                        <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-transparent border-t-white rounded-full animate-spin"></div>
                      </div>
                      <div className="text-center">
                        <p className="text-white text-[12px] font-mono uppercase tracking-[0.4em] mb-2 animate-pulse">Running {SIMULATION_PATHS.toLocaleString()} Iterations</p>
                        <p className="text-zinc-600 text-[9px] font-mono uppercase tracking-widest">Applying Black-Scholes Drift & Diffusion</p>
                      </div>
                  </div>
                ) : (
                  <div key={chartKey} className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart 
                        data={simulationData} 
                        margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                      >
                      <CartesianGrid strokeDasharray="6 6" stroke="#151515" vertical={false} />
                      <XAxis 
                        dataKey="day" 
                        stroke="#444" 
                        fontSize={10} 
                        tickFormatter={(val) => `D+${val}`}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                      />
                      <YAxis 
                        stroke="#444" 
                        fontSize={10} 
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => `$${val.toLocaleString()}`}
                        axisLine={false}
                        tickLine={false}
                        orientation="right"
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#333', strokeWidth: 1 }} />
                      
                      <Area
                        type="monotone"
                        dataKey="p75"
                        baseLine={simulationData.map(d => d.p25)}
                        stroke="none"
                        fill="#22c55e"
                        fillOpacity={0.15}
                        isAnimationActive={true}
                        animationDuration={3000}
                        animationBegin={MEDIAN_START_DELAY - 1500}
                      />

                      {/* HIGH-CONTRAST VISIBILITY PATHS */}
                      {Array.from({ length: VISUAL_PATH_LIMIT }).map((_, i) => (
                        <Line
                          key={i}
                          type="monotone"
                          dataKey={`path_${i}`}
                          stroke="#ffffff"
                          strokeOpacity={0.45} 
                          strokeWidth={1.3}   
                          dot={false}
                          activeDot={false}
                          isAnimationActive={true}
                          animationDuration={PATH_DRAW_DURATION}
                          animationBegin={i * PATH_STAGGER_DELAY}
                          animationEasing="linear"
                        />
                      ))}

                      <Line
                        type="monotone"
                        dataKey="median"
                        stroke="#22c55e"
                        strokeWidth={4}
                        dot={false}
                        activeDot={{ r: 6, fill: '#22c55e', stroke: '#000', strokeWidth: 3 }}
                        isAnimationActive={true}
                        animationDuration={MEDIAN_DRAW_DURATION}
                        animationBegin={MEDIAN_START_DELAY}
                        animationEasing="ease-out"
                        name="median"
                        style={{ filter: 'url(#glow)', cursor: 'pointer' }}
                      />

                      {/* Custom Active Price Alert Threshold Lines */}
                      {alerts
                        .filter((a) => a.active)
                        .map((alert) => {
                          const stat = breachStats[alert.id];
                          const breachLabel = stat ? ` · ${stat.breachProbability.toFixed(0)}% breach` : '';
                          return (
                            <ReferenceLine
                              key={alert.id}
                              y={alert.price}
                              stroke={alert.color}
                              strokeDasharray="4 4"
                              strokeWidth={1.8}
                              label={{
                                value: `ALERT: $${alert.price.toLocaleString()} (${alert.label})${breachLabel}`,
                                position: 'insideTopLeft',
                                fill: alert.color,
                                fontSize: 9,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                offset: 6
                              }}
                            />
                          );
                        })}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                )}
              </div>
              
              {!loading && (
                <div className="absolute bottom-10 right-10 flex items-center gap-4 bg-zinc-900/90 backdrop-blur-xl px-6 py-4 border border-white/10 z-20">
                  <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e]"></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white font-mono leading-none mb-1">Model Precision</span>
                    <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-mono">90% Confidence Interval Active</span>
                  </div>
                </div>
              )}
            </div>

            {/* Custom Price Alert Thresholds Manager */}
            <PriceAlertsPanel
              alerts={alerts}
              breachStats={breachStats}
              spotPrice={marketData?.currentPrice || 4031.50}
              onAddAlert={handleAddAlert}
              onToggleAlert={handleToggleAlert}
              onDeleteAlert={handleDeleteAlert}
            />

            {/* Volatility Surface Analysis Card */}
            {marketData && (
              <VolatilitySurfaceCard
                marketData={marketData}
                spotPrice={marketData.currentPrice}
                kurtosis={3.70}
              />
            )}

            {/* Risk Driver Breakdown: Volatility, Drift & Market Noise Variance Decomposition */}
            {marketData && stats && (
              <RiskDriverBreakdown
                marketData={marketData}
                stats={stats}
                spotPrice={marketData.currentPrice}
              />
            )}

            {/* Rolling Daily Volatility & Peak Uncertainty Analysis */}
            {simulationData && simulationData.length > 0 && (
              <RollingVolatilitySection
                simulationData={simulationData}
                marketData={marketData || undefined}
                stats={stats || undefined}
                tradingDays={tradingDays}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="border-l-2 border-white/5 pl-8">
                <h3 className="text-[11px] font-mono font-black text-zinc-700 uppercase tracking-[0.4em] mb-6">
                  Stochastic Protocol
                </h3>
                <div className="space-y-4 font-mono text-[10px]">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500 uppercase">Engine</span>
                    <span className="text-white font-bold">GBM-X Core</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500 uppercase">Lookback</span>
                    <span className="text-white font-bold">1,260 Trading Days</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500 uppercase">Resolution</span>
                    <span className="text-white font-bold">High Density</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 border-l-2 border-white/5 pl-8">
                <h3 className="text-[11px] font-mono font-black text-zinc-700 uppercase tracking-[0.4em] mb-6">
                  Investment Summary
                </h3>
                <p className="text-[13px] text-zinc-400 leading-relaxed font-medium max-w-2xl">
                  Leveraging a <span className="text-white font-bold">5-year historical dataset</span>, the simulation projects structural gold price appreciation through <span className="text-white font-bold">January 1, 2027</span>. 
                  The <span className="text-green-500 font-bold uppercase tracking-widest text-[11px]">Median Path</span> accounts for central drift with current volatility levels. 
                  Users are advised that tail-risk scenarios (P5 Bear: $3,459) imply potential severe drawdowns revisited under extreme market stress. 
                  Designed for <span className="text-zinc-100 font-bold italic">BlackSigma Capital</span> institutional grade analysis.
                </p>
              </div>
            </div>

            {/* Institutional PDF Documentation Memorandum Card */}
            <div className="border border-white/15 bg-zinc-950/60 p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500"></span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400 font-bold">Formal Governance Artifact</span>
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Export Institutional Risk Memorandum (PDF)
                </h3>
                <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                  Generates an archival 2-page A4 document incorporating the live stochastic ensemble chart snapshot, 
                  Value-at-Risk audit (Variance-Covariance, Historical, Monte Carlo, Expected Shortfall), 
                  P5–P95 quantile distribution, and cryptographic validation sign-off.
                </p>
              </div>

              <button
                onClick={handleExportPdf}
                disabled={loading || exportingPdf}
                className="shrink-0 flex items-center gap-3 bg-white text-black hover:bg-zinc-200 disabled:opacity-20 transition-all px-7 py-3.5 rounded-none font-mono font-bold text-xs uppercase tracking-[0.15em] cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.08)]"
              >
                {exportingPdf ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>Compiling PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5 text-black" />
                    <span>Download PDF Memorandum</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto mt-40 pb-20 border-t border-white/10 pt-16 flex flex-col md:flex-row justify-between items-start gap-12">
        <div className="max-w-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 bg-white flex items-center justify-center">
              <span className="text-black font-black text-xl">B</span>
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-[0.6em] font-black text-white">BlackSigma Capital</p>
              <p className="text-[10px] text-zinc-500 font-mono">INTELLIGENCE • PRECISION • SCALE</p>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600 font-mono uppercase tracking-tight">
            Proprietary stochastic modeling engine. Distributed outcomes are non-deterministic simulations based on historical drift and diffusion parameters from a rigorous 5-year retrospective analysis. Financial projections are probabilistic and carry inherent market risks. 
            Digital signature validated for <span className="text-zinc-400">Sarthak Pagar</span>.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 self-end md:self-auto">
          <div className="flex gap-2">
            <span className="text-[9px] px-2 py-1 bg-white/5 border border-white/10 text-zinc-500 font-mono uppercase">Version 2.8.5_L</span>
            <span className="text-[9px] px-2 py-1 bg-white/5 border border-white/10 text-zinc-500 font-mono uppercase">Stable Build</span>
          </div>
          <span className="text-[10px] text-zinc-700 font-black tracking-[0.3em] uppercase">BY_SARTHAK_PAGAR</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
