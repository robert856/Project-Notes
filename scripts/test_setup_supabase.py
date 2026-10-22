import base64
import json
import unittest
from setup_supabase import auth_settings, is_public_key, select_public_key, SetupError


class SetupTests(unittest.TestCase):
    def jwt(self, role):
        return 'header.' + base64.urlsafe_b64encode(json.dumps({'role': role}).encode()).decode().rstrip('=') + '.signature'

    def test_never_accepts_service_or_secret_keys(self):
        self.assertFalse(is_public_key('sb_secret_never_publish'))
        self.assertFalse(is_public_key(self.jwt('service_role')))
        self.assertFalse(is_public_key('sb_publishable_masked***'))
        with self.assertRaises(SetupError):
            select_public_key([{'name': 'service_role', 'api_key': self.jwt('service_role')}])

    def test_only_selects_public_key(self):
        key = 'sb_publishable_' + 'x' * 30
        self.assertEqual(select_public_key([{'type': 'publishable', 'api_key': key}, {'name': 'service_role', 'api_key': self.jwt('service_role')}]), key)
        self.assertTrue(is_public_key(self.jwt('anon')))

    def test_preserves_redirects_and_does_not_replace_smtp(self):
        result = auth_settings({'uri_allow_list': 'https://example.com/callback', 'smtp_host': 'private.example.com'})
        self.assertIn('https://example.com/callback', result['uri_allow_list'])
        self.assertIn('https://robert856.github.io/Project-Notes/', result['uri_allow_list'])
        self.assertFalse(result['mailer_autoconfirm'])
        self.assertNotIn('smtp_host', result)


if __name__ == '__main__':
    unittest.main()
