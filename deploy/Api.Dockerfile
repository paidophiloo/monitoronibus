FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY services/api/requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY services/api/app app
USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header", "--ws-max-size", "4096", "--ws-max-queue", "8"]
