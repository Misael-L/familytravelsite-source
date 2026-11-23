from pathlib import Path
import json,hashlib
T=Path(__file__).parent;W=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4');b=json.loads((T/'before-private.json').read_text());source='client/src/integrations/family/publicVariantCache.ts';test='client/src/integrations/family/publicVariantCache.test.ts';sha=lambda x:hashlib.sha256(x).hexdigest();old=(W/source).read_text();oldtest=(W/test).read_text();assert sha(old.encode())==b['website_tracked'][source]and sha(oldtest.encode())==b['website_tracked'][test]
block="""  it('uses the checked response stream without reading a nullable body twice', async () => {
    const f = setup();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const r = response(stream);
    let reads = 0;
    const readBody = vi.fn((): ReadableStream<Uint8Array> | null => (++reads === 1 ? stream : null));
    Object.defineProperty(r, 'body', { get: readBody });
    const getReader = vi.spyOn(stream, 'getReader');
    f.network.mockResolvedValueOnce(r);

    const saved = await f.api.capture(desc(), context);
    expect(saved.status).toBe('ready');
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(getReader).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(f.rows.size).toBe(1);
  });
  it.each(['non-numeric-length', 'oversized-length', 'non-webp'])(
    'rejects %s before acquiring a response reader',
    async (mode) => {
      const f = setup();
      const headers = new Headers({ 'content-type': 'image/webp' });
      if (mode === 'non-webp') headers.set('content-type', 'text/html');
      else
        headers.set(
          'content-length',
          mode === 'non-numeric-length' ? 'invalid' : String(PUBLIC_VARIANT_LIMITS.imageBytes + 1)
        );
      const r = response(bytes, headers);
      const stream = r.body;
      if (!stream) throw new Error('Expected the response stream fixture');
      const getReader = vi.spyOn(stream, 'getReader');
      f.network.mockResolvedValueOnce(r);

      await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'response' });
      expect(getReader).not.toHaveBeenCalled();
      expect(stream.locked).toBe(false);
      expect(f.rows.size).toBe(0);
    }
  );
"""
anchor="  it('bounds the streamed body even without Content-Length and cancels the reader', async () => {";assert oldtest.count(anchor)==1;newtest=oldtest.replace(anchor,block+anchor)
start=old.index('function responseLength(');end=old.index('async function body(',start);helper=old[start:end]
newhelper=helper.replace('function responseLength(', 'function checkedResponse(').replace("    response.headers.get('content-type')?.trim().toLowerCase() !== 'image/webp' ||\n    !response.body", "    response.headers.get('content-type')?.trim().toLowerCase() !== 'image/webp'").replace('  return length;','  const stream = response.body;\n  if (!stream) fail(\'response\');\n  return { length, stream };')
new=old[:start]+newhelper+old[end:];oldcaller="  const length = responseLength(response, limits);\n  const reader = response.body.getReader(),";newcaller="  const { length, stream } = checkedResponse(response, limits);\n  const reader = stream.getReader(),";assert new.count(oldcaller)==1;new=new.replace(oldcaller,newcaller)
assert new.replace(newhelper,helper).replace(newcaller,oldcaller)==old and newtest.replace(block,'')==oldtest
for n,s in [('original-source.ts',old),('candidate-source.ts',new),('original-test.ts',oldtest),('candidate-test.ts',newtest),('added-tests.ts.txt',block)]: (T/n).write_text(s)
p={'source':source,'test':test,'source_before_sha256':sha(old.encode()),'source_after_sha256':sha(new.encode()),'test_before_sha256':sha(oldtest.encode()),'test_after_sha256':sha(newtest.encode()),'exact_original_source_restored_by_reversing_helper_and_caller':True,'all_original_test_bytes_restored_by_removing_only_added_block':True,'intentional_behavior_delta':'Use the same validated stream and read Response.body once instead of twice. HTTP/header checks retain order before stream acquisition; resource cleanup stays in the same finally.','new_test_cases':4,'new_cases_one_red_on_original_expected':True,'no_policy_baseline_or_suppression_change':True};(T/'response-contract-proposal.json').write_text(json.dumps(p,indent=2)+'\n');print('Prepared two-file response contract and four focused regression cases.')
