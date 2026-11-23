async function packingNativeFinalChecks() {
 page.setDefaultTimeout(20000);
 const commands=[],groups=[],items=[];
 page.on('request',r=>{const p=new URL(r.url()).pathname;if(p.endsWith('/execute_family_trip_packing_category_v1'))commands.push(r.postDataJSON());if(p.endsWith('/execute_family_trip_packing_group_v1'))groups.push(r.postDataJSON());if(p.endsWith('/execute_family_trip_packing_v1'))items.push(r.postDataJSON());});
 const rpc=(name,args)=>page.evaluate(async({api,anon,name,args})=>{
  const key='sb-'+new URL(api).hostname.split('.')[0]+'-auth-token',session=JSON.parse(localStorage.getItem(key));
  if(!session?.access_token)throw Error('Missing actual local SDK session');
  const response=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:JSON.stringify(args)});
  if(response.status!==200)throw Error('Local category check '+name+' '+response.status);return response.json();
 },{api:fixture.api,anon:fixture.anon_key,name,args});
 const read=()=>rpc('get_family_trip_packing_with_categories_v1',{p_trip_id:fixture.trip_id});
 const lists=async()=>{await page.getByRole('button',{name:'Lists',exact:true}).first().click();};
 const edit=async()=>{if(phone&&await page.getByRole('button',{name:'Edit',exact:true}).count())await page.getByRole('button',{name:'Edit',exact:true}).first().click();};
 const header=label=>page.locator('span').filter({hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).first().locator('..');
 const menu=async label=>{await edit();await header(label).getByRole('button',{name:'List options',exact:true}).click();};
 const rename=async(label,name)=>{await menu(label);await page.getByText('Rename',{exact:true}).last().click();const field=page.locator('input:focus');await field.fill(name);await field.press('Enter');};
 const assignments=async label=>{await edit();if(await page.getByRole('button',{name:/Category Guest/}).count())return;const h=header(label);if(phone)await h.getByRole('button',{name:'Assign members',exact:true}).click();else await h.locator('button:has(svg.lucide-user-plus)').click();};
 await page.goto(origin+'/trips/'+fixture.trip_id);await login(fixture.owner,true);
 await expect(page.getByRole('button',{name:'Plan',exact:true}).first()).toBeVisible({timeout:30000});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:90000}).toBe(true);await lists();
 await expect(page.getByText('D16b shared raincoat',{exact:true}).first()).toBeVisible({timeout:30000});
 await expect(page.getByText('D16b peer-only medicine',{exact:true})).toHaveCount(0);
 const initial=await read(),common=initial.categories.find(c=>c.name==='Gear'&&c.owner_person_id===null);assert.ok(common);
 const privateRows=initial.packing.items.filter(r=>r.is_private);
 assert.equal(common.assignments[0].person_id,fixture.historical_guest);
 record('actual App/worker/Auth/TOTP load strict122 coupled categories, private rows stay private, and historical responsibility survives eligibility loss');
 await rename('Gear','Renamed Gear');
 await expect.poll(async()=> (await read()).categories.find(c=>c.id===common.id)?.name).toBe('Renamed Gear');
 await expect(header('Renamed Gear')).toBeVisible();assert.equal(commands.length,1);assert.equal(commands[0].p_action,'category-rename');assert.equal(commands[0].p_observed_category.id,common.id);assert.equal(items.length,0);
 assert.deepEqual((await read()).packing.items.filter(r=>r.is_private),privateRows);
 record('native rename submits exactly one actual category RPC, preserves identity/provenance/personal rows, and publishes the fresh canonical label');
 await assignments('Renamed Gear');
 const guest=page.getByRole('button',{name:/Category Guest/});await expect(guest).toBeVisible({timeout:30000});await guest.click();
 await expect.poll(async()=> (await read()).categories.find(c=>c.id===common.id)?.assignments.map(a=>a.person_id).sort()).toEqual([fixture.category_guest,fixture.historical_guest].sort());
 assert.equal(commands.at(-1).p_action,'category-assignees');assert.deepEqual(commands.at(-1).p_values.person_ids,[fixture.category_guest,fixture.historical_guest].sort());
 record('eligible accountless guest is assigned by Person identity while an ineligible historical assignee remains intact');
 // The complete canonical publication may temporarily replace the native card during each save.
 await expect(header('Renamed Gear')).toBeVisible();
 if(phone){await assignments('Renamed Gear');await page.getByRole('button',{name:/Historical Guest/}).click();}
 else await header('Renamed Gear').locator('button:has(.assignee-chip)').filter({hasText:'H'}).click();
 await expect.poll(async()=> (await read()).categories.find(c=>c.id===common.id)?.assignments.map(a=>a.person_id)).toEqual([fixture.category_guest]);
 await expect(header('Renamed Gear')).toBeVisible();await assignments('Renamed Gear');await expect(page.getByRole('button',{name:/Historical Guest/})).toHaveCount(0);
 record('historical ineligible responsibility can be removed through the native picker/chip and is never promoted into an eligible new choice');
 // Close the picker, then hold an actual committed rename reply.
 await page.keyboard.press('Escape');if(phone)await header('Renamed Gear').getByRole('button',{name:'Assign members',exact:true}).click();else await page.locator('body').click({position:{x:2,y:2}});
 let resume,arrived=false,delivered=false;const held=new Promise(r=>{resume=r;});
 const slow=async route=>{const response=await route.fetch();assert.equal(response.status(),200);arrived=true;await held;await route.fulfill({response});delivered=true;};
 await page.route(fixture.api+'/rest/v1/rpc/execute_family_trip_packing_category_v1',slow);
 const beforeSlow=commands.length;await rename('Renamed Gear','Slow canonical Gear');await expect.poll(()=>arrived).toBe(true);
 assert.equal(commands.length,beforeSlow+1);await expect.poll(async()=>{const pending=page.getByRole('button',{name:'List options',exact:true});return await pending.count()===0 || await pending.first().isDisabled();}).toBe(true);
 resume();await expect.poll(()=>delivered).toBe(true);await page.unroute(fixture.api+'/rest/v1/rpc/execute_family_trip_packing_category_v1',slow);await expect(header('Slow canonical Gear')).toBeVisible({timeout:30000});
 record('a slow real SQL commit disables the pending category menu and results in one immutable operation with no partial optimistic category state');
 let lost=0;const loss=async route=>{const response=await route.fetch();assert.equal(response.status(),200);lost++;await route.abort('failed');};
 await page.route(fixture.api+'/rest/v1/rpc/execute_family_trip_packing_category_v1',loss);
 await rename('Slow canonical Gear','Recovered Gear');await expect.poll(()=>lost).toBe(1);await page.unroute(fixture.api+'/rest/v1/rpc/execute_family_trip_packing_category_v1',loss);
 const beforeReload=commands.length;await page.reload({waitUntil:'domcontentloaded'});const recover=page.getByRole('button',{name:'Check retained packing save',exact:true});
 await expect(recover).toBeVisible({timeout:30000});await recover.click();await expect(page.getByRole('button',{name:'Plan',exact:true}).first()).toBeVisible({timeout:30000});await expect(recover).toHaveCount(0);assert.equal(commands.length,beforeReload);await lists();await expect(header('Recovered Gear')).toBeVisible({timeout:30000});
 record('genuine lost category response survives reload and resolves by the original typed receipt without replay');
 await menu('Recovered Gear');await page.getByText('Check All',{exact:true}).last().click();
 await expect.poll(async()=> (await read()).packing.items.filter(r=>!r.is_private).every(r=>r.checked)).toBe(true);assert.equal(groups.length,1);
 await expect(header('Recovered Gear')).toBeVisible();await page.getByRole('button',{name:/^My list/}).click();await rename('Other','Personal Kit');
 await expect.poll(async()=> (await read()).categories.some(c=>c.name==='Personal Kit'&&c.owner_person_id===initial.scope.person_id)).toBe(true);
 await expect(header('Personal Kit')).toBeVisible();await edit();await expect(header('Personal Kit').getByRole('button',{name:'Assign members',exact:true})).toHaveCount(0);await expect(header('Personal Kit').locator('button:has(svg.lucide-user-plus)')).toHaveCount(0);
 record('existing native group packed-state still works; own-personal rename is enabled while personal assignment stays unavailable');
 await page.getByRole('button',{name:/^Shared\b/}).click();
 // Two distinct raw category identities share the native default display heading.
 for(const category of ['', 'Other']){
  const p=await read();await rpc('execute_family_trip_packing_v1',{p_trip_id:fixture.trip_id,p_operation_id:crypto.randomUUID(),p_scope:p.scope,p_action:'create',p_target_id:crypto.randomUUID(),p_expected_revision:null,p_expected_collection_revision:null,p_values:{name:'Collision '+(category||'empty'),category,visibility:'common'}});
 }
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('button',{name:'Plan',exact:true}).first()).toBeVisible({timeout:30000});await lists();await expect(page.getByText('Collision empty',{exact:true}).first()).toBeVisible({timeout:30000});
 const beforeCollision=commands.length;await menu('Other');await expect(page.getByText('Rename',{exact:true})).toHaveCount(0);await expect(header('Other').getByRole('button',{name:'Assign members',exact:true})).toHaveCount(0);await expect(header('Other').locator('button:has(svg.lucide-user-plus)')).toHaveCount(0);assert.equal(commands.length,beforeCollision);
 record('a default-label collision cannot rename or assign the wrong category, while the native group menu retains supported actions');
 await page.keyboard.press('Escape');
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('button',{name:'Plan',exact:true}).first()).toBeVisible({timeout:30000});await lists();await expect(header('Recovered Gear')).toBeVisible({timeout:30000});
 const beforeOffline=commands.length;await page.evaluate(()=>localStorage.setItem('trek_forced_offline','1'));await page.reload({waitUntil:'domcontentloaded'});await expectCold();await lists();
 await expect(page.getByText('D16b shared raincoat',{exact:true}).first()).toBeVisible({timeout:30000});await expect(header('Recovered Gear')).toBeVisible();await expect(page.getByRole('button',{name:'List options',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Assign members',exact:true})).toHaveCount(0);assert.equal(commands.length,beforeOffline);
 assert.equal(events.filter(e=>e.path.includes('/render/image/')).length,0);assert.equal(proxy.events.filter(e=>String(e.path??'').includes('/render/image/')).length,0);assert.equal(errors.length,0);assert.equal(caught.length,0);
 await page.screenshot({path:path.join(output,'native-categories.png'),fullPage:true});
 snapshots.packingCategories={commands:commands.length,actions:commands.map(c=>c.p_action),distinctOperations:new Set(commands.map(c=>c.p_operation_id)).size,guestPersonIdentity:true,historicalRemoval:true,personalAssignmentGated:true,collisionGated:true,lostCommitReceiptWithoutReplay:true,coldOfflineReadOnly:true,groupCommands:groups.length};
 record('actual generated-worker cold reopening on qualified122 preserves complete category facts but disables all authoring; zero transformation attempts');
}
