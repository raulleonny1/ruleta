"use client";

import { useCallback, useState } from "react";
import { ColorWheel } from "@/components/ColorWheel";
import {
  INITIAL_COLORS,
  type ChosenColorEntry,
  type WheelColor,
} from "@/lib/wheelColors";

export default function Home() {
  const [remaining, setRemaining] = useState<WheelColor[]>(INITIAL_COLORS);
  const [wheelKey, setWheelKey] = useState(0);
  const [chosenSequence, setChosenSequence] = useState<ChosenColorEntry[]>([]);

  const handleRemoved = useCallback((removed: WheelColor) => {
    setRemaining((prev) => prev.filter((c) => c.id !== removed.id));
    setChosenSequence((prev) => [
      ...prev,
      {
        id: removed.id,
        name: removed.name,
        fill: removed.fill,
        stroke: removed.stroke,
      },
    ]);
  }, []);

  const reset = useCallback(() => {
    setRemaining(INITIAL_COLORS);
    setChosenSequence([]);
    setWheelKey((k) => k + 1);
  }, []);

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 py-12">
      <header className="mb-10 max-w-lg text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Ruleta de colores
        </h1>
      </header>

      <ColorWheel
        key={wheelKey}
        colors={remaining}
        chosenSequence={chosenSequence}
        onAfterRemove={handleRemoved}
      />

      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full border border-zinc-400 bg-white px-6 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
      >
        Reiniciar
      </button>
    </div>
  );
}
