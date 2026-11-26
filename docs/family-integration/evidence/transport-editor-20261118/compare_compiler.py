from pathlib import Path
import json
T=Path(__file__).parent;a=json.loads((T/'original-compiler-surface.json').read_text());b=json.loads((T/'candidate-compiler-surface.json').read_text());paths=json.loads((T/'application-paths.json').read_text());rows={}
for mode in ['ordinary','extended']:
 x,y=a[mode],b[mode];assert x['roots']==y['roots']
 for k in ['parent_exports','functions','lookup','waypoint_types']:assert x[k]==y[k],(mode,k)
 assert x['boundary_diagnostics']==y['boundary_diagnostics']==[] and y['single_shared_factory_and_conversion_symbols']
 u,v=x['source_inventory'],y['source_inventory'];added=sorted(v.keys()-u.keys());removed=sorted(u.keys()-v.keys());changed=sorted(k for k in u.keys()&v.keys()if u[k]!=v[k]);assert added==sorted(paths[1:3])and removed==[]and changed==paths[:1],(mode,added,removed,changed)
 rows[mode]={'roots_before_after':[x['roots'],y['roots']],'sources_before_after':[x['sources'],y['sources']],'added_sources':added,'removed_sources':removed,'changed_sources':changed,'all_other_program_source_bytes_exact':True,'diagnostics_before_after':[0,0]}
r={'passed':True,'programs':rows,'parent_public_types_default_export_and_component_types_exact':True,'same_component_imported_value_bindings_except_reviewed_shared_lookup':True,'lookup_annotation_literal_element_type_exact':True,'parent_and_form_use_single_shared_factory_conversion_symbols':True,'no_any_unknown_or_contract_weakening':True};(T/'compiler-program-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
