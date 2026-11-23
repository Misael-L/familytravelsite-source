"""Offline source-configuration tests: no Docker, SQL, SDK or network."""
from pathlib import Path
import ast,json,os,sys,unittest,urllib.parse
from unittest.mock import patch
T=Path(__file__).parent
if not (T/'browser_seed.py').exists():raise RuntimeError('Use the explicit owned private fixture stage')
tree=ast.parse((T/'browser_seed.py').read_text());node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='browser_source');env={'os':os,'urllib':urllib};exec(compile(ast.Module(body=[node],type_ignores=[]),'<isolated-source-config>','exec'),env);source=env['browser_source']
image=json.loads((T/'browser-image-final-private.json').read_text())['source'];host=urllib.parse.urlsplit(image).hostname
class Guards(unittest.TestCase):
 def test_qualified_alias_is_unchanged(self):
  with patch.dict(os.environ,{'FAMILY_BROWSER_QUALIFIED':'1'},clear=True):self.assertEqual(source(),'http://127.0.0.1:55331')
 def test_explicit_image_source_matches_executed_private_config(self):
  with patch.dict(os.environ,{'FAMILY_BROWSER_IMAGE_SOURCE':image,'FAMILY_BROWSER_IMAGE_HOST':host},clear=True):self.assertEqual(source(),image)
 def test_missing_image_source_refuses(self):
  with patch.dict(os.environ,{},clear=True),self.assertRaises(KeyError):source()
 def test_missing_expected_host_refuses(self):
  with patch.dict(os.environ,{'FAMILY_BROWSER_IMAGE_SOURCE':image},clear=True),self.assertRaises(KeyError):source()
 def test_other_host_refuses(self):
  with patch.dict(os.environ,{'FAMILY_BROWSER_IMAGE_SOURCE':image,'FAMILY_BROWSER_IMAGE_HOST':'other.invalid'},clear=True),self.assertRaises(ValueError):source()
 def refused(self,value):
  with patch.dict(os.environ,{'FAMILY_BROWSER_IMAGE_SOURCE':value,'FAMILY_BROWSER_IMAGE_HOST':host},clear=True),self.assertRaises(ValueError):source()
 def test_non_https_refuses(self):self.refused(image.replace('https:','http:',1))
 def test_credentials_refuse(self):self.refused(image.replace('://','://fixture:placeholder@',1))
 def test_path_or_parameters_refuse(self):
  for suffix in ['/path','?example=1','#fragment']:self.refused(image+suffix)
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Guards));(T/'fixture-source-config-guards.json').write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'fixture_SQL_authoring_AST_preserved':True,'Docker_SQL_SDK_or_network_calls':0,'source_value_embedded_in_public_script':False},indent=2)+'\n');sys.exit(not result.wasSuccessful())
