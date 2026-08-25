<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Metodo nao permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'JSON invalido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

foreach (['word', 'contextText', 'subject', 'topic'] as $field) {
    if (!isset($payload[$field]) || trim((string) $payload[$field]) === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => "Campo obrigatorio ausente: {$field}."], JSON_UNESCAPED_UNICODE);
        exit;
    }
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
        $explanation = $apiKey !== ''
            ? explainWithGoogle($payload, $apiKey, $model)
            : explainWithFallback($payload);
    } catch (Throwable $exception) {
        $explanation = explainWithFallback($payload);
        $explanation['fallbackReason'] = $exception->getMessage();
    }

    echo json_encode([
        'ok' => true,
        'explanation' => $explanation
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $exception->getMessage()], JSON_UNESCAPED_UNICODE);
}

function explainWithGoogle(array $payload, string $apiKey, string $model): array
{
    $schema = [
        'type' => 'object',
        'additionalProperties' => false,
        'properties' => [
            'meaning' => ['type' => 'string'],
            'inContext' => ['type' => 'string']
        ],
        'required' => ['meaning', 'inContext']
    ];

    $systemPrompt = implode("\n", [
        'Voce explica palavras para criancas em portugues do Brasil.',
        'Explique de forma simples, curta e apropriada para a idade.',
        'Use o contexto da materia e da frase selecionada.',
        'Se a palavra fizer parte de uma questao, explique o sentido dentro dessa questao.',
        'Nao use termos adultos, tecnicos demais ou inadequados.',
        'Retorne apenas JSON valido.'
    ]);

    $userPrompt = json_encode([
        'palavra' => (string) $payload['word'],
        'contexto' => (string) $payload['contextText'],
        'materia' => (string) $payload['subject'],
        'tema' => (string) $payload['topic'],
        'desenho' => (string) ($payload['theme'] ?? ''),
        'dificuldade' => (string) ($payload['difficulty'] ?? '')
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent';
    $body = [
        'contents' => [[
            'parts' => [[
                'text' => $systemPrompt . "\n\nDados:\n" . $userPrompt
            ]]
        ]],
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
        CURLOPT_TIMEOUT => 30
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

    foreach ($response['candidates'] ?? [] as $candidate) {
        foreach ($candidate['content']['parts'] ?? [] as $part) {
            if (isset($part['text']) && is_string($part['text'])) {
                $decoded = json_decode($part['text'], true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        }
    }

    throw new RuntimeException('A API do Google nao retornou uma explicacao utilizavel.');
}

function explainWithFallback(array $payload): array
{
    $word = trim((string) $payload['word']);
    $topic = trim((string) $payload['topic']);
    $context = trim((string) $payload['contextText']);

    return [
        'meaning' => "{$word} e uma palavra importante dentro do assunto {$topic}. Ela deve ser entendida junto da frase ou questao em que apareceu.",
        'inContext' => "No contexto selecionado, {$word} ajuda a entender melhor esta parte: \"{$context}\". A ideia e observar como essa palavra funciona dentro da explicacao ou da pergunta."
    ];
}
