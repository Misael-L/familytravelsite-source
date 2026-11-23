import { withFamilyOperationContext } from '@family/backend/supabase/operationContext';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyHandler, FamilyRequest } from './transport';

function requestTrip(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const selector = request.pathname.match(/^\/trips\/([^/]+)/)?.[1];
  if (!selector) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector)) return selector;
  if (!/^\d+$/.test(selector)) return undefined;
  try {
    return repo.knownViews()?.ids.uuid('trip', selector);
  } catch (error) {
    // Route-specific validation retains its original status/message for unresolved legacy keys.
    if (error instanceof Error && 'code' in error && ['invalid_uuid', 'unknown_view_key'].includes(String(error.code)))
      return undefined;
    throw error;
  }
}

type Context = ReturnType<FamilyFrontendRepository['captureContext']>;
const contexts = new WeakMap<FamilyFrontendRepository, Context>();
export function familyRequestContext(repo: FamilyFrontendRepository): Context {
  return contexts.get(repo) ?? repo.captureContext(undefined, { revision: false });
}
/** Wrap handler-level operations, preserving sync payload helpers and exact call arguments. */
export function scopeFamilyOperations<T extends object>(
  repo: FamilyFrontendRepository,
  operations: T,
  context: Context = familyRequestContext(repo)
): T {
  return new Proxy(operations, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        context.assertCurrent();
        const result: unknown = withFamilyOperationContext(context, () => Reflect.apply(value, target, args));
        if (result instanceof Promise)
          return result.then(
            (value) => {
              context.assertCurrent();
              return value;
            },
            (error) => {
              context.assertCurrent();
              throw error;
            }
          );
        context.assertCurrent();
        return result;
      };
    },
  });
}

/** Each request retains its repository owner across awaits; it cannot borrow the next actor's cache. */
export function scopedFamilyRequest(
  repo: FamilyFrontendRepository,
  routes: (scoped: FamilyFrontendRepository) => FamilyHandler
): FamilyHandler {
  const auth = routes(repo);
  return (request: FamilyRequest) => {
    // Authentication deliberately establishes/replaces the session. Its own lifecycle fences apply.
    if (request.pathname.startsWith('/auth/')) return auth(request);
    const repositoryContext = repo.captureContext(requestTrip(repo, request), { revision: false });
    const context = repositoryContext;
    const scoped = new Proxy(repo, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          context.assertCurrent();
          const result: unknown = Reflect.apply(value, target, args);
          // The method has already issued this promise. Attach both handlers even if it
          // synchronously changed context; a pre-await assertion would orphan its rejection.
          if (result instanceof Promise)
            return result.then(
              (value) => {
                context.assertCurrent();
                return value;
              },
              (error) => {
                context.assertCurrent();
                throw error;
              }
            );
          context.assertCurrent();
          return result;
        };
      },
    });
    contexts.set(scoped, context);
    return context.perform(() => routes(scoped)(request));
  };
}
