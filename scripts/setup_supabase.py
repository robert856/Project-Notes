"""One-time setup through the scoped management token in GitHub Actions.
Never print management credentials, API response bodies, or secret API keys.
"""
import base64
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = "xmnwzgihlwgthknenpdl"
SITE_URL = "https://robert856.github.io/Project-Notes/"
ROOT = Path(__file__).resolve().parents[1]


class SetupError(Exception):
    pass


def management(path, method="GET", payload=None):
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SetupError("SUPABASE_ACCESS_TOKEN is missing from repository Actions secrets.")
    request = urllib.request.Request(
        "https://api.supabase.com/v1/projects/" + PROJECT_REF + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        # Supabase responses can include secrets (especially auth configuration).
        # Log only operation/status, never the response body or request headers.
        raise SetupError(f"Supabase {method} {path.split('?')[0]} returned HTTP {error.code}. Check token permissions and the project reference.") from None
    except (urllib.error.URLError, TimeoutError):
        raise SetupError("Could not reach Supabase management API; no credentials were logged.") from None


def is_public_key(key):
    if not isinstance(key, str) or '*' in key:
        return False
    if key.startswith("sb_publishable_"):
        return len(key) > 25
    try:
        payload = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        return payload.get('role') == 'anon'
    except (ValueError, IndexError, UnicodeDecodeError):
        return False


def select_public_key(keys):
    for entry in sorted(keys, key=lambda key: key.get('type') != 'publishable'):
        if entry.get('type') == 'publishable' or entry.get('name') == 'anon':
            key = entry.get('api_key')
            if is_public_key(key):
                return key
    raise SetupError("No readable public/publishable API key was returned. Add the public key as the SUPABASE_PUBLISHABLE_KEY repository variable; do not grant access to secret/service-role keys.")


def auth_settings(existing):
    redirects = [value.strip() for value in (existing.get('uri_allow_list') or '').split(',') if value.strip()]
    if SITE_URL not in redirects:
        redirects.append(SITE_URL)
    return {'site_url': SITE_URL, 'uri_allow_list': ','.join(redirects), 'external_email_enabled': True, 'disable_signup': False, 'mailer_autoconfirm': False}


def setup():
    if not re.fullmatch(r'[a-z]{20}', PROJECT_REF):
        raise SetupError('Invalid project reference.')
    # Scope is the exact project shown in the user-approved dashboard.
    existing = management('/database/migrations') or []
    applied = {item.get('name') for item in existing}
    files = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    if not applied:
        tables = management('/database/query', 'POST', {'query': "select tablename from pg_tables where schemaname='public' and tablename in ('projects','project_members','boards','cards','attachments','project_invites')", 'read_only': True})
        if tables:
            raise SetupError('Application tables already exist without recorded migrations. Stopped to preserve existing data; inspect the schema before retrying.')
    for file in files:
        name = 'stillroom_' + file.stem
        if name in applied:
            print(f'Already applied: {file.name}')
            continue
        management('/database/migrations', 'POST', {'name': name, 'query': file.read_text()})
        print(f'Applied: {file.name}')
    current = management('/config/auth')
    management('/config/auth', 'PATCH', auth_settings(current))
    verified = management('/config/auth')
    if verified.get('site_url') != SITE_URL or not verified.get('external_email_enabled') or verified.get('mailer_autoconfirm') is not False:
        raise SetupError('Email authentication settings did not verify.')
    print('Verified email sign-in, email verification and GitHub Pages redirect URL.')
    key = os.environ.get('SUPABASE_PUBLISHABLE_KEY') or select_public_key(management('/api-keys?reveal=false'))
    if not is_public_key(key):
        raise SetupError('Refusing to publish a non-public API key.')
    checks = management('/database/query', 'POST', {'query': "select count(*) filter(where c.relrowsecurity)::int as secured_tables, count(*)::int as app_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('projects','project_members','boards','cards','attachments','project_invites');", 'read_only': True})
    if not checks or checks[0].get('secured_tables') != 6 or checks[0].get('app_tables') != 6:
        raise SetupError('Application table RLS verification failed.')
    bucket = management('/database/query', 'POST', {'query': "select public is false as private_bucket from storage.buckets where id='attachments';", 'read_only': True})
    if not bucket or not bucket[0].get('private_bucket'):
        raise SetupError('Private attachment bucket verification failed.')
    # Both publishable keys and legacy anon JWTs are intentionally public frontend configuration.
    # Never write any other value from the management API to the checkout/artifacts.
    (ROOT / 'src/supabase-config.json').write_text(json.dumps({'url': f'https://{PROJECT_REF}.supabase.co', 'publishableKey': key}, indent=2) + '\n')
    print('Verified RLS on six tables and private attachment storage. Wrote public frontend configuration.')
    custom_smtp = bool(verified.get('smtp_host'))
    summary = ['## Stillroom Supabase setup', '', '- Migrations applied/verified.', '- Email sign-in and production redirect configured.', '- RLS and private storage verified.', '- Public client configuration generated.', '', '**Email delivery:** ' + ('Custom SMTP is configured; delivery still needs an actual sign-in test.' if custom_smtp else 'Supabase built-in sender only. Sign-in emails are restricted to project-team addresses; inviting other people requires custom SMTP.'), '', 'Browser-local work remains in localStorage/IndexedDB; it has not been uploaded automatically.']
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write('\n'.join(summary)+'\n')
    print('Custom email provider configured: ' + ('yes' if custom_smtp else 'no; built-in sender restrictions apply'))


if __name__ == '__main__':
    try:
        setup()
    except SetupError as error:
        print('::error::Setup stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
