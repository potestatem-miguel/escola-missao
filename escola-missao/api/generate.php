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

try {
    try {
        $content = $apiKey !== ''
            ? generateWithGoogle($payload, $apiKey, $model)
            : generateFallback($payload);
    } catch (Throwable $exception) {
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
        ? "Use o universo de {$theme} como referencia ludica tanto na explicacao quanto nas questoes."
        : 'Nao use personagens especificos; mantenha uma linguagem divertida e infantil.';

    $retryInstruction = $retryMode
        ? 'Como esta crianca vai refazer o teste, crie questoes novas, com enunciados diferentes dos anteriores.'
        : 'Crie um pacote completo de aula e teste.';

    $schema = [
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
                'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'properties' => [
                        'heading' => ['type' => 'string'],
                        'body' => ['type' => 'string'],
                        'bullets' => [
                            'type' => 'array',
                            'items' => ['type' => 'string']
                        ]
                    ],
                    'required' => ['heading', 'body', 'bullets']
                ]
            ],
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
        'required' => ['title', 'intro', 'subject', 'topic', 'difficulty', 'lessonSections', 'children']
    ];

    $systemPrompt = implode("\n", [
        'Voce e um criador de material pedagogico infantil em portugues do Brasil.',
        'Explique com clareza, exemplos simples e tom acolhedor.',
        'O conteudo deve ser apropriado para criancas e respeitar serie, idade e dificuldade.',
        'E proibido incluir termos pornograficos, sexualizados, violentos em excesso, ofensivos ou inadequados para a idade.',
        'E proibido incluir termos ou referencias que nao condizem com a idade da crianca.',
        'Nas questoes, alternativas e explicacoes, nao use nomes estrangeiros, nomes japoneses, termos dificeis de pronunciar ou palavras inventadas.',
        'Prefira nomes simples e familiares em portugues, como Ana, Bia, Davi, Leo, Nina, bola, casa, escola e parque.',
        'Se houver desenho ou filme de referencia, use essa referencia de forma clara tanto na explicacao quanto em todas as questoes.',
        'Se o desenho tiver personagens com nomes dificeis, troque os nomes por descricoes simples em portugues.',
        $themeInstruction,
        $retryInstruction,
        "Objetivo selecionado: {$goal}.",
        'Se houver PDF ou imagens anexadas, trate esses arquivos como fonte principal do conteudo didatico.',
        'Leia o conteudo do material anexado e recrie a explicacao de forma mais ludica e facilitada.',
        'Nao invente assunto fora do que aparece no material anexado, exceto para simplificar e explicar melhor.',
        'Se o objetivo for "Exercicios", retorne lessonSections vazio e gere apenas as questoes.',
        'Se o objetivo for "Explicacao + Exercicios", retorne explicacao completa e as questoes.',
        'Se o objetivo for "Explicacao", retorne explicacao completa e questions vazio para todas as criancas.',
        'As questoes de cada crianca devem ser diferentes entre si.',
        'Gere exatamente o numero de questoes solicitado para cada crianca.',
        'Cada questao deve ter apenas uma alternativa correta.',
        'Retorne somente JSON valido no schema informado.'
    ]);

    $userPrompt = json_encode([
        'materia' => (string) $payload['subject'],
        'tema_da_materia' => $topic,
        'referencia_ludica' => $theme,
        'objetivo' => $goal,
        'quantidade_exercicios' => (int) $payload['questionCount'],
        'dificuldade' => (string) $payload['difficulty'],
        'usar_material_anexado_como_base_principal' => count($attachments) > 0,
        'criancas' => array_map(static function (array $child): array {
            return [
                'id' => (string) $child['id'],
                'nome' => (string) $child['studentName'],
                'idade' => (int) $child['age'],
                'serie' => (string) $child['grade']
            ];
        }, $payload['children']),
        'questoes_anteriores' => $previousQuestions
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent';
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

    $parts[] = ['text' => $systemPrompt . "\n\nDados do pedido:\n" . $userPrompt];

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
        'intro' => "Conteudo de {$subject} com referencias inspiradas em {$themeLabel}.",
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
                'prompt' => "Na aventura inspirada em {$themeLabel}, qual frase mostra melhor que a crianca entendeu o assunto {$topic}?",
                'options' => [
                    "Eu consigo explicar {$topic} com minhas palavras.",
                    'Eu marquei uma resposta sem ler.',
                    'Eu pulei todos os exemplos.',
                    'Eu desisti antes de tentar.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Explicar com as proprias palavras mostra compreensao real do conteudo.'
            ],
            [
                'prompt' => "Ao estudar {$subject} com exemplos inspirados em {$themeLabel}, o que mais ajuda a aprender?",
                'options' => [
                    'Relacionar o assunto a exemplos simples.',
                    'Ignorar a explicacao.',
                    'Responder correndo sem pensar.',
                    'Marcar qualquer alternativa.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Exemplos simples ajudam a entender e lembrar do que foi estudado.'
            ],
            [
                'prompt' => "Depois da explicacao sobre {$topic} no universo de {$themeLabel}, o que o exercicio deve verificar?",
                'options' => [
                    'Se a crianca consegue aplicar a ideia aprendida.',
                    'Se a crianca clicou rapido.',
                    'Se a crianca decorou palavras sem sentido.',
                    'Se a crianca deixou tudo em branco.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Um bom exercicio mede se a crianca conseguiu usar o conhecimento.'
            ]
        ],
        [
            [
                'prompt' => "Na missao inspirada em {$themeLabel}, qual atitude ajuda a aprender {$topic}?",
                'options' => [
                    'Ler, pensar e revisar a explicacao.',
                    'Escolher qualquer resposta sem analisar.',
                    'Desistir na primeira questao.',
                    'Ignorar o que foi ensinado.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Aprender bem envolve atencao, tentativa e revisao.'
            ],
            [
                'prompt' => "Quando o sistema mostra a resposta correta depois da aventura de {$themeLabel}, isso serve para:",
                'options' => [
                    'Transformar o erro em aprendizado.',
                    'Confundir a crianca.',
                    'Trocar a materia estudada.',
                    'Apagar a explicacao anterior.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Ver o gabarito com explicacao ajuda a entender onde acertou ou errou.'
            ],
            [
                'prompt' => "Ao estudar {$subject} com o tema {$themeLabel}, o que a crianca precisa fazer primeiro?",
                'options' => [
                    'Ler com calma e entender a pergunta.',
                    'Escolher a primeira alternativa sem pensar.',
                    'Ignorar o enunciado.',
                    'Trocar de materia no meio da atividade.'
                ],
                'correctIndex' => 0,
                'explanation' => 'Entender o que a pergunta pede e o primeiro passo para acertar.'
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
            'body' => "Hoje vamos estudar {$topic} em {$subject} com explicacoes simples e seguras, usando referencias claras inspiradas em {$themeLabel}.",
            'bullets' => [
                "A linguagem foi ajustada para o nivel {$difficulty}.",
                "Os exemplos usam situacoes e clima de {$themeLabel}, mas com palavras simples em portugues.",
                'A explicacao pode ser acompanhada por pais e responsaveis.'
            ]
        ],
        [
            'heading' => 'Como entender esse assunto',
            'body' => "O objetivo e observar a ideia principal, ver exemplos faceis ligados ao desenho {$themeLabel} e depois praticar.",
            'bullets' => [
                'Leia com calma.',
                "Use as comparacoes inspiradas em {$themeLabel} para lembrar da regra.",
                'Veja o gabarito como parte do aprendizado.'
            ]
        ],
        [
            'heading' => 'Resumo da aula',
            'body' => "Os exercicios abaixo usam o mesmo tema de {$themeLabel} para manter o interesse das criancas.",
            'bullets' => [
                "A aula e explicada com referencias do desenho {$themeLabel}.",
                'As questoes sao separadas para cada crianca.',
                'Os testes podem ser refeitos abaixo de 80%.'
            ]
        ]
    ];
}
