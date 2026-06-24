#!/bin/bash
DEVICE=joncastillo@192.168.50.199
REMOTE=/mnt/sda/opt/dev_atomic_records

rsync -az --no-perms --no-owner --no-group --no-times --inplace \
  --exclude node_modules --exclude dist --exclude .git --exclude env --exclude data \
  ./ $DEVICE:$REMOTE/

ssh $DEVICE "bash -l -c '
  docker stop dev_atomic_records 2>/dev/null || true
  docker rm dev_atomic_records 2>/dev/null || true
  bash $REMOTE/start_dev_atomic.sh
'"
