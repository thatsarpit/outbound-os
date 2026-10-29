"""Private Hermes sales MCP facade. Outbound actions require human approval.

Uses the existing MCP/API channel implementations; never mounts the CRM database.
The approval listener must be loopback-published behind private Tailscale HTTPS.
"""
import hashlib
import hmac
import html
import json
import os
import secrets
import sqlite3
import threading
import time
import urllib.request
import uuid
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

READ = frozenset('stats_overview whatsapp_costs analytics_funnel analytics_campaign_roi analytics_email_performance list_tags list_leads get_lead lead_timeline list_messages list_campaigns get_campaign campaign_ab_results system_status whatsapp_accounts whatsapp_templates email_accounts email_verification_status list_users list_media_files campaign_leads campaign_preview_leads'.split())
WRITE = frozenset('create_lead update_lead delete_lead lead_toggle_pause lead_set_status lead_assign bulk_lead_action import_leads create_campaign update_campaign delete_campaign populate_campaign start_campaign pause_campaign send_whatsapp send_whatsapp_file send_email verify_email_addresses system_pause_resume'.split())
ALLOWED = READ | WRITE
DIRECT_ONLY = frozenset({'delete_lead', 'delete_campaign', 'bulk_lead_action', 'lead_toggle_pause'})
SLOTS = threading.BoundedSemaphore(2)
MAX_BODY = 65536
TTL = 1800
RECIPIENT_FIELDS = frozenset('id name mobile email waUserId company product country quantity status score repliedAt poolId emailOptOut emailStatus isOnWhatsApp assignedAccount assignedEmailAccountId'.split())


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def result(value, error=False):
    return {'content': [{'type': 'text', 'text': canonical(value)}], 'isError': error}


def unpack(value):
    if value.get('isError'):
        raise ValueError('Upstream rejected the operation; inspect the CRM before retrying.')
    return json.loads(value['content'][0]['text'])


def decode(raw, content_type):
    if 'text/event-stream' in content_type:
        for block in raw.decode().split('\n\n'):
            data = '\n'.join(line[5:].strip() for line in block.splitlines() if line.startswith('data:'))
            if data:
                return json.loads(data)
        raise ValueError('Empty upstream event')
    return json.loads(raw)


def upstream(message):
    headers = {'Authorization': 'Bearer ' + os.environ['UPSTREAM_TOKEN'],
               'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
    req = urllib.request.Request(os.environ['UPSTREAM_URL'], data=canonical(message).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError('Upstream response too large')
        return decode(raw, response.headers.get('Content-Type', '')) if raw else None


def call(tool, args):
    response = upstream({'jsonrpc': '2.0', 'id': secrets.token_hex(8), 'method': 'tools/call',
                         'params': {'name': tool, 'arguments': args}})
    if not response or 'error' in response:
        raise ValueError('Upstream unavailable')
    return response['result']


class Ledger:
    def __init__(self, filename, caller=call, clock=time.time):
        self.filename, self.caller, self.clock = filename, caller, clock
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS approval (id TEXT PRIMARY KEY, digest TEXT NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL, snapshot TEXT, csrf TEXT NOT NULL, created INTEGER NOT NULL, state TEXT NOT NULL, response TEXT)')
            db.execute('CREATE INDEX IF NOT EXISTS approval_digest ON approval(digest, created)')

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.filename, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def snapshot(self, tool, args):
        if tool != 'start_campaign':
            return None
        campaign = unpack(self.caller('get_campaign', {'campaign_id': args['campaign_id']}))
        if campaign.get('status') not in ['draft', 'paused', 'scheduled']:
            raise ValueError('Campaign is not startable.')
        rows, page = [], 1
        while True:
            batch = unpack(self.caller('campaign_leads', {'campaign_id': args['campaign_id'], 'page': page, 'limit': 50}))
            if not all(isinstance(row.get('lead'), dict)
                       and RECIPIENT_FIELDS <= row['lead'].keys()
                       and row['lead']['id'] == row['leadId'] for row in batch['leads']):
                raise ValueError('Recipient destinations or personalization are missing. Upgrade the API before launch approval.')
            rows.extend(batch['leads'])
            if page >= batch['pages']:
                break
            page += 1
            if page > 100:
                raise ValueError('Audience exceeds the 5,000-recipient approval limit; split the campaign.')
        if not any(row.get('status') == 'pending' for row in rows):
            raise ValueError('Populate and review a nonempty campaign audience before launch.')
        # Sorting removes query ordering changes while retaining exact membership/content.
        return {'campaign': campaign, 'audience': sorted(rows, key=lambda row: row['id'])}

    def request(self, tool, args):
        if tool not in WRITE or not isinstance(args, dict):
            raise ValueError('Unsupported sales action')
        args = dict(args)
        request_id = args.pop('_request_id', '')
        if not isinstance(request_id, str) or len(request_id) > 100:
            raise ValueError('Invalid request ID')
        digest = hashlib.sha256(canonical([tool, args, request_id]).encode()).hexdigest()
        now = int(self.clock())
        with self.db() as db:
            previous = db.execute('SELECT * FROM approval WHERE digest=? AND created>? ORDER BY created DESC LIMIT 1', (digest, now - 86400)).fetchone()
            if previous and (previous['state'] != 'pending' or now - previous['created'] <= TTL):
                return self.public(previous)
        snapshot = self.snapshot(tool, args)
        if tool in ['send_whatsapp', 'send_whatsapp_file'] and not args.get('client_message_id'):
            args['client_message_id'] = str(uuid.uuid4())
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM approval WHERE created < ?', (now - 7 * 86400,))
            row = db.execute('SELECT * FROM approval WHERE digest=? AND created>? ORDER BY created DESC LIMIT 1', (digest, now - 86400)).fetchone()
            if row and (row['state'] != 'pending' or now - row['created'] <= TTL):
                return self.public(row)
            identifier = secrets.token_urlsafe(24)
            db.execute('INSERT INTO approval VALUES (?,?,?,?,?,?,?,?,?)',
                       (identifier, digest, tool, canonical(args), canonical(snapshot), secrets.token_urlsafe(32), now, 'pending', None))
            return self.public(db.execute('SELECT * FROM approval WHERE id=?', (identifier,)).fetchone())

    def get(self, identifier):
        with self.db() as db:
            return db.execute('SELECT * FROM approval WHERE id=?', (identifier,)).fetchone()

    def public(self, row):
        state = row['state']
        if state == 'pending' and self.clock() - row['created'] > TTL:
            state = 'expired'
        return {'approval_id': row['id'], 'state': state,
                'approval_url': os.environ.get('APPROVAL_ORIGIN', '') + '/sales/approval/' + row['id'],
                'result': json.loads(row['response']) if row['response'] else None,
                'instruction': 'Ask the owner to open the private approval link. Only the owner can execute this action. Never claim a pending action succeeded. Use sales_action_status to check completion.'}

    def decide(self, identifier, csrf, decision):
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM approval WHERE id=?', (identifier,)).fetchone()
            if not row or not hmac.compare_digest(row['csrf'], csrf) or decision not in ['approve', 'deny']:
                raise ValueError('Invalid approval')
            if row['state'] != 'pending':
                return self.public(row)
            if self.clock() - row['created'] > TTL:
                raise ValueError('Approval expired; prepare a fresh action.')
            # Commit ownership before any network effect; a crash is never automatically replayed.
            db.execute('UPDATE approval SET state=? WHERE id=?', ('running' if decision == 'approve' else 'denied', identifier))
        if decision == 'deny':
            return self.public(self.get(identifier))
        try:
            args = json.loads(row['args'])
            if canonical(self.snapshot(row['tool'], args)) != row['snapshot']:
                raise ValueError('Campaign or audience changed; request fresh approval.')
            response = self.caller(row['tool'], args)
            state = 'uncertain' if response.get('isError') else 'completed'
        except Exception as error:
            state = 'uncertain'
            response = result({'error': str(error), 'instruction': 'Inspect CRM state before preparing another action. No automatic retry.'}, True)
        with self.db() as db:
            db.execute('UPDATE approval SET state=?, response=? WHERE id=?', (state, canonical(response), identifier))
        return self.public(self.get(identifier))


LEDGER = None


def rpc(message):
    if not isinstance(message, dict) or message.get('jsonrpc') != '2.0':
        raise ValueError('One JSON-RPC object is required; batches are disabled')
    method = message.get('method')
    if method not in ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call']:
        raise ValueError('Unsupported method')
    if method == 'tools/call':
        params = message.get('params', {})
        tool, args = params.get('name'), params.get('arguments', {})
        if not isinstance(args, dict) or tool not in ALLOWED | {'sales_action_status'} or (tool in DIRECT_ONLY and os.environ.get('DIRECT_SALES') != 'true'):
            raise ValueError('Unsupported sales tool')
        if tool == 'sales_action_status':
            row = LEDGER.get(args.get('approval_id', ''))
            value = result(LEDGER.public(row) if row else {'error': 'Approval not found'}, not bool(row))
        elif tool in WRITE:
            prepared = LEDGER.request(tool, args)
            if os.environ.get('DIRECT_SALES') == 'true' or tool in ['create_campaign', 'update_campaign', 'populate_campaign', 'pause_campaign', 'lead_assign', 'verify_email_addresses'] or (tool == 'system_pause_resume' and args.get('action') == 'pause'):
                row = LEDGER.get(prepared['approval_id'])
                finished = LEDGER.decide(row['id'], row['csrf'], 'approve')
                value = finished['result'] or result(finished)
            else:
                value = result(prepared)
        else:
            if tool in ['list_leads', 'list_campaigns', 'campaign_leads']:
                limit = args.get('limit', 20)
                if type(limit) is not int or not 1 <= limit <= 50:
                    raise ValueError('List limit must be between 1 and 50')
                args = {**args, 'limit': limit}
            value = call(tool, args)
        return {'jsonrpc': '2.0', 'id': message.get('id'), 'result': value}
    data = upstream(message)
    if data and method == 'initialize' and 'result' in data:
        data['result']['serverInfo'] = {'name': 'outbound-os-sales', 'version': '1.0.0'}
        data['result']['capabilities'] = {'tools': {}}
        data['result']['instructions'] = ('Direct sales execution enabled by the owner. Requested CRM, messaging and campaign operations execute immediately. Preserve request IDs and inspect uncertain results before retrying. No coding or infrastructure changes.' if os.environ.get('DIRECT_SALES') == 'true' else 'Sales operations. Draft campaigns, audience population, assignment and emergency pauses execute immediately. Other mutations require human approval through the private page. Read results truthfully.')
    if data and method == 'tools/list' and 'result' in data:
        tools = []
        for item in data['result'].get('tools', []):
            name = item.get('name')
            if name not in ALLOWED:
                continue
            if name in DIRECT_ONLY and os.environ.get('DIRECT_SALES') != 'true':
                continue
            item = dict(item)
            item['annotations'] = {'readOnlyHint': name in READ, 'destructiveHint': name in WRITE, 'idempotentHint': name in READ}
            if name in WRITE:
                item['description'] = (('Executes directly under owner authorization. ' if os.environ.get('DIRECT_SALES') == 'true' else 'Executes draft preparation, assignments and pauses immediately; other mutations only prepare an owner approval link. ') + item['description'])
                item['inputSchema'] = {**item['inputSchema'], 'properties': {**item['inputSchema'].get('properties', {}), '_request_id': {'type': 'string', 'maxLength': 100, 'description': 'Stable ID for this intent; reuse after interruptions. New ID only for a separate intentional action.'}}}
            tools.append(item)
        tools.append({'name': 'sales_action_status', 'description': 'Read the result of an owner-approved sales action.', 'inputSchema': {'type': 'object', 'properties': {'approval_id': {'type': 'string'}}, 'required': ['approval_id']}, 'annotations': {'readOnlyHint': True}})
        data['result'] = {'tools': tools}
    return data


class Handler(BaseHTTPRequestHandler):
    server_version = 'HermesSales/1'
    def setup(self):
        super().setup()
        self.connection.settimeout(15)
    def log_message(self, *_):
        pass

    def reply(self, status, body='', kind='text/html; charset=utf-8', cookie=None):
        raw = body.encode()
        self.send_response(status)
        for k, v in {'Content-Type': kind, 'Content-Length': str(len(raw)), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}.items():
            self.send_header(k, v)
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(raw)

    def page(self, body, cookie=None):
        self.reply(200, '<!doctype html><meta name="viewport" content="width=device-width"><title>Hermes sales approval</title><style>body{font:17px system-ui;max-width:850px;margin:32px auto;padding:20px;background:#10141c;color:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#202735;padding:16px}button,input{font:inherit;padding:12px;margin:8px 0}button{cursor:pointer}</style><h1>Hermes sales approval</h1>' + body, cookie=cookie)

    def authenticated(self):
        try:
            cookies = SimpleCookie(self.headers.get('Cookie', ''))
            value = cookies['__Host-sales-owner'].value
            expiry, signature = value.split('.')
            expected = hmac.new(os.environ['OWNER_SESSION_KEY'].encode(), expiry.encode(), hashlib.sha256).hexdigest()
            return int(expiry) > time.time() and hmac.compare_digest(signature, expected)
        except Exception:
            return False

    def do_GET(self):
        if self.path == '/healthz':
            return self.reply(200, canonical({'status': 'ok', 'mode': 'owner-approved-sales'}), 'application/json')
        if self.server.server_port != 9120:
            return self.reply(405)
        identifier = urlsplit(self.path).path.removeprefix('/sales/approval/')
        row = LEDGER.get(identifier)
        if not row:
            return self.reply(404, 'Approval not found')
        if not self.authenticated():
            return self.page('<p>Sign in with admin and your saved Hermes dashboard password.</p><form method="post"><input name="username" autocomplete="username" value="admin" required><br><input name="password" type="password" autocomplete="current-password" required><br><button>Sign in</button></form>')
        value = LEDGER.public(row)
        details = html.escape(json.dumps({'action': row['tool'], 'arguments': json.loads(row['args']), 'campaign_review': json.loads(row['snapshot'])}, indent=2, ensure_ascii=False))
        buttons = ''
        if value['state'] == 'pending':
            buttons = '<form method="post"><input type="hidden" name="csrf" value="' + row['csrf'] + '"><button name="decision" value="approve">Approve and execute</button> <button name="decision" value="deny">Deny</button></form>'
        self.page('<p>State: ' + html.escape(value['state']) + '</p><p>Approval executes this exact action now. A campaign launch can contact the listed audience through its configured sender. Existing channel charges may apply.</p><pre>' + details + '</pre>' + buttons + '<pre>' + html.escape(json.dumps(value['result'], indent=2)) + '</pre>')

    def do_POST(self):
        if not SLOTS.acquire(blocking=False):
            return self.reply(429, 'Busy; try again shortly')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_BODY:
                raise ValueError('Request too large or empty')
            body = self.rfile.read(size)
            if self.server.server_port == 9118:
                if self.path != '/mcp' or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + os.environ['BRIDGE_TOKEN']):
                    return self.reply(401)
                message = json.loads(body)
                try:
                    data = rpc(message)
                except ValueError as error:
                    data = {'jsonrpc': '2.0', 'id': message.get('id') if isinstance(message, dict) else None, 'error': {'code': -32602, 'message': str(error)}}
                return self.reply(200 if data else 202, canonical(data) if data else '', 'application/json')
            origin = os.environ['APPROVAL_ORIGIN']
            if self.headers.get('Origin') != origin:
                return self.reply(403, 'Invalid origin')
            form = parse_qs(body.decode(), strict_parsing=True)
            get = lambda key: form.get(key, [''])[0]
            if 'password' in form:
                # A fixed delay plus two bounded worker slots limit password guessing.
                time.sleep(1)
                actual = hashlib.pbkdf2_hmac('sha256', get('password').encode(), bytes.fromhex(os.environ['OWNER_PASSWORD_SALT']), 300000).hex()
                if get('username') != 'admin' or not hmac.compare_digest(actual, os.environ['OWNER_PASSWORD_HASH']):
                    return self.reply(403, 'Sign-in failed. Go back and try again.')
                expiry = str(int(time.time()) + 8 * 3600)
                sig = hmac.new(os.environ['OWNER_SESSION_KEY'].encode(), expiry.encode(), hashlib.sha256).hexdigest()
                self.send_response(303)
                self.send_header('Location', self.path)
                self.send_header('Set-Cookie', '__Host-sales-owner=' + expiry + '.' + sig + '; Path=/; Secure; HttpOnly; SameSite=Strict')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            if not self.authenticated():
                return self.reply(401, 'Sign in first')
            identifier = urlsplit(self.path).path.removeprefix('/sales/approval/')
            value = LEDGER.decide(identifier, get('csrf'), get('decision'))
            self.page('<p>State: ' + html.escape(value['state']) + '</p><pre>' + html.escape(json.dumps(value['result'], indent=2)) + '</pre>')
        except ValueError as error:
            self.reply(400, html.escape(str(error)))
        except Exception:
            self.reply(502, 'Upstream unavailable. Check action status and the CRM before retrying.')
        finally:
            SLOTS.release()


if __name__ == '__main__':
    for name in ['BRIDGE_TOKEN', 'UPSTREAM_TOKEN', 'OWNER_SESSION_KEY', 'OWNER_PASSWORD_HASH', 'OWNER_PASSWORD_SALT', 'APPROVAL_ORIGIN']:
        assert os.environ.get(name), name + ' required'
    os.umask(0o077)
    LEDGER = Ledger(os.environ.get('APPROVAL_DB', '/state/approvals.db'))
    role = os.environ.get('GATEWAY_ROLE', 'mcp')
    assert role in ['mcp', 'approval'], 'Unknown gateway role'
    ThreadingHTTPServer(('0.0.0.0', 9120 if role == 'approval' else 9118), Handler).serve_forever()
