from pathlib import Path
import hashlib, json, os, subprocess, tomllib

STAGE = Path(os.environ.get('FAMILY_PACKING_GROUP_STAGE','/private/tmp'))
ROOT = Path(__file__).resolve().parents[2]
STATE = Path('/private/tmp/family-modernization-active.json')

def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', container(), 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], input=statement, capture_output=True, text=True, timeout=150)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def container():
    return 'supabase_db_' + json.loads(STATE.read_text())['project_id']

def validate():
    state = json.loads(STATE.read_text())
    work = Path(state['workdir']).resolve()
    assert state['project_id'] == 'family-modernization-20261104-q8ichzv'
    assert state['api_port'] == 55331 and state['db_port'] == 55332
    assert str(work).startswith('/private/tmp/family-modernization-')
    assert (work/'.family-modernization-disposable.json').is_file()
    assert not (work/'supabase/.temp/project-ref').exists()
    config = tomllib.loads((work/'supabase/config.toml').read_text())
    assert config['project_id'] == state['project_id']
    assert config['db']['port'] == 55332 and config['api']['port'] == 55331
    info = json.loads(subprocess.check_output(['docker', 'inspect', container()], text=True))[0]
    assert any(int(x['HostPort']) == 55332 for x in info['NetworkSettings']['Ports']['5432/tcp'])
    assert sql("select exists(select 1 from public.families where id='0ea04851-1ad5-428d-9460-f086a4e94aa6')") == 'f'
    return work

def old_hashes():
    hashes = json.loads((ROOT/'supabase/tests/packing_group_migration_prefix.json').read_text())
    assert len(hashes) == 119
    assert all(hashlib.sha256((ROOT/'supabase/migrations'/n).read_bytes()).hexdigest() == h for n,h in hashes.items())

def manifest():
    tables = json.loads(sql("select jsonb_agg(format('%I.%I',n.nspname,c.relname) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','family_auth') and c.relkind='r'"))
    rows = []
    for table in tables:
        rows.append("select '"+table.replace("'","''")+"' k, md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]')::text) h from "+table+' x')
    return json.loads(sql('select jsonb_object_agg(k,h) from ('+' union all '.join(rows)+') x'))

