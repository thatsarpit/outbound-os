import importlib.util
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).with_name('gateway.py'))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class SalesGatewayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = 100000
        self.calls = []
        self.campaign = {'id': 1, 'name': 'Synthetic campaign', 'status': 'draft', 'messageTemplate': 'Hello {{name}}'}
        self.audience = [{'id': 1, 'leadId': 42, 'status': 'pending',
                          'lead': {**{key: None for key in g.RECIPIENT_FIELDS}, 'id': 42, 'name': 'Synthetic lead', 'email': 'synthetic@example.test'}}]
        self.ledger = g.Ledger(str(Path(self.tmp.name) / 'test.db'), self.call, lambda: self.now)

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, tool, args):
        self.calls.append(tool)
        if tool == 'get_campaign':
            return g.result(self.campaign)
        if tool == 'campaign_leads':
            return g.result({'leads': self.audience, 'pages': 1})
        return g.result({'success': True})

    def approve(self, request):
        return self.ledger.decide(request['approval_id'], self.ledger.get(request['approval_id'])['csrf'], 'approve')

    def test_prepare_has_no_effect_and_owner_decision_is_one_time(self):
        request = self.ledger.request('send_email', {'lead_id': 42, 'body': 'Synthetic'})
        self.assertEqual(self.calls, [])
        self.assertEqual(request['state'], 'pending')
        self.assertEqual(self.ledger.request('send_email', {'body': 'Synthetic', 'lead_id': 42})['approval_id'], request['approval_id'])
        self.assertEqual(self.approve(request)['state'], 'completed')
        self.assertEqual(self.approve(request)['state'], 'completed')
        self.assertEqual(self.calls, ['send_email'])
        self.assertEqual(self.ledger.request('send_email', {'lead_id': 42, 'body': 'Synthetic'})['state'], 'completed')

    def test_concurrent_approval_only_one_network_effect(self):
        request = self.ledger.request('send_whatsapp', {'lead_id': 42, 'message': 'Synthetic'})
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            list(pool.map(lambda _: self.approve(request), range(4)))
        self.assertEqual(self.calls, ['send_whatsapp'])

    def test_denial_expiry_and_bad_csrf_never_execute(self):
        request = self.ledger.request('send_email', {'lead_id': 42, 'body': 'Synthetic'})
        with self.assertRaises(ValueError):
            self.ledger.decide(request['approval_id'], 'wrong', 'approve')
        row = self.ledger.get(request['approval_id'])
        self.assertEqual(self.ledger.decide(row['id'], row['csrf'], 'deny')['state'], 'denied')
        other = self.ledger.request('send_email', {'lead_id': 43, 'body': 'Synthetic'})
        self.now += g.TTL + 1
        with self.assertRaisesRegex(ValueError, 'expired'):
            self.approve(other)
        self.assertEqual(self.calls, [])

    def test_changed_campaign_or_audience_blocks_launch(self):
        for changed in ['content', 'audience']:
            with self.subTest(changed=changed):
                request = self.ledger.request('start_campaign', {'campaign_id': 1, '_request_id': changed})
                if changed == 'content':
                    self.campaign['messageTemplate'] = 'Changed message'
                else:
                    self.audience.append({'id': 2, 'leadId': 43, 'status': 'pending'})
                self.assertEqual(self.approve(request)['state'], 'uncertain')
        self.assertNotIn('start_campaign', self.calls)

    def test_empty_campaign_cannot_request_launch(self):
        self.audience = []
        with self.assertRaisesRegex(ValueError, 'Populate'):
            self.ledger.request('start_campaign', {'campaign_id': 1})

    def test_recipient_destination_and_personalization_changes_invalidate_approval(self):
        for field, value in [('email', 'changed@example.test'), ('waUserId', 'US.synthetic'), ('company', 'Changed company'), ('product', 'Changed product')]:
            with self.subTest(field=field):
                request = self.ledger.request('start_campaign', {'campaign_id': 1, '_request_id': field})
                self.audience[0]['lead'][field] = value
                self.assertEqual(self.approve(request)['state'], 'uncertain')
        self.assertNotIn('start_campaign', self.calls)
        del self.audience[0]['lead']['email']
        with self.assertRaisesRegex(ValueError, 'destinations'):
            self.ledger.request('start_campaign', {'campaign_id': 1, '_request_id': 'old-api'})

    def test_timeout_and_process_death_never_replay(self):
        request = self.ledger.request('send_email', {'lead_id': 42, 'body': 'Synthetic'})
        def failure(*_):
            raise TimeoutError('Synthetic timeout')
        self.ledger.caller = failure
        self.assertEqual(self.approve(request)['state'], 'uncertain')
        self.assertEqual(self.approve(request)['state'], 'uncertain')
        other = self.ledger.request('send_email', {'lead_id': 43, 'body': 'Synthetic'})
        with self.ledger.db() as db:
            db.execute("UPDATE approval SET state='running' WHERE id=?", (other['approval_id'],))
        reopened = g.Ledger(self.ledger.filename, failure, lambda: self.now)
        row = reopened.get(other['approval_id'])
        self.assertEqual(reopened.decide(row['id'], row['csrf'], 'approve')['state'], 'running')

    def test_rpc_filters_admin_and_destructive_operations(self):
        with patch.object(g, 'LEDGER', self.ledger):
            for tool in ['delete_lead', 'delete_campaign', 'bulk_lead_action', 'terminal']:
                with self.assertRaises(ValueError):
                    g.rpc({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': tool, 'arguments': {}}})
            with self.assertRaises(ValueError):
                g.rpc([])
            response = g.rpc({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'send_email', 'arguments': {'lead_id': 42, 'body': 'Synthetic'}}})
            self.assertEqual(g.unpack(response['result'])['state'], 'pending')
            self.assertEqual(self.calls, [])

    def test_http_owner_auth_csrf_and_no_mcp_access_to_approval_listener(self):
        request = self.ledger.request('send_email', {'lead_id': 42, 'body': '<script>Synthetic</script>'})
        salt = b'synthetic-owner-salt'
        env = {'APPROVAL_ORIGIN': 'https://private.example.test', 'OWNER_SESSION_KEY': 'synthetic-session-key',
               'OWNER_PASSWORD_SALT': salt.hex(), 'OWNER_PASSWORD_HASH': hashlib.pbkdf2_hmac('sha256', b'synthetic-password', salt, 300000).hex()}
        server = g.ThreadingHTTPServer(('127.0.0.1', 0), g.Handler)
        port = server.server_port
        server.server_port = 9120
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{port}/sales/approval/' + request['approval_id']
        def post(body, headers):
            return urllib.request.urlopen(urllib.request.Request(base, data=body.encode(), headers=headers), timeout=5)
        try:
            with patch.dict(os.environ, env), patch.object(g, 'LEDGER', self.ledger):
                page = urllib.request.urlopen(base).read().decode()
                self.assertIn('Sign in', page)
                self.assertNotIn('Synthetic</script>', page)
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    post('decision=approve&csrf=wrong', {'Origin': env['APPROVAL_ORIGIN']})
                self.assertEqual(denied.exception.code, 401)
                denied.exception.close()
                with self.assertRaises(urllib.error.HTTPError) as origin:
                    post('username=admin&password=synthetic-password', {'Origin': 'https://evil.example.test'})
                self.assertEqual(origin.exception.code, 403)
                origin.exception.close()
                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, *_):
                        return None
                opener = urllib.request.build_opener(NoRedirect)
                with self.assertRaises(urllib.error.HTTPError) as redirect:
                    opener.open(urllib.request.Request(base, data=b'username=admin&password=synthetic-password', headers={'Origin': env['APPROVAL_ORIGIN']}))
                response = redirect.exception
                self.assertEqual(response.code, 303)
                cookie = response.headers['Set-Cookie'].split(';', 1)[0]
                self.assertIn('Secure', response.headers['Set-Cookie'])
                response.close()
                signed = urllib.request.Request(base, headers={'Cookie': cookie})
                page = urllib.request.urlopen(signed).read().decode()
                self.assertIn('&lt;script&gt;', page)
                self.assertNotIn('<script>', page)
                row = self.ledger.get(request['approval_id'])
                response = post('decision=approve&csrf=' + row['csrf'], {'Origin': env['APPROVAL_ORIGIN'], 'Cookie': cookie})
                self.assertIn('completed', response.read().decode())
                self.assertEqual(self.calls, ['send_email'])
        finally:
            server.shutdown()
            server.server_close()

    def test_drafts_execute_once_but_campaign_launch_requires_human(self):
        with patch.object(g, 'LEDGER', self.ledger):
            for tool in ['create_campaign', 'populate_campaign', 'pause_campaign']:
                message = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': tool, 'arguments': {'campaign_id': 1}}}
                self.assertTrue(g.unpack(g.rpc(message)['result'])['success'])
                self.assertTrue(g.unpack(g.rpc(message)['result'])['success'])
                self.assertEqual(self.calls.count(tool), 1)
            request = g.rpc({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'start_campaign', 'arguments': {'campaign_id': 1}}})
            self.assertEqual(g.unpack(request['result'])['state'], 'pending')
            self.assertNotIn('start_campaign', self.calls)

    def test_whatsapp_request_has_stable_send_identity_before_approval(self):
        request = self.ledger.request('send_whatsapp', {'lead_id': 42, 'message': 'Synthetic'})
        row = self.ledger.get(request['approval_id'])
        message_id = json.loads(row['args'])['client_message_id']
        self.assertEqual(len(message_id), 36)
        repeated = self.ledger.request('send_whatsapp', {'lead_id': 42, 'message': 'Synthetic'})
        self.assertEqual(repeated['approval_id'], request['approval_id'])
        self.assertEqual(json.loads(self.ledger.get(repeated['approval_id'])['args'])['client_message_id'], message_id)

    def test_mcp_listener_requires_bearer_and_cannot_handle_owner_routes(self):
        server = g.ThreadingHTTPServer(('127.0.0.1', 0), g.Handler)
        port = server.server_port
        server.server_port = 9118
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{port}'
        message = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'send_email', 'arguments': {'lead_id': 42, 'body': 'Synthetic'}}}).encode()
        try:
            with patch.dict(os.environ, {'BRIDGE_TOKEN': 'synthetic-bridge-bearer'}), patch.object(g, 'LEDGER', self.ledger):
                for path, bearer in [('/mcp', ''), ('/sales/approval/test', 'Bearer synthetic-bridge-bearer')]:
                    with self.assertRaises(urllib.error.HTTPError) as denied:
                        urllib.request.urlopen(urllib.request.Request(base + path, data=message, headers={'Authorization': bearer}))
                    self.assertEqual(denied.exception.code, 401)
                    denied.exception.close()
                response = urllib.request.urlopen(urllib.request.Request(base + '/mcp', data=message, headers={'Authorization': 'Bearer synthetic-bridge-bearer'}))
                self.assertEqual(g.unpack(json.load(response)['result'])['state'], 'pending')
                self.assertEqual(self.calls, [])
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
