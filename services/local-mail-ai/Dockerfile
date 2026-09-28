FROM python:3.12-slim-bookworm
WORKDIR /service
ENV PYTHONUNBUFFERED=1 USE_TF=0 HF_HUB_DISABLE_TELEMETRY=1 TOKENIZERS_PARALLELISM=false
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.14.0 && pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV MGH_AI_HOST=0.0.0.0 MGH_AI_DATA=/data HF_HOME=/data/huggingface
EXPOSE 8765
CMD ["python", "server.py"]
