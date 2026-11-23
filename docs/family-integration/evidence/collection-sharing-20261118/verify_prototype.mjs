import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ts from '/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4/node_modules/typescript/lib/typescript.js';
const T='/private/tmp/trek-core-collection-sharing-source-20261118',W='/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4';
const parse=s=>ts.createSourceFile('useCollectionSharing.ts',s,ts.ScriptTarget.Latest,true),printer=ts.createPrinter({removeComments:true});
const a=parse(fs.readFileSync(T+'/original.ts','utf8')),b=parse(fs.readFileSync(T+'/candidate.ts','utf8')),print=(n,s)=>printer.printNode(ts.EmitHint.Unspecified,n,s);
function find(sf,predicate){const found=[];function walk(n){if(predicate(n))found.push(n);ts.forEachChild(n,walk);}walk(sf);assert.equal(found.length,1);return found[0];}
for(const name of ['MemberAction','CollectionSharingOptions','sortCollectionMembers','nextCollectionRole']){
 const before=find(a,n=>n.name?.getText(a)===name),after=find(b,n=>n.name?.getText(b)===name);assert.equal(print(before,a),print(after,b));
}
for(const name of ['sortedMembers','slotOf','busyUserId','setRole','cycleRole','cancel','remove','toast','currentUserId','invite','cancelInvite','removeMember','setMemberRole','leave']){
 const before=find(a,n=>ts.isVariableDeclaration(n)&&n.name.getText(a)===name),after=find(b,n=>ts.isVariableDeclaration(n)&&n.name.getText(b)===name);assert.equal(print(before,a),print(after,b));
}
const hook=sf=>find(sf,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='useCollectionSharing');
assert.deepEqual(hook(a).parameters.map(n=>print(n,a)),hook(b).parameters.map(n=>print(n,b)));
assert.equal(print(hook(a).body.statements.at(-1),a),print(hook(b).body.statements.at(-1),b));
const oldBusy=find(a,n=>ts.isCallExpression(n)&&n.expression.getText(a)==='setBusy'&&ts.isBlock(n.arguments[0]?.body));
const helper=find(b,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='clearBusyMember');assert.equal(print(oldBusy.arguments[0].body,a),print(helper.body,b));
const bounds=JSON.parse(fs.readFileSync(T+'/candidate-boundary.json'));assert(bounds.passed&&bounds.diagnostics.length===0);assert(bounds.files.every(f=>f.errors===0&&f.warnings===0&&f.formatted));
const old=JSON.parse(fs.readFileSync(T+'/original-result.json')),now=JSON.parse(fs.readFileSync(T+'/candidate-result.json'));assert.equal(old.numPassedTests,57);assert.equal(old.numFailedTests,21);assert.equal(now.numPassedTests,78);assert.equal(now.numFailedTests,0);assert.equal(now.exit,0);
const failures=JSON.parse(fs.readFileSync(T+'/original-tests.json')).testResults.flatMap(f=>f.assertionResults.filter(x=>x.status==='failed').map(x=>({path:f.name.split('/client/')[1],name:x.fullName})));assert.equal(failures.length,21);assert(failures.every(f=>f.path.endsWith('useCollectionSharing.lifetime.test.tsx')||f.path.endsWith('collectionSharing.consumers.test.tsx')));
const baseline=JSON.parse(fs.readFileSync(W+'/client/scripts/eslint-baseline.json')),tightened=JSON.parse(fs.readFileSync(T+'/tightened-eslint-baseline.json'));assert.equal(baseline.src['react-hooks/set-state-in-effect'],185);baseline.src['react-hooks/set-state-in-effect']=184;assert.deepEqual(tightened,baseline);
const sha=n=>crypto.createHash('sha256').update(fs.readFileSync(T+'/'+n)).digest('hex');
const tests=Object.fromEntries(['useCollectionSharing.lifetime.test.tsx','collectionSharing.consumers.test.tsx','collectionSharing.gates.test.ts'].map(n=>[n,sha(n)]));
const out={passed:true,unchanged_public_options_roles_sorting_store_selectors_action_payload_callbacks_and_result_AST:true,unchanged_desktop_phone_markup_API_store_and_Family_handlers:true,busy_removal_body_exact:true,deliberate_changes:['scope private transient state and async follow-ups to the open collection/permission/account/private-source lifetime','retire operations on close/unmount/selection/permission/session changes and StrictMode effect teardown','use synchronous per-kind/phone-shared action locks without changing desktop concurrent leave semantics','refuse hidden owner-only writes while closed or non-owner','replace obsolete synchronous close-reset effect with owned render-state selection'],existing_native_cases:38,new_cases:40,new_gate_cases:15,original_passed:57,original_failed:21,candidate_passed:78,failures,source_sha256:sha('candidate.ts'),companion_sha256:sha('collectionSharingState.ts'),test_sha256:tests,baseline_sha256:sha('tightened-eslint-baseline.json'),required_ratchet_tightening:{src:{'react-hooks/set-state-in-effect':[185,184]}},new_allowances_or_suppressions:0,coverage:JSON.parse(fs.readFileSync(T+'/candidate-coverage/coverage-summary.json')),measurements:bounds.measurements.filter(x=>!x.file.includes('.test.')),live_or_server_idempotency_acceptance:false};
fs.writeFileSync(T+'/prototype-proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:true,candidate:78,original_failed:21,coverage:out.coverage.total,root_lines:out.measurements.find(x=>x.name==='useCollectionSharing').lines}));
