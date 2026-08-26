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

if (!isset($payload['child']) || !is_array($payload['child'])) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'A crianca precisa ser enviada corretamente.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

foreach (['studentName', 'age', 'grade'] as $field) {
    if (!isset($payload['child'][$field]) || $payload['child'][$field] === '') {
        http_response_code(422);
        echo json_encode([
            'ok' => false,
            'error' => "Campo obrigatorio ausente na crianca: {$field}."
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$attachments = $payload['attachments'] ?? [];
if (!is_array($attachments) || count($attachments) === 0) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => 'Envie pelo menos uma imagem ou PDF da licao de casa.'
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
            ? generateHomeworkWithGoogle($payload, $apiKey, $model)
            : generateHomeworkFallback($payload);
    } catch (Throwable $exception) {
        $content = generateHomeworkFallback($payload);
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

function generateHomeworkWithGoogle(array $payload, string $apiKey, string $model): array
{
    $child = $payload['child'];
    $theme = trim((string) ($payload['theme'] ?? ''));
    $attachments = array_values(array_filter($payload['attachments'] ?? [], 'is_array'));

    $schema = [
        'type' => 'object',
        'additionalProperties' => false,
        'properties' => [
            'studentName' => ['type' => 'string'],
            'grade' => ['type' => 'string'],
            'title' => ['type' => 'string'],
            'intro' => ['type' => 'string'],
            'subjectOverview' => [
                'type' => 'object',
                'additionalProperties' => false,
                'properties' => [
                    'title' => ['type' => 'string'],
                    'body' => ['type' => 'string'],
                    'bullets' => [
                        'type' => 'array',
                        'items' => ['type' => 'string']
                    ]
                ],
                'required' => ['title', 'body', 'bullets']
            ],
            'items' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'properties' => [
                        'transcriptionTitle' => ['type' => 'string'],
                        'requestSummary' => ['type' => 'string'],
                        'simpleExplanation' => ['type' => 'string'],
                        'similarExample' => ['type' => 'string'],
                        'guidanceTip' => ['type' => 'string']
                    ],
                    'required' => ['transcriptionTitle', 'requestSummary', 'simpleExplanation', 'similarExample', 'guidanceTip']
                ]
            ]
        ],
        'required' => ['studentName', 'grade', 'title', 'intro', 'subjectOverview', 'items']
    ];

    $themeInstruction = $theme !== ''
        ? "Use {$theme} apenas como referencia ludica para explicar melhor, sem depender de nomes dificeis."
        : 'Use uma linguagem ludica e infantil, sem referencias complicadas.';

    $systemPrompt = implode("\n", [
        'Voce e um tutor infantil especializado em explicar licao de casa em portugues do Brasil.',
        'Sua funcao e ajudar a crianca a entender o que cada exercicio pede, sem jamais entregar a resposta final.',
        'Antes de explicar os exercicios, identifique a materia principal e explique o assunto central do arquivo de forma simples e correta.',
        'Essa primeira explicacao deve ensinar a materia do arquivo, e nao apenas falar sobre como estudar ou como responder.',
        'E extremamente proibido resolver o exercicio, dar o gabarito, dizer qual alternativa esta certa ou completar a resposta pela crianca.',
        'E extremamente proibido escrever frases como "a resposta e", "o resultado final e", "marque a letra", "copie isto" ou equivalentes.',
        'Explique de forma simples, acolhedora e apropriada para a idade.',
        'Se houver varias questoes no material, transcreva cada exercicio separadamente e explique um por um.',
        'Cada explicacao precisa estar ligada ao conteudo real do arquivo enviado.',
        'Para cada exercicio, explique o que esta sendo pedido, ensine o raciocinio, mostre um exemplo parecido e deixe uma dica para a crianca tentar sozinha.',
        'Nao crie explicacoes vagas, genericas ou metacognitivas demais. Ensine o conteudo da materia de verdade.',
        'Nao use conteudo pornografico, violento em excesso, ofensivo ou inadequado para criancas.',
        'Nao use nomes estrangeiros dificeis. Prefira linguagem simples em portugues.',
        $themeInstruction,
        'Retorne somente JSON valido no schema informado.'
    ]);

    $userPrompt = json_encode([
        'crianca' => [
            'nome' => (string) $child['studentName'],
            'idade' => (int) $child['age'],
            'serie' => (string) $child['grade']
        ],
        'referencia_ludica' => $theme,
        'objetivo' => 'Explicar a licao de casa sem entregar a resposta final'
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

    $parts[] = ['text' => $systemPrompt . "\n\nDados do pedido:\n" . $userPrompt];

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

function generateHomeworkFallback(array $payload): array
{
    $child = $payload['child'];
    $theme = trim((string) ($payload['theme'] ?? ''));
    $themeText = $theme !== '' ? " usando referencias inspiradas em {$theme}" : '';

    return [
        'studentName' => (string) $child['studentName'],
        'grade' => (string) $child['grade'],
        'title' => 'Explicacao guiada da licao de casa',
        'intro' => 'Esta e uma explicacao de apoio para ajudar a crianca a entender a materia e a atividade, sem mostrar a resposta final.',
        'subjectOverview' => [
            'title' => 'Entendendo a matéria do arquivo',
            'body' => 'Primeiro a crianca precisa descobrir qual e o assunto principal da atividade. Depois, vale revisar a regra, a ideia central ou o tipo de conta que aparece no material.',
            'bullets' => [
                'Leia o enunciado e descubra qual materia esta sendo trabalhada.',
                'Observe exemplos, palavras-chave e contas parecidas antes de responder.',
                'Use a explicacao como apoio para pensar com calma, sem copiar uma resposta pronta.'
            ]
        ],
        'items' => [
            [
                'transcriptionTitle' => 'Exercicio 1',
                'requestSummary' => 'Leia o enunciado com calma e descubra o que a professora quer que voce observe ou encontre.',
                'simpleExplanation' => 'Primeiro, identifique as palavras importantes do enunciado. Depois, pense no assunto que esta sendo estudado' . $themeText . '.',
                'similarExample' => 'Se a atividade pede para encontrar a ideia principal de uma frase, treine com uma frase parecida e descubra sobre o que ela fala.',
                'guidanceTip' => 'Circule as palavras principais do enunciado e tente explicar com suas proprias palavras o que precisa ser feito.'
            ],
            [
                'transcriptionTitle' => 'Exercicio 2',
                'requestSummary' => 'Separe as etapas da atividade antes de responder.',
                'simpleExplanation' => 'Muitas licoes ficam mais faceis quando a crianca pensa passo a passo, sem pressa e sem tentar adivinhar a resposta.',
                'similarExample' => 'Se o exercicio tiver duas partes, faca primeiro a observacao e so depois pense no que escrever.',
                'guidanceTip' => 'Leia uma vez, depois leia de novo apontando com o dedo para cada palavra importante.'
            ]
        ]
    ];
}

function extractTextOutput(array $response): string
{
    $candidate = $response['candidates'][0]['content']['parts'][0]['text'] ?? '';
    return is_string($candidate) ? trim($candidate) : '';
}
