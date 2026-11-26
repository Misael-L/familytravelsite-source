import { z } from 'zod';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const point = z.object({ lat, lng }).strict();
const id = z.number().int().positive();
const revision = z.number().int().nonnegative();

export const waypointSaveSchema = z.object({
  dayId: id,
  fromId: id,
  toId: id,
  revision,
  point: point.nullable(),
}).strict();

export const waypointViewSchema = z.object({
  editable: z.boolean(),
  legs: z.array(waypointSaveSchema.extend({
    waypointId: id.nullable(),
  })),
});

export const waypointRpcSchema = z.object({
  trip_id: z.string().uuid(),
  editable: z.boolean(),
  legs: z.array(z.object({
    day_id: z.string().uuid(),
    from_visit_id: z.string().uuid(),
    to_visit_id: z.string().uuid(),
    revision,
    waypoint_id: z.string().uuid().nullable(),
    lat: lat.nullable(),
    lng: lng.nullable(),
  }).refine(row => (row.lat === null) === (row.lng === null) && (row.lat === null || row.waypoint_id !== null))),
});

export type WaypointView = z.infer<typeof waypointViewSchema>;
export type WaypointSave = z.infer<typeof waypointSaveSchema>;
