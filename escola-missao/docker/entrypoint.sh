#!/bin/sh
set -eu

SUPABASE_URL_VALUE="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY_VALUE="${SUPABASE_ANON_KEY:-}"

cat > /var/www/html/supabase-config.js <<EOF
window.ESTUDA_SUPABASE_CONFIG = {
  url: $(printf '%s' "$SUPABASE_URL_VALUE" | php -r 'echo json_encode(stream_get_contents(STDIN));'),
  anonKey: $(printf '%s' "$SUPABASE_ANON_KEY_VALUE" | php -r 'echo json_encode(stream_get_contents(STDIN));')
};
EOF

exec "$@"
