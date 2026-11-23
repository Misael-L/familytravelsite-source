import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFamilyPlanner, isPlannerRequest } from './plannerBootstrap';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const cohort = vi.hoisted(() => ({
  handle: vi.fn(),
  install: vi.fn(),
  dispose: vi.fn(),
  release: vi.fn(),
}));
vi.mock('./plannerCohort', () => ({ createFamilyPlannerCohort: () => cohort }));
const repository = {} as FamilyFrontendRepository;
const request = (pathname: string): FamilyRequest => ({
  method: 'GET',
  pathname,
  query: new URLSearchParams(),
  body: undefined,
});
afterEach(() => vi.resetAllMocks());

describe('ordinary Family planner composition', () => {
  it('keeps auth/public/account startup outside the private planner session', async () => {
    const app = vi.fn().mockResolvedValue({ account: true });
    cohort.install.mockReturnValue(cohort.release);
    const binding = installFamilyPlanner(repository, app);
    for (const path of [
      '/auth/app-config',
      '/auth/me',
      '/auth/login',
      '/auth/mfa/verify-login',
      '/auth/logout',
      '/config',
      '/addons',
      '/plugins',
      '/settings',
      '/trips',
      '/tags',
      '/categories',
      '/public/trips/demo',
      '/shared/demo',
    ]) {
      const r = request(path);
      expect(isPlannerRequest(path)).toBe(false);
      await expect(binding.handle(r)).resolves.toEqual({ account: true });
      expect(app).toHaveBeenLastCalledWith(r);
    }
    expect(cohort.handle).not.toHaveBeenCalled();
    binding.dispose();
  });
  it('sends every Trip and ancillary planner route through the owned handler', async () => {
    const app = vi.fn();
    cohort.install.mockReturnValue(cohort.release);
    cohort.handle.mockResolvedValue({ owned: true });
    const binding = installFamilyPlanner(repository, app);
    for (const path of [
      '/trips/abc',
      '/trips/abc/bundle',
      '/trips/abc/family/task-commands',
      '/day-schedule/abc',
      '/day-tints/abc',
      '/map-markers/abc',
      '/map-layers/abc',
      '/trip-warnings/abc',
      '/view-contributions/person/abc',
    ]) {
      const r = request(path);
      expect(isPlannerRequest(path)).toBe(true);
      await expect(binding.handle(r)).resolves.toEqual({ owned: true });
      expect(cohort.handle).toHaveBeenLastCalledWith(r);
    }
    expect(app).not.toHaveBeenCalled();
    binding.dispose();
  });
  it('retains the exact command, original headers and abort signal', async () => {
    cohort.install.mockReturnValue(cohort.release);
    cohort.handle.mockResolvedValue({ committed: true });
    const app = vi.fn(),
      binding = installFamilyPlanner(repository, app);
    const r = {
      ...request('/trips/abc/family/planner-editor-command'),
      method: 'POST',
      body: { operation_id: 'original', revision: 7 },
      headers: { 'x-idempotency-key': 'original' },
      signal: new AbortController().signal,
    };
    await binding.handle(r);
    expect(cohort.handle.mock.calls[0][0]).toBe(r);
    expect(app).not.toHaveBeenCalled();
    binding.dispose();
  });
  it('refuses all dispatch after release instead of falling back to legacy', async () => {
    cohort.install.mockReturnValue(cohort.release);
    const app = vi.fn(),
      binding = installFamilyPlanner(repository, app);
    binding.dispose();
    binding.dispose();
    expect(cohort.release).toHaveBeenCalledTimes(1);
    for (const path of ['/trips/abc', '/auth/me'])
      await expect(binding.handle(request(path))).rejects.toMatchObject({
        status: 409,
        code: 'planner_cohort_disposed',
      });
    expect(app).not.toHaveBeenCalled();
    expect(cohort.handle).not.toHaveBeenCalled();
  });
  it('disposes an uninstalled reader on exclusive-port installation failure', () => {
    const error = new Error('another planner owns the ports');
    cohort.install.mockImplementation(() => {
      throw error;
    });
    expect(() => installFamilyPlanner(repository, vi.fn())).toThrow(error);
    expect(cohort.dispose).toHaveBeenCalledTimes(1);
    expect(cohort.release).not.toHaveBeenCalled();
  });
});
