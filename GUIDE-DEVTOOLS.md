# Guide : comprendre et « craquer » ton jeu des 3 gobelets avec Chrome DevTools

Ce guide porte sur **ton propre jeu** (`index.html`, `style.css`, `jeu.js`).
Le but : voir concrètement pourquoi un jeu qui calcule le résultat dans le navigateur
ne peut pas faire confiance au joueur, puis comprendre comment on le protège.

---

## 0. Lancer le jeu

- **En local** : double-clic sur `index.html`, ou mieux, dans le dossier :
  `python3 -m http.server 8000` puis ouvre http://localhost:8000
- **En ligne (GitHub Pages)** : crée un dépôt, pousse les 3 fichiers à la racine,
  puis *Settings → Pages → Branch: main / root*. L'URL ressemble à
  `https://<ton-login>.github.io/<depot>/`.

- **Version déjà en ligne** : https://claude.ai/artifact/DmPG9drdP9jJbeLeAWsTE2
  Le jeu y tourne dans une *iframe* : dans la console, choisis le bon contexte avec le
  menu déroulant **« top »** en haut de la console (sinon `etat` est introuvable).
  Dans *Sources*, les fichiers sont sous le domaine de l'iframe.

Ouvre les DevTools : **clic droit → Inspecter**, ou `F12`, ou `Ctrl+Maj+I` (`Cmd+Option+I` sur Mac).

---

## 1. Lire le code : onglet *Sources*

1. Onglet **Sources** → panneau de gauche **Page** → ton domaine → `jeu.js`.
2. Tout le code est là, lisible. Sur un vrai site il serait souvent minifié :
   le bouton **`{}`** (Pretty print) en bas de l'éditeur le remet en forme.
3. `Ctrl+P` (`Cmd+P`) ouvre n'importe quel fichier par son nom,
   `Ctrl+Maj+F` cherche un mot dans tous les fichiers (essaie `aBoule`).

**Ce qu'il faut remarquer :** toute la logique est dans `jeu.js`, et l'objet `etat`
contient la vérité (`etat.gobelets[i].aBoule`). Le navigateur la connaît, donc toi aussi.

---

## 2. Regarder l'état depuis la console

Onglet **Console**, pendant que le jeu attend ton choix :

```js
etat.phase
// "choix"

etat.gobelets.map(g => ({ id: g.id, emplacement: g.emplacement, aBoule: g.aBoule }))
// [{id: 0, emplacement: 2, aBoule: true}, ...]

// L'emplacement (0 = gauche, 1 = milieu, 2 = droite) des gobelets gagnants :
etat.gobelets.filter(g => g.aBoule).map(g => g.emplacement)
```

Tu peux aussi tricher dans l'autre sens, en modifiant l'état :

```js
etat.score.gagnees = 999; afficherScore();
etat.gobelets.forEach(g => g.aBoule = true);   // tout gobelet devient gagnant
```

> Pourquoi ça marche ? `jeu.js` est un script « classique » : ses `const` et
> fonctions de premier niveau sont globales, donc visibles depuis la console.
> Avec un module (`type="module"`) ou une IIFE, elles seraient cachées… mais
> un **breakpoint** (section 3) y donne accès quand même. Cacher n'est pas protéger.

---

## 3. Mettre le jeu en pause : les *breakpoints*

1. Sources → `jeu.js` → clique sur le **numéro de ligne** de
   `const gagne = choisi.aBoule;` dans `choisirGobelet`. Un marqueur bleu apparaît.
2. Joue et clique sur un gobelet. Le jeu se fige sur cette ligne.
3. À droite, le panneau **Scope** montre `id`, `choisi`, et tu peux survoler
   `etat` pour tout lire. Dans la console (qui est maintenant « dans » la fonction) :
   ```js
   choisi.aBoule = true   // tu forces la victoire
   ```
4. `F8` pour reprendre. Tu as gagné.

Variantes utiles :
- **Breakpoint conditionnel** (clic droit sur le numéro de ligne → *Add conditional breakpoint*) :
  `choisi.aBoule === false` → ne s'arrête que si tu vas perdre.
- **Logpoint** (*Add logpoint*) : affiche une valeur sans arrêter le jeu, par ex.
  dans `melanger()` après la boucle : `etat.gobelets.map(g => g.aBoule)`.
- **Event Listener Breakpoints** (panneau de droite → *Mouse → click*) :
  s'arrête sur n'importe quel clic, pratique quand tu ne sais pas encore quel code réagit.

---

## 4. Le truc de « l'aperçu » : regarder d'abord, choisir ensuite

C'est l'exercice que tu as décrit : le 1er clic soulève le gobelet **sans compter**,
le jeu reste en phase `choix`, et c'est le **2e clic** qui est le choix officiel.

Pourquoi c'est possible : chaque gobelet appelle `choisirGobelet(id)` **par son nom**
au moment du clic (voir `creerGobelets()`). Si on remplace la fonction, c'est notre
version qui s'exécute. On garde l'originale de côté pour le 2e clic.

Colle ceci dans la console **avant** de cliquer sur un gobelet (après le mélange, ou même avant de lancer) :

```js
// 1. On garde la vraie fonction
const choixOfficiel = choisirGobelet;
let dejaRegarde = false;

// 2. On la remplace par la nôtre
choisirGobelet = async function (id) {
  if (!dejaRegarde) {
    // 1er clic : simple aperçu. On utilise les fonctions d'animation du jeu
    // mais on ne touche ni à etat.phase ni au score.
    dejaRegarde = true;
    const g = etat.gobelets.find(g => g.id === id);
    await lever(g);
    await attendre(700);
    await baisser(g);
    return;
  }
  // 2e clic : on rend la main au jeu, qui le prend comme choix officiel
  dejaRegarde = false;
  return choixOfficiel(id);
};
```

Joue : clique un gobelet, il se lève et se referme, le jeu attend toujours.
Si la boule y était, reclique dessus ; sinon choisis un autre. Le jeu valide ce 2e clic
comme s'il était le premier.

Pour annuler le truc : `choisirGobelet = choixOfficiel` (ou recharge la page).

### Rendre la modification permanente : *Local Overrides*

Ce que tu tapes en console disparaît au rechargement. Pour modifier le fichier lui-même :

1. Sources → onglet **Overrides** (à côté de *Page*) → *Select folder for overrides* → choisis un dossier vide → *Autoriser*.
2. Ouvre `jeu.js`, modifie `choisirGobelet` directement (même logique que ci-dessus), `Ctrl+S`.
3. Recharge : Chrome sert **ta** version du fichier au lieu de celle du serveur, à chaque visite.

### Autres façons de lire la réponse

- **Elements** : chaque `.emplacement` contient une `.boule` ; celles qui ont l'attribut
  `hidden` sont vides. Le gobelet qui cache une boule « visible » est le bon,
  quel que soit le mélange. Tu peux aussi décocher `transform` sur `.gobelet.leve`
  ou mettre `opacity: 0.3` sur `.gobelet` dans le panneau *Styles* : gobelets transparents.
- **Animations** (`Ctrl+Maj+P` → « Show Animations ») : passer la vitesse à 10 % ralentit
  les transitions CSS. Attention, les `setTimeout` du jeu ne ralentissent pas, donc le
  rendu devient saccadé : bonne illustration de la différence entre horloge CSS et horloge JS.
  Mieux : dans la console, `DUREE_ECHANGE_MIN` est une `const`, mais tu peux mettre un
  breakpoint dans `melanger()` et changer `duree` à la volée.

---

## 5. Pourquoi tout ça marche : le jeu fait confiance au client

Règle d'or : **tout ce qui est envoyé au navigateur appartient au joueur.**
Le code, les variables, les fichiers, les animations : il peut les lire, les mettre
en pause et les réécrire. Ici, trois failles :

1. **Le secret est côté client** : `aBoule` est dans la mémoire du navigateur.
2. **Le verdict est calculé côté client** : `const gagne = choisi.aBoule`.
3. **La règle « un seul choix » est appliquée côté client** : `if (etat.phase !== 'choix') return;`
   On la contourne en ne passant simplement pas par cette fonction au 1er clic.

---

## 6. Se défendre

### a) Serveur qui fait autorité (*server-authoritative*)

Le serveur garde la position des boules et calcule le résultat. Le navigateur
n'est qu'un écran.

```
Client                                   Serveur
POST /partie {nbBoules: 2}       →       tire les positions, les garde en mémoire
                                 ←       {partieId, melange: [[0,2],[1,2],...]}
(anime le mélange)
POST /partie/abc/choix {emplacement: 1} →  vérifie : partie existe ? pas déjà jouée ?
                                         enregistre le choix, ferme la partie
                                 ←       {gagne: true, positions: [...]}
```

Exemple minimal en Node (Express) :

```js
const parties = new Map();

app.post('/partie', (req, res) => {
  const id = crypto.randomUUID();
  const positions = tirerPositions(req.body.nbBoules);     // ex. [true, false, true]
  const melange = genererMelange(22);                       // liste d'échanges
  parties.set(id, { positions: appliquer(positions, melange), jouee: false });
  res.json({ id, depart: positions, melange });
});

app.post('/partie/:id/choix', (req, res) => {
  const p = parties.get(req.params.id);
  if (!p || p.jouee) return res.status(409).json({ erreur: 'déjà jouée' });
  p.jouee = true;                                  // UN seul choix, vérifié ici
  const gagne = p.positions[req.body.emplacement] === true;
  res.json({ gagne, positions: p.positions });
});
```

Ton truc de l'aperçu ne marche plus : pour « regarder » un gobelet, il faut demander
au serveur, et le serveur compte cette demande comme ton choix. Modifier `aBoule` ou
le score dans la console ne change rien non plus : ce n'est plus la vérité.

**Limite honnête, spécifique à ce jeu :** dans un jeu de gobelets, le client *doit*
connaître le mélange pour l'animer. Un script peut donc rejouer les échanges et
savoir où est la boule (c'est l'équivalent d'une caméra au ralenti dans la vraie vie).
Le serveur empêche de **changer d'avis** et de **falsifier le résultat**, pas de
**suivre** le mélange. C'est un bon exemple de la différence entre
« protéger la logique » et « cacher l'information » : on ne peut cacher que ce qu'on
n'envoie pas.

### b) Engagement / révélation (*commit-reveal*) : prouver que la maison ne triche pas

Avec un serveur, c'est maintenant le joueur qui doit lui faire confiance : le serveur
pourrait déplacer la boule après ton choix. Solution :

1. Au début, le serveur envoie `engagement = SHA-256(positionsFinales + secretAleatoire)`.
   Le joueur ne peut rien en déduire, mais le serveur ne peut plus changer les positions.
2. Le joueur envoie son choix.
3. Le serveur révèle `positionsFinales` et `secretAleatoire`.
4. Le navigateur recalcule le hash et vérifie qu'il correspond à l'engagement :

```js
async function sha256(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const ok = (await sha256(JSON.stringify(positions) + secret)) === engagement;
```

C'est le principe des jeux « provably fair » en ligne.

### c) Le reste, en résumé

| Mesure | Ce qu'elle apporte | Ce qu'elle n'apporte pas |
|---|---|---|
| Minifier / obfusquer le JS | Ralentit la lecture | Aucune sécurité : *Pretty print* + breakpoints |
| Module ES / IIFE (pas de globales) | Plus de `etat` dans la console | Les breakpoints y accèdent quand même |
| Détecter les DevTools ouverts | Gêne les débutants | Se contourne en 1 minute |
| **Serveur qui décide + 1 choix vérifié** | Résultat et règles infalsifiables | Ne cache pas ce qui est affiché |
| **Commit-reveal** | Le joueur peut vérifier que le serveur est honnête | — |

---

## Exercices pour aller plus loin

1. Écris un script console qui, sans lire `aBoule`, retrouve la boule en écoutant
   les changements de `style.left` (indice : `MutationObserver`). C'est l'attaque
   « suivre le mélange » de la section 6a.
2. Passe `jeu.js` en `type="module"` et refais la section 4 uniquement avec un breakpoint.
3. Écris le petit serveur Node de la section 6a et vérifie que ton truc d'aperçu échoue.
