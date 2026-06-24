#!/bin/bash
REMOTE=/mnt/sda/opt/dev_atomic_records

cd $REMOTE

docker build -t dev_atomic_records .

docker run -d \
  --name dev_atomic_records \
  --restart unless-stopped \
  -p 3210:3210 \
  -p 3211:3211 \
  -v $REMOTE/data:/app/data \
  dev_atomic_records
