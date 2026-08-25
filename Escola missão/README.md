# Estuda Kids IA

Aplicativo web para gerar aulas infantis personalizadas com IA e corrigir exercicios automaticamente.

## O que esta pronto

- Formulario com varios alunos no mesmo envio.
- Dados separados por aluno:
  - nome
  - idade
  - serie
- Dados compartilhados do conteudo:
  - materia
  - tema da materia
  - desenho, anime ou filme de referencia
  - dificuldade
  - quantidade de exercicios
- Exibicao da aula na mesma tela.
- Exercicios de multipla escolha com correcao imediata.
- Gabarito com explicacao apos o envio das respostas.
- Botao para gerar novo teste quando o aproveitamento ficar em ate 79%.
- Reaproveitamento automatico dos dados do formulario ao gerar novo teste.
- Integracao com Google Gemini.
- Regras no prompt para evitar termos improprios e nomes estrangeiros dificeis nas questoes.
- Fallback local quando a chave do Google ainda nao estiver configurada.

## Estrutura

- `index.html`: interface principal
- `styles.css`: visual da aplicacao
- `app.js`: formulario, consumo da API, correcao e novo teste
- `api/generate.php`: endpoint que gera o conteudo
- `config.example.php`: modelo de configuracao do Google Gemini
- `iniciar-servidor.bat`: inicia o servidor local no Windows
- `server.ps1`: script PowerShell que sobe o PHP local

## Como configurar

1. Copie `config.example.php` para `config.php`.
2. Preencha a chave da API do Google em `config.php`.
3. Se quiser, troque o modelo em `google_model`.

## Como rodar

Com Laragon ou outro PHP instalado:

1. Execute `iniciar-servidor.bat`.
2. Abra `http://localhost:8000`.

Ou manualmente:

```bash
php -S localhost:8000
```

## Observacoes

- Sem `config.php`, o sistema continua funcionando em modo demonstrativo.
- Em producao, a chave da API do Google deve ficar apenas no servidor.
- O endpoint foi preparado para retornar JSON estruturado, facilitando depois adicionar login, salvar historico, PDF ou area administrativa.
