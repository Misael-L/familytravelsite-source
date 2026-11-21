import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from '/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4/node_modules/typescript/lib/typescript.js';
const T='/private/tmp/trek-core-quality-geolocation-source-20261117';
const original=fs.readFileSync(T+'/original.ts','utf8'),candidate=fs.readFileSync(T+'/candidate.ts','utf8');
const parse=s=>ts.createSourceFile('useGeolocation.ts',s,ts.ScriptTarget.Latest,true);
const before=parse(original),after=parse(candidate);
const helpers=after.statements.filter(n=>ts.isFunctionDeclaration(n)&&['readCompassHeading','watchErrorCode'].includes(n.name?.text));
assert.equal(helpers.length,2);
const compass=helpers.find(n=>n.name.text==='readCompassHeading'),error=helpers.find(n=>n.name.text==='watchErrorCode');
assert.equal(compass.parameters.length,1);assert.equal(error.parameters.length,1);
assert(ts.isReturnStatement(compass.body.statements.at(-1))&&compass.body.statements.at(-1).expression.text==='heading');
assert.equal(error.body.statements.length,1);assert(ts.isReturnStatement(error.body.statements[0]));
let headings=0,errors=0;
const expanded=ts.transform(after,[ctx=>{
 const visit=n=>{
  if(ts.isSourceFile(n))return ts.factory.updateSourceFile(n,ts.visitNodes(n.statements,stmt=>helpers.includes(stmt)?undefined:ts.visitNode(stmt,visit)));
  if(ts.isVariableStatement(n)&&n.declarationList.declarations.length===1){
   const d=n.declarationList.declarations[0];
   if(ts.isCallExpression(d.initializer)&&d.initializer.expression.getText(after)==='readCompassHeading'){
    assert.equal(d.name.getText(after),'heading');assert.equal(d.initializer.arguments[0].getText(after),'e');headings++;
    return compass.body.statements.slice(0,-1);
   }
  }
  if(ts.isCallExpression(n)&&n.expression.getText(after)==='watchErrorCode'){
   assert.equal(n.arguments[0].getText(after),'err');errors++;return error.body.statements[0].expression;
  }
  return ts.visitEachChild(n,visit,ctx);
 };
 return root=>ts.visitNode(root,visit);
}]).transformed[0];
const printer=ts.createPrinter({removeComments:true});
assert.equal(printer.printFile(expanded),printer.printFile(before));
assert.equal(headings,1);assert.equal(errors,1);
const directives=s=>s.split('\n').filter(x=>x.includes('eslint-disable')).map(s=>s.trim()).sort();
assert.deepEqual(directives(candidate),directives(original));
const boundary=JSON.parse(fs.readFileSync(T+'/candidate-boundary.json'));
assert(boundary.passed);
const output={passed:true,whole_module_AST_identical_after_two_synchronous_inlines:true,no_hook_callback_effect_dependency_or_async_boundary_change:true,imports_exports_and_one_shot_exact:true,existing_suppression_comments_exact:true,helpers:boundary.measurements.filter(x=>['useGeolocation','readCompassHeading','watchErrorCode'].includes(x.name)),original_hook_counted_lines:129};
fs.writeFileSync(T+'/structure-proof.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
