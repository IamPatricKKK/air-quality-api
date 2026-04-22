FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare yarn@stable --activate
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build
EXPOSE 3002
CMD ["node", "dist/main.js"]
