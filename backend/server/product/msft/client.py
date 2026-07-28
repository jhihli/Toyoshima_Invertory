"""
Client for Microsoft's Recycling API (Buyback reports).

We PUSH JSON via HTTP PUT. Two-layer auth:
  1. Ocp-Apim-Subscription-Key header (supplier-specific key from the MS CDO team)
  2. Authorization: Bearer <token>  - OAuth2 client-credentials against Entra ID

Plus per-request headers: Correlation-Id (unique GUID), ProgramType (CLOUD),
TenantId (our tenant). All connection values come from settings.MSFT_API (.env).

`requests` is imported lazily inside the network methods so payload assembly /
dry-run works even before `pip install requests`.
"""
import uuid

from django.conf import settings

# Report type → endpoint sub-path under the devicerecycling base.
REPORT_PATHS = {
    'credit': 'creditdetails',
    'podoc':  'podocument',
    'pnr':    'paymentnotifications',
}

TOKEN_TIMEOUT = 30
API_TIMEOUT = 120  # MS recommends 120s for bulk


class MsftApiError(Exception):
    pass


class MsftClient:
    def __init__(self, cfg=None):
        self.cfg = cfg or settings.MSFT_API
        self._token = None  # simple per-instance cache

    # ─── config helpers ────────────────────────────────────────────────
    @property
    def base_url(self) -> str:
        env = (self.cfg.get('ENVIRONMENT') or 'test').lower()
        base = self.cfg['PROD_BASE'] if env == 'prod' else self.cfg['TEST_BASE']
        return base.rstrip('/')

    def endpoint(self, report_type: str) -> str:
        try:
            return f"{self.base_url}/{REPORT_PATHS[report_type]}"
        except KeyError:
            raise MsftApiError(f"Unknown report type: {report_type!r}")

    def _missing_creds(self) -> list:
        need = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'RESOURCE_SCOPE', 'SUBSCRIPTION_KEY']
        return [k for k in need if not self.cfg.get(k)]

    # ─── auth ──────────────────────────────────────────────────────────
    def get_token(self) -> str:
        if self._token:
            return self._token
        import requests  # lazy
        authority = f"https://login.microsoftonline.com/{self.cfg['TENANT_ID']}"
        resp = requests.post(
            f"{authority}/oauth2/v2.0/token",
            data={
                'grant_type': 'client_credentials',
                'client_id': self.cfg['CLIENT_ID'],
                'client_secret': self.cfg['CLIENT_SECRET'],
                'scope': f"{self.cfg['RESOURCE_SCOPE']}/.default",
            },
            timeout=TOKEN_TIMEOUT,
        )
        if resp.status_code != 200:
            raise MsftApiError(f"Token request failed ({resp.status_code}): {resp.text}")
        self._token = resp.json().get('access_token')
        if not self._token:
            raise MsftApiError(f"No access_token in token response: {resp.text}")
        return self._token

    def _headers(self, correlation_id: str) -> dict:
        return {
            'Authorization': f'Bearer {self.get_token()}',
            'Ocp-Apim-Subscription-Key': self.cfg['SUBSCRIPTION_KEY'],
            'Correlation-Id': correlation_id,
            'ProgramType': self.cfg.get('PROGRAM_TYPE', 'CLOUD'),
            'TenantId': self.cfg['TENANT_ID'],
            'Accept': '*/*',
            'Content-Type': 'application/json',
        }

    # ─── the one call ──────────────────────────────────────────────────
    def put(self, report_type: str, payload: dict, dry_run: bool = False) -> dict:
        """PUT a report payload. Returns a normalized result dict:
        {dry_run, endpoint, correlation_id, http_status, response, success_count,
         error_count}. On dry_run, no network call is made."""
        endpoint = self.endpoint(report_type)
        correlation_id = str(uuid.uuid4())

        if dry_run:
            return {
                'dry_run': True, 'endpoint': endpoint, 'correlation_id': correlation_id,
                'http_status': None, 'response': None, 'success_count': 0, 'error_count': 0,
            }

        missing = self._missing_creds()
        if missing:
            raise MsftApiError(f"Missing MSFT credentials in .env: {', '.join(missing)}")

        import requests  # lazy
        resp = requests.put(
            endpoint, json=payload, headers=self._headers(correlation_id), timeout=API_TIMEOUT,
        )
        try:
            body = resp.json()
        except ValueError:
            body = {'raw': resp.text}

        errs = body.get('errorResponses') or [] if isinstance(body, dict) else []
        oks = body.get('successResponses') or [] if isinstance(body, dict) else []
        return {
            'dry_run': False, 'endpoint': endpoint, 'correlation_id': correlation_id,
            'http_status': resp.status_code, 'response': body,
            'success_count': len(oks), 'error_count': len(errs),
        }
