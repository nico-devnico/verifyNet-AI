# Archives — ne pas exécuter

Ces fichiers sont les schémas et notes de la première version du projet. Ils
sont conservés uniquement pour retrouver l'intention d'origine d'une table ou
d'une colonne.

Le schéma en vigueur est celui de `supabase/migrations/`, à exécuter dans
l'ordre `0001` → `0002` → `0003`.

Rejouer un fichier de ce dossier sur une base à jour la casserait. Deux cas
méritent une mise en garde explicite :

- **`NO_RLS_FIX.sql`** désactive la sécurité au niveau des lignes. Toute donnée
  de tout utilisateur devient lisible et modifiable par n'importe quel compte,
  y compris anonyme. Ce fichier ne doit jamais être exécuté.
- **`CREATE_SUPER_ADMIN.md`** et `CREATE_SUPER_ADMIN_PROFILE.sql` décrivent une
  promotion manuelle avec des identifiants en clair. Utilisez
  `npm run create:super-admin` à la place.
