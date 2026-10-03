#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"
flutter pub get
exec flutter run -d "${1:-emulator-5554}" --dart-define=API_BASE_URL="${API_BASE_URL:-https://api-befull.kao9.com/api/v1}" --dart-define=DEV_HTTP_PROXY="${DEV_HTTP_PROXY:-}"
