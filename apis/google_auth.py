from google.oauth2.credentials import Credentials

from app.config import get_settings

TOKEN_URI = "https://oauth2.googleapis.com/token"


def get_credentials() -> Credentials:
    s = get_settings()
    return Credentials(
        None,
        refresh_token=s.google_refresh_token,
        token_uri=TOKEN_URI,
        client_id=s.google_client_id,
        client_secret=s.google_client_secret,
    )
