# CV interactif de Jeremy Vincent

Code source de <https://jejelazdeug.github.io/OnlinePortfolioJeremyVincent.github.io/>.

Le site est fait de simples fichiers HTML, CSS et JavaScript, **sans étape de compilation** :
ce que contient ce dépôt est exactement ce que GitHub met en ligne. Après chaque modification
enregistrée (« commit »), le site se met à jour tout seul en une à deux minutes.

## Modifier le site : trois façons

### 1. Le plus simple : demander à Claude
Dans une conversation Claude reliée à GitHub, décrivez le changement, par exemple :
« Ajoute ma nouvelle publication sur mon site » ou « Remplace le CV PDF par celui-ci ».
Claude modifie les fichiers et les publie.

### 2. Petite modification de texte, directement sur github.com
1. Ouvrez le fichier `index.html` dans ce dépôt.
2. Cliquez sur l’icône **crayon** (« Edit this file »), en haut à droite du fichier.
3. Faites **Ctrl+F** pour retrouver le texte à changer, puis modifiez-le.
   Ne touchez qu’au texte situé entre les balises `<…>`, pas aux balises elles-mêmes.
4. Cliquez sur **Commit changes…**, puis de nouveau sur **Commit changes**.

### 3. Modification plus importante : github.dev
Sur la page du dépôt, appuyez sur la touche **.** (point) : un Visual Studio Code s’ouvre
dans le navigateur, sans rien installer. Modifiez, puis enregistrez avec l’icône
« Source Control » (Commit & Push).

## Où se trouve quoi ?

| Je veux changer… | Fichier | Chercher avec Ctrl+F |
|---|---|---|
| La présentation, les actualités (« Latest ») | `index.html` | `PROFILE ====` |
| Les diplômes | `index.html` | `EDUCATION ====` |
| Les expériences | `index.html` | `RESEARCH ====` |
| Les publications | `index.html` | `PUBLICATIONS ====` |
| Les prix | `index.html` | `AWARDS ====` |
| Les objectifs de carrière | `index.html` | `CAREER GOALS ====` |
| Le CV téléchargeable | `cv/Jeremy_Vincent_CV.pdf` | remplacer le fichier (même nom) |
| Une image | dossier `img/` | remplacer le fichier (même nom) |

### Exemples courants

**Le preprint est en ligne sur bioRxiv.** Dans la partie Publications, remplacez la ligne
```html
<span class="pub-status">Preprint, submission to bioRxiv in progress</span>
```
par
```html
<span><i>bioRxiv</i></span> <a class="pub-link" href="https://doi.org/10.1101/XXXX" target="_blank" rel="noopener">DOI 10.1101/XXXX</a>
```
(en mettant le vrai DOI), puis mettez à jour la phrase correspondante dans « Latest ».

**Ajouter une publication.** Copiez un bloc complet `<li class="pub"> … </li>` de la partie
Publications, collez-le juste en dessous de `<ol class="pubs" reversed>` et modifiez le titre,
les auteurs, la revue et le lien. Votre nom s’écrit `<strong>Vincent, J.</strong>` pour
apparaître en gras, et les noms d’espèces s’écrivent `<i>Trypanosoma brucei</i>` pour être en italique.

**Remplacer le CV PDF.** Ouvrez le dossier `cv`, cliquez sur **Add file → Upload files**,
déposez votre nouveau fichier nommé exactement `Jeremy_Vincent_CV.pdf`, puis **Commit changes**.

## Organisation des fichiers

```
index.html              tout le contenu du site
404.html                page affichée pour un lien cassé
css/style.css           mise en forme (couleurs, polices, mise en page)
js/main.js              choix du parasite, menu, carte, visionneuse d’images, onglets des jeux
js/trypano-run.js       le jeu Trypano Run
js/big-eater.js         le jeu Big Eater (le macrophage)
js/click-parasite.js    le jeu Click the parasite
cv/Jeremy_Vincent_CV.pdf  le CV téléchargeable
img/                    images optimisées (WebP) et curseurs
fonts/                  polices Bitter et Fira Sans (licence SIL Open Font)
og-image.jpg            image d’aperçu affichée quand le lien est partagé
```

## Crédits

- Carte : [Leaflet](https://leafletjs.com), fonds © contributeurs OpenStreetMap, chargés seulement
  quand la partie Education apparaît à l’écran.
- Polices : Bitter et Fira Sans, licence SIL Open Font (voir `fonts/`).
- Icônes des titres de partie : dessinées dans le style de [Lucide](https://lucide.dev) (licence ISC), intégrées dans `css/style.css`.
- Trypano Run s’inspire du jeu du dinosaure hors connexion de Chrome ; tous les sprites sont dessinés en code.
- Big Eater reprend le principe des jeux de labyrinthe d’arcade, avec son propre labyrinthe et ses personnages (macrophage, Leishmania, Toxoplasma, T. cruzi, Plasmodium) dessinés en code.
- Dessins, images de microscopie et posters : Jeremy Vincent.
