FROM python:3.13-slim

# 不產生 .pyc 檔；log 直接輸出，不經過緩衝（docker compose logs 才看得到即時輸出）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 先只複製 requirements.txt 並安裝套件：程式碼改動時這一層可以沿用快取，不用每次重裝
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# 開發用的啟動指令；正式環境會在 docker-compose.prod.yml 改用 gunicorn
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
