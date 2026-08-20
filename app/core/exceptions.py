class AppError(Exception):
    def __init__(self, status_code: int, code: str, detail: str) -> None:
        self.status_code = status_code
        self.code = code
        self.detail = detail
        super().__init__(detail)


class NotFoundError(AppError):
    def __init__(self, detail: str = "Resource not found") -> None:
        super().__init__(404, "not_found", detail)


class PermissionDeniedError(AppError):
    def __init__(self, detail: str = "Permission denied") -> None:
        super().__init__(403, "forbidden", detail)


class UnauthorizedError(AppError):
    def __init__(self, detail: str = "Not authenticated") -> None:
        super().__init__(401, "unauthorized", detail)


class ConflictError(AppError):
    def __init__(self, detail: str = "Conflict") -> None:
        super().__init__(409, "conflict", detail)


class ValidationError(AppError):
    def __init__(self, detail: str = "Validation error") -> None:
        super().__init__(422, "validation_error", detail)


class InvalidTransitionError(AppError):
    def __init__(self, detail: str = "Invalid status transition") -> None:
        super().__init__(409, "invalid_status_transition", detail)


class FileUploadError(AppError):
    def __init__(self, detail: str = "File upload failed") -> None:
        super().__init__(422, "file_upload_error", detail)
