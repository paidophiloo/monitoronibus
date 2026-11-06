import type { Observation } from "./observations";

export type Vehicle = {
  id: string;
  line: string;
  bay?: string;
  x: number;
  z: number;
  paint: string;
  status?: "No pátio" | "Em saída";
  observation?: Observation;
};

export const fleet: Vehicle[] = [
  {
    id: "8 1029",
    line: "3301-10",
    bay: "01",
    x: -13.5,
    z: 2,
    paint: "#19639f",
    status: "No pátio",
  },
  {
    id: "7 9154",
    line: "312N-10",
    bay: "02",
    x: -7.9,
    z: 2,
    paint: "#bd463f",
    status: "No pátio",
  },
  {
    id: "8 1776",
    line: "4310-10",
    bay: "03",
    x: -2.3,
    z: 2,
    paint: "#19639f",
    status: "No pátio",
  },
  {
    id: "8 2361",
    line: "4103-10",
    bay: "04",
    x: 3.3,
    z: 2,
    paint: "#138455",
    status: "Em saída",
  },
  {
    id: "7 8042",
    line: "407P-10",
    bay: "05",
    x: 8.9,
    z: 2,
    paint: "#bd463f",
    status: "No pátio",
  },
  {
    id: "8 4102",
    line: "373T-10",
    bay: "06",
    x: 14.5,
    z: 2,
    paint: "#19639f",
    status: "No pátio",
  },
  {
    id: "8 3132",
    line: "3766-10",
    bay: "07",
    x: -15.5,
    z: 16.5,
    paint: "#19639f",
    status: "No pátio",
  },
  {
    id: "7 5538",
    line: "4025-10",
    bay: "08",
    x: -9.9,
    z: 16.5,
    paint: "#bd463f",
    status: "No pátio",
  },
];
