from pathlib import Path
s=Path(__file__).resolve().parent;r=Path('/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2')
driver=(r/'client/tests/browser/family-offline-lifecycle/run.mjs').read_text()
assert driver.count("assert.equal(fixture.api, 'http://127.0.0.1:55331');")==1
assert driver.count('assert.equal(proof.migrations, 119);')==1
driver=driver.replace("assert.equal(fixture.api, 'http://127.0.0.1:55331');","assert.equal(fixture.api, 'http://127.0.0.1:55431');").replace('assert.equal(proof.migrations, 119);','assert.equal(proof.migrations, 122);')
driver=driver.replace("path.join(root, 'tests/browser/pwa-entry/loopback-proxy.mjs')",repr(str(s/'guarded-proxy.mjs')))
proxy=(r/'client/tests/browser/pwa-entry/loopback-proxy.mjs').read_text();old='const deny = offline || !allowed.has(u.origin) || !!u.username || !!u.password;';assert proxy.count(old)==1
proxy=proxy.replace(old,old[:-1]+" || u.pathname.includes('/render/image/');");(s/'guarded-proxy.mjs').write_text(proxy)
marker="else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'controls') await nativeControlsChecks();";assert driver.count(marker)==1
driver=driver.replace(marker,"else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'controls') await packingNativeFinalChecks();")
(s/'packing-category-browser-driver.mjs').write_text(driver+'\n'+(s/'category-browser-check.mjs').read_text())
print('Scoped122 actual App/worker driver with pre-network hosted/transform guards prepared.')
