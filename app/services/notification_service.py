import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)

_SMTP_TIMEOUT_SECONDS: int = 10
_SMTPS_PORT: int = 465

_CLOSING_SIGNATURE: str = "Society Maintenance Portal"


class NotificationService:
    def _send_email(self, recipient: str, subject: str, body: str) -> bool:
        if not settings.EMAIL_ENABLED:
            logger.info("email skipped (disabled): to=%s subject=%s", recipient, subject)
            return False

        message = EmailMessage()
        message.set_content(body)
        message["Subject"] = subject
        message["From"] = settings.EMAIL_FROM
        message["To"] = recipient

        try:
            if settings.SMTP_PORT == _SMTPS_PORT:
                with smtplib.SMTP_SSL(
                    settings.SMTP_HOST,
                    settings.SMTP_PORT,
                    timeout=_SMTP_TIMEOUT_SECONDS,
                    context=ssl.create_default_context(),
                ) as server:
                    if settings.SMTP_USERNAME:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(message)
            else:
                with smtplib.SMTP(
                    settings.SMTP_HOST,
                    settings.SMTP_PORT,
                    timeout=_SMTP_TIMEOUT_SECONDS,
                ) as server:
                    server.starttls(context=ssl.create_default_context())
                    if settings.SMTP_USERNAME:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(message)
        except Exception as exc:
            logger.error("email delivery failed: %s", exc)
            return False

        logger.info("email sent: to=%s subject=%s", recipient, subject)
        return True

    def send_complaint_status_changed_email(
        self,
        recipient: str,
        resident_name: str,
        complaint_id: str,
        category_name: str,
        old_status: str,
        new_status: str,
        note: str | None,
    ) -> bool:
        subject = f"Complaint #{complaint_id[:8]} status updated: {new_status}"
        lines: list[str] = [
            f"Hello {resident_name},",
            "",
            f"Your complaint #{complaint_id[:8]} regarding {category_name} has been updated.",
            f"Previous status: {old_status}",
            f"New status: {new_status}",
        ]
        if note:
            lines.append(f"Note: {note}")
        lines.extend(["", "Regards,", _CLOSING_SIGNATURE])
        return self._send_email(recipient, subject, "\n".join(lines))

    def send_important_notice_email(self, recipient: str, title: str, content: str) -> bool:
        subject = f"Important Society Notice: {title}"
        body = "\n".join([
            title,
            "",
            content,
            "",
            "Regards,",
            _CLOSING_SIGNATURE,
        ])
        return self._send_email(recipient, subject, body)


notification_service = NotificationService()
