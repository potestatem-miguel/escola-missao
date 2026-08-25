<?php

return [
    'google_api_key' => getenv('GOOGLE_API_KEY') ?: 'AIzaSyCz-EWKpGRwDaZl9r4bxn0ufS0C8lfXSB8',
    'google_model' => getenv('GOOGLE_MODEL') ?: 'gemini-2.5-flash',
    'elevenlabs_api_key' => getenv('ELEVENLABS_API_KEY') ?: 'sk_d1262295c28cf6afe4674967145d63c3ee1cd6ea2c975733',
    'elevenlabs_voice_id' => getenv('ELEVENLABS_VOICE_ID') ?: 'bIHbv24MWmeRgasZH58o',
    'elevenlabs_model_id' => getenv('ELEVENLABS_MODEL_ID') ?: 'eleven_multilingual_v2',
];
