<?php

return [
    'google_api_key' => getenv('GOOGLE_API_KEY') ?: 'coloque-sua-chave-google-aqui',
    'google_model' => getenv('GOOGLE_MODEL') ?: 'gemini-2.5-flash',
    'elevenlabs_api_key' => getenv('ELEVENLABS_API_KEY') ?: 'coloque-sua-chave-elevenlabs-aqui',
    'elevenlabs_voice_id' => getenv('ELEVENLABS_VOICE_ID') ?: 'bIHbv24MWmeRgasZH58o',
    'elevenlabs_model_id' => getenv('ELEVENLABS_MODEL_ID') ?: 'eleven_multilingual_v2',
];
