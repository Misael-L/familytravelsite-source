import { describe, expect, it } from 'vitest';
import { analyzeRouteGeometry, focusRouteProfileAtDistance } from './routeGeometry';

describe('route geometry numeric boundaries', () => {
  it.each([-500, 0, 512.125])('keeps complete elevation %s at zero-distance samples', (height) => {
    const a = analyzeRouteGeometry(
      JSON.stringify([
        [0, 0, height],
        [0, 0, height + 10],
        [0, 0, height - 7],
      ])
    );
    expect(a).not.toBeNull();
    expect(a?.distanceKm).toBe(0);
    expect(a?.minEle).toBe(height - 7);
    expect(a?.maxEle).toBe(height + 10);
    expect(a?.gain).toBe(10);
    expect(a?.loss).toBe(17);
    expect(a?.distanceIndexedProfileSamples.map((s) => s.elevationMeters)).toEqual([height, height + 10, height - 7]);
    expect(a?.distanceIndexedProfileSamples.map((s) => s.distanceMeters)).toEqual([0, 0, 0]);
  });
  it('preserves parsed negative-zero elevation and the extrema signs', () => {
    const a = analyzeRouteGeometry('[[0,0,-0],[0.001,0.001,0]]');
    expect(Object.is(a?.distanceIndexedProfileSamples[0].elevationMeters, -0)).toBe(true);
    expect(Object.is(a?.minEle, -0)).toBe(true);
    expect(Object.is(a?.maxEle, 0)).toBe(true);
  });
  it.each(['[[0,0,0],[0.01,0.01]]', '[[0,0],[0.01,0.01]]'])(
    'retains distance and omits the whole elevation model for partial geometry %s',
    (geometry) => {
      const a = analyzeRouteGeometry(geometry);
      expect(a?.distanceKm).toBeGreaterThan(0);
      expect(a?.minEle).toBeNull();
      expect(a?.maxEle).toBeNull();
      expect(a?.gain).toBeNull();
      expect(a?.loss).toBeNull();
      expect(a?.distanceIndexedProfileSamples).toEqual([]);
    }
  );
  it.each(['null', '"20"', '1e999'])(
    'filters an invalid third-coordinate %s before deriving complete-elevation metrics',
    (bad) => {
      const a = analyzeRouteGeometry(`[[0,0,0],[0.001,0.001,${bad}],[0.01,0.01,20]]`);
      expect(a?.routeCoordinates).toEqual([
        [0, 0],
        [0.01, 0.01],
      ]);
      expect(a?.minEle).toBe(0);
      expect(a?.maxEle).toBe(20);
      expect(a?.gain).toBe(20);
      expect(a?.distanceIndexedProfileSamples).toHaveLength(2);
    }
  );
  it('preserves the midpoint tie and endpoint clamping of profile focus', () => {
    const samples = [
      { distanceMeters: 0, elevationMeters: -10, lat: 0, lng: 0 },
      { distanceMeters: 100, elevationMeters: 10, lat: 2, lng: 4 },
    ];
    const before = structuredClone(samples);
    expect(focusRouteProfileAtDistance(samples, 50)).toEqual({
      distanceMeters: 50,
      elevationMeters: 0,
      lat: 1,
      lng: 2,
      sampleIndex: 1,
    });
    expect(focusRouteProfileAtDistance(samples, 50 - Number.EPSILON * 50)?.sampleIndex).toBe(0);
    expect(focusRouteProfileAtDistance(samples, -5)?.sampleIndex).toBe(0);
    expect(focusRouteProfileAtDistance(samples, 105)?.sampleIndex).toBe(1);
    expect(samples).toEqual(before);
  });
  it('keeps the first endpoint when all prepared samples share a distance', () => {
    expect(
      focusRouteProfileAtDistance(
        [
          { distanceMeters: 0, elevationMeters: 0, lat: 0, lng: 0 },
          { distanceMeters: 0, elevationMeters: 20, lat: 2, lng: 4 },
        ],
        5
      )
    ).toEqual({ distanceMeters: 0, elevationMeters: 0, lat: 0, lng: 0, sampleIndex: 0 });
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY])('retains null elevation for a nonfinite sample %s', (height) => {
    const result = focusRouteProfileAtDistance(
      [
        { distanceMeters: 0, elevationMeters: height, lat: 0, lng: 0 },
        { distanceMeters: 100, elevationMeters: 20, lat: 2, lng: 4 },
      ],
      50
    );
    expect(result).toEqual({ distanceMeters: 50, elevationMeters: null, lat: 1, lng: 2, sampleIndex: 1 });
  });
  it('rejects nonfinite coordinates in the selected interior segment', () => {
    const samples = [
      { distanceMeters: 0, elevationMeters: 0, lat: 0, lng: 0 },
      { distanceMeters: 100, elevationMeters: 10, lat: Number.NaN, lng: 2 },
      { distanceMeters: 200, elevationMeters: 20, lat: 4, lng: 4 },
    ];
    expect(focusRouteProfileAtDistance(samples, 50)).toBeNull();
    expect(focusRouteProfileAtDistance(samples, 150)).toBeNull();
  });
});
