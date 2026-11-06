FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DB_PATH=/data/stats.db

WORKDIR /app
COPY app.py ./
COPY web ./web
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')" || exit 1
CMD ["python", "app.py"]
