#!/usr/bin/env bash
# Ephemeral local-only §47R identities. Refuses production.
# Disposable mode: FTA47R_DISPOSABLE_REQUIRED=1 + FTA47R_* routing; never overwrites
# client/.env.47r.e2e.local. Manual mode writes that gitignored file for current-stack 54321.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
APP="${FAMILYTRAVELAPP_ROOT:-$HOME/Desktop/FamilyTravelApp}"
PROD_FINGERPRINT="0ea04851-1ad5-428d-9460-f086a4e94aa6"
FAM_A='dddddddd-4700-4000-8000-000000000047'
FAM_B='dddddddd-4700-4000-8000-000000000048'
COUNTRY_ID='dddddddd-4700-4000-8000-000000000050'
PLACE_ID='dddddddd-4700-4000-8000-000000000051'
TRIP_ID='dddddddd-4700-4000-8000-000000000052'
JOURNEY_ID='dddddddd-4700-4000-8000-000000000053'
LIST_ID='dddddddd-4700-4000-8000-000000000054'
ENTRY_ID='dddddddd-4700-4000-8000-000000000055'
LIST_ITEM_ID='dddddddd-4700-4000-8000-000000000056'

if [[ ! -d "$APP/supabase" ]]; then
  echo "seed-47r-local: FamilyTravelApp supabase dir not found at $APP" >&2
  exit 1
fi

if [[ "${FTA47R_DISPOSABLE_REQUIRED:-}" == "1" ]]; then
  # shellcheck source=../../../../FamilyTravelApp/scripts/47r11-disposable-env.sh
  source "${APP}/scripts/47r11-disposable-env.sh"
  fta47r_load_status
  ENV_OUT="${FTA47R_SEED_ENV_OUT:-}"
  if [[ -z "$ENV_OUT" ]]; then
    echo "seed-47r-local: FTA47R_SEED_ENV_OUT is required in disposable mode" >&2
    exit 1
  fi
  if [[ "$ENV_OUT" == "$ROOT/client/.env.47r.e2e.local" ]]; then
    echo "seed-47r-local: disposable seed must not overwrite client/.env.47r.e2e.local" >&2
    exit 1
  fi
else
  cd "$APP"
  STATUS_ENV="$(supabase status -o env 2>/dev/null || true)"
  if echo "$STATUS_ENV" | grep -Eq 'gdqywxjlkcrsuylqdhmc|supabase\.co'; then
    echo "seed-47r-local: refused production-looking Supabase URL" >&2
    exit 1
  fi
  API_URL="$(printf '%s\n' "$STATUS_ENV" | awk -F= '/^API_URL=/{print substr($0,index($0,"=")+1)}' | tr -d '"')"
  ANON_KEY="$(printf '%s\n' "$STATUS_ENV" | awk -F= '/^ANON_KEY=/{print substr($0,index($0,"=")+1)}' | tr -d '"')"
  SERVICE_ROLE_KEY="$(printf '%s\n' "$STATUS_ENV" | awk -F= '/^SERVICE_ROLE_KEY=/{print substr($0,index($0,"=")+1)}' | tr -d '"')"
  DB_URL="$(printf '%s\n' "$STATUS_ENV" | awk -F= '/^DB_URL=/{print substr($0,index($0,"=")+1)}' | tr -d '"')"
  if [[ -z "$API_URL" || -z "$ANON_KEY" || -z "$SERVICE_ROLE_KEY" || -z "$DB_URL" ]]; then
    echo "seed-47r-local: local supabase is not running" >&2
    exit 1
  fi
  if [[ "$API_URL" != "http://127.0.0.1:54321" && "$API_URL" != "http://localhost:54321" ]]; then
    echo "seed-47r-local: manual seed API_URL must be local 54321" >&2
    exit 1
  fi
  ENV_OUT="${FTA47R_SEED_ENV_OUT:-$ROOT/client/.env.47r.e2e.local}"
fi

FP="$(psql "$DB_URL" -Atqc "select exists(select 1 from public.families where id = '$PROD_FINGERPRINT');")"
if [[ "$FP" == "t" ]]; then
  echo "seed-47r-local: refused production family fingerprint" >&2
  exit 1
fi

PASSWORD='phase47r-local-only'
upsert_user() {
  local email="$1"
  local body http id
  body="$(printf '{"email":"%s","password":"%s","email_confirm":true}' "$email" "$PASSWORD")"
  http="$(curl -sS -o /tmp/47r-user.json -w '%{http_code}' \
    -X POST "$API_URL/auth/v1/admin/users" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "$body")"
  if [[ "$http" == "200" || "$http" == "201" ]]; then
    python3 -c 'import json; print(json.load(open("/tmp/47r-user.json"))["id"])'
    return
  fi
  curl -sS "$API_URL/auth/v1/admin/users?page=1&per_page=200" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "apikey: $SERVICE_ROLE_KEY" >/tmp/47r-users.json
  id="$(python3 - "$email" <<'PY'
import json, sys
email = sys.argv[1]
data = json.load(open("/tmp/47r-users.json"))
users = data.get("users") if isinstance(data, dict) else data
for u in users or []:
    if u.get("email") == email:
        print(u["id"])
        break
else:
    raise SystemExit(f"missing user {email}")
PY
)"
  curl -sS -o /tmp/47r-user.json -w '%{http_code}' \
    -X PUT "$API_URL/auth/v1/admin/users/$id" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"password":"%s","email_confirm":true}' "$PASSWORD")" >/dev/null
  printf '%s\n' "$id"
}

HOF_ID="$(upsert_user 'phase47r-hof@local.test')"
MEMBER_ID="$(upsert_user 'phase47r-member@local.test')"
REVIEWER_ID="$(upsert_user 'phase47r-reviewer@local.test')"
INACTIVE_ID="$(upsert_user 'phase47r-inactive@local.test')"
STRANGER_ID="$(upsert_user 'phase47r-stranger@local.test')"

export HOF_ID MEMBER_ID REVIEWER_ID INACTIVE_ID STRANGER_ID
export FAM_A FAM_B COUNTRY_ID PLACE_ID TRIP_ID JOURNEY_ID LIST_ID ENTRY_ID LIST_ITEM_ID
psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
begin;
select set_config('family_auth.allow_identity_link', '1', true);

insert into public.families (id, name, primary_color)
values
  ('dddddddd-4700-4000-8000-000000000047', '47R A', '#111111'),
  ('dddddddd-4700-4000-8000-000000000048', '47R B', '#222222')
on conflict (id) do update set name = excluded.name;

insert into public.family_branches (family_id, name)
values
  ('dddddddd-4700-4000-8000-000000000047', 'Root'),
  ('dddddddd-4700-4000-8000-000000000048', 'Root')
on conflict (family_id, name) do nothing;

insert into public.profiles (id, display_name, is_super_admin)
values
  ('$HOF_ID', 'HOF 47R', false),
  ('$MEMBER_ID', 'Member 47R', false),
  ('$REVIEWER_ID', 'Reviewer 47R', false),
  ('$INACTIVE_ID', 'Inactive 47R', false),
  ('$STRANGER_ID', 'Stranger 47R', false)
on conflict (id) do update
  set display_name = excluded.display_name, is_super_admin = excluded.is_super_admin;

insert into public.family_members (family_id, branch_id, user_id, role, status)
select
  'dddddddd-4700-4000-8000-000000000047',
  (select id from public.family_branches where family_id = 'dddddddd-4700-4000-8000-000000000047' and name = 'Root' limit 1),
  x.user_id, x.role, x.status
from (values
  ('$HOF_ID'::uuid, 'patriarch'::public.family_role, 'active'::public.membership_status),
  ('$MEMBER_ID'::uuid, 'child', 'active'),
  ('$REVIEWER_ID'::uuid, 'parent', 'active'),
  ('$INACTIVE_ID'::uuid, 'child', 'suspended')
) as x(user_id, role, status)
on conflict (family_id, user_id) do update
  set role = excluded.role, status = excluded.status, branch_id = excluded.branch_id;

insert into public.family_members (family_id, branch_id, user_id, role, status)
select
  'dddddddd-4700-4000-8000-000000000048',
  (select id from public.family_branches where family_id = 'dddddddd-4700-4000-8000-000000000048' and name = 'Root' limit 1),
  '$STRANGER_ID'::uuid, 'parent', 'active'
on conflict (family_id, user_id) do update
  set role = excluded.role, status = excluded.status, branch_id = excluded.branch_id;

insert into public.people (family_id, user_id, display_name, email)
select v.family_id, v.user_id, v.display_name, v.email
from (values
  ('dddddddd-4700-4000-8000-000000000047'::uuid, '$HOF_ID'::uuid, 'HOF 47R', 'phase47r-hof@local.test'),
  ('dddddddd-4700-4000-8000-000000000047'::uuid, '$MEMBER_ID'::uuid, 'Member 47R', 'phase47r-member@local.test'),
  ('dddddddd-4700-4000-8000-000000000047'::uuid, '$REVIEWER_ID'::uuid, 'Reviewer 47R', 'phase47r-reviewer@local.test'),
  ('dddddddd-4700-4000-8000-000000000047'::uuid, '$INACTIVE_ID'::uuid, 'Inactive 47R', 'phase47r-inactive@local.test'),
  ('dddddddd-4700-4000-8000-000000000048'::uuid, '$STRANGER_ID'::uuid, 'Stranger 47R', 'phase47r-stranger@local.test')
) as v(family_id, user_id, display_name, email)
where not exists (
  select 1 from public.people p where p.user_id = v.user_id and p.family_id = v.family_id
);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email like 'phase47r-%@local.test'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

delete from auth.mfa_challenges
where factor_id in (
  select f.id from auth.mfa_factors f
  join auth.users u on u.id = f.user_id
  where u.email like 'phase47r-%@local.test'
);
delete from auth.mfa_factors
where user_id in (select id from auth.users where email like 'phase47r-%@local.test');

delete from public.family_member_map_preferences
where family_id in ('$FAM_A', '$FAM_B');
delete from public.family_map_settings
where family_id in ('$FAM_A', '$FAM_B');

insert into public.countries (id, name, iso2, iso3)
values ('$COUNTRY_ID', '47R Italy', 'QZ', 'QZZ')
on conflict (id) do update set name = excluded.name;

insert into public.places (id, name, country_id, latitude, longitude, coord_source)
values ('$PLACE_ID', '47R Florence', '$COUNTRY_ID', 43.76960000, 11.25580000, 'curated')
on conflict (id) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      name = excluded.name,
      coord_source = excluded.coord_source;

insert into public.trips (id, family_id, name, primary_country_id, status, start_at, end_at, created_by_person_id)
select '$TRIP_ID', '$FAM_A', '47R Planner Fixture', '$COUNTRY_ID', 'planning',
  timestamptz '2026-09-10 00:00:00+00', timestamptz '2026-09-12 00:00:00+00',
  p.id
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.trip_places (trip_id, place_id, is_primary)
values ('$TRIP_ID', '$PLACE_ID', true)
on conflict (trip_id, place_id) do update set is_primary = true;

insert into public.trip_travelers (trip_id, person_id, user_id)
select '$TRIP_ID', p.id, p.user_id
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
  and not exists (
    select 1 from public.trip_travelers tt
    where tt.trip_id = '$TRIP_ID' and tt.person_id = p.id
  );

update public.family_feature_rollouts
set state = 'enabled'
where feature_key = 'journey';

insert into public.family_feature_overrides (family_id, feature_key, enabled, updated_by_person_id)
select '$FAM_A', 'journey', true, p.id
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (family_id, feature_key) do update set enabled = true;

insert into public.journeys (id, family_id, title, status, owner_person_id)
select '$JOURNEY_ID', '$FAM_A', '47R Journey Fixture', 'active', p.id
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (id) do update set title = excluded.title, status = excluded.status;

insert into public.journey_members (journey_id, person_id, role)
select '$JOURNEY_ID', p.id, 'owner'
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (journey_id, person_id) do update set role = 'owner';

insert into public.journey_entries (
  id, journey_id, author_person_id, kind, title, entry_date, location_name, location_lat, location_lng, sort_order
)
select '$ENTRY_ID', '$JOURNEY_ID', p.id, 'checkin', '47R Duomo', '2026-09-10',
  'Florence', 43.7731, 11.2560, 0
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (id) do update set location_lat = excluded.location_lat, location_lng = excluded.location_lng;

insert into public.lists (id, family_id, name, list_kind, visibility, owner_person_id, color)
select '$LIST_ID', '$FAM_A', '47R Collection Fixture', 'wishlist', 'family', p.id, '#6366f1'
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (id) do update set name = excluded.name, visibility = excluded.visibility;

insert into public.list_items (id, list_id, item_kind, place_id, name, added_by_person_id, status)
select '$LIST_ITEM_ID', '$LIST_ID', 'place', '$PLACE_ID', '47R Florence', p.id, 'want'
from public.people p
where p.family_id = '$FAM_A' and p.user_id = '$HOF_ID'
on conflict (id) do update set place_id = excluded.place_id;

do \$\$
begin
  if not exists (
    select 1 from public.people
    where family_id = '$FAM_A' and user_id = '$HOF_ID' and archived_at is null
  ) then
    raise exception '47R seed missing HOF people row';
  end if;
  if not exists (select 1 from public.trips where id = '$TRIP_ID') then
    raise exception '47R seed missing planner trip';
  end if;
  if not exists (select 1 from public.lists where id = '$LIST_ID') then
    raise exception '47R seed missing collection list';
  end if;
  if not exists (
    select 1 from public.trip_places where trip_id = '$TRIP_ID' and place_id = '$PLACE_ID'
  ) then
    raise exception '47R seed missing trip_places pin';
  end if;
end
\$\$;

commit;
SQL

PRIV="$(psql "$DB_URL" -Atqc "select has_table_privilege('authenticated','public.trips','SELECT') and has_table_privilege('authenticated','public.trip_places','SELECT') and has_table_privilege('authenticated','public.places','SELECT') and has_table_privilege('authenticated','public.lists','SELECT');")"
if [[ "$PRIV" != "t" ]]; then
  echo "seed-47r-local: authenticated SELECT missing on trips/trip_places/places/lists" >&2
  exit 1
fi

enroll_totp() {
  python3 - "$API_URL" "$ANON_KEY" "$1" "$PASSWORD" <<'PY'
import hashlib, hmac, json, struct, sys, time, urllib.error, urllib.request, base64

api, anon, email, password = sys.argv[1:5]

def req(method, path, token, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"apikey": anon, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = urllib.request.Request(api.rstrip("/") + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        code = ""
        try:
            code = json.loads(raw).get("error_code") or json.loads(raw).get("msg") or ""
        except Exception:
            code = raw[:120]
        raise SystemExit(f"totp {method} {path} {e.code} {code}") from None

def totp(secret, when=None):
    pad = "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(secret.upper() + pad)
    counter = int((when if when is not None else time.time()) // 30)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"

status, session = req("POST", "/auth/v1/token?grant_type=password", anon, {"email": email, "password": password})
access = session.get("access_token")
if not access:
    raise SystemExit("totp password grant failed")
_, enrolled = req("POST", "/auth/v1/factors", access, {"factor_type": "totp", "friendly_name": "47r-local"})
factor_id = enrolled.get("id")
secret = (enrolled.get("totp") or {}).get("secret")
if not factor_id or not secret:
    raise SystemExit("totp enroll missing secret")
verified = False
for skew in (0, -30, 30):
    _, challenge = req("POST", f"/auth/v1/factors/{factor_id}/challenge", access, {})
    challenge_id = challenge.get("id")
    if not challenge_id:
        continue
    try:
        req("POST", f"/auth/v1/factors/{factor_id}/verify", access, {
            "challenge_id": challenge_id,
            "code": totp(secret, time.time() + skew),
        })
        verified = True
        break
    except SystemExit:
        continue
if not verified:
    raise SystemExit("totp verify failed")
print(secret)
PY
}

HOF_TOTP="$(enroll_totp 'phase47r-hof@local.test')" || exit 1
REVIEWER_TOTP="$(enroll_totp 'phase47r-reviewer@local.test')" || exit 1
STRANGER_TOTP="$(enroll_totp 'phase47r-stranger@local.test')" || exit 1
if [[ -z "$HOF_TOTP" || -z "$REVIEWER_TOTP" || -z "$STRANGER_TOTP" ]]; then
  echo "seed-47r-local: TOTP enroll failed" >&2
  exit 1
fi

python3 - "$API_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY" "$HOF_ID" "$PASSWORD" "$HOF_TOTP" "$TRIP_ID" "$LIST_ID" "$PLACE_ID" <<'PY'
import hmac, hashlib, json, struct, sys, time, urllib.error, urllib.request, base64
api, anon, service, hof_id, password, secret, trip_id, list_id, place_id = sys.argv[1:10]

def totp(when=None):
    pad = "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(secret.upper() + pad)
    counter = int((when if when is not None else time.time()) // 30)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    return f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"

def req(method, path, token, body=None, extra=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"apikey": anon, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if extra:
        headers.update(extra)
    r = urllib.request.Request(api.rstrip("/") + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        raise SystemExit(f"seed-47r-local: {method} {path} {e.code} {raw[:180]}") from None

_, session = req("POST", "/auth/v1/token?grant_type=password", anon, {
    "email": "phase47r-hof@local.test", "password": password,
})
access = session.get("access_token")
if not access:
    raise SystemExit("seed-47r-local: hof password grant failed")
_, admin_user = req("GET", f"/auth/v1/admin/users/{hof_id}", service, extra={"apikey": service})
if isinstance(admin_user, dict) and isinstance(admin_user.get("user"), dict):
    admin_user = admin_user["user"]
factors = admin_user.get("factors") if isinstance(admin_user, dict) else []
factor_id = None
for f in factors or []:
    if f.get("factor_type") == "totp" and f.get("status") == "verified" and f.get("id"):
        factor_id = f.get("id")
        break
if not factor_id:
    raise SystemExit("seed-47r-local: hof totp factor missing")
verified = False
for skew in (0, -30, 30):
    _, challenge = req("POST", f"/auth/v1/factors/{factor_id}/challenge", access, {})
    cid = challenge.get("id")
    if not cid:
        continue
    try:
        _, verified_session = req("POST", f"/auth/v1/factors/{factor_id}/verify", access, {
            "challenge_id": cid, "code": totp(time.time() + skew),
        })
        access = verified_session.get("access_token") or access
        verified = True
        break
    except SystemExit:
        continue
if not verified:
    raise SystemExit("seed-47r-local: hof aal2 verify failed")

def must_row(path, label):
    status, body = req("GET", path, access, extra={"Accept": "application/json", "Prefer": "count=exact"})
    rows = body if isinstance(body, list) else []
    if status >= 400 or not rows:
        raise SystemExit(f"seed-47r-local: authenticated SELECT {label} failed status={status} rows={len(rows)}")

must_row(f"/rest/v1/trips?id=eq.{trip_id}&select=id,name", "trips")
must_row(f"/rest/v1/lists?id=eq.{list_id}&select=id,name", "lists")
must_row(f"/rest/v1/places?id=eq.{place_id}&select=id,name,latitude,longitude", "places")
print("seed-47r-local: hof aal2 SELECT trips/lists/places ok")
PY

umask 077
HOF_PERSON_ID="$(psql "$DB_URL" -Atqc "select id from public.people where family_id = '$FAM_A' and user_id = '$HOF_ID'")"
MEMBER_PERSON_ID="$(psql "$DB_URL" -Atqc "select id from public.people where family_id = '$FAM_A' and user_id = '$MEMBER_ID'")"
WRITE_SERVICE_ROLE=0
if [[ "${FTA47R_DISPOSABLE_REQUIRED:-}" == "1" ]]; then
  WRITE_SERVICE_ROLE=1
fi
{
  echo "VITE_DATA_PLANE=supabase"
  echo "VITE_SUPABASE_URL=$API_URL"
  echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "VITE_MAPBOX_ACCESS_TOKEN="
  if [[ "$WRITE_SERVICE_ROLE" == "1" ]]; then
    echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
    echo "FTA47R_DISPOSABLE_REQUIRED=1"
    echo "FTA47R_DISPOSABLE_WORKDIR=$FTA47R_DISPOSABLE_WORKDIR"
    echo "FTA47R_PROJECT_ID=$FTA47R_PROJECT_ID"
    echo "FTA47R_E2E_ENV_FILE=$FTA47R_E2E_ENV_FILE"
    echo "FTA47R_SEED_ENV_OUT=$FTA47R_SEED_ENV_OUT"
  fi
  echo "47R_HOF_EMAIL=phase47r-hof@local.test"
  echo "47R_MEMBER_EMAIL=phase47r-member@local.test"
  echo "47R_REVIEWER_EMAIL=phase47r-reviewer@local.test"
  echo "47R_INACTIVE_EMAIL=phase47r-inactive@local.test"
  echo "47R_STRANGER_EMAIL=phase47r-stranger@local.test"
  echo "47R_PASSWORD=$PASSWORD"
  echo "47R_HOF_TOTP=$HOF_TOTP"
  echo "47R_REVIEWER_TOTP=$REVIEWER_TOTP"
  echo "47R_STRANGER_TOTP=$STRANGER_TOTP"
  echo "47R_FAMILY_ID=$FAM_A"
  echo "47R_FAMILY_B_ID=$FAM_B"
  echo "47R_TRIP_ID=$TRIP_ID"
  echo "47R_JOURNEY_ID=$JOURNEY_ID"
  echo "47R_LIST_ID=$LIST_ID"
  echo "47R_PLACE_ID=$PLACE_ID"
  echo "47R_HOF_PERSON_ID=$HOF_PERSON_ID"
  echo "47R_MEMBER_PERSON_ID=$MEMBER_PERSON_ID"
} > "$ENV_OUT"
echo "seed-47r-local: wrote env to $(basename "$ENV_OUT")"
rm -f /tmp/47r-user.json /tmp/47r-users.json
