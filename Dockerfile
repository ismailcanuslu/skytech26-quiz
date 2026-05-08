FROM node:20-alpine AS builder
WORKDIR /app

# Build sırasında dışarıdan gelecek değişkenleri tanımlıyoruz
ARG NEXT_PUBLIC_API_URL

COPY package*.json ./
RUN npm ci

COPY . .

# ARG değerini ENV olarak atıyoruz ki Next.js build sırasında bunu görsün
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Runner aşamasında tekrar tanımlamaya gerek yok çünkü build aşamasında JS içine gömüldü
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["npm", "run", "start"]
