# Smoobu GPT Connector

Passerelle en lecture seule entre un GPT personnalisé et l'API Smoobu, prévue pour Vercel.

## Variables d'environnement Vercel

Créer exactement ces trois variables dans le projet Vercel :

- `SMOOBU_API_KEY` : la clé API Smoobu.
- `SMOOBU_API_SECRET` : le secret généré avec cette clé dans Smoobu.
- `CONNECTOR_API_KEY` : une longue valeur secrète de ton choix, différente des deux précédentes. Elle protège l'accès entre ton GPT et cette passerelle.

Ne mets jamais ces valeurs dans GitHub.

## Déploiement

1. Importer ce dépôt dans Vercel.
2. Laisser le framework sur `Other` et le répertoire racine vide.
3. Ajouter les trois variables ci-dessus.
4. Cliquer sur `Deploy`.
5. Une fois le déploiement terminé, ouvrir `https://TON-DOMAINE.vercel.app/api/health` : la réponse doit indiquer que le connecteur fonctionne.

## Connexion au GPT

Le fichier `openapi.yaml` contient le schéma à coller dans les Actions du GPT.

Avant de le coller, remplacer :

`https://REPLACE_WITH_YOUR_VERCEL_DOMAIN`

par le domaine fourni par Vercel.

Dans l'authentification de l'Action GPT, choisir une clé API envoyée dans l'en-tête `x-connector-key` et utiliser exactement la même valeur que `CONNECTOR_API_KEY`.

## Endpoints disponibles

- `GET /api/health`
- `GET /api/apartments`
- `GET /api/reservations`
- `GET /api/messages?reservationId=...`
- `GET /api/rates?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&apartments=...`

La passerelle est volontairement en lecture seule pour la première version.

## Accès MCP pour Copilot Smoobu

`https://smoobu-gpt-connector.vercel.app/api/mcp` expose le transport MCP Streamable HTTP sans session, avec le SDK officiel. Les endpoints REST et OpenAPI restent disponibles sans modification.

Les sept outils sont `healthCheck`, `listApartments`, `listReservations`, `getReservationMessages`, `getRates`, `getStats` et `getRevenueSummary`. Leurs paramètres sont dérivés du schéma OpenAPI et leurs appels réutilisent les handlers REST existants. Les consignes de Copilot Smoobu restent dans le plugin et ne sont pas remplacées.

L’accès MCP exige la même clé `CONNECTOR_API_KEY` (ou l’alias existant `GPT_CONNECTOR_KEY`) via `x-connector-key` ou `Authorization: Bearer …`. Configurer la clé dans le mécanisme sécurisé d’authentification du client, jamais dans GitHub, une URL, le chat ou un fichier de plugin. Même la découverte MCP est protégée.

Les requêtes avec un Origin sont limitées à `https://chatgpt.com` par défaut ; `MCP_ALLOWED_ORIGINS` permet de définir une liste séparée par des virgules. Aucun accès aux données n’est accordé sans clé.

Après déploiement Vercel, vérifier l’initialisation et `tools/list` avec un client MCP authentifié avant de relier le plugin à cette URL. Les requêtes GET MCP renvoient 405 (pas de flux SSE autonome). Les outils sont en lecture seule : aucun envoi de message ou de facture.

Validation : `npm ci` puis `npm test`. Le test utilise le client MCP officiel par HTTP, vérifie les sept outils, la transmission des paramètres, l’authentification, les Origins, les arguments manquants et les erreurs Smoobu avec des données simulées. Il ne prouve pas l’accès réel à Smoobu.
