FROM node:24-alpine

WORKDIR /app

# 先只複製 package*.json 並安裝套件：程式碼改動時這一層可以沿用快取，不用每次重裝
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# 開發用的啟動指令（node --watch 自動重啟）；正式環境改用 npm start
CMD ["npm", "run", "dev"]
