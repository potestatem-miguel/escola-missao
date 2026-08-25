# Estuda Kids IA

Aplicativo web para gerar aulas infantis personalizadas com IA, explicar lição de casa e acompanhar desempenho com login, Supabase e relatórios.

## O que está pronto

- Login de responsável com Supabase Auth
- Cadastro de crianças
- Área de estudo com geração de explicação e exercícios
- Área de lição de casa com leitura de PDF/imagens
- Relatórios por criança
- Upload de arquivos
- Integração com Google Gemini
- Narração com ElevenLabs
- Estrutura preparada para deploy com Docker

## Estrutura principal

- `index.html`: página inicial
- `login.html`: login e cadastro de conta
- `study.html`: área de estudo
- `homework.html`: área de lição de casa
- `children.html`: cadastro da criança
- `reports.html`: relatórios
- `api/`: endpoints PHP
- `Dockerfile`: imagem para deploy
- `docker-compose.yml`: teste local com Docker
- `supabase-schema.sql`: schema do Supabase
- `SUPABASE-SETUP.md`: guia do Supabase

## Rodar localmente com PHP

Com Laragon ou outro PHP instalado:

1. Execute `iniciar-servidor.bat`
2. Abra `http://localhost:8000`

## Rodar com Docker

### Opção 1: Docker Compose

1. Ajuste as variáveis de ambiente no seu shell ou crie um `.env`
2. Rode:

```bash
docker compose up --build
```

3. Abra:

```text
http://localhost:8080
```

### Variáveis importantes

```env
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-2.5-flash
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=bIHbv24MWmeRgasZH58o
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
SUPABASE_URL=https://ccdtpcjxzdrjsafzhzgn.supabase.co
SUPABASE_ANON_KEY=
```

## Deploy no EasyPanel com Dockerfile

Use `Aplicativo`, não `Caixa`.

### No EasyPanel

1. Crie um novo serviço do tipo `Aplicativo`
2. Conecte o repositório GitHub
3. Use a branch `main`
4. Se o projeto estiver em subpasta no repositório, ajuste o `Build Path`
5. No build, use o `Dockerfile` da raiz do projeto
6. Adicione as variáveis de ambiente:

```env
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-2.5-flash
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=bIHbv24MWmeRgasZH58o
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
SUPABASE_URL=https://ccdtpcjxzdrjsafzhzgn.supabase.co
SUPABASE_ANON_KEY=
```

7. Exponha a porta:

```text
8080
```

8. Faça o deploy

## Observações importantes

- Em produção, prefira usar variáveis de ambiente em vez de chaves fixas em arquivo.
- A `secret key` do Supabase não deve ir para o frontend.
- O arquivo `supabase-config.js` é sobrescrito no container pelo `entrypoint.sh`, usando as variáveis de ambiente do deploy.
- Se você já expôs alguma chave sensível durante os testes, rotacione essa chave no provedor.
