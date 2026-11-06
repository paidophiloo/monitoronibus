import { parseGateCsv, parseScheduleCsv, reconcileShift } from "./shift-engine";

export const DEMO_SHIFT_AT = "2026-11-06T06:28:00-03:00";

export const DEMO_SHIFT_GPS: Readonly<Record<string, string>> = {
  "8 1776": "2026-11-06T05:52:00-03:00",
  "7 8042": "2026-11-06T06:27:10-03:00",
};

export const SCHEDULE_TEMPLATE = "trip_id,vehicle_id,planned_at,route\r\n";
export const GATE_TEMPLATE = "event_id,vehicle_id,observed_at,direction,trip_id\r\n";

const schedule = `${SCHEDULE_TEMPLATE}PM-0600,8 1029,2026-11-06T06:00:00-03:00,3301-10
PM-0605,7 9154,2026-11-06T06:05:00-03:00,312N-10
PM-0610,8 1776,2026-11-06T06:10:00-03:00,4310-10
PM-0615,8 2361,2026-11-06T06:15:00-03:00,4103-10`;

const gate = `${GATE_TEMPLATE}PORT-003,8 1029,2026-11-06T06:02:00-03:00,OUT,PM-0600
PORT-014,7 9154,2026-11-06T06:14:00-03:00,OUT,PM-0605
PORT-019,7 8042,2026-11-06T06:17:00-03:00,OUT,PM-0615`;

export const demoShift = reconcileShift(parseScheduleCsv(schedule), parseGateCsv(gate));
