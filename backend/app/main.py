import asyncio
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from .config import Settings
from .models import AdaptRequest, AdaptResponse, ServiceError
from .groq import GroqService
from .vocabulary import Vocabulary
from .pipeline import Pipeline


def create_app(settings=None, pipeline=None):
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=settings.timeout, follow_redirects=False) as client:
            app.state.pipeline = pipeline or Pipeline(GroqService(client, settings), Vocabulary.load(settings.vocabulary_path))
            yield

    app = FastAPI(title='AllyCAA', version='0.1.0', lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                       allow_origin_regex=r'^(chrome-extension://[a-p]{32}|moz-extension://[a-f0-9-]+)$' if settings.environment == 'development' else None,
                       allow_methods=['POST', 'GET'], allow_headers=['Content-Type'], allow_credentials=False)
    buckets = defaultdict(deque)
    concurrent = asyncio.Semaphore(4)

    @app.exception_handler(ServiceError)
    async def service_error(request, error):
        return JSONResponse(status_code=error.status, content={'error': {'code': error.code, 'message': error.message}})

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        # Do not echo private user input in errors or log it.
        return JSONResponse(status_code=422, content={'error': {'code': 'invalid_selection', 'message': 'Envie somente text, com 1 a 100 caracteres e conteúdo não vazio.'}})

    @app.middleware('http')
    async def guard(request, call_next):
        origin = request.headers.get('origin')
        import re
        allowed = origin in settings.allowed_origins or (settings.environment == 'development' and origin and re.fullmatch(r'(chrome-extension://[a-p]{32}|moz-extension://[a-f0-9-]+)', origin))
        if origin and not allowed:
            return JSONResponse(status_code=403, content={'error': {'code': 'origin_denied', 'message': 'Origem não autorizada.'}})
        if request.url.path == '/api/adapt' and request.method == 'POST':
            # Stream bound also covers chunked uploads. Reinject through Request's body cache.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 4096:
                    return JSONResponse(status_code=413, content={'error': {'code': 'body_too_large', 'message': 'Requisição muito grande.'}})
            request._body = bytes(body)
            now = time.monotonic()
            for key in list(buckets):
                while buckets[key] and buckets[key][0] <= now - 60:
                    buckets[key].popleft()
                if not buckets[key]:
                    del buckets[key]
            peer = request.client.host if request.client else 'unknown'
            if len(buckets[peer]) >= settings.rate_limit:
                return JSONResponse(status_code=429, headers={'Retry-After': '60'}, content={'error': {'code': 'rate_limited', 'message': 'Muitas solicitações. Aguarde um minuto.'}})
            buckets[peer].append(now)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'model': settings.model, 'groq_configured': bool(settings.groq_api_key)}

    @app.post('/api/adapt', response_model=AdaptResponse)
    async def adapt(body: AdaptRequest, request: Request):
        try:
            async with asyncio.timeout(settings.total_timeout):
                async with concurrent:
                    return await request.app.state.pipeline.run(body.text)
        except TimeoutError:
            raise ServiceError('processing_timeout', 'O processamento excedeu o tempo máximo. Tente novamente.', 504) from None

    return app


app = create_app()
