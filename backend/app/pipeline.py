import asyncio
import os
import re
import unicodedata
from .models import AdaptResponse, ServiceError, Token
from .prompts import (PROMPT_SIMPLIFICACAO, PROMPT_EXTRACAO, PROMPT_SINONIMO, PROMPT_ESCOLHA, PROMPT_ALINHAMENTO,
                      SISTEMA_SINONIMO, SISTEMA_ESCOLHA, SISTEMA_ALINHAMENTO, STOPWORDS_SEGURANCA)
from .vocabulary import MAX_CANDIDATOS


def filter_and_dedupe(words):
    seen, result = set(), []
    for w in words:
        n = w.strip().lower()
        if not n or n in STOPWORDS_SEGURANCA or n in seen:
            continue
        seen.add(n)
        result.append(w)
    return result


def fold(text):
    text = unicodedata.normalize('NFD', text.casefold())
    return re.sub(r'^\W+|\W+$', '', ''.join(c for c in text if unicodedata.category(c) != 'Mn'))


def fallback_alignment(tokens, words):
    folded = [fold(t) for t in tokens]
    result = []
    for word in map(fold, words):
        found = -1
        for i, t in enumerate(folded):
            common = len(os.path.commonprefix([t, word]))
            if t and word and (t == word or (common >= 4 and common >= min(len(t), len(word)) - 1)):
                found = i
                break
        result.append(found)
    return result


class Pipeline:
    def __init__(self, groq, vocabulary):
        self.groq, self.vocab = groq, vocabulary
        self.slots = asyncio.Semaphore(3)

    async def choose(self, phrase, word, valid):
        listing = '\n'.join(f'{i}. {term}' for i, (term, _) in enumerate(valid, 1))
        try:
            async with self.slots:
                choice = await self.groq.complete(SISTEMA_ESCOLHA, PROMPT_ESCOLHA.format(frase=phrase, palavra=word, lista=listing), 'escolha', 'integer')
        except ServiceError:
            return None
        return valid[choice - 1] if 1 <= choice <= len(valid) else None

    async def resolve(self, phrase, word):
        direct = self.vocab.find(word)
        if direct is not None:
            return direct
        candidates = self.vocab.wordnet_candidates(word)
        for step in ('sinonimo', 'hiperonimo'):
            valid = []
            for term in candidates[step]:
                pid = self.vocab.find(term)
                if pid is not None:
                    valid.append((term, pid))
                if len(valid) >= MAX_CANDIDATOS:
                    break
            if not valid:
                continue
            chosen = valid[0] if len({pid for _, pid in valid}) == 1 else await self.choose(phrase, word, valid)
            if chosen is not None:
                return chosen[1]
        try:
            async with self.slots:
                synonym = await self.groq.complete(SISTEMA_SINONIMO, PROMPT_SINONIMO.format(frase=phrase, palavra=word), 'sinonimo')
        except ServiceError as error:
            if error.code == 'groq_not_configured':
                raise
            return None
        return self.vocab.find(synonym) if len(synonym) <= 80 else None

    async def align(self, tokens, simplified, found):
        words = [w for w, _ in found]
        try:
            async with self.slots:
                indices = await self.groq.complete(
                    SISTEMA_ALINHAMENTO,
                    PROMPT_ALINHAMENTO + '\nPalavras da frase original: ' + '; '.join(f'{i}={t}' for i, t in enumerate(tokens)) +
                    f'\nFrase simplificada: {simplified}\nPalavras-chave: ' + '; '.join(words), 'indices', 'integers')
            if len(indices) != len(words) or any(not -1 <= i < len(tokens) for i in indices):
                raise ValueError('alignment')
            return indices
        except ServiceError as error:
            if error.code == 'groq_not_configured':
                raise
        except ValueError:
            pass
        return fallback_alignment(tokens, words)

    async def run(self, text):
        try:
            simplified = (await self.groq.complete(PROMPT_SIMPLIFICACAO, f'Frase: {text}', 'frase_simplificada')).strip()
        except ServiceError as error:
            if error.code == 'groq_not_configured':
                raise
            simplified = ''
        if not simplified or len(simplified) > 1000:
            simplified = text 
        words = filter_and_dedupe(await self.groq.complete(PROMPT_EXTRACAO, f'Frase: {simplified}', 'palavras_chave', 'array'))
        if len(words) > 24 or any(len(w) > 80 for w in words):
            raise ServiceError('invalid_response', 'A IA retornou conceitos inválidos.')
        ids = await asyncio.gather(*(self.resolve(simplified, w) for w in words))
        tokens = re.findall(r'\S+', text)
        pictures = {}
        found = [(w, pid) for w, pid in zip(words, ids) if pid is not None]
        if found:
            for (word, pid), i in zip(found, await self.align(tokens, simplified, found)):
                if i >= 0 and i not in pictures:
                    pictures[i] = pid
            by_form = {fold(tokens[i]): pid for i, pid in pictures.items() if fold(tokens[i])}
            for i, t in enumerate(tokens):
                if i not in pictures and fold(t) in by_form:
                    pictures[i] = by_form[fold(t)]
        return AdaptResponse(original_text=text, tokens=[
            Token(index=i, text=t, pictogram_id=pictures.get(i),
                  image_url=f'https://static.arasaac.org/pictograms/{pictures[i]}/{pictures[i]}_500.png' if i in pictures else None)
            for i, t in enumerate(tokens)])
