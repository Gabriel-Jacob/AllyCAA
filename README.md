# AllyCAA

Extensão de navegador (Edge) que adapta trechos de texto de até 100 caracteres para pictogramas de Comunicação Aumentativa e Alternativa (CAA), usando IA e os pictogramas do ARASAAC. Projeto de TCC do curso de Análise e Desenvolvimento de Sistemas.

## Como funciona

1. O usuário seleciona um trecho na página. Os primeiros 100 caracteres ficam em verde e o excedente em vermelho.
2. Ao confirmar em **Traduzir para CAA**, somente esse trecho é enviado ao backend local. A seleção sozinha não consulta nenhum serviço.
3. O backend processa o texto:
   - **Simplificação** da frase na Groq (`openai/gpt-oss-120b`). A frase simplificada serve apenas ao processamento e não é exibida.
   - **Extração** das palavras-chave.
   - **Busca do pictograma** de cada palavra: primeiro no vocabulário ARASAAC local; se não houver, por sinônimos e hiperônimos do OpenWordnet-PT, com a IA escolhendo entre as opções.
   - **Alinhamento** dos pictogramas às palavras do texto original.
4. A extensão mostra a frase original com cada pictograma acima da sua palavra. Palavras sem pictograma ficam com o espaço em branco.
5. O usuário pode **Ouvir** (com barra de progresso por palavra), **Interromper** e **Voltar ao texto original**. A tecla Escape também fecha a adaptação.

As imagens dos pictogramas são carregadas do site do ARASAAC. O contrato da API está descrito em `backend/app/models.py`.

## Requisitos

- Python 3.11 ou superior
- Node.js 20 ou superior
- Edge 140 ou superior
- Chave da Groq com acesso ao modelo `openai/gpt-oss-120b`
- Conexão com a internet

## Instalação

No PowerShell, dentro da pasta `AllyCAA`:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
# Uma única vez: baixa o OpenWordnet-PT (sinônimos e hiperônimos)
.venv/Scripts/python.exe scripts/instalar_openwordnet_pt.py
Copy-Item backend/.env.example backend/.env
```

Edite `backend/.env` e preencha `GROQ_API_KEY`.

## Executar o backend

```powershell
.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
```

## Gerar e instalar a extensão

Em outro terminal, na pasta `AllyCAA`:

```powershell
npm run build
```

O comando cria `dist/edge` (a pasta `dist/` não faz parte do repositório). O build usa o backend em `http://127.0.0.1:8000`; para outro endereço use `node scripts/build.mjs --backend https://seu-backend`.

### Edge

1. Abra `edge://extensions` e ative o modo de desenvolvedor.
2. Escolha **Carregar sem compactação** e selecione `dist/edge`.
3. Recarregue uma página HTTP ou HTTPS comum.
4. Selecione até 100 caracteres e confirme em **Traduzir para CAA**.


## Estrutura

```
backend/
  app/            API (FastAPI): pipeline, Groq, vocabulário, configuração
  data/           vocabulário ARASAAC em português (arasaac_vocabulario_br.json)
extension/        código da extensão (conteúdo, background, voz, estilos, ícones)
manifests/        manifestos do Edge
scripts/          build da extensão e instalação do OpenWordnet-PT
```

## Créditos e licenças

Veja `CREDITOS.md`. Os pictogramas são de Sergio Palao, propriedade do Governo de Aragão (ARASAAC), licença CC BY-NC-SA.
