#!/bin/sh
# Trains the remaining networks one after another (logs in tuning/nn-<model>.log).
# WORKERS=12 for more threads (default 8, so the machine stays usable).
set -e
cd "$(dirname "$0")/.."
pnpm exec tsx scripts/train-nn.ts hypergammon 300000 48 ${WORKERS:-8} > tuning/nn-hypergammon.log 2>&1
pnpm exec tsx scripts/train-nn.ts portes 200000 80 ${WORKERS:-8} > tuning/nn-portes.log 2>&1
pnpm exec tsx scripts/train-nn.ts plakoto 200000 80 ${WORKERS:-8} > tuning/nn-plakoto.log 2>&1
pnpm exec tsx scripts/train-nn.ts fevga 200000 80 ${WORKERS:-8} > tuning/nn-fevga.log 2>&1
