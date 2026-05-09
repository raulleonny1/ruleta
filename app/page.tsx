"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ColorWheel } from "@/components/ColorWheel";
import { getFirebaseApp } from "@/lib/firebase";
import {
  colorsToIds,
  colorIdsToColors,
  commitRoomState,
  resetRoomDocument,
  runRemoteSpinTransaction,
  subscribeRuletaRoom,
} from "@/lib/ruleta-firestore-sync";
import {
  INITIAL_COLORS,
  type ChosenColorEntry,
  type WheelColor,
} from "@/lib/wheelColors";

function sameIdList(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameChosen(a: ChosenColorEntry[], b: ChosenColorEntry[]) {
  return a.length === b.length && a.every((x, i) => x.id === b[i]?.id);
}

/** Un solo id quitado entre dos listas consecutivas. */
function diffOneRemoved(oldIds: string[], newIds: string[]): string | null {
  if (oldIds.length !== newIds.length + 1) return null;
  const removed = oldIds.filter((id) => !newIds.includes(id));
  return removed.length === 1 ? removed[0]! : null;
}

type PendingRoom = {
  ids: string[];
  chosen: ChosenColorEntry[];
  spinSeq: number;
};

export default function Home() {
  const [roomId, setRoomId] = useState("default");
  const [remaining, setRemaining] = useState<WheelColor[]>(INITIAL_COLORS);
  const [wheelKey, setWheelKey] = useState(0);
  const [chosenSequence, setChosenSequence] = useState<ChosenColorEntry[]>([]);
  const [syncReady, setSyncReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [replaySpin, setReplaySpin] = useState<{ v: number; removeId: string } | null>(null);

  const lastIdsRef = useRef(colorsToIds(INITIAL_COLORS));
  const lastChosenRef = useRef<ChosenColorEntry[]>([]);
  const pendingRoomRef = useRef<PendingRoom | null>(null);
  const replayCounterRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sala = params.get("sala")?.trim();
    if (sala) setRoomId(sala.slice(0, 64) || "default");
  }, []);

  useEffect(() => {
    lastIdsRef.current = colorsToIds(INITIAL_COLORS);
    lastChosenRef.current = [];
    setRemaining(INITIAL_COLORS);
    setChosenSequence([]);
    setSyncReady(false);
    setReplaySpin(null);
    pendingRoomRef.current = null;
    setWheelKey((k) => k + 1);
  }, [roomId]);

  const applyPendingRoom = useCallback(() => {
    const p = pendingRoomRef.current;
    if (p) {
      lastIdsRef.current = p.ids;
      lastChosenRef.current = p.chosen;
      setRemaining(colorIdsToColors(p.ids));
      setChosenSequence(p.chosen);
    }
    pendingRoomRef.current = null;
    setReplaySpin(null);
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      getFirebaseApp();
    } catch {
      setSyncError("Firebase no configurado (variables NEXT_PUBLIC_FIREBASE_*). La ruleta funciona solo en este dispositivo.");
      setSyncReady(true);
      return;
    }

    try {
      unsub = subscribeRuletaRoom(
        roomId,
        (data) => {
          const incomingIds = data.colorIds;
          const incomingChosen = data.chosen;

          const pending = pendingRoomRef.current;
          if (
            pending &&
            sameIdList(incomingIds, pending.ids) &&
            sameChosen(incomingChosen, pending.chosen)
          ) {
            setSyncReady(true);
            return;
          }

          if (
            sameIdList(incomingIds, lastIdsRef.current) &&
            sameChosen(incomingChosen, lastChosenRef.current)
          ) {
            setSyncReady(true);
            return;
          }

          const removedId = diffOneRemoved(lastIdsRef.current, incomingIds);
          if (removedId) {
            pendingRoomRef.current = {
              ids: incomingIds,
              chosen: incomingChosen,
              spinSeq: data.spinSeq,
            };
            replayCounterRef.current += 1;
            setReplaySpin({ v: replayCounterRef.current, removeId: removedId });
            setSyncReady(true);
            return;
          }

          pendingRoomRef.current = null;
          setReplaySpin(null);
          lastIdsRef.current = incomingIds;
          lastChosenRef.current = incomingChosen;
          setRemaining(colorIdsToColors(incomingIds));
          setChosenSequence(incomingChosen);
          setSyncReady(true);
        },
        (err) => {
          setSyncError(err.message);
          setSyncReady(true);
        },
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Error al conectar con Firebase.");
      setSyncReady(true);
    }

    return () => {
      unsub?.();
    };
  }, [roomId]);

  const handleRemoved = useCallback(
    async (removed: WheelColor) => {
      const nextRem = lastIdsRef.current
        .map((id) => INITIAL_COLORS.find((c) => c.id === id))
        .filter((c): c is WheelColor => Boolean(c))
        .filter((c) => c.id !== removed.id);
      const nextChosen: ChosenColorEntry[] = [
        ...lastChosenRef.current,
        {
          id: removed.id,
          name: removed.name,
          fill: removed.fill,
          stroke: removed.stroke,
        },
      ];

      const nextIds = colorsToIds(nextRem);

      lastIdsRef.current = nextIds;
      lastChosenRef.current = nextChosen;

      setRemaining(nextRem);
      setChosenSequence(nextChosen);

      try {
        getFirebaseApp();
        await commitRoomState(roomId, nextIds, nextChosen);
      } catch {
        /* sin Firebase: solo estado local */
      }
    },
    [roomId],
  );

  const reset = useCallback(async () => {
    const fresh = [...INITIAL_COLORS];
    const ids = colorsToIds(fresh);
    const chosen: ChosenColorEntry[] = [];
    lastIdsRef.current = ids;
    lastChosenRef.current = chosen;
    setRemaining(fresh);
    setChosenSequence(chosen);
    setReplaySpin(null);
    pendingRoomRef.current = null;
    setWheelKey((k) => k + 1);
    try {
      getFirebaseApp();
      await resetRoomDocument(roomId);
    } catch {
      /* solo local */
    }
  }, [roomId]);

  const remoteSpin = useCallback(async () => {
    setRemoteBusy(true);
    setSyncError(null);
    try {
      getFirebaseApp();
      await runRemoteSpinTransaction(roomId);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "No se pudo girar desde la nube.");
    } finally {
      setRemoteBusy(false);
    }
  }, [roomId]);

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 py-12">
      <header className="mb-6 max-w-lg text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Ruleta de colores
        </h1>
        <p className="mt-2 text-xs text-zinc-500">
          Sala: <span className="font-mono font-semibold text-zinc-700">{roomId}</span> — misma URL con{" "}
          <span className="font-mono">?sala=tuNombre</span> en iPad y PC.
        </p>
        {syncError && (
          <p className="mt-2 text-pretty text-xs text-amber-800" role="alert">
            {syncError}
          </p>
        )}
      </header>

      {!syncReady ? (
        <p className="text-sm text-zinc-500">Conectando con la sala…</p>
      ) : (
        <ColorWheel
          key={wheelKey}
          colors={remaining}
          chosenSequence={chosenSequence}
          onAfterRemove={handleRemoved}
          replaySpin={replaySpin}
          onAfterRemoteReplayComplete={applyPendingRoom}
          onRemoteReplayFailed={applyPendingRoom}
          spinLocked={replaySpin != null}
        />
      )}

      <div className="mt-6 flex w-full max-w-md flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={remoteSpin}
          disabled={remoteBusy || remaining.length <= 1 || !syncReady || replaySpin != null}
          className="rounded-full bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition enabled:hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {remoteBusy ? "Enviando giro…" : "Girar sala (otros dispositivos)"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-zinc-400 bg-white px-6 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}
