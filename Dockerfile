
FROM python:3.11-slim as builder

WORKDIR /app


RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    libgl1 \
    libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*


COPY requirements.txt .
RUN pip install --user -r requirements.txt


RUN python -c "from rembg import new_session; \
    new_session('u2net'); \
    new_session('u2netp'); \
    new_session('isnet-general-use')"


FROM python:3.11-slim

WORKDIR /app


RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*


COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

COPY app.py .
COPY haarcascade_frontalface_default.xml /usr/share/opencv4/haarcascades/


ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV CUDA_VISIBLE_DEVICES=""  # Force CPU usage


RUN mkdir -p /root/.u2net && \
    chmod -R 777 /root/.u2net

EXPOSE $PORT


HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:$PORT/health || exit 1


CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "120", "app:app"]