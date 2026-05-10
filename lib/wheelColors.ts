/** Siempre queda al final como único ganador (Rojo). */
export const FINAL_SURVIVING_COLOR_ID = "10";

/**
 * Lila solo puede eliminarse con el botón «Girar ruleta» (giro forzado).
 * En giros aleatorios (y «Girar sala» remoto) nunca sale elegida.
 */
export const LILA_TARGET_COLOR_ID = "9";

export type WheelColor = {
  id: string;
  name: string;
  fill: string;
  /** Stroke for light segments (e.g. white) */
  stroke?: string;
  /** Text on slice */
  labelFill?: string;
};

export type ChosenColorEntry = Pick<WheelColor, "id" | "name" | "fill" | "stroke">;

export const INITIAL_COLORS: WheelColor[] = [
  { id: "1", name: "Rosado", fill: "#F48FB1", labelFill: "#4a1026" },
  { id: "12", name: "Rosado 2", fill: "#F06292", labelFill: "#fff" },
  { id: "2", name: "Fucsia", fill: "#D81B60", labelFill: "#fff" },
  { id: "3", name: "Celeste", fill: "#4FC3F7", labelFill: "#083d52" },
  { id: "4", name: "Blanco", fill: "#FFFFFF", stroke: "#BDBDBD", labelFill: "#333" },
  { id: "5", name: "Morado", fill: "#5E35B1", labelFill: "#fff" },
  { id: "6", name: "Amarillo", fill: "#FFEE58", labelFill: "#3d3510" },
  { id: "7", name: "Naranja", fill: "#FB8C00", labelFill: "#3d1f08" },
  { id: "8", name: "Verde", fill: "#43A047", labelFill: "#fff" },
  { id: "11", name: "Verde pastel", fill: "#C8E6C9", labelFill: "#1b3d2e" },
  { id: "9", name: "Lila", fill: "#CE93D8", labelFill: "#3d1a44" },
  { id: "10", name: "Rojo", fill: "#D32F2F", labelFill: "#fff" },
];
