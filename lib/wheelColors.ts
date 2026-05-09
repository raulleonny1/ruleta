/** Siempre queda al final como único ganador (Rojo oscuro). */
export const FINAL_SURVIVING_COLOR_ID = "10";

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
  { id: "1", name: "Rosa claro", fill: "#F8BBD0", labelFill: "#3d1a26" },
  { id: "2", name: "Verde menta", fill: "#A8E6CF", labelFill: "#143d2e" },
  { id: "3", name: "Fucsia", fill: "#E91E8C", labelFill: "#fff" },
  { id: "4", name: "Gris claro", fill: "#DADADA", stroke: "#BDBDBD", labelFill: "#2a2a2a" },
  { id: "5", name: "Amarillo pastel", fill: "#FFF3B0", labelFill: "#3d3510" },
  { id: "6", name: "Morado", fill: "#7E57C2", labelFill: "#fff" },
  { id: "7", name: "Naranja", fill: "#FF9E57", labelFill: "#3d1f08" },
  { id: "8", name: "Celeste", fill: "#7EC8E3", labelFill: "#0c2a33" },
  { id: "9", name: "Verde brillante", fill: "#00E676", labelFill: "#042818" },
  { id: "10", name: "Rojo oscuro", fill: "#8B1538", labelFill: "#fff" },
  { id: "11", name: "Blanco", fill: "#FFFFFF", stroke: "#CFCFCF", labelFill: "#333" },
];
