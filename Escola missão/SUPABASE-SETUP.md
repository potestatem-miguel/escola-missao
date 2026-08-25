# Supabase Setup

Este projeto agora usa:

- `Supabase Auth` para login do responsável
- `Supabase Database` para crianças, sessões, questões e relatórios
- `Supabase Storage` para PDFs e imagens

## 1. Rodar o SQL no Supabase

No painel do Supabase:

1. Abra `SQL Editor`
2. Crie uma nova query
3. Cole todo o conteúdo de [supabase-schema.sql](C:\Users\junio\OneDrive\Desktop\Escola missão\supabase-schema.sql)
4. Execute

Isso cria:

- tabela `profiles`
- tabela `children`
- tabela `study_sessions`
- tabela `study_questions`
- tabela `homework_sessions`
- bucket `estuda-materials`
- políticas RLS

## 2. Conferir Auth

No painel do Supabase:

1. Abra `Authentication`
2. Em `Providers`, deixe `Email` habilitado
3. Escolha se quer exigir confirmação de email

Se a confirmação de email estiver ligada:

- o responsável cria a conta na tela de login
- confirma no email
- depois entra no sistema

## 3. Conferir as chaves

O frontend usa:

- [supabase-config.js](C:\Users\junio\OneDrive\Desktop\Escola missão\supabase-config.js)

Nele ficam:

- `url`
- `anonKey`

## 4. Rodar localmente

1. Suba o servidor PHP
2. Abra `http://localhost:8000`
3. Crie a conta do responsável na tela de login
4. Cadastre a criança
5. Gere conteúdo e responda exercícios

## 5. Antes de publicar

Recomendado:

1. Rotacionar a `secret key` antiga no Supabase
2. Manter apenas a `publishable key` no frontend
3. Deixar Google e ElevenLabs apenas no backend

## 6. Publicação

Para publicar em servidor:

1. Suba o projeto no GitHub
2. Conecte no EasyPanel
3. Configure PHP/web root
4. Garanta que o servidor consiga acessar:
   - Google Gemini
   - ElevenLabs
   - Supabase
