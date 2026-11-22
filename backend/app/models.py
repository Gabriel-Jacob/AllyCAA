import unicodedata
from pydantic import BaseModel, ConfigDict, field_validator


class AdaptRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    text: str

    @field_validator('text')
    @classmethod
    def validate_text(cls, value):
        if not value.strip() or len(value) > 100:
            raise ValueError('Selecione de 1 a 100 caracteres, incluindo espaços e pontuação.')
        if any(unicodedata.category(c) == 'Cs' for c in value):
            raise ValueError('O texto contém Unicode inválido.')
        return value


class Token(BaseModel):
    index: int
    text: str
    pictogram_id: int | None = None
    image_url: str | None = None


class AdaptResponse(BaseModel):
    original_text: str
    tokens: list[Token]


class ServiceError(Exception):
    def __init__(self, code, message, status=502):
        self.code, self.message, self.status = code, message, status
