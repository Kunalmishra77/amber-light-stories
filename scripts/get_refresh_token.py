"""One-time OAuth consent flow. Prints the refresh token to store in .env.

Usage:
    .venv\\Scripts\\python scripts\\get_refresh_token.py

Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already set in .env
(create them at console.cloud.google.com -> Credentials -> OAuth client -> Desktop app).
"""
from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import get_settings

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


def main():
    s = get_settings()
    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        SCOPES,
    )
    creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    print("\n=== SUCCESS ===")
    print("Put this in your .env as GOOGLE_REFRESH_TOKEN:\n")
    print(creds.refresh_token)


if __name__ == "__main__":
    main()
