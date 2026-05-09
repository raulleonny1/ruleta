"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FINAL_SURVIVING_COLOR_ID,
  type ChosenColorEntry,
  type WheelColor,
} from "@/lib/wheelColors";

const SIZE = 380;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 8;
const FULL_SPINS = 5;
/** Duración del giro (6 s). */
const SPIN_MS = 6000;
const DRUM_SRC = "/tambor.mp3";

type Celebration = {
  id: string;
  colorName: string;
  fill: string;
};

function needsStrongOutline(fill: string) {
  const f = fill.trim().toLowerCase();
  return (
    f === "#ffffff" ||
    f === "#fff" ||
    f === "#fff3b0" ||
    f === "#dadada" ||
    f === "#f8bbd0"
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return [
    "M",
    cx,
    cy,
    "L",
    start.x,
    start.y,
    "A",
    r,
    r,
    0,
    largeArc,
    0,
    end.x,
    end.y,
    "Z",
  ].join(" ");
}

function ConfettiBurst({ burstId }: { burstId: string }) {
  const pieces = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const pseudo = (i * 9301 + 49297 + burstId.length * 17) % 233280 / 233280;
      return {
        left: `${(pseudo * 100) % 100}%`,
        delay: `${(i % 10) * 0.05}s`,
        duration: `${2.1 + (i % 6) * 0.15}s`,
        hue: Math.floor((pseudo * 360 + i * 19) % 360),
        w: 5 + (i % 4),
        h: 7 + (i % 5),
        xEnd: `${-60 + pseudo * 120}px`,
        rot: `${540 + (i % 8) * 90}deg`,
      };
    });
  }, [burstId]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl"
      aria-hidden
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-[2px] opacity-95"
          style={{
            left: p.left,
            top: "-8%",
            width: p.w,
            height: p.h,
            backgroundColor: `hsl(${p.hue} 88% 56%)`,
            animation: `confetti-drop ${p.duration} ease-out ${p.delay} forwards`,
            ["--confetti-x" as string]: p.xEnd,
            ["--confetti-rot" as string]: p.rot,
          }}
        />
      ))}
    </div>
  );
}

type Props = {
  colors: WheelColor[];
  chosenSequence: ChosenColorEntry[];
  onAfterRemove?: (removed: WheelColor) => void;
  /** Giro replicado desde Firestore (v distinto en cada evento). */
  replaySpin?: { v: number; removeId: string } | null;
  onAfterRemoteReplayComplete?: () => void;
  onRemoteReplayFailed?: () => void;
  /** Bloquea “Girar ruleta” mientras se anima un giro remoto. */
  spinLocked?: boolean;
};

export function ColorWheel({
  colors,
  chosenSequence,
  onAfterRemove,
  replaySpin,
  onAfterRemoteReplayComplete,
  onRemoteReplayFailed,
  spinLocked,
}: Props) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const drumRef = useRef<HTMLAudioElement | null>(null);
  /** Última lista de colores (para cierre de giro fiable en todos los navegadores). */
  const colorsRef = useRef(colors);
  const spinWinIndexRef = useRef<number | null>(null);
  const spinEndedRef = useRef(false);
  const spinFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinKindRef = useRef<"local" | "remote">("local");
  const lastReplayVRef = useRef(0);

  const n = colors.length;

  colorsRef.current = colors;

  useEffect(() => {
    return () => {
      const a = drumRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      if (spinFallbackTimerRef.current) {
        clearTimeout(spinFallbackTimerRef.current);
        spinFallbackTimerRef.current = null;
      }
    };
  }, []);

  const slices = useMemo(() => {
    if (n === 0) return [];
    const step = 360 / n;
    return colors.map((c, i) => {
      const start = i * step;
      const end = (i + 1) * step;
      const mid = (i + 0.5) * step;
      const labelR = R * 0.62;
      const lp = polarToCartesian(CX, CY, labelR, mid);
      return { color: c, start, end, mid, lp, d: slicePath(CX, CY, R, start, end) };
    });
  }, [colors, n]);

  const applySpinComplete = useCallback(() => {
    if (spinEndedRef.current) return;
    spinEndedRef.current = true;
    if (spinFallbackTimerRef.current) {
      clearTimeout(spinFallbackTimerRef.current);
      spinFallbackTimerRef.current = null;
    }

    const kind = spinKindRef.current;
    spinKindRef.current = "local";

    setSpinning(false);
    const idx = spinWinIndexRef.current;
    spinWinIndexRef.current = null;
    if (idx === null) return;

    const removed = colorsRef.current[idx];
    if (!removed) return;

    setCelebration({
      id: `${removed.id}-${Date.now()}`,
      colorName: removed.name,
      fill: removed.fill,
    });
    if (kind === "remote") {
      onAfterRemoteReplayComplete?.();
    } else {
      onAfterRemove?.(removed);
    }
    setPendingRemoveIndex(null);
  }, [onAfterRemove, onAfterRemoteReplayComplete]);

  const finishSpin = useCallback(
    (e: React.TransitionEvent<SVGGElement>) => {
      if (e.propertyName !== "transform") return;
      if (e.target !== e.currentTarget) return;
      applySpinComplete();
    },
    [applySpinComplete],
  );

  const playDrum = useCallback(() => {
    const drum = drumRef.current;
    if (drum) {
      drum.pause();
      drum.currentTime = 0;
      void drum.play().catch(() => {
        /* autoplay bloqueado o archivo ausente */
      });
    }
  }, []);

  const beginSpinWithWinIndex = useCallback(
    (winIndex: number) => {
      if (spinning || n <= 1) return;

      const sliceSize = 360 / n;
      const centerOfWinner = winIndex * sliceSize + sliceSize / 2;

      const need = ((-centerOfWinner - rotation) % 360 + 360) % 360;
      const totalDelta = FULL_SPINS * 360 + need;

      spinEndedRef.current = false;
      spinWinIndexRef.current = winIndex;
      if (spinFallbackTimerRef.current) {
        clearTimeout(spinFallbackTimerRef.current);
      }
      spinFallbackTimerRef.current = setTimeout(() => {
        spinFallbackTimerRef.current = null;
        applySpinComplete();
      }, SPIN_MS + 250);

      setPendingRemoveIndex(winIndex);
      setCelebration(null);
      setSpinning(true);
      setRotation((r) => r + totalDelta);
      playDrum();
    },
    [n, rotation, spinning, applySpinComplete, playDrum],
  );

  const spin = useCallback(() => {
    if (spinning || n <= 1) return;

    const redStillIn = colors.some((c) => c.id === FINAL_SURVIVING_COLOR_ID);
    const removableIndices = colors
      .map((_, i) => i)
      .filter((i) => !redStillIn || colors[i].id !== FINAL_SURVIVING_COLOR_ID);
    if (removableIndices.length === 0) return;
    const winIndex =
      removableIndices[Math.floor(Math.random() * removableIndices.length)];

    spinKindRef.current = "local";
    beginSpinWithWinIndex(winIndex);
  }, [colors, n, rotation, spinning, beginSpinWithWinIndex]);

  useEffect(() => {
    if (!replaySpin || spinning || n <= 1) return;
    if (lastReplayVRef.current === replaySpin.v) return;
    const winIndex = colors.findIndex((c) => c.id === replaySpin.removeId);
    if (winIndex < 0) {
      onRemoteReplayFailed?.();
      return;
    }
    spinKindRef.current = "remote";
    beginSpinWithWinIndex(winIndex);
    lastReplayVRef.current = replaySpin.v;
  }, [replaySpin, spinning, n, colors, beginSpinWithWinIndex, onRemoteReplayFailed]);

  useEffect(() => {
    if (!replaySpin) {
      lastReplayVRef.current = 0;
    }
  }, [replaySpin]);

  const isFinal = n === 1;
  const isEmpty = n === 0;

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8">
      <audio
        ref={drumRef}
        src={DRUM_SRC}
        preload="auto"
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
      <div className="flex w-full flex-row flex-wrap items-start justify-center gap-4 md:gap-6 lg:gap-8">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <div
            className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
            style={{ marginTop: -4 }}
            aria-hidden
          >
            <div
              className="h-0 w-0 border-x-[14px] border-x-transparent border-t-[22px] border-t-zinc-900 drop-shadow-md"
              style={{ filter: "drop-shadow(0 2px 2px rgb(0 0 0 / 0.25))" }}
            />
          </div>

          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="overflow-visible"
            role="img"
            aria-label="Ruleta de colores"
          >
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: `${CX}px ${CY}px`,
                transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)` : "none",
                willChange: spinning ? "transform" : "auto",
              }}
              onTransitionEnd={finishSpin}
            >
              {isFinal && colors[0] ? (
                <g key={colors[0].id}>
                  {/* Un arco 0°–360° en SVG degenera; un círculo relleno es el caso correcto. */}
                  <circle
                    cx={CX}
                    cy={CY}
                    r={R}
                    fill={colors[0].fill}
                    stroke={colors[0].stroke ?? "rgba(0,0,0,0.14)"}
                    strokeWidth={colors[0].stroke ? 2 : 1}
                  />
                  <text
                    x={CX}
                    y={CY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none text-[13px] font-bold uppercase leading-tight tracking-wide sm:text-[15px]"
                    fill={colors[0].labelFill ?? "#1a1a1a"}
                    style={{
                      textShadow:
                        colors[0].labelFill === "#fff"
                          ? "0 1px 3px rgba(0,0,0,0.55)"
                          : "0 0 4px rgba(255,255,255,0.9)",
                    }}
                  >
                    {colors[0].name.split(" ").map((w, i) => (
                      <tspan key={i} x={CX} dy={i === 0 ? 0 : 15}>
                        {w}
                      </tspan>
                    ))}
                  </text>
                </g>
              ) : (
                slices.map(({ color, d, lp }) => (
                  <g key={color.id}>
                    <path
                      d={d}
                      fill={color.fill}
                      stroke={color.stroke ?? "rgba(0,0,0,0.12)"}
                      strokeWidth={color.stroke ? 2 : 1}
                    />
                    <text
                      x={lp.x}
                      y={lp.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="select-none text-[12px] font-semibold uppercase tracking-wide"
                      fill={color.labelFill ?? "#1a1a1a"}
                      style={{
                        textShadow:
                          color.labelFill === "#fff"
                            ? "0 1px 2px rgba(0,0,0,0.45)"
                            : "0 0 3px rgba(255,255,255,0.85)",
                      }}
                    >
                      {color.name.split(" ").map((w, i) => (
                        <tspan key={i} x={lp.x} dy={i === 0 ? 0 : 12}>
                          {w}
                        </tspan>
                      ))}
                    </text>
                  </g>
                ))
              )}
            </g>
            <circle cx={CX} cy={CY} r={21} fill="#fafafa" stroke="#27272a" strokeWidth={2} />
          </svg>
        </div>

        <div className="flex w-[10.5rem] shrink-0 flex-col gap-3 sm:w-44">
          {isEmpty && (
            <p className="text-center text-xs text-zinc-600 sm:text-left">No quedan colores.</p>
          )}
          {isFinal && !isEmpty && (
            <p className="text-center text-xs font-semibold leading-snug text-zinc-900 sm:text-left">
              Final:{" "}
              <span className="text-fuchsia-700">{colors[0].name}</span>
            </p>
          )}

          {celebration && (
            <div
              className="relative z-10 flex min-h-[200px] w-full flex-col justify-center overflow-hidden rounded-2xl border-[3px] border-yellow-300 bg-gradient-to-br from-fuchsia-500 via-amber-400 to-cyan-400 px-3 py-4 shadow-lg"
              role="status"
              aria-live="polite"
              style={{
                animation: "fiesta-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                fontFamily: "var(--font-fiesta), system-ui, sans-serif",
              }}
            >
              <ConfettiBurst burstId={celebration.id} />

              <p
                className="relative z-10 text-center text-sm font-bold uppercase leading-tight tracking-wide text-white"
                style={{
                  textShadow:
                    "0 2px 0 rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.22)",
                  animation: "fiesta-shake 0.35s ease-in-out 2",
                }}
              >
                ¡Color elegido!
              </p>

              <div className="relative z-10 mx-auto mt-2 w-full rounded-xl border-2 border-white/70 bg-white/95 px-2 py-3 shadow-inner">
                <p
                  className="text-center text-2xl font-bold leading-none tracking-tight"
                  style={{
                    color: celebration.fill,
                    fontFamily: "var(--font-fiesta), system-ui, sans-serif",
                    WebkitTextStroke: needsStrongOutline(celebration.fill)
                      ? "1.5px #374151"
                      : undefined,
                    textShadow:
                      "0 2px 0 rgba(0,0,0,0.12), 0 4px 18px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.25)",
                  }}
                >
                  {celebration.colorName}
                </p>
              </div>

              <p className="relative z-10 mt-2 text-center text-lg leading-none" aria-hidden>
                <span className="inline-block animate-bounce">🎉</span>{" "}
                <span className="inline-block animate-bounce [animation-delay:120ms]">✨</span>{" "}
                <span className="inline-block animate-bounce [animation-delay:240ms]">🎊</span>
              </p>
            </div>
          )}

          <aside
            className="rounded-lg border border-zinc-200/90 bg-white/95 px-2 py-2 shadow-sm backdrop-blur-sm"
            aria-label="Orden de colores elegidos"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Orden de salida
            </p>
            {chosenSequence.length === 0 ? (
              <p className="mt-1 text-[10px] leading-snug text-zinc-400">—</p>
            ) : (
              <ol className="mt-1 max-h-52 space-y-1 overflow-y-auto pr-0.5 text-left">
                {chosenSequence.map((c, index) => (
                  <li
                    key={`${c.id}-${index}`}
                    className="flex items-center gap-1.5 text-[11px] leading-tight text-zinc-800"
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-[10px] font-semibold tabular-nums text-zinc-400">
                      {index + 1}.
                    </span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border shadow-inner"
                      style={{
                        backgroundColor: c.fill,
                        borderColor: c.stroke ?? "rgba(0,0,0,0.2)",
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate" title={c.name}>
                      {c.name}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>

      <button
        type="button"
        onClick={spin}
        disabled={spinning || n <= 1 || spinLocked}
        className="rounded-full bg-zinc-900 px-8 py-3 text-sm font-semibold text-white shadow-md transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {n <= 1 ? "Ruleta terminada" : spinning ? "Girando…" : "Girar ruleta"}
      </button>
    </div>
  );
}
