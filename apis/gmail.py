import base64
from email.message import EmailMessage

from googleapiclient.discovery import build

from app.config import get_settings
from apis.google_auth import get_credentials


def send_email(subject: str, body_text: str, to: str | None = None) -> None:
    to = to or get_settings().notify_email
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service = build("gmail", "v1", credentials=get_credentials())
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
