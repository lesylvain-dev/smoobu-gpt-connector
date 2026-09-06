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
