# Image de production de crypto-web (Next.js 16).
# Construction : docker build -t veille-web --build-arg NEXT_PUBLIC_API_URL=https://api.example.org --build-arg NEXT_PUBLIC_WS_URL=wss://api.example.org .
# Les deux adresses sont FIGÉES dans le code compilé : une image par environnement (changer d'adresse = reconstruire).
# Exécution    : voir docs/DEPLOIEMENT.md.

# ---- Construction ---------------------------------------------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Réessais : un téléchargement coupé (réseau de la plateforme de construction) ne doit pas faire échouer tout le déploiement.
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=15000 --fetch-retry-maxtimeout=120000

COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
# Sans adresse d'API, l'application viserait localhost:3001 : on refuse de construire une image qui ne marcherait pas.
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "NEXT_PUBLIC_API_URL est obligatoire (--build-arg)" && exit 1)
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Exécution -------------------------------------------------------------------------------------------------------
FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Serveur autonome + fichiers statiques + public (icônes, service worker), copiés à la main : `standalone` ne les inclut pas.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Lanceur : gère SIGTERM (Node, processus n° 1 du conteneur, l'ignorerait sinon : arrêt forcé après le délai).
COPY scripts/docker-start.mjs ./docker-start.mjs

USER node
EXPOSE 3000
# /login est une page publique : si elle répond, le serveur sert l'application.
# Délai de 10 s : le premier appel à froid peut dépasser 5 s sur une machine chargée (constaté à l'essai).
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "docker-start.mjs"]
