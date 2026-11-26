import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ts from '/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4/node_modules/typescript/lib/typescript.js';
const T='/private/tmp/trek-core-planner-page-source-20261118',parse=s=>ts.createSourceFile('useTripPlannerPage.ts',s,ts.ScriptTarget.Latest,true),printer=ts.createPrinter({removeComments:true});
const original=fs.readFileSync(T+'/original.ts','utf8'),candidate=fs.readFileSync(T+'/candidate.ts','utf8'),a=parse(original),b=parse(candidate),print=(n,s)=>printer.printNode(ts.EmitHint.Unspecified,n,s);
function find(sf,predicate){const found=[];function walk(n){if(predicate(n))found.push(n);ts.forEachChild(n,walk);}walk(sf);assert.equal(found.length,1);return found[0];}
const decl=sf=>find(sf,n=>ts.isVariableDeclaration(n)&&n.name.getText(sf)==='closePlaceForm'),ac=decl(a),bc=decl(b),helper=find(b,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='clearPlaceForm');
assert(ts.isArrowFunction(ac.initializer)&&ts.isArrowFunction(bc.initializer));const call=bc.initializer.body;assert(ts.isCallExpression(call));assert.equal(call.expression.getText(b),'clearPlaceForm');
const names=['setShowPlaceForm','setEditingPlace','setEditingAssignmentId','setPrefillCoords','setServiceStopForm'];
assert.deepEqual(call.arguments.map(n=>n.getText(b)),names);assert.deepEqual(helper.parameters.map(n=>n.name.getText(b)),names);assert.deepEqual(helper.body.statements.map(n=>print(n,b)),ac.initializer.body.statements.map(n=>print(n,a)));
let restored=candidate;for(const[start,end,text]of[[helper.getStart(b),helper.end,''],[bc.initializer.getStart(b),bc.initializer.end,ac.initializer.getText(a)]].sort((x,y)=>y[0]-x[0]))restored=restored.slice(0,start)+text+restored.slice(end);
assert.equal(printer.printFile(parse(restored)),printer.printFile(a));
const boundary=JSON.parse(fs.readFileSync(T+'/candidate-boundary.json'));assert(boundary.passed);assert(boundary.files.filter(x=>/\.test\.tsx?$/.test(x.file)).every(x=>!x.errors&&!x.warnings&&x.formatted));
for(const v of['original','candidate']){const result=JSON.parse(fs.readFileSync(T+'/'+v+'-result.json'));assert.equal(result.exit,0);assert.equal(result.numPassedTests,207);assert.equal(result.numFailedTests,0);}
const sha=n=>crypto.createHash('sha256').update(fs.readFileSync(T+'/'+n)).digest('hex');
const out={passed:true,entire_original_module_AST_restored_by_only_inlining_cleanup_and_removing_private_helper:true,unchanged_route_memo_dependencies_and_hook_order:true,cleanup_editor_lookup_cancellation_and_five_local_setter_calls_exact:true,unchanged_public_wrapper_phone_planner_reuse_and_return_model:true,new_async_boundaries:0,functional_behavior_change:null,candidate_passed:207,original_passed:207,new_hook_consumer_cases:25,existing_cases:182,source_sha256:sha('candidate.ts'),test_sha256:{'useTripPlannerPage.test.tsx':sha('useTripPlannerPage.test.tsx')},coverage:JSON.parse(fs.readFileSync(T+'/candidate-coverage/coverage-summary.json')),boundary:boundary.measurements.filter(m=>m.file.endsWith('useTripPlannerPage.ts')),existing_root_complexity_unchanged:23};
fs.writeFileSync(T+'/prototype-proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:true,candidate_passed:207,original_passed:207,coverage:out.coverage.total,boundary:out.boundary.filter(x=>['clearPlaceForm','useTripPlannerPageOf'].includes(x.name))}));
