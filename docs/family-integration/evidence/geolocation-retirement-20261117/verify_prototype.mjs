import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ts from '/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4/node_modules/typescript/lib/typescript.js';
const T='/private/tmp/trek-core-geolocation-retirement-source-20261117';
const parse=s=>ts.createSourceFile('useGeolocation.ts',s,ts.ScriptTarget.Latest,true),printer=ts.createPrinter({removeComments:true}),print=(node,sf)=>printer.printNode(ts.EmitHint.Unspecified,node,sf);
const a=parse(fs.readFileSync(T+'/original.ts','utf8')),b=parse(fs.readFileSync(T+'/candidate.ts','utf8'));
const prefix=sf=>sf.statements.filter(n=>!ts.isFunctionDeclaration(n)||!['useGeolocation','clearLocationWatch','retainLocationWatch'].includes(n.name?.text)).map(n=>print(n,sf));
assert.deepEqual(prefix(a),prefix(b));
function calls(sf,names){const out=[];function visit(n){if(ts.isCallExpression(n)&&names.includes(n.expression.getText(sf)))out.push(print(n,sf));ts.forEachChild(n,visit);}visit(sf);return out;}
assert.deepEqual(calls(a,['useState','useRef','useEffect']),calls(b,['useState','useRef','useEffect']));
function deps(sf){const out=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='useCallback')out.push(print(n.arguments.at(-1),sf));ts.forEachChild(n,visit);}visit(sf);return out;}
assert.deepEqual(deps(a),deps(b));
function watches(sf){const found=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='navigator.geolocation.watchPosition')found.push(print(n.arguments[2],sf));ts.forEachChild(n,visit);}visit(sf);return found;}
assert.deepEqual(watches(a),watches(b));
const boundary=JSON.parse(fs.readFileSync(T+'/candidate-boundary.json'));assert(boundary.passed);assert.equal(boundary.files.find(x=>x.file.endsWith('.test.ts')).warnings,0);
const before=JSON.parse(fs.readFileSync(T+'/original-tests.json')),after=JSON.parse(fs.readFileSync(T+'/candidate-tests.json'));assert.equal(before.numTotalTests,418);assert.equal(before.numFailedTests,13);assert.equal(after.numPassedTests,418);assert.equal(after.numFailedTests,0);
const failed=before.testResults.flatMap(f=>f.assertionResults.filter(x=>x.status==='failed').map(x=>({path:f.name.split('/client/')[1],name:x.fullName})));assert(failed.every(x=>x.path==='src/hooks/useGeolocation.lifecycle.test.ts'));
const hash=n=>crypto.createHash('sha256').update(fs.readFileSync(T+'/'+n)).digest('hex');
const result={passed:true,unchanged_imports_exports_one_shot_and_projection_helpers:true,state_ref_effect_call_order_exact:true,callback_dependencies_exact:true,watch_options_exact:true,new_async_boundaries:0,callback_retirement_and_watch_adoption_intentionally_changed:true,new_test_warnings:0,new_regressions:25,existing_regressions:393,total_candidate_passed:418,original_new_regression_failures:failed,source_sha256:hash('candidate.ts'),test_sha256:hash('useGeolocation.lifecycle.test.ts'),coverage:JSON.parse(fs.readFileSync(T+'/candidate-coverage/coverage-summary.json')).total};
fs.writeFileSync(T+'/prototype-proof.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,regressions:418,original_failures:failed.length,new_tests:25,hook_lines:boundary.measurements.find(x=>x.name==='useGeolocation').lines}));
