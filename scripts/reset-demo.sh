#!/bin/sh
# Reload fictional demo data into the local database named by DATABASE_URL.
set -eu
cd "$(dirname "$0")/.."
npm run migrate
npm run seed:reset
