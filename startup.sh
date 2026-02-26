#!/bin/bash
export UPLOAD_DIR="/home/azureuser/uploads"
gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.main:app
