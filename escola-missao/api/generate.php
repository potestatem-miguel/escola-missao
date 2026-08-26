<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Metodo nao permitido.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'JSON invalido.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$requiredFields = ['children', 'subject', 'goal', 'questionCount', 'difficulty'];

foreach ($requiredFields as $field) {
    if (!isset($payload[$field]) || $payload[$field] === '' || $payload[$field] === []) {
        http_response_code(422);
        echo json_encode([
            'ok' => false,
            'error' => "Campo obrigatorio ausente: {$field}."
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if (!is_array($payload['children'])) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'A lista de criancas e invalida.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

foreach ($payload['children'] as $index => $child) {
    if (!is_array($child)) {
        http_response_code(422);
        echo json_encode([
            'ok' => false,
            'error' => 'Cada crianca precisa ser enviada como objeto.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    foreach (['id', 'studentName', 'age', 'grade'] as $field) {
        if (!isset($child[$field]) || $child[$field] === '') {
            http_response_code(422);
            echo json_encode([
                'ok' => false,
                'error' => "Campo obrigatorio ausente na crianca " . ($index + 1) . ": {$field}."
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
}

$attachments = $payload['attachments'] ?? [];
if (!is_array($attachments)) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'A lista de anexos e invalida.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$topicText = trim((string) ($payload['topic'] ?? ''));
if ($topicText === '' && count($attachments) === 0) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'Informe o conteudo da materia ou envie PDF/imagens.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$config = [];
$configPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';

if (file_exists($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) {
        $config = $loaded;
    }
}

$apiKey = $config['google_api_key'] ?? (getenv('GOOGLE_API_KEY') ?: '');
$model = $config['google_model'] ?? (getenv('GOOGLE_MODEL') ?: 'gemini-2.5-flash');
$allowDemoFallback = shouldUseDemoFallback($config);

try {
    if ($apiKey === '' && !$allowDemoFallback) {
        throw new RuntimeException('A chave da IA do Google nao esta configurada. Sem isso, o sistema nao pode gerar conteudo confiavel.');
    }

    try {
        $content = $apiKey !== ''
            ? generateWithGoogle($payload, $apiKey, $model)
            : generateFallback($payload);
    } catch (Throwable $exception) {
        if (!$allowDemoFallback) {
            throw new RuntimeException('Nao foi possivel gerar um conteudo confiavel com a IA agora. Tente novamente em alguns instantes. Detalhe: ' . $exception->getMessage());
        }

        $content = generateFallback($payload);
        $content['generatedWithFallback'] = true;
        $content['fallbackReason'] = $exception->getMessage();
    }

    echo json_encode([
        'ok' => true,
        'content' => $content
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $exception->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

function generateWithGoogle(array $payload, string $apiKey, string $model): array
{
    $theme = trim((string) ($payload['theme'] ?? ''));
    $topic = trim((string) ($payload['topic'] ?? ''));
    $goal = trim((string) $payload['goal']);
    $retryMode = (bool) ($payload['retryMode'] ?? false);
    $previousQuestions = array_values(array_filter($payload['previousQuestions'] ?? [], 'is_string'));
    $attachments = array_values(array_filter($payload['attachments'] ?? [], 'is_array'));
    $themeInstruction = $theme !== ''
        ? "Use o universo de {$theme} como referencia ludica tanto na explicacao quanto nas questoes, mas sem substituir a materia real."
        : 'Nao use personagens especificos; mantenha uma linguagem divertida e infantil.';

    $retryInstruction = $retryMode
        ? 'Como esta crianca vai refazer o teste, crie questoes novas, com enunciados diferentes dos anteriores.'
        : 'Crie um pacote completo de aula e teste.';

    $childrenData = array_map(static function (array $child): array {
        return [
            'id' => (string) $child['id'],
            'nome' => (string) $child['studentName'],
            'idade' => (int) $child['age'],
            'serie' => (string) $child['grade'],
            'preferencias' => array_values(array_filter($child['favoriteThemes'] ?? [], 'is_string'))
        ];
    }, $payload['children']);

    $lessonSystemPrompt = implode("\n", [
        'Voce e um criador de material pedagogico infantil em portugues do Brasil.',
        'Sua primeira tarefa e construir uma aula de verdade, focada no conteudo da materia.',
        'Explique com clareza, exemplos simples e tom acolhedor.',
        'O conteudo deve ser apropriado para criancas e respeitar serie, idade e dificuldade.',
        'E proibido incluir termos pornograficos, sexualizados, violentos em excesso, ofensivos ou inadequados para a idade.',
        'E proibido incluir termos ou referencias que nao condizem com a idade da crianca.',
        'Nao use nomes estrangeiros, nomes japoneses, termos dificeis de pronunciar ou palavras inventadas.',
        'Prefira nomes simples e familiares em portugues, como Ana, Bia, Davi, Leo, Nina, bola, casa, escola e parque.',
        'Se houver desenho ou filme de referencia, use essa referencia de forma clara na explicacao, mas sem substituir a materia real.',
        'Se o desenho tiver personagens com nomes dificeis, troque os nomes por descricoes simples em portugues.',
        $themeInstruction,
        "Objetivo selecionado: {$goal}.",
        'Se houver PDF ou imagens anexadas, trate esses arquivos como fonte principal do conteudo didatico.',
        'Leia o conteudo do material anexado e recrie a explicacao de forma mais ludica e facilitada.',
        'Nao invente assunto fora do que aparece no material anexado, exceto para simplificar e explicar melhor.',
        'A explicacao deve ensinar a materia e o topico de verdade. Nao explique "como estudar", "como aprender" ou "como fazer prova" no lugar do conteudo.',
        'Se a materia for Matematica, ensine a regra, a operacao, o passo a passo e exemplos coerentes com o topico pedido.',
        'Se a materia for Portugues, ensine a classe gramatical, a regra, a funcao na frase e exemplos coerentes com o topico pedido.',
        'Se a materia for Historia, Geografia ou Ciencias, ensine os fatos, conceitos, causas, exemplos e relacoes corretas do topico pedido.',
        'Construa uma aula completa com inicio, desenvolvimento, exemplos e fechamento.',
        'Os exemplos devem ajudar a entender o topico pedido e nao podem ficar vagos.',
        'Retorne tambem uma lista de conceitos-chave que resumem o que foi ensinado.',
        'Retorne somente JSON valido no schema informado.'
    ]);

    $lessonUserPrompt = json_encode([
        'materia' => (string) $payload['subject'],
        'tema_da_materia' => $topic,
        'referencia_ludica' => $theme,
        'objetivo' => $goal,
        'quantidade_exercicios' => (int) $payload['questionCount'],
        'dificuldade' => (string) $payload['difficulty'],
        'usar_material_anexado_como_base_principal' => count($attachments) > 0,
        'criancas' => $childrenData,
        'questoes_anteriores' => $previousQuestions
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $parts = [];
    foreach ($attachments as $attachment) {
        $data = trim((string) ($attachment['data'] ?? ''));
        $mimeType = trim((string) ($attachment['mimeType'] ?? ''));
        if ($data !== '' && $mimeType !== '') {
            $parts[] = [
                'inline_data' => [
                    'mime_type' => $mimeType,
                    'data' => $data
                ]
            ];
        }
    }

    $parts[] = ['text' => $lessonSystemPrompt . "\n\nDados do pedido:\n" . $lessonUserPrompt];

    $lessonSchema = [
        'type' => 'object',
        'additionalProperties' => false,
        'properties' => [
            'title' => ['type' => 'string'],
            'intro' => ['type' => 'string'],
            'subject' => ['type' => 'string'],
            'topic' => ['type' => 'string'],
            'difficulty' => ['type' => 'string'],
            'lessonSections' => [
                'type' => 'array',
                'minItems' => 3,
                'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'properties' => [
                        'heading' => ['type' => 'string'],
                        'body' => ['type' => 'string'],
                        'bullets' => [
                            'type' => 'array',
                            'minItems' => 2,
                            'items' => ['type' => 'string']
                        ]
                    ],
                    'required' => ['heading', 'body', 'bullets']
                ]
            ],
            'keyConcepts' => [
                'type' => 'array',
                'minItems' => 3,
                'items' => ['type' => 'string']
            ]
        ],
        'required' => ['title', 'intro', 'subject', 'topic', 'difficulty', 'lessonSections', 'keyConcepts']
    ];

    $lessonContent = callGoogleJson($apiKey, $model, $parts, $lessonSchema);
    if (!is_array($lessonContent)) {
        throw new RuntimeException('A IA nao retornou uma aula valida.');
    }

    validateGeneratedStudyLesson($lessonContent, $payload);

    $children = array_map(static function (array $child): array {
        return [
            'id' => (string) $child['id'],
            'studentName' => (string) $child['studentName'],
            'age' => (int) $child['age'],
            'grade' => (string) $child['grade'],
            'questions' => []
        ];
    }, $payload['children']);

    if (in_array($goal, ['Exercicios', 'Explicacao + Exercicios'], true)) {
        $questionSystemPrompt = implode("\n", [
            'Voce e um criador de exercicios infantis em portugues do Brasil.',
            'Sua unica fonte de verdade e a aula enviada no campo "aula_base".',
            'Crie exercicios estritamente baseados nessa aula. Nao invente perguntas genericas e nao troque de assunto.',
            'Cada questao deve testar um conceito, uma regra, um exemplo, uma interpretacao ou uma aplicacao real do conteudo ensinado.',
            'E proibido criar questoes metacognitivas ou vagas, como "o que ajuda a aprender", "o que mostra que voce entendeu", "qual atitude e melhor" ou parecidas.',
            'E proibido criar perguntas sobre o proprio desenho, sobre comportamento de estudo ou sobre a existencia da explicacao.',
            'A referencia ludica deve aparecer apenas como contexto do enunciado ou do exemplo. O foco central da pergunta deve ser a materia.',
            'As alternativas erradas devem ser plausiveis e relacionadas ao mesmo conteudo.',
            'Nas alternativas e explicacoes, nao use nomes estrangeiros, nomes japoneses, termos dificeis de pronunciar ou palavras inventadas.',
            'Prefira nomes simples em portugues.',
            $retryInstruction,
            'As questoes de cada crianca devem ser diferentes entre si, mas todas precisam continuar alinhadas a aula_base.',
            'Gere exatamente o numero de questoes solicitado para cada crianca.',
            'Cada questao deve ter apenas uma alternativa correta.',
            'Cada explicacao do gabarito deve citar a ideia ensinada na aula_base que justifica a resposta correta.',
            'Retorne somente JSON valido no schema informado.'
        ]);

        $questionUserPrompt = json_encode([
            'materia' => (string) $payload['subject'],
            'tema_da_materia' => $topic,
            'referencia_ludica' => $theme,
            'dificuldade' => (string) $payload['difficulty'],
            'quantidade_exercicios_por_crianca' => (int) $payload['questionCount'],
            'criancas' => $childrenData,
            'questoes_anteriores' => $previousQuestions,
            'aula_base' => $lessonContent
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $questionSchema = [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'children' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'additionalProperties' => false,
                        'properties' => [
                            'id' => ['type' => 'string'],
                            'studentName' => ['type' => 'string'],
                            'age' => ['type' => 'integer'],
                            'grade' => ['type' => 'string'],
                            'questions' => [
                                'type' => 'array',
                                'items' => [
                                    'type' => 'object',
                                    'additionalProperties' => false,
                                    'properties' => [
                                        'prompt' => ['type' => 'string'],
                                        'options' => [
                                            'type' => 'array',
                                            'items' => ['type' => 'string'],
                                            'minItems' => 4,
                                            'maxItems' => 5
                                        ],
                                        'correctIndex' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 4],
                                        'explanation' => ['type' => 'string']
                                    ],
                                    'required' => ['prompt', 'options', 'correctIndex', 'explanation']
                                ]
                            ]
                        ],
                        'required' => ['id', 'studentName', 'age', 'grade', 'questions']
                    ]
                ]
            ],
            'required' => ['children']
        ];

        $questionContent = callGoogleJson(
            $apiKey,
            $model,
            [['text' => $questionSystemPrompt . "\n\nDados do pedido:\n" . $questionUserPrompt]],
            $questionSchema
        );

        if (!is_array($questionContent) || !isset($questionContent['children']) || !is_array($questionContent['children'])) {
            throw new RuntimeException('A IA nao retornou exercicios validos.');
        }

        $children = $questionContent['children'];
    }

    $finalContent = [
        'title' => (string) $lessonContent['title'],
        'intro' => (string) $lessonContent['intro'],
        'subject' => (string) $lessonContent['subject'],
        'topic' => (string) $lessonContent['topic'],
        'difficulty' => (string) $lessonContent['difficulty'],
        'lessonSections' => in_array($goal, ['Explicacao', 'Explicacao + Exercicios'], true)
            ? $lessonContent['lessonSections']
            : [],
        'children' => $children
    ];

    validateGeneratedStudyContent($finalContent, $payload);

    return $finalContent;
}

function shouldUseDemoFallback(array $config): bool
{
    $value = $config['allow_demo_fallback'] ?? getenv('ALLOW_DEMO_FALLBACK') ?? '';
    $normalized = strtolower(trim((string) $value));

    return in_array($normalized, ['1', 'true', 'yes', 'sim'], true);
}

function extractTextOutput(array $response): string
{
    foreach ($response['candidates'] ?? [] as $candidate) {
        foreach ($candidate['content']['parts'] ?? [] as $part) {
            if (isset($part['text']) && is_string($part['text'])) {
                return $part['text'];
            }
        }
    }

    return '';
}

function callGoogleJson(string $apiKey, string $model, array $parts, array $schema): array
{
    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent';
    $body = [
        'contents' => [
            [
                'parts' => $parts
            ]
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseJsonSchema' => $schema
        ]
    ];

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey
        ],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 60
    ]);

    $rawResponse = curl_exec($ch);
    if ($rawResponse === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Falha ao consultar a API do Google: ' . $error);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $response = json_decode($rawResponse, true);
    if ($status >= 400) {
        $message = $response['error']['message'] ?? 'Erro desconhecido ao consultar a API do Google.';
        throw new RuntimeException($message);
    }

    $jsonText = extractTextOutput($response);
    if ($jsonText === '') {
        throw new RuntimeException('A resposta da API do Google nao trouxe um JSON utilizavel.');
    }

    $decoded = json_decode($jsonText, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('A API do Google retornou uma estrutura invalida.');
    }

    return $decoded;
}

function validateGeneratedStudyContent(array $content, array $payload): void
{
    $goal = trim((string) ($payload['goal'] ?? ''));
    $topic = trim((string) ($payload['topic'] ?? ''));
    $expectedQuestionCount = max(0, (int) ($payload['questionCount'] ?? 0));
    $blockedPatterns = [
        'o que ajuda a aprender',
        'o que mostra que voce entendeu',
        'qual atitude ajuda a aprender',
        'qual atitude e melhor',
        'o que uma boa questao',
        'como a referencia',
        'alternativa sem relacao com a materia',
        'opcao escolhida apenas por sorte',
        'responde sem ler',
        'troca de materia no meio do teste',
        'escolhe a maior frase'
    ];

    if (in_array($goal, ['Explicacao', 'Explicacao + Exercicios'], true)) {
        $sections = $content['lessonSections'] ?? null;
        if (!is_array($sections) || count($sections) === 0) {
            throw new RuntimeException('A IA nao retornou a explicacao da materia.');
        }

        $allLessonText = normalizeTextForValidation(
            ($content['title'] ?? '') . ' ' .
            ($content['intro'] ?? '') . ' ' .
            implode(' ', array_map(static function (array $section): string {
                $bullets = isset($section['bullets']) && is_array($section['bullets']) ? implode(' ', $section['bullets']) : '';
                return (string) ($section['heading'] ?? '') . ' ' . (string) ($section['body'] ?? '') . ' ' . $bullets;
            }, $sections))
        );

        if ($topic !== '') {
            $topicTokens = extractRelevantTokens($topic);
            if ($topicTokens !== [] && !containsAnyToken($allLessonText, $topicTokens)) {
                throw new RuntimeException('A explicacao retornada nao parece estar focada no topico solicitado.');
            }
        }
    }

    if (!in_array($goal, ['Exercicios', 'Explicacao + Exercicios'], true)) {
        return;
    }

    $children = $content['children'] ?? null;
    if (!is_array($children) || count($children) === 0) {
        throw new RuntimeException('A IA nao retornou exercicios para a crianca.');
    }

    foreach ($children as $child) {
        $questions = $child['questions'] ?? null;
        if (!is_array($questions) || count($questions) !== $expectedQuestionCount) {
            throw new RuntimeException('A IA nao retornou a quantidade correta de exercicios.');
        }

        foreach ($questions as $question) {
            $promptText = normalizeTextForValidation((string) ($question['prompt'] ?? ''));
            $explanationText = normalizeTextForValidation((string) ($question['explanation'] ?? ''));
            $optionsText = normalizeTextForValidation(implode(' ', array_map('strval', $question['options'] ?? [])));
            $joinedText = $promptText . ' ' . $explanationText . ' ' . $optionsText;

            foreach ($blockedPatterns as $pattern) {
                if (str_contains($joinedText, $pattern)) {
                    throw new RuntimeException('A IA retornou exercicios genericos ou fora do padrao de qualidade.');
                }
            }

            if ($topic !== '') {
                $topicTokens = extractRelevantTokens($topic);
                if ($topicTokens !== [] && !containsAnyToken($joinedText, $topicTokens)) {
                    throw new RuntimeException('A IA retornou uma questao desconectada do topico da materia.');
                }
            }
        }
    }
}

function validateGeneratedStudyLesson(array $content, array $payload): void
{
    $topic = trim((string) ($payload['topic'] ?? ''));
    $sections = $content['lessonSections'] ?? null;
    if (!is_array($sections) || count($sections) < 3) {
        throw new RuntimeException('A IA nao retornou uma explicacao suficientemente completa.');
    }

    foreach ($sections as $section) {
        $body = trim((string) ($section['body'] ?? ''));
        $bullets = $section['bullets'] ?? null;
        if ($body === '' || !is_array($bullets) || count($bullets) < 2) {
            throw new RuntimeException('A IA retornou uma explicacao incompleta em uma das secoes.');
        }
    }

    if ($topic !== '') {
        $allLessonText = normalizeTextForValidation(
            ($content['title'] ?? '') . ' ' .
            ($content['intro'] ?? '') . ' ' .
            implode(' ', array_map(static function (array $section): string {
                $bullets = isset($section['bullets']) && is_array($section['bullets']) ? implode(' ', $section['bullets']) : '';
                return (string) ($section['heading'] ?? '') . ' ' . (string) ($section['body'] ?? '') . ' ' . $bullets;
            }, $sections))
        );

        $topicTokens = extractRelevantTokens($topic);
        if ($topicTokens !== [] && !containsAnyToken($allLessonText, $topicTokens)) {
            throw new RuntimeException('A explicacao retornada nao parece estar focada no topico solicitado.');
        }
    }
}

function normalizeTextForValidation(string $text): string
{
    $normalized = trim(mb_strtolower($text, 'UTF-8'));
    $replacements = [
        'á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a',
        'é' => 'e', 'ê' => 'e',
        'í' => 'i',
        'ó' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ú' => 'u',
        'ç' => 'c'
    ];

    return strtr($normalized, $replacements);
}

function extractRelevantTokens(string $topic): array
{
    $normalized = normalizeTextForValidation($topic);
    $parts = preg_split('/[^a-z0-9]+/', $normalized) ?: [];
    $parts = array_values(array_filter($parts, static function (string $part): bool {
        return strlen($part) >= 4 && !in_array($part, ['para', 'sobre', 'com', 'uma', 'umas', 'esse', 'essa', 'isso', 'mais'], true);
    }));

    return array_slice(array_unique($parts), 0, 6);
}

function containsAnyToken(string $text, array $tokens): bool
{
    foreach ($tokens as $token) {
        if (str_contains($text, $token)) {
            return true;
        }
    }

    return false;
}

function generateFallback(array $payload): array
{
    $subject = trim((string) $payload['subject']);
    $topic = trim((string) ($payload['topic'] ?? ''));
    $difficulty = trim((string) $payload['difficulty']);
    $goal = trim((string) $payload['goal']);
    $theme = trim((string) ($payload['theme'] ?? ''));
    $questionCount = max(3, (int) $payload['questionCount']);
    $themeLabel = $theme !== '' ? $theme : 'uma aventura divertida';
    $topicLabel = $topic !== '' ? $topic : 'o material enviado';
    $lessonSections = in_array($goal, ['Explicacao', 'Explicacao + Exercicios'], true)
        ? buildLessonSections($subject, $topicLabel, $difficulty, $themeLabel)
        : [];
    $children = array_map(static function (array $child, int $index) use ($goal, $subject, $topic, $questionCount, $themeLabel): array {
        return [
            'id' => (string) $child['id'],
            'studentName' => (string) $child['studentName'],
            'age' => (int) $child['age'],
            'grade' => (string) $child['grade'],
            'questions' => in_array($goal, ['Exercicios', 'Explicacao + Exercicios'], true)
                ? generateFallbackQuestions($subject, $topic !== '' ? $topic : 'o material enviado', $questionCount, $themeLabel, $index)
                : []
        ];
    }, $payload['children'], array_keys($payload['children']));

    return [
        'title' => "Aula personalizada sobre {$topicLabel}",
        'intro' => "Conteudo de {$subject} com explicacao da materia e referencias inspiradas em {$themeLabel}.",
        'subject' => $subject,
        'topic' => $topicLabel,
        'difficulty' => $difficulty,
        'lessonSections' => $lessonSections,
        'children' => $children
    ];
}

function generateFallbackQuestions(string $subject, string $topic, int $questionCount, string $themeLabel, int $variant): array
{
    $questionSets = [
        [
            [
                'prompt' => "Pensando no assunto {$topic} em {$subject}, qual alternativa representa melhor a ideia estudada na aventura de {$themeLabel}?",
                'options' => [
                    "A alternativa que aplica corretamente a regra de {$topic}.",
                    'Uma alternativa sem relacao com a materia.',
                    'Uma frase que nao trata do assunto estudado.',
                    'Uma opcao escolhida apenas por sorte.'
                ],
                'correctIndex' => 0,
                'explanation' => "A resposta correta precisa estar ligada ao conteudo real de {$topic}, e nao a uma atitude generica."
            ],
            [
                'prompt' => "Na aula de {$subject} com referencias de {$themeLabel}, o que uma boa questao sobre {$topic} precisa verificar?",
                'options' => [
                    "Se a crianca consegue usar o conteudo de {$topic} em um exemplo.",
                    'Se a crianca responde sem ler.',
                    'Se a crianca troca de materia no meio do teste.',
                    'Se a crianca escolhe a maior frase.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Uma boa questao deve avaliar aplicacao do conteudo, nao comportamento aleatorio.'
            ],
            [
                'prompt' => "Qual alternativa descreve melhor como a referencia de {$themeLabel} deve aparecer em uma questao sobre {$topic}?",
                'options' => [
                    'Como contexto ou exemplo, mantendo o foco na materia.',
                    'Como unica informacao importante, sem ensinar a materia.',
                    'Com nomes dificeis que atrapalham a leitura.',
                    'Sem relacao com o conteudo estudado.'
                ],
                'correctIndex' => 0,
                'explanation' => 'A referencia ludica deve ajudar a explicar o topico, nao tomar o lugar da materia.'
            ]
        ],
        [
            [
                'prompt' => "Em uma questao de {$subject} sobre {$topic}, qual alternativa estaria mais alinhada ao conteudo ensinado?",
                'options' => [
                    "A opcao que usa corretamente a explicacao de {$topic}.",
                    'Uma frase sem relacao com o assunto.',
                    'Uma alternativa montada so para parecer divertida.',
                    'Uma resposta escolhida por impulso.'
                ],
                'correctIndex' => 0,
                'explanation' => 'A alternativa correta sempre precisa conversar com o conteudo estudado.'
            ],
            [
                'prompt' => "Qual tipo de erro deve aparecer nas alternativas erradas de uma questao sobre {$topic}?",
                'options' => [
                    "Erros parecidos com as duvidas comuns sobre {$topic}.",
                    'Erros sem nenhuma ligacao com a materia.',
                    'Frases sobre comportamento em sala.',
                    'Palavras inventadas e sem contexto.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Distratores bons sao proximos do conteudo real e ajudam a medir a compreensao.'
            ],
            [
                'prompt' => "Se a aula ensinou {$topic} com o tema {$themeLabel}, o que a explicacao principal precisa trazer?",
                'options' => [
                    "A regra, o conceito e exemplos do proprio topico {$topic}.",
                    'Apenas frases sobre motivacao para estudar.',
                    'Somente nomes de personagens.',
                    'Respostas prontas sem explicar a materia.'
                ],
                'correctIndex' => 0,
                'explanation' => 'A explicacao precisa ensinar o topico de verdade para preparar a crianca para os exercicios.'
            ]
        ]
    ];

    $selectedSet = $questionSets[$variant % count($questionSets)];
    return array_slice($selectedSet, 0, min($questionCount, count($selectedSet)));
}

function buildLessonSections(string $subject, string $topic, string $difficulty, string $themeLabel): array
{
    return [
        [
            'heading' => "Vamos aprender {$topic}",
            'body' => "Hoje vamos estudar {$topic} em {$subject} com uma explicacao simples, correta e ligada a exemplos inspirados em {$themeLabel}.",
            'bullets' => [
                "A linguagem foi ajustada para o nivel {$difficulty}.",
                "Os exemplos usam situacoes de {$themeLabel}, mas mantem o foco no conteudo real da materia.",
                'A explicacao prioriza a regra, o conceito ou a ideia central do assunto.'
            ]
        ],
        [
            'heading' => 'Entendendo a materia',
            'body' => "Primeiro vamos identificar a ideia principal de {$topic}, depois observar exemplos simples e por fim praticar com perguntas ligadas ao conteudo.",
            'bullets' => [
                "Os exemplos fazem ponte entre {$themeLabel} e o assunto estudado.",
                'As explicacoes evitam palavras complicadas e focam no que a crianca precisa entender.',
                'As perguntas servem para testar a aplicacao do conteudo.'
            ]
        ],
        [
            'heading' => 'Resumo da aula',
            'body' => "Os exercicios abaixo usam o mesmo tema de {$themeLabel} para manter o interesse, mas continuam avaliando {$topic}.",
            'bullets' => [
                "A aula explica {$topic} com referencias do universo de {$themeLabel}.",
                'As questoes precisam conversar com a explicacao apresentada.',
                'O refazer teste continua disponivel abaixo de 80%.'
            ]
        ]
    ];
}
