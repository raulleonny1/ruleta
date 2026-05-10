import {
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase";
import {
  FINAL_SURVIVING_COLOR_ID,
  INITIAL_COLORS,
  type ChosenColorEntry,
  type WheelColor,
} from "@/lib/wheelColors";

export const RULETA_ROOMS = "ruletaRooms";

export type RuletaRoomSnapshot = {
  colorIds: string[];
  chosen: ChosenColorEntry[];
  spinSeq: number;
};

function db() {
  return getFirestore(getFirebaseApp());
}

export function colorIdsToColors(ids: string[]): WheelColor[] {
  return ids
    .map((id) => INITIAL_COLORS.find((c) => c.id === id))
    .filter((c): c is WheelColor => Boolean(c));
}

export function colorsToIds(colors: WheelColor[]): string[] {
  return colors.map((c) => c.id);
}

function entryFromColor(c: WheelColor): ChosenColorEntry {
  return {
    id: c.id,
    name: c.name,
    fill: c.fill,
    stroke: c.stroke,
  };
}

/** Firestore no admite `undefined` en documentos. */
export function chosenForFirestore(chosen: ChosenColorEntry[]) {
  return chosen.map((e) => {
    const row: { id: string; name: string; fill: string; stroke?: string } = {
      id: e.id,
      name: e.name,
      fill: e.fill,
    };
    if (e.stroke != null && e.stroke !== "") {
      row.stroke = e.stroke;
    }
    return row;
  });
}

export function subscribeRuletaRoom(
  roomId: string,
  onData: (data: RuletaRoomSnapshot) => void,
  onError?: (err: Error) => void,
): () => void {
  const ref = doc(db(), RULETA_ROOMS, roomId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        void setDoc(ref, {
          colorIds: INITIAL_COLORS.map((c) => c.id),
          chosen: [] as ChosenColorEntry[],
          spinSeq: 0,
        });
        return;
      }
      const d = snap.data();
      onData({
        colorIds: (d.colorIds as string[]) ?? INITIAL_COLORS.map((c) => c.id),
        chosen: (d.chosen as ChosenColorEntry[]) ?? [],
        spinSeq: typeof d.spinSeq === "number" ? d.spinSeq : 0,
      });
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

/** Sincroniza estado tras un giro local (animación terminó). */
export async function commitRoomState(
  roomId: string,
  colorIds: string[],
  chosen: ChosenColorEntry[],
): Promise<void> {
  const ref = doc(db(), RULETA_ROOMS, roomId);
  await runTransaction(db(), async (transaction) => {
    const snap = await transaction.get(ref);
    const nextSeq = (snap.exists() ? (snap.data()?.spinSeq as number) ?? 0 : 0) + 1;
    transaction.set(
      ref,
      {
        colorIds,
        chosen: chosenForFirestore(chosen),
        spinSeq: nextSeq,
      },
      { merge: true },
    );
  });
}

/** Quita un color al azar (respeta Rojo al final) y actualiza la sala — útil desde otro móvil. */
export async function runRemoteSpinTransaction(roomId: string): Promise<void> {
  const ref = doc(db(), RULETA_ROOMS, roomId);
  await runTransaction(db(), async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    const ids = (data.colorIds as string[]) ?? [];
    if (ids.length <= 1) return;

    const redStillIn = ids.includes(FINAL_SURVIVING_COLOR_ID);
    const removableIds = ids.filter(
      (id) => !redStillIn || id !== FINAL_SURVIVING_COLOR_ID,
    );
    if (removableIds.length === 0) return;

    const pick = removableIds[Math.floor(Math.random() * removableIds.length)];
    const newIds = ids.filter((id) => id !== pick);
    const color = INITIAL_COLORS.find((c) => c.id === pick);
    if (!color) return;

    const chosen = [...((data.chosen as ChosenColorEntry[]) ?? []), entryFromColor(color)];
    const nextSeq = ((data.spinSeq as number) ?? 0) + 1;

    transaction.update(ref, {
      colorIds: newIds,
      chosen: chosenForFirestore(chosen),
      spinSeq: nextSeq,
    });
  });
}

export async function resetRoomDocument(roomId: string): Promise<void> {
  const ref = doc(db(), RULETA_ROOMS, roomId);
  await setDoc(ref, {
    colorIds: INITIAL_COLORS.map((c) => c.id),
    chosen: [] as ChosenColorEntry[],
    spinSeq: 0,
  });
}
