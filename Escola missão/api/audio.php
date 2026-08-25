<?php

declare(strict_types=1);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Metodo nao permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!is_array($payload) || trim((string) ($payload['text'] ?? '')) === '') {
    http_response_code(422);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Texto obrigatorio para gerar o audio.'], JSON_UNESCAPED_UNICODE);
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

$apiKey = $config['elevenlabs_api_key'] ?? (getenv('ELEVENLABS_API_KEY') ?: '');
$voiceId = $config['elevenlabs_voice_id'] ?? (getenv('ELEVENLABS_VOICE_ID') ?: 'EXAVITQu4vr4xnSDxMaL');
$modelId = $config['elevenlabs_model_id'] ?? (getenv('ELEVENLABS_MODEL_ID') ?: 'eleven_multilingual_v2');

if ($apiKey === '') {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Chave da ElevenLabs nao configurada no servidor.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$text = trim((string) $payload['text']);

$requestBody = [
    'text' => $text,
    'model_id' => $modelId,
    'voice_settings' => [
        'stability' => 0.55,
        'similarity_boost' => 0.7
    ]
];

$endpoint = 'https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voiceId) . '?output_format=mp3_44100_128';

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'xi-api-key: ' . $apiKey,
        'Accept: audio/mpeg'
    ],
    CURLOPT_POSTFIELDS => json_encode($requestBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_TIMEOUT => 60
]);

$rawResponse = curl_exec($ch);

if ($rawResponse === false) {
    $error = curl_error($ch);
    curl_close($ch);
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Falha ao consultar a ElevenLabs: ' . $error], JSON_UNESCAPED_UNICODE);
    exit;
}

$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'audio/mpeg';
curl_close($ch);

if ($status >= 400) {
    $decoded = json_decode($rawResponse, true);
    $message = $decoded['detail']['message'] ?? $decoded['detail'] ?? 'Erro desconhecido ao consultar a ElevenLabs.';
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => is_string($message) ? $message : 'Erro ao consultar a ElevenLabs.'], JSON_UNESCAPED_UNICODE);
    exit;
}

header('Content-Type: ' . $contentType);
header('Cache-Control: no-store');
echo $rawResponse;
