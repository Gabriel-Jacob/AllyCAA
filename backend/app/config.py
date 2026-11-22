import os
from dataclasses import dataclass, field
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')


@dataclass(frozen=True)
class Settings:
    groq_api_key: str = field(default_factory=lambda: os.getenv('GROQ_API_KEY', ''))
    environment: str = field(default_factory=lambda: os.getenv('ALLY_ENV', 'development'))
    allowed_origins: tuple = field(default_factory=lambda: tuple(filter(None, os.getenv('ALLY_ALLOWED_ORIGINS', '').split(','))))
    allowed_hosts: tuple = field(default_factory=lambda: tuple(os.getenv('ALLY_ALLOWED_HOSTS', '127.0.0.1,localhost,testserver').split(',')))
    rate_limit: int = field(default_factory=lambda: int(os.getenv('ALLY_RATE_LIMIT', '10')))
    timeout: float = field(default_factory=lambda: float(os.getenv('ALLY_TIMEOUT_SECONDS', '30')))
    total_timeout: float = field(default_factory=lambda: float(os.getenv('ALLY_TOTAL_TIMEOUT_SECONDS', '45')))
    vocabulary_path: str = field(default_factory=lambda: os.getenv('ALLY_VOCABULARY_PATH', str(Path(__file__).resolve().parents[1] / 'data' / 'arasaac_vocabulario_br.json')))
    model: str = 'openai/gpt-oss-120b'

    def __post_init__(self):
        if self.environment not in ('development', 'production'):
            raise ValueError('ALLY_ENV deve ser development ou production.')
        if self.environment == 'production' and (not self.allowed_origins or '*' in self.allowed_origins):
            raise ValueError('Defina origens exatas das extensões em produção.')
        if min(self.rate_limit, self.timeout, self.total_timeout) <= 0:
            raise ValueError('Limites e tempos devem ser positivos.')
