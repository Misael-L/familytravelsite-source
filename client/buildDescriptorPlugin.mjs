import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

/** A descriptor of finalized entry bytes, not an input to entry hashing. */
export function familyBuildDescriptor(version, requireRelease = false) {
  if (typeof version !== 'string' || !/^[\w.+-]{1,64}$/.test(version)) throw Error('Invalid app build version');
  if (requireRelease && !/^family-\d{4}\.\d{2}\.\d{2}\.\d+(?:-rc\.\d+)?$/.test(version))
    throw Error('A Family release build requires APP_VERSION=family-YYYY.MM.DD.N[-rc.K]');
  return {
    name: 'family-public-build-descriptor',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entries = Object.values(bundle).filter(
          (item) => item.type === 'chunk' && item.isEntry && item.name === 'index'
        );
        if (entries.length !== 1) throw Error('Exactly one index entry is required for build identity');
        const entry = entries[0],
          body = Buffer.from(entry.code);
        if (
          !/^assets\/index-[A-Za-z0-9_-]+\.js$/.test(entry.fileName) ||
          body.length < 1 ||
          body.length > 8 * 1024 * 1024
        )
          throw Error('Unsupported public build entry');
        this.emitFile({
          type: 'asset',
          fileName: 'family-build.json',
          source:
            JSON.stringify({
              format: 'family.build.v1',
              version,
              entry: {
                path: '/' + entry.fileName,
                bytes: body.length,
                sha256: createHash('sha256').update(body).digest('hex'),
              },
            }) + '\n',
        });
      },
    },
  };
}
