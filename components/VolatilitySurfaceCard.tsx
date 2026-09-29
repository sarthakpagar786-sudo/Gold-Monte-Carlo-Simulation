import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, 
  RotateCcw, 
  Layers, 
  Grid3X3, 
  TrendingUp, 
  Sliders, 
  ShieldAlert, 
  Maximize2,
  Info
} from 'lucide-react';
import { MarketData } from '../types';

interface VolatilitySurfaceCardProps {
  marketData: MarketData;
  spotPrice?: number;
  kurtosis?: number;
}

type ViewMode = '3d-surface' | '2d-matrix' | 'smile-curves';
type VolScenario = 'baseline' | 'stress' | 'compression';

interface GridPoint {
  tenorName: string;
  tenorYears: number;
  moneyness: number;
  strike: number;
  vol: number;
  delta: number;
  vega: number;
  xProj?: number;
  yProj?: number;
  depth?: number;
}

interface QuadFace {
  p1: GridPoint;
  p2: GridPoint;
  p3: GridPoint;
  p4: GridPoint;
  avgVol: number;
  avgDepth: number;
}

const TENORS = [
  { name: '1M', years: 1 / 12, label: '1 Month' },
  { name: '3M', years: 0.25, label: '3 Months' },
  { name: '6M', years: 0.50, label: '6 Months' },
  { name: '9M', years: 0.75, label: '9 Months' },
  { name: '1Y', years: 1.00, label: '1 Year' },
  { name: '1.5Y', years: 1.50, label: '18 Months' },
  { name: '2Y', years: 2.00, label: '2 Years (Jan 2027)' },
];

const MONEYNESS_LEVELS = [0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20];

// Color interpolation for volatility heatmap: Emerald -> Gold -> Crimson
function getVolColor(vol: number, alpha: number = 1): string {
  // vol in percent (e.g. 13 to 25)
  const vMin = 13.0;
  const vMax = 24.5;
  const t = Math.max(0, Math.min(1, (vol - vMin) / (vMax - vMin)));

  let r = 0, g = 0, b = 0;
  if (t < 0.35) {
    // 13.0% to 17.0%: Emerald / Cyan dark to bright
    const sub = t / 0.35;
    r = Math.round(6 + (16 - 6) * sub);
    g = Math.round(90 + (185 - 90) * sub);
    b = Math.round(80 + (129 - 80) * sub);
  } else if (t < 0.70) {
    // 17.0% to 21.0%: Mint / Gold
    const sub = (t - 0.35) / 0.35;
    r = Math.round(16 + (234 - 16) * sub);
    g = Math.round(185 + (179 - 185) * sub);
    b = Math.round(129 + (8 - 129) * sub);
  } else {
    // 21.0% to 24.5%+: Amber to Intense Coral / Crimson Red
    const sub = (t - 0.70) / 0.30;
    r = Math.round(234 + (239 - 234) * sub);
    g = Math.round(179 + (68 - 179) * sub);
    b = Math.round(8 + (68 - 8) * sub);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const VolatilitySurfaceCard: React.FC<VolatilitySurfaceCardProps> = ({
  marketData,
  spotPrice = 4031.50,
  kurtosis = 3.70
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('3d-surface');
  const [scenario, setScenario] = useState<VolScenario>('baseline');
  const [selectedTenorIdx, setSelectedTenorIdx] = useState<number>(4); // Default 1Y

  // 3D camera angles
  const [yaw, setYaw] = useState<number>(42); // Horizontal rotation in degrees
  const [pitch, setPitch] = useState<number>(36); // Vertical tilt in degrees
  const [zoom, setZoom] = useState<number>(1.0);
  const [hoveredPoint, setHoveredPoint] = useState<GridPoint | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const spot = marketData?.currentPrice || spotPrice;
  const baseVol = (marketData?.volatilityEstimate || 0.1533) * 100;

  // Calculate full volatility surface grid
  const surfaceData = useMemo(() => {
    const grid: GridPoint[][] = [];

    // Scenario modifiers
    let shiftVol = 0;
    let convexityMult = 1.0;
    let skewMult = 1.0;

    if (scenario === 'stress') {
      shiftVol = 4.2; // +420 bps vol shock
      convexityMult = 1.35;
      skewMult = 1.25;
    } else if (scenario === 'compression') {
      shiftVol = -2.8; // Low-vol compression
      convexityMult = 0.75;
      skewMult = 0.8;
    }

    TENORS.forEach((tenor) => {
      const row: GridPoint[] = [];
      const T = tenor.years;

      // Term structure: slight mean-reverting decay for short-dated, flat at 1Y-2Y
      const atmTermVol = baseVol + shiftVol + 1.2 * Math.exp(-2.2 * T) - 0.4 * Math.sqrt(T);

      MONEYNESS_LEVELS.forEach((m) => {
        const strike = spot * m;
        const logMoneyness = Math.log(m);

        // Skew: In Gold, out-of-the-money calls exhibit higher demand during inflation/crises (upside skew)
        // while OTM puts command downside hedge premiums
        const skew = 1.85 * logMoneyness * skewMult;

        // Smile curvature / wings: amplified by excess kurtosis (3.70)
        const wingCurvature =
          (2.2 + (kurtosis - 3.0) * 0.9) * (logMoneyness * logMoneyness) * (1 / Math.sqrt(Math.max(T, 0.15))) * convexityMult;

        const vol = Math.max(10.5, atmTermVol + skew + wingCurvature);

        // Black-Scholes approximate Delta for reference
        const d1 = (logMoneyness + (0.045 + 0.5 * Math.pow(vol / 100, 2)) * T) / ((vol / 100) * Math.sqrt(T));
        // Normal CDF approximation
        const normCdf = (x: number) => {
          const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
          const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
          const sign = x < 0 ? -1 : 1;
          const absX = Math.abs(x) / Math.SQRT2;
          const tVal = 1.0 / (1.0 + p * absX);
          const erf = 1.0 - (((((a5 * tVal + a4) * tVal + a3) * tVal + a2) * tVal + a1) * tVal * Math.exp(-absX * absX));
          return 0.5 * (1.0 + sign * erf);
        };
        const delta = Math.round(normCdf(d1) * 100);

        // Vega approximation ($ per 1% vol per oz)
        const vega = spot * Math.sqrt(T) * Math.exp(-0.5 * d1 * d1) * 0.003989;

        row.push({
          tenorName: tenor.name,
          tenorYears: tenor.years,
          moneyness: m,
          strike,
          vol,
          delta,
          vega
        });
      });

      grid.push(row);
    });

    return grid;
  }, [spot, baseVol, kurtosis, scenario]);

  // Render 3D Canvas
  const draw3dCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 460;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Dark sleek background
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, width, height);

    // Subtle center glow
    const centerGlow = ctx.createRadialGradient(width * 0.5, height * 0.52, 10, width * 0.5, height * 0.52, 380);
    centerGlow.addColorStop(0, 'rgba(16, 185, 129, 0.05)');
    centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    // 3D projection transformation parameters
    const radYaw = (yaw * Math.PI) / 180;
    const radPitch = (pitch * Math.PI) / 180;

    const cosYaw = Math.cos(radYaw);
    const sinYaw = Math.sin(radYaw);
    const cosPitch = Math.cos(radPitch);
    const sinPitch = Math.sin(radPitch);

    const centerX = width * 0.5;
    const centerY = height * 0.56;

    // Scale factors
    const xSpan = (width * 0.52) * zoom;
    const ySpan = (height * 0.44) * zoom;
    const zSpan = (height * 0.36) * zoom;

    const numRows = surfaceData.length;
    const numCols = surfaceData[0].length;

    // Volatility bounds for Z normalization
    let minVol = Infinity;
    let maxVol = -Infinity;
    surfaceData.forEach(row => {
      row.forEach(pt => {
        if (pt.vol < minVol) minVol = pt.vol;
        if (pt.vol > maxVol) maxVol = pt.vol;
      });
    });

    const vRange = Math.max(1, maxVol - minVol);

    // Project each grid point into 2D camera coordinates
    const projected: GridPoint[][] = [];

    for (let r = 0; r < numRows; r++) {
      const projRow: GridPoint[] = [];
      for (let c = 0; c < numCols; c++) {
        const pt = surfaceData[r][c];

        // Normalized 3D space: [-0.5, 0.5]
        const nx = (c / (numCols - 1) - 0.5); // Moneyness axis (X)
        const ny = (r / (numRows - 1) - 0.5); // Tenor axis (Y)
        const nz = ((pt.vol - minVol) / vRange - 0.5); // Volatility height (Z)

        // Rotate around Z (yaw)
        const rx = nx * cosYaw - ny * sinYaw;
        const ry = nx * sinYaw + ny * cosYaw;
        const rz = nz;

        // Tilt around X (pitch)
        const py = ry * cosPitch - rz * sinPitch;
        const pz = ry * sinPitch + rz * cosPitch;

        // Screen mapping
        const screenX = centerX + rx * xSpan;
        const screenY = centerY + py * ySpan - pz * zSpan;

        projRow.push({
          ...pt,
          xProj: screenX,
          yProj: screenY,
          depth: pz // for painter's algorithm
        });
      }
      projected.push(projRow);
    }

    // 1. Draw floor base grid / shadow
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    for (let r = 0; r < numRows; r++) {
      ctx.beginPath();
      for (let c = 0; c < numCols; c++) {
        const nx = (c / (numCols - 1) - 0.5);
        const ny = (r / (numRows - 1) - 0.5);
        const nz = -0.55; // floor
        const rx = nx * cosYaw - ny * sinYaw;
        const ry = nx * sinYaw + ny * cosYaw;
        const py = ry * cosPitch - nz * sinPitch;
        const pz = ry * sinPitch + nz * cosPitch;
        const sx = centerX + rx * xSpan;
        const sy = centerY + py * ySpan - pz * zSpan;
        if (c === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // 2. Build quad faces and sort by depth (Painter's algorithm)
    const quads: QuadFace[] = [];

    for (let r = 0; r < numRows - 1; r++) {
      for (let c = 0; c < numCols - 1; c++) {
        const p1 = projected[r][c];
        const p2 = projected[r][c + 1];
        const p3 = projected[r + 1][c + 1];
        const p4 = projected[r + 1][c];

        const avgDepth = ((p1.depth || 0) + (p2.depth || 0) + (p3.depth || 0) + (p4.depth || 0)) / 4;
        const avgVol = (p1.vol + p2.vol + p3.vol + p4.vol) / 4;

        quads.push({ p1, p2, p3, p4, avgVol, avgDepth });
      }
    }

    // Back to front
    quads.sort((a, b) => (b.avgDepth) - (a.avgDepth));

    // 3. Render shaded polygon facets
    quads.forEach((quad) => {
      if (!quad.p1.xProj || !quad.p2.xProj || !quad.p3.xProj || !quad.p4.xProj) return;

      ctx.beginPath();
      ctx.moveTo(quad.p1.xProj, quad.p1.yProj!);
      ctx.lineTo(quad.p2.xProj, quad.p2.yProj!);
      ctx.lineTo(quad.p3.xProj, quad.p3.yProj!);
      ctx.lineTo(quad.p4.xProj, quad.p4.yProj!);
      ctx.closePath();

      // Translucent heatmap fill
      ctx.fillStyle = getVolColor(quad.avgVol, 0.72);
      ctx.fill();

      // Subtle wireframe stroke
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // 4. Draw bold isobar / smile lines along tenors
    ctx.lineWidth = 1.8;
    for (let r = 0; r < numRows; r++) {
      const isSelected = r === selectedTenorIdx;
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = isSelected ? 2.5 : 1.2;

      ctx.beginPath();
      for (let c = 0; c < numCols; c++) {
        const pt = projected[r][c];
        if (c === 0) ctx.moveTo(pt.xProj!, pt.yProj!);
        else ctx.lineTo(pt.xProj!, pt.yProj!);
      }
      ctx.stroke();
    }

    // 5. Draw At-The-Money (ATM, m = 1.00) Spine Line
    const atmColIdx = MONEYNESS_LEVELS.indexOf(1.00);
    if (atmColIdx !== -1) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let r = 0; r < numRows; r++) {
        const pt = projected[r][atmColIdx];
        if (r === 0) ctx.moveTo(pt.xProj!, pt.yProj!);
        else ctx.lineTo(pt.xProj!, pt.yProj!);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. Draw axis labels in 3D space
    ctx.font = 'bold 9px "Courier New", Courier, monospace';
    ctx.fillStyle = '#9ca3af';

    // Moneyness edge labels
    const frontRow = projected[numRows - 1];
    frontRow.forEach((pt, i) => {
      if (i % 2 === 0 && pt.xProj && pt.yProj) {
        ctx.textAlign = 'center';
        ctx.fillText(`${(pt.moneyness * 100).toFixed(0)}%`, pt.xProj, pt.yProj + 14);
      }
    });

    // Tenor edge labels
    for (let r = 0; r < numRows; r += 2) {
      const pt = projected[r][0];
      if (pt.xProj && pt.yProj) {
        ctx.textAlign = 'right';
        ctx.fillText(pt.tenorName, pt.xProj - 10, pt.yProj + 3);
      }
    }

    // 7. Highlight hovered point with drop-pin & pulse
    if (hoveredPoint && hoveredPoint.xProj && hoveredPoint.yProj) {
      // Glow circle
      ctx.beginPath();
      ctx.arc(hoveredPoint.xProj, hoveredPoint.yProj, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

  }, [surfaceData, yaw, pitch, zoom, selectedTenorIdx, hoveredPoint]);

  useEffect(() => {
    if (viewMode === '3d-surface') {
      draw3dCanvas();
    }
  }, [draw3dCanvas, viewMode]);

  // Mouse interaction for 3D rotation
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      setYaw(prev => (prev + dx * 0.5) % 360);
      setPitch(prev => Math.max(10, Math.min(85, prev - dy * 0.4)));
      return;
    }

    // Hover detection: find nearest point
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let closest: GridPoint | null = null;
    let minDist = 22; // threshold in pixels

    surfaceData.forEach(row => {
      row.forEach(pt => {
        if (pt.xProj !== undefined && pt.yProj !== undefined) {
          const dist = Math.hypot(pt.xProj - mx, pt.yProj - my);
          if (dist < minDist) {
            minDist = dist;
            closest = pt;
          }
        }
      });
    });

    setHoveredPoint(closest);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleResetCamera = () => {
    setYaw(42);
    setPitch(36);
    setZoom(1.0);
  };

  // Selected tenor cross section data for 2D smile curve
  const currentSmileRow = surfaceData[selectedTenorIdx] || surfaceData[0];

  return (
    <div className="bg-[#050505] border border-white/15 p-8 relative flex flex-col gap-6">
      {/* Top Header & View Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 bg-green-500"></span>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400 font-bold">
              Quantitative Volatility Architecture
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
            Volatility Surface & Smile Topology
            <span className="text-zinc-600 font-normal text-sm font-mono">
              σ(K, T) · S0 = ${spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </h2>
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center gap-1 bg-white/5 p-1 border border-white/10 self-start md:self-auto">
          <button
            onClick={() => setViewMode('3d-surface')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === '3d-surface'
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>3D Surface</span>
          </button>

          <button
            onClick={() => setViewMode('2d-matrix')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === '2d-matrix'
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            <span>2D Matrix</span>
          </button>

          <button
            onClick={() => setViewMode('smile-curves')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === 'smile-curves'
                ? 'bg-white text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>Smile Cross-Section</span>
          </button>
        </div>
      </div>

      {/* Institutional Top KPI & Scenario Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 font-mono text-[11px]">
        {/* KPI Pills (unstyled text with dividers per frontend-design rule) */}
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-zinc-500 uppercase text-[9px] block">Baseline Vol (σ5Y)</span>
            <span className="font-bold text-white text-xs">{baseVol.toFixed(2)}%</span>
          </div>
          <div className="w-[1px] h-6 bg-white/10 hidden sm:block"></div>
          <div>
            <span className="text-zinc-500 uppercase text-[9px] block">Kurtosis Smile Impact</span>
            <span className="font-bold text-amber-400 text-xs">+{((kurtosis - 3.0) * 0.9).toFixed(2)}% Wings</span>
          </div>
          <div className="w-[1px] h-6 bg-white/10 hidden sm:block"></div>
          <div>
            <span className="text-zinc-500 uppercase text-[9px] block">Safe-Haven Call Skew</span>
            <span className="font-bold text-green-400 text-xs">+1.85% (Upside)</span>
          </div>
          <div className="w-[1px] h-6 bg-white/10 hidden sm:block"></div>
          <div>
            <span className="text-zinc-500 uppercase text-[9px] block">1Y ATM Target</span>
            <span className="font-bold text-white text-xs">{surfaceData[4][4].vol.toFixed(2)}%</span>
          </div>
        </div>

        {/* Scenario Selector */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 uppercase text-[9px]">Scenario:</span>
          <div className="flex items-center gap-1 bg-black p-0.5 border border-white/10">
            <button
              onClick={() => setScenario('baseline')}
              className={`px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
                scenario === 'baseline' ? 'bg-white/20 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              5Y Empirical
            </button>
            <button
              onClick={() => setScenario('stress')}
              className={`px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
                scenario === 'stress' ? 'bg-red-500/30 text-red-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              +400bps Shock
            </button>
            <button
              onClick={() => setScenario('compression')}
              className={`px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
                scenario === 'compression' ? 'bg-green-500/20 text-green-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Low-Vol Flat
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport Content */}
      <div className="relative min-h-[480px] w-full bg-[#030304] border border-white/10 overflow-hidden">
        {/* VIEW 1: 3D Surface View */}
        {viewMode === '3d-surface' && (
          <div className="relative w-full h-[480px]">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />

            {/* Interactive 3D Camera Controls overlay */}
            <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-[#0a0a0f]/90 border border-white/15 px-4 py-2.5 backdrop-blur-md font-mono text-[9px] text-zinc-400">
              <div className="flex items-center gap-2">
                <span>Drag to Rotate</span>
                <span className="text-zinc-600">·</span>
                <span>Pitch: {pitch.toFixed(0)}°</span>
                <span className="text-zinc-600">·</span>
                <span>Yaw: {yaw.toFixed(0)}°</span>
              </div>
              <button
                onClick={handleResetCamera}
                className="flex items-center gap-1.5 text-zinc-300 hover:text-white border-l border-white/10 pl-3 cursor-pointer"
                title="Reset Camera Orientation"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* Thermal Legend Indicator */}
            <div className="absolute top-4 right-4 flex flex-col gap-1.5 bg-[#0a0a0f]/90 border border-white/15 p-3 backdrop-blur-md font-mono text-[9px]">
              <span className="text-zinc-500 uppercase tracking-widest text-[8px] font-bold">Implied Vol Heatmap</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 text-[8px]">13%</span>
                <div
                  className="w-24 h-2.5"
                  style={{
                    background: 'linear-gradient(to right, #064e3b, #10b981, #eab308, #ef4444)'
                  }}
                />
                <span className="text-zinc-400 text-[8px]">24%+</span>
              </div>
              <div className="flex justify-between text-[7px] text-zinc-500 uppercase mt-0.5">
                <span>Low ATM</span>
                <span>Wings / Skew</span>
              </div>
            </div>

            {/* Hovered Point HUD Card */}
            {hoveredPoint && (
              <div className="absolute top-4 left-4 bg-[#08080c]/95 border border-white/20 p-4 shadow-2xl backdrop-blur-md font-mono min-w-[240px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase">{hoveredPoint.tenorName} Option Tenor</span>
                  <span className="text-xs font-black text-green-400">{hoveredPoint.vol.toFixed(2)}% Vol</span>
                </div>
                <div className="space-y-1.5 text-[9px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Moneyness:</span>
                    <span className="text-white font-bold">{(hoveredPoint.moneyness * 100).toFixed(0)}% (K/S)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Strike Price:</span>
                    <span className="text-white">${hoveredPoint.strike.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Approx. Delta:</span>
                    <span className="text-zinc-300">{hoveredPoint.delta}Δ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Spread to Base ATM:</span>
                    <span className={`font-bold ${hoveredPoint.vol >= baseVol ? 'text-amber-400' : 'text-green-400'}`}>
                      {hoveredPoint.vol >= baseVol ? '+' : ''}{(hoveredPoint.vol - baseVol).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: 2D Quantitative Heatmap Matrix */}
        {viewMode === '2d-matrix' && (
          <div className="p-6 overflow-x-auto">
            <table className="w-full font-mono text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-white/15 text-[9px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-3">Tenor</th>
                  {MONEYNESS_LEVELS.map(m => (
                    <th key={m} className={`py-2.5 px-3 text-center ${m === 1.00 ? 'text-green-400 font-bold' : ''}`}>
                      {(m * 100).toFixed(0)}%
                      <span className="block text-[8px] font-normal text-zinc-600">
                        ${Math.round(spot * m).toLocaleString()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[10px]">
                {surfaceData.map((row, rIdx) => (
                  <tr key={TENORS[rIdx].name} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-bold text-white whitespace-nowrap">
                      {TENORS[rIdx].name}
                      <span className="text-zinc-600 text-[8px] block font-normal">{TENORS[rIdx].label}</span>
                    </td>
                    {row.map(pt => {
                      const isAtm = pt.moneyness === 1.00;
                      return (
                        <td
                          key={pt.moneyness}
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          className={`py-3 px-2 text-center transition-all cursor-pointer ${
                            isAtm ? 'border-x border-green-500/30' : ''
                          }`}
                          style={{
                            backgroundColor: getVolColor(pt.vol, 0.15)
                          }}
                        >
                          <span
                            className="font-bold text-[11px] block"
                            style={{ color: getVolColor(pt.vol, 1) }}
                          >
                            {pt.vol.toFixed(1)}%
                          </span>
                          <span className="text-[8px] text-zinc-500 block">
                            {pt.delta}Δ
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 3: 2D Volatility Smile Cross-Sections */}
        {viewMode === 'smile-curves' && (
          <div className="p-8 flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
              <span className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider">
                Select Expiry Tenor Cross-Section:
              </span>
              <div className="flex flex-wrap gap-2">
                {TENORS.map((t, idx) => (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTenorIdx(idx)}
                    className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
                      selectedTenorIdx === idx
                        ? 'bg-green-500 text-black'
                        : 'bg-white/5 text-zinc-400 hover:text-white border border-white/10'
                    }`}
                  >
                    {t.name} ({t.label})
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Cross-Section Chart */}
            <div className="w-full h-[280px] relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 700 240">
                {/* Gridlines */}
                {[14, 16, 18, 20, 22, 24].map((vTick) => {
                  const y = 220 - ((vTick - 13) / 12) * 190;
                  return (
                    <g key={vTick}>
                      <line x1="50" y1={y} x2="680" y2={y} stroke="#181824" strokeDasharray="3 3" />
                      <text x="42" y={y + 3} fill="#71717a" fontSize="8" fontFamily="monospace" textAnchor="end">
                        {vTick}%
                      </text>
                    </g>
                  );
                })}

                {/* Vertical Spot line */}
                {(() => {
                  const xSpot = 50 + (4 / 8) * 630;
                  return (
                    <g>
                      <line x1={xSpot} y1="30" x2={xSpot} y2="220" stroke="#22c55e" strokeDasharray="4 4" strokeWidth="1.2" />
                      <text x={xSpot} y="22" fill="#22c55e" fontSize="8" fontFamily="monospace" textAnchor="middle">
                        ATM Spot: ${spot.toFixed(0)}
                      </text>
                    </g>
                  );
                })()}

                {/* Comparison Smile Curve: 1M vs Selected vs 2Y */}
                {[0, selectedTenorIdx, 6].filter((v, i, a) => a.indexOf(v) === i).map((tIdx) => {
                  const row = surfaceData[tIdx];
                  const isCurrent = tIdx === selectedTenorIdx;
                  const strokeColor = isCurrent ? '#22c55e' : tIdx === 0 ? '#f59e0b' : '#38bdf8';
                  const strokeWidth = isCurrent ? 3 : 1.5;

                  const points = row.map((pt, cIdx) => {
                    const x = 50 + (cIdx / (row.length - 1)) * 630;
                    const y = 220 - ((pt.vol - 13) / 12) * 190;
                    return `${x},${y}`;
                  }).join(' ');

                  return (
                    <g key={tIdx}>
                      <polyline
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={isCurrent ? undefined : '4 3'}
                        points={points}
                      />
                      {row.map((pt, cIdx) => {
                        const x = 50 + (cIdx / (row.length - 1)) * 630;
                        const y = 220 - ((pt.vol - 13) / 12) * 190;
                        return (
                          <circle
                            key={cIdx}
                            cx={x}
                            cy={y}
                            r={isCurrent ? 4 : 2.5}
                            fill={strokeColor}
                            className="cursor-pointer hover:r-6 transition-all"
                            onMouseEnter={() => setHoveredPoint(pt)}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* X-axis labels */}
                {MONEYNESS_LEVELS.map((m, cIdx) => {
                  const x = 50 + (cIdx / (MONEYNESS_LEVELS.length - 1)) * 630;
                  return (
                    <g key={m}>
                      <text x={x} y="235" fill="#9ca3af" fontSize="8" fontFamily="monospace" textAnchor="middle">
                        {(m * 100).toFixed(0)}%
                      </text>
                      <text x={x} y="244" fill="#52525b" fontSize="7" fontFamily="monospace" textAnchor="middle">
                        ${Math.round(spot * m)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend & Analytical Insight for Smile */}
            <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] bg-white/[0.02] p-4 border border-white/5">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-green-500"></span>
                  <span className="text-white font-bold">{TENORS[selectedTenorIdx].name} ({TENORS[selectedTenorIdx].label})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-amber-500"></span>
                  <span className="text-zinc-400">1M (Short Horizon)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-sky-400"></span>
                  <span className="text-zinc-400">2Y (Target Settlement Horizon)</span>
                </div>
              </div>

              <div className="text-zinc-400 text-[9px]">
                Excess Kurtosis (<span className="text-white font-bold">3.70</span>) induces steep quadratic smile curvature in OTM wings.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quantitative Narrative & Mathematical Formulation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-[10px] border-t border-white/10 pt-6">
        <div className="space-y-2 border-l border-white/10 pl-4">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block">1. Safe-Haven Upside Skew</span>
          <p className="text-zinc-400 leading-relaxed font-sans text-xs">
            Gold options feature pronounced positive call skew (higher volatility for high strikes). Flight-to-safety capital surges and monetary debasement hedge demand drive upside volatility premiums over symmetric log-normal baselines.
          </p>
        </div>

        <div className="space-y-2 border-l border-white/10 pl-4">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block">2. Leptokurtic Wing Convexity</span>
          <p className="text-zinc-400 leading-relaxed font-sans text-xs">
            Calibrated with historical excess kurtosis of <span className="text-white font-bold">3.70</span>, out-of-the-money put and call wings diverge sharply from Gaussian baselines, ensuring stress tests account for tail-risk fat tails ($3,459 bear floor).
          </p>
        </div>

        <div className="space-y-2 border-l border-white/10 pl-4">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block">3. Term Structure Convergence</span>
          <p className="text-zinc-400 leading-relaxed font-sans text-xs">
            Short-term tenors (1M–3M) exhibit acute event-risk sensitivity, while long-term tenors (1Y–2Y) converge toward the structural 5-year empirical volatility anchor of <span className="text-green-400 font-bold">15.33%</span>.
          </p>
        </div>
      </div>
    </div>
  );
};
