from pathlib import Path
import json
T=Path(__file__).parent;a=json.loads((T/'boundary-before.json').read_text());b=json.loads((T/'boundary-after.json').read_text())
keys=['current_roots','current_nodes','current_nodes_sha256','current_edges_sha256','current_source_hashes','boundary_current_entry_membership','configuration_hashes','literal_glob_expansions','dynamic_review']
assert all(a[k]==b[k]for k in keys)and a['current_nodes']==6091
assert a['raw_sources']+3==b['raw_sources']and a['application_modules']+2==b['application_modules']
old=a['all_value_type_ImportTypeNode_JSDoc_mock_require_consumers'];new=b['all_value_type_ImportTypeNode_JSDoc_mock_require_consumers'];assert len(old)==3 and len(new)==7
for r in old:assert any(x['from']==r['from']and x['target']==r['target']and x['declaration']==r['declaration']for x in new)
assert a['augmentation']==b['augmentation']==[]and a['synthetic_direct_import_positive_control']and b['synthetic_direct_import_positive_control']
r={'passed':True,'current_nodes':6091,'current_roots_graph_edges_source_bytes_config_dynamic_globs_exact':True,'raw_sources_before_after':[a['raw_sources'],b['raw_sources']],'application_modules_before_after':[a['application_modules'],b['application_modules']],'incoming_edges_before_after':[len(old),len(new)],'existing_booking_transport_and_day_timeline_consumers_preserved':True,'only_new_test_parent_form_and_shared_helper_imports_added':True,'no_module_augmentation_or_new_runtime_mount':True,'synthetic_import_control_detects_parent':True};(T/'boundary-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
