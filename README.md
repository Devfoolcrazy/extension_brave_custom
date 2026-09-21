# Seuil

Page de démarrage pour Brave (et tout navigateur Chromium) : horloge, recherche sur le moteur de ton choix, fond d'écran Unsplash, raccourcis et dossiers de raccourcis.

Aucun build, aucune dépendance : du HTML, du CSS et des modules JavaScript.

## Installer

1. Ouvre `brave://extensions`.
2. Active le **Mode développeur** (en haut à droite).
3. Clique sur **Charger l'extension non empaquetée** et choisis ce dossier.
4. Ouvre un nouvel onglet. Brave demande une fois s'il faut conserver la nouvelle page : réponds **Conserver**.

Pour que la page s'affiche aussi au lancement du navigateur : `brave://settings/getStarted` → *Au démarrage* → **Ouvrir la page Nouvel onglet**.

Après une modification du code, clique sur la flèche de rechargement de l'extension dans `brave://extensions`.

## Utiliser

- **Rechercher ou lancer** : tape `/` pour placer le curseur dans le champ. Dès la première lettre, les raccourcis correspondants (ceux des dossiers compris) s'affichent sous le champ : `Entrée` ouvre le premier, `↑` `↓` choisissent, `Échap` ferme la liste pour lancer une recherche web. `Cmd/Ctrl + Entrée` ouvre dans un nouvel onglet. Une adresse (`exemple.fr`, `localhost:3000`) ouvre directement le site.
- **Mots-clés** : `yt lofi` cherche sur YouTube, `gh brave` sur GitHub, `w Turing` sur Wikipédia, `mdn flexbox` sur MDN. La liste se modifie dans les réglages.
- Les raccourcis occupent la première rangée, les dossiers la seconde.
- **Ouvrir tout un dossier** : clic molette sur un dossier (ou Cmd/Ctrl + clic) ouvre tous ses raccourcis dans des onglets d'arrière-plan, à la suite de l'onglet courant.
- **Modifier les raccourcis** (en bas à droite) : ajoute des raccourcis et des dossiers, clique sur une tuile pour la modifier, glisse-la pour la déplacer. Une suppression peut être annulée pendant quelques secondes. Déposer un raccourci au centre d'un dossier l'y range ; le champ *Emplacement* d'un raccourci permet de l'en sortir.
- **Réglages** : moteur de recherche, horloge, fond d'écran, couleur d'accent, export et import de la configuration.

### Fond d'écran

| Source | Clé Unsplash | Ce que ça fait |
| --- | --- | --- |
| Une photo précise | facultative | Colle l'adresse d'une page photo Unsplash ou d'une image. Avec une clé, le crédit du photographe s'affiche. |
| Photos par thème | requise | Photo aléatoire selon un thème ou des collections, renouvelée à chaque onglet, toutes les 15 minutes, chaque heure, chaque jour ou à la demande. |
| Un dossier d'images de mon ordinateur | — | Choisis un dossier : ses images (sous-dossiers compris) sont copiées dans le navigateur, ramenées à la taille de l'écran, puis tirées au hasard au rythme choisi. |
| Une image de mon ordinateur | — | L'image est stockée dans le navigateur. |

La clé d'accès s'obtient gratuitement sur <https://unsplash.com/developers> (créer une application, copier l'*Access Key*). Elle est limitée à 50 requêtes par heure ; le mode « à chaque nouvel onglet » en consomme deux par onglet.

Une extension ne peut pas relire un dossier du disque par elle-même (l'API File System Access est désactivée dans Brave) : le dossier est donc importé une fois. Après y avoir ajouté des images, choisis-le à nouveau dans les réglages ; la bibliothèque est alors remplacée. Les formats que le navigateur ne décode pas (HEIC, RAW) sont ignorés.

L'intervalle de rotation se règle dans *Changer de photo* : un des préréglages, ou « À un intervalle de mon choix » pour saisir un nombre de minutes, d'heures ou de jours (1 minute au minimum). Si l'onglet reste ouvert, la rotation continue à cet intervalle.

L'image affichée est gardée en cache (IndexedDB) : pas d'attente réseau à l'ouverture d'un onglet. En mode « par thème », la photo suivante est téléchargée en arrière-plan et montrée au prochain onglet.

Plusieurs onglets ouverts restent synchronisés : une modification faite dans l'un apparaît aussitôt dans les autres, qui repartent de cette version au lieu de l'écraser.

## Limite connue

Sur une page Nouvel onglet fournie par une extension, Chromium place le curseur dans la barre d'adresse, pas dans la page. D'où le raccourci `/`.

## Organisation

```
manifest.json      Manifest V3, remplace la page Nouvel onglet
newtab.html        Structure de la page et des boîtes de dialogue
css/newtab.css     Styles
js/main.js         Démarrage, horloge, synchronisation entre onglets
js/search.js       Lanceur de raccourcis, mots-clés, recherche web
js/icons.js        Nom et icône d'un raccourci
js/toast.js        Bandeau d'annulation
js/store.js        Configuration (chrome.storage.local), valeurs par défaut
js/wallpaper.js    Unsplash, cache IndexedDB, affichage du fond
js/tiles.js        Raccourcis, dossiers, mode édition, glisser-déposer
js/settings.js     Panneau de réglages, export et import
fonts/             Bricolage Grotesque (licence OFL), embarquée
```

Pour travailler sur la page hors extension : `python3 -m http.server` puis `http://localhost:8000/newtab.html`. La configuration passe alors par `localStorage` et les favicons sont remplacées par des initiales.
