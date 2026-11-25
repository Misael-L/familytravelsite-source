interface TrackStats {
  distKm: number;
  hasEle: boolean;
  minEle: number;
  maxEle: number;
  totalUp: number;
  totalDown: number;
  /** The elevation profile as an SVG path in a CHART_W × CHART_H box, empty without elevations. */
  pathD: string;
}

export const CHART_W = 280;

export const CHART_H = 60;

/** Distance, elevation extremes, climb and descent of a GPX track, or null when it cannot be read. */
export function computeTrackStats(routeGeometry: string): TrackStats | null {
  try {
    const pts: number[][] = JSON.parse(routeGeometry);
    if (!pts || pts.length < 2) return null;
    const hasEle = pts[0].length >= 3;

    // Haversine distance
    const toRad = (d: number) => (d * Math.PI) / 180;
    let totalDist = 0;
    for (let i = 1; i < pts.length; i++) {
      const [lat1, lng1] = pts[i - 1],
        [lat2, lng2] = pts[i];
      const dLat = toRad(lat2 - lat1),
        dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      totalDist += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Elevation stats
    let minEle = Infinity,
      maxEle = -Infinity,
      totalUp = 0,
      totalDown = 0;
    if (hasEle) {
      for (let i = 0; i < pts.length; i++) {
        const e = pts[i][2];
        if (e < minEle) minEle = e;
        if (e > maxEle) maxEle = e;
        if (i > 0) {
          const diff = e - pts[i - 1][2];
          if (diff > 0) totalUp += diff;
          else totalDown += Math.abs(diff);
        }
      }
    }

    // Elevation profile
    const elevations = hasEle ? pts.map((p) => p[2]) : [];
    let pathD = '';
    if (elevations.length > 1) {
      const step = Math.max(1, Math.floor(elevations.length / CHART_W));
      const sampled = elevations.filter((_, i) => i % step === 0);
      const eMin = Math.min(...sampled),
        eMax = Math.max(...sampled);
      const range = eMax - eMin || 1;
      pathD = sampled
        .map((e, i) => {
          const x = (i / (sampled.length - 1)) * CHART_W;
          const y = CHART_H - ((e - eMin) / range) * (CHART_H - 4) - 2;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    }
    return { distKm: totalDist / 1000, hasEle, minEle, maxEle, totalUp, totalDown, pathD };
  } catch {
    return null;
  }
}
