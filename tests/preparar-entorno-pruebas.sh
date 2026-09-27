#!/usr/bin/env bash
# Prepara un entorno de pruebas aislado con un perfil parecido al VPS de 1 GB.
# NO se conecta a produccion en ningun momento: todo ocurre en localhost.
#
#   bash preparar-entorno-pruebas.sh
#
# Que hace:
#   1. Crea la base paredescano_test con el ESQUEMA de paredescano, sin datos.
#   2. Aplica las dos migraciones sobre la base de pruebas.
#   3. Siembra 202 usuarios y 50 000 actividades sinteticas.
#   4. Compila en modo produccion.
#   5. Levanta el servidor apuntando SOLO a la base de pruebas.
#
# Requisito: MySQL local con el usuario root. No necesita la base real: si no
# existe paredescano, usa el volcado de esquema guardado en sql/esquema.sql.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DB="paredescano_test"
USUARIOS="${USUARIOS:-200}"
ACTIVIDADES="${ACTIVIDADES:-50000}"
PUERTO="${PUERTO:-3123}"

echo "== 1/5 Base de pruebas =="
mysql -u root -e "DROP DATABASE IF EXISTS ${TEST_DB}; CREATE DATABASE ${TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if [ -f "$RAIZ/sql/esquema.sql" ]; then
  echo "   usando sql/esquema.sql"
  mysql -u root "$TEST_DB" < "$RAIZ/sql/esquema.sql"
elif mysql -u root -e "USE paredescano" 2>/dev/null; then
  echo "   clonando el esquema de paredescano (SOLO estructura, sin datos)"
  mysqldump -u root --no-data --routines --triggers paredescano | mysql -u root "$TEST_DB"
else
  echo "   ERROR: no hay sql/esquema.sql ni una base paredescano de la que copiar." >&2
  echo "   Guarda un volcado SOLO de estructura con:" >&2
  echo "   mysqldump -u root --no-data --routines --triggers paredescano > sql/esquema.sql" >&2
  exit 1
fi

echo "== 2/5 Migraciones sobre la base de PRUEBAS =="
# Solo se aplican a ${TEST_DB}. Nunca a paredescano.
mysql -u root "$TEST_DB" < "$RAIZ/sql/actividad_movil.sql"
mysql -u root "$TEST_DB" < "$RAIZ/sql/sesiones_persistentes.sql"

echo "== 3/5 Datos sinteticos (${USUARIOS} usuarios, ${ACTIVIDADES} actividades) =="
# El generador escribe en paredescano_test. Falla si se apunta a otra cosa.
node "$RAIZ/tests/semilla.js"

echo "== 4/5 Compilacion de produccion =="
cd "$RAIZ"
npm run build
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public || true

echo "== 5/5 Arrancando el servidor de pruebas en el puerto ${PUERTO} =="
cd "$RAIZ/.next/standalone"
DB_NAME="${TEST_DB}" \
DB_HOST=127.0.0.1 \
DB_USER=root \
DB_PASSWORD="${DB_PASSWORD:-}" \
TZ=America/Lima \
PORT="${PUERTO}" \
HOSTNAME=127.0.0.1 \
NODE_ENV=production \
node server.js

echo
echo "Servidor de pruebas en http://127.0.0.1:${PUERTO}"
echo "COMPROBACION OBLIGATORIA antes de medir nada:"
echo "  curl -s http://127.0.0.1:${PUERTO}/api/setup/status"
echo "  y comprobar que .env sigue apuntando a ${TEST_DB}, NO a paredescano."
