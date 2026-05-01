FROM node:22-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5874

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public

USER node

EXPOSE 5874

CMD ["npm", "run", "server"]
