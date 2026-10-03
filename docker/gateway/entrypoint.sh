#!/bin/sh
set -eu

if [ -z "${PEOPLE_REMOTE_URL:-}" ] || [ -z "${DELIVERY_REMOTE_URL:-}" ]; then
  echo "PEOPLE_REMOTE_URL and DELIVERY_REMOTE_URL are required" >&2
  exit 1
fi

mkdir -p /usr/share/nginx/html

cat > /usr/share/nginx/html/config.json <<EOF
{
  "peopleRemoteUrl": "${PEOPLE_REMOTE_URL}",
  "deliveryRemoteUrl": "${DELIVERY_REMOTE_URL}"
}
EOF

exec nginx -g 'daemon off;'
