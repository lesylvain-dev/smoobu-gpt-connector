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

L’accès MCP exige la même clé `CONNECTOR_API_KEY` (ou l’alias existant `GPT_CONNECTOR_KEY`) via `x-connector-key` pour les clients techniques historiques. Pour ChatGPT, utiliser OAuth décrit ci-dessous. Configurer la clé dans le mécanisme sécurisé d’authentification du client, jamais dans GitHub, une URL, le chat ou un fichier de plugin. Même la découverte MCP est protégée.

Les requêtes avec un Origin sont limitées à `https://chatgpt.com` par défaut ; `MCP_ALLOWED_ORIGINS` permet de définir une liste séparée par des virgules. Aucun accès aux données n’est accordé sans clé.

Après déploiement Vercel, vérifier l’initialisation et `tools/list` avec un client MCP authentifié avant de relier le plugin à cette URL. Les requêtes GET MCP renvoient 405 (pas de flux SSE autonome). Les outils sont en lecture seule : aucun envoi de message ou de facture.

Validation : `npm ci` puis `npm test`. Le test utilise le client MCP officiel par HTTP, vérifie les sept outils, la transmission des paramètres, l’authentification, les Origins, les arguments manquants et les erreurs Smoobu avec des données simulées. Il ne prouve pas l’accès réel à Smoobu.

## OAuth ChatGPT avec WorkOS AuthKit

La connexion utilise WorkOS AuthKit (OAuth avec PKCE, CIMD/DCR et page de connexion hébergée). Les clés Smoobu et la clé du connecteur restent dans Vercel ; aucun secret WorkOS n’est nécessaire dans ce serveur.

### Configuration du compte

1. Créer un compte sur https://dashboard.workos.com et ouvrir l’environnement AuthKit choisi.
2. Dans **Connect → Configuration**, activer **Client ID Metadata Document** et **Dynamic Client Registration**.
3. Ajouter comme **Resource Indicator** l’URL exacte `https://smoobu-gpt-connector.vercel.app/api/mcp`. La choisir comme valeur par défaut pour les clients qui n’envoient pas le paramètre resource.
4. Copier le domaine AuthKit de cet environnement (du type `…authkit.app`).
5. Créer/inviter uniquement le propriétaire parmi les utilisateurs AuthKit et récupérer son identifiant `user_…` depuis le tableau de bord. La connexion doit utiliser ce même compte, dans le même environnement.
6. Dans les variables **Production** du projet Vercel, ajouter `AUTHKIT_DOMAIN` (ce domaine) et `MCP_ALLOWED_USER_ID` (cet identifiant), puis redéployer. Ces deux valeurs ne sont pas des secrets. Conserver les variables Smoobu et CONNECTOR_API_KEY existantes.
7. Vérifier `https://smoobu-gpt-connector.vercel.app/.well-known/oauth-protected-resource` : la réponse doit annoncer le domaine AuthKit réel. Dans Copilot Smoobu, lancer la connexion OAuth ; la page de connexion et le consentement sont hébergés par AuthKit.

Le code ne provisionne pas un compte WorkOS ni des variables Vercel. Tant que celles-ci ne sont pas renseignées, la connexion ChatGPT reste inactive. Ne jamais ouvrir les données à tous les utilisateurs AuthKit : le serveur vérifie strictement `MCP_ALLOWED_USER_ID`.

### Sécurité et compatibilité

- Signature RSA vérifiée via les clés publiques AuthKit ; issuer, audience exacte, expiration, iat et utilisateur vérifiés.
- Métadonnées OAuth aux chemins racine et associé à `/api/mcp`, et challenge WWW-Authenticate sur les réponses 401.
- Les tokens expirés ou incorrects sont refusés. AuthKit prend en charge les renouvellements via son flux OAuth.
- Une configuration OAuth partielle refuse l’accès ; elle ne revient pas à une authentification par clé pour ChatGPT.
- Les endpoints REST continuent à utiliser `x-connector-key` comme auparavant. Les sept outils MCP, leur calcul et les consignes du plugin sont conservés.
- Les tests couvrent la validation cryptographique et les refus d’accès. Le flux réel nécessite le compte WorkOS et la configuration ci-dessus.

Documentation utilisée : https://workos.com/docs/authkit/mcp
