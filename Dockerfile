FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src/ src/
COPY submission/fixtures/ submission/fixtures/
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build
COPY backend/pom.xml pom.xml
COPY backend/src/ src/
COPY --from=frontend /build/dist/ src/main/resources/static/
RUN mvn -B package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=backend /build/target/replay-lab-0.1.0.jar app.jar
COPY deployment/start.sh start.sh
ENV SPRING_PROFILES_ACTIVE=render
USER 10001:10001
EXPOSE 10000
ENTRYPOINT ["sh", "/app/start.sh"]
