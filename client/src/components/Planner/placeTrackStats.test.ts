import { describe, expect, it } from 'vitest';
import { CHART_H, CHART_W, computeTrackStats } from './placeTrackStats';

describe('track statistics value boundaries', () => {
  it.each(['not-json', 'null', '[]', '[[0,0]]'])('returns null for unreadable or insufficient track %s', (input) => {
    expect(computeTrackStats(input)).toBeNull();
  });

  it('measures one equatorial degree in kilometres without inventing elevations', () => {
    const stats = computeTrackStats('[[0,0],[0,1]]');
    expect(stats?.distKm).toBeCloseTo(111.19492664455873, 8);
    expect(stats).toMatchObject({
      hasEle: false,
      minEle: Infinity,
      maxEle: -Infinity,
      totalUp: 0,
      totalDown: 0,
      pathD: '',
    });
  });

  it('keeps coincident two-dimensional points at zero distance', () => {
    expect(computeTrackStats('[[45,10],[45,10]]')?.distKm).toBe(0);
  });

  it('reports climb, descent and the independently expected three-point elevation profile', () => {
    expect(computeTrackStats('[[0,0,100],[0,0,120],[0,0,90]]')).toEqual({
      distKm: 0,
      hasEle: true,
      minEle: 90,
      maxEle: 120,
      totalUp: 20,
      totalDown: 30,
      pathD: 'M0.0,39.3 L140.0,2.0 L280.0,58.0',
    });
  });

  it('keeps a flat below-sea-level profile finite at the original chart dimensions', () => {
    expect([CHART_W, CHART_H]).toEqual([280, 60]);
    expect(computeTrackStats('[[0,0,-5],[0,0,-5]]')).toEqual({
      distKm: 0,
      hasEle: true,
      minEle: -5,
      maxEle: -5,
      totalUp: 0,
      totalDown: 0,
      pathD: 'M0.0,58.0 L280.0,58.0',
    });
  });

  it.each([
    [559, 559],
    [560, 280],
  ])('retains the original sampling boundary for %i points (%i vertices)', (count, vertices) => {
    const points = Array.from({ length: count }, () => [0, 0, 10]);
    const path = computeTrackStats(JSON.stringify(points))?.pathD;
    expect(path?.split(' ')).toHaveLength(vertices);
    expect(path?.startsWith('M0.0,58.0 ')).toBe(true);
    expect(path?.endsWith(' L280.0,58.0')).toBe(true);
  });

  it('keeps full-track elevation statistics even when the last extreme is not a sampled vertex', () => {
    const points = Array.from({ length: 560 }, (_, index) => [0, 0, index === 559 ? 1000 : 10]);
    const stats = computeTrackStats(JSON.stringify(points));
    expect(stats).toMatchObject({ distKm: 0, minEle: 10, maxEle: 1000, totalUp: 990, totalDown: 0 });
    expect(stats?.pathD.split(' ')).toHaveLength(280);
    expect(stats?.pathD).not.toContain(',2.0');
    expect(stats?.pathD.endsWith(' L280.0,58.0')).toBe(true);
  });
});
