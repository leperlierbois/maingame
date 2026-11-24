/*
 * Jeu des 3 gobelets, avec mises fictives (argent de jeu, juste pour s'amuser)
 * -----------------------------------------------------------------------------
 * Tout le jeu tourne dans le navigateur (côté "client").
 * C'est volontaire : le but de l'exercice est d'ouvrir les DevTools de Chrome
 * et de voir qu'un jeu qui fait confiance au client peut être manipulé.
 * Voir GUIDE-DEVTOOLS.md.
 *
 * Ce fichier est un script "classique" (pas un module ES) : la constante
 * `etat` et les fonctions déclarées ici sont accessibles depuis la console.
 *
 * Déroulement : un seul appui sur ▶ lance tout. Les gobelets se lèvent et
 * montrent la ou les billes, se referment, se mélangent (de plus en plus vite),
 * puis le joueur touche un gobelet pour valider son choix.
 */

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

const DUREE_LEVER = 450;          // ms, doit correspondre au CSS (.gobelet transition)
const DUREE_REVELATION = 1200;    // ms pendant lesquelles on montre les billes au début
const NB_ECHANGES = 22;           // nombre d'échanges pendant le mélange
const DUREE_ECHANGE_MAX = 700;    // ms, premier échange (lent)
const DUREE_ECHANGE_MIN = 70;     // ms, derniers échanges (très rapides)
const ACCELERATION = 0.85;        // chaque échange dure 85 % du précédent

// Mises (argent fictif, en XOF)
const SOLDE_DEPART = 100000;
const MISE_MIN = 200;
const MISE_MAX = 73411.6;
const MULTIPLICATEURS = { 1: 2.91, 2: 1.45 };

// ---------------------------------------------------------------------------
// L'état du jeu : TOUTE la vérité est ici, dans la mémoire du navigateur.
// ---------------------------------------------------------------------------

const etat = {
  nbBoules: 1,
  // 'attente'   : on n'a pas encore lancé
  // 'revelation': les gobelets sont levés, on voit les billes
  // 'melange'   : les gobelets échangent leurs places
  // 'choix'     : le joueur doit cliquer sur un gobelet
  // 'resultat'  : on montre le résultat
  phase: 'attente',
  // Un objet par gobelet : { id, emplacement (0, 1 ou 2), aBoule, el, btn, boule }
  gobelets: [],
  score: { gagnees: 0, perdues: 0 },
  solde: SOLDE_DEPART,
  mise: 0,          // mise de la partie en cours
  son: true,
};

// Raccourcis vers les éléments de la page
const elTable = document.getElementById('table');
const elMessage = document.getElementById('message');
const elScore = document.getElementById('score');
const elSolde = document.getElementById('solde');
const elChoixBoules = document.getElementById('choix-boules');
const elMise = document.getElementById('mise');
const elJetons = document.getElementById('jetons');
const elAide = document.getElementById('aide');
const btnJouer = document.getElementById('btn-jouer');
const btnReset = document.getElementById('btn-reset');
const btnEffacer = document.getElementById('btn-effacer');
const btnSon = document.getElementById('btn-son');
const btnAide = document.getElementById('btn-aide');
const btnFermerAide = document.getElementById('btn-fermer-aide');

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

/** Renvoie une promesse résolue après `ms` millisecondes (pour enchaîner les animations avec await). */
function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Entier aléatoire entre 0 (inclus) et max (exclu). */
function hasard(max) {
  return Math.floor(Math.random() * max);
}

/** Mélange un tableau (algorithme de Fisher-Yates) et renvoie une copie. */
function melangerTableau(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = hasard(i + 1);
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Arrondi à 2 décimales (les centimes de XOF fictifs). */
function arrondir(n) {
  return Math.round(n * 100) / 100;
}

/** 73411.6 -> "73 411,6" */
function formater(n) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function afficherMessage(texte, classe = '') {
  elMessage.textContent = texte;
  elMessage.className = classe;
}

function afficherSolde() {
  elSolde.textContent = `${formater(etat.solde)} XOF`;
}

function afficherScore() {
  elScore.textContent = `Gagnées : ${etat.score.gagnees} · Perdues : ${etat.score.perdues}`;
  afficherSolde();
  sauvegarder();
}

/** Garde le solde et le score d'une visite à l'autre (si le navigateur le permet). */
function sauvegarder() {
  try {
    localStorage.setItem('gobelets', JSON.stringify({ solde: etat.solde, score: etat.score, son: etat.son }));
  } catch (e) { /* stockage indisponible : tant pis */ }
}
function charger() {
  try {
    const d = JSON.parse(localStorage.getItem('gobelets'));
    if (d && typeof d.solde === 'number' && isFinite(d.solde)) etat.solde = d.solde;
    if (d && d.score) etat.score = { gagnees: d.score.gagnees | 0, perdues: d.score.perdues | 0 };
    if (d && typeof d.son === 'boolean') etat.son = d.son;
  } catch (e) { /* rien */ }
}

/** Active ou désactive le clic sur les 3 gobelets. */
function gobeletsCliquables(oui) {
  for (const g of etat.gobelets) g.btn.disabled = !oui;
}

/** Bloque (ou débloque) les commandes de mise pendant une partie. */
function commandesBloquees(oui) {
  btnJouer.disabled = oui;
  btnReset.disabled = oui;
  btnEffacer.disabled = oui;
  elMise.disabled = oui;
  for (const b of elJetons.querySelectorAll('button')) b.disabled = oui;
  for (const b of elChoixBoules.querySelectorAll('button')) b.disabled = oui;
  elChoixBoules.classList.toggle('verrouille', oui);
}

// ---------------------------------------------------------------------------
// Petits sons (générés, aucun fichier)
// ---------------------------------------------------------------------------

let audio = null;

function son(type) {
  if (!etat.son) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = {
      echange: [[520, 0.04, 'triangle', 0.05]],
      lever:   [[330, 0.08, 'sine', 0.08]],
      gagne:   [[523, 0.1, 'square', 0.06], [659, 0.1, 'square', 0.06], [784, 0.18, 'square', 0.06]],
      perdu:   [[220, 0.18, 'sawtooth', 0.05], [165, 0.25, 'sawtooth', 0.05]],
      clic:    [[880, 0.03, 'sine', 0.05]],
    }[type] || [];
    let t = audio.currentTime;
    for (const [freq, duree, forme, volume] of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = forme;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + duree);
      t += duree * 0.9;
    }
  } catch (e) { /* pas de son, pas grave */ }
}

function afficherSon() {
  btnSon.textContent = etat.son ? '🔊' : '🔇';
  btnSon.setAttribute('aria-pressed', String(etat.son));
  btnSon.setAttribute('aria-label', etat.son ? 'Couper le son' : 'Activer le son');
}

// ---------------------------------------------------------------------------
// La mise
// ---------------------------------------------------------------------------

/**
 * Lit le champ de mise. Accepte "1 000", "1000,5", "1000.5".
 * Renvoie un nombre, ou NaN si ce n'est pas un nombre.
 */
function lireMise() {
  const brut = elMise.value.replace(/\s/g, '').replace(',', '.');
  if (brut === '' || !/^\d*\.?\d*$/.test(brut)) return NaN;
  return Number(brut);
}

/** Ramène une mise dans [MISE_MIN, MISE_MAX]. */
function bornerMise(valeur) {
  return arrondir(Math.min(MISE_MAX, Math.max(MISE_MIN, valeur)));
}

function ecrireMise(valeur) {
  elMise.value = formater(valeur);
}

/**
 * Vérifie la mise avant de jouer. Renvoie la mise valide, ou null
 * (et affiche pourquoi) si on ne peut pas jouer.
 */
function validerMise() {
  const valeur = lireMise();
  if (isNaN(valeur)) {
    afficherMessage(`Entre une mise entre ${formater(MISE_MIN)} et ${formater(MISE_MAX)} XOF`, 'erreur');
    return null;
  }
  const bornee = bornerMise(valeur);
  if (bornee !== arrondir(valeur)) {
    ecrireMise(bornee);
    afficherMessage(
      valeur < MISE_MIN
        ? `Mise minimale : ${formater(MISE_MIN)} XOF. Mise ajustée, appuie sur ▶`
        : `Mise maximale : ${formater(MISE_MAX)} XOF. Mise ajustée, appuie sur ▶`,
      'erreur'
    );
    return null;
  }
  if (bornee > etat.solde) {
    afficherMessage(
      etat.solde < MISE_MIN
        ? 'Solde insuffisant. Touche « Réinitialiser » pour recommencer.'
        : `Solde insuffisant : ${formater(etat.solde)} XOF`,
      'erreur'
    );
    return null;
  }
  return bornee;
}

// ---------------------------------------------------------------------------
// Création des gobelets dans la page
// ---------------------------------------------------------------------------

/** Dessin d'un gobelet (SVG). Les dégradés ont un identifiant propre à chaque gobelet. */
function dessinGobelet(id) {
  const c = `g${id}`;
  return `
<svg viewBox="0 0 100 112" aria-hidden="true">
  <defs>
    <linearGradient id="${c}corps" x1="0" x2="1">
      <stop offset="0" stop-color="#b8461a"/>
      <stop offset=".28" stop-color="#ff9a3c"/>
      <stop offset=".45" stop-color="#ffc56b"/>
      <stop offset=".75" stop-color="#e8702a"/>
      <stop offset="1" stop-color="#9c3412"/>
    </linearGradient>
    <linearGradient id="${c}bord" x1="0" x2="1">
      <stop offset="0" stop-color="#c2531f"/>
      <stop offset=".4" stop-color="#ffd590"/>
      <stop offset="1" stop-color="#a83b15"/>
    </linearGradient>
  </defs>
  <!-- corps légèrement évasé, sommet arrondi -->
  <path d="M24 14 Q50 2 76 14 L86 94 L14 94 Z" fill="url(#${c}corps)"/>
  <ellipse cx="50" cy="14" rx="26" ry="7" fill="#ffd28a"/>
  <ellipse cx="50" cy="14" rx="18" ry="4" fill="#f59a45"/>
  <!-- anneau néon -->
  <path d="M19 52 L81 52 L82.5 62 L17.5 62 Z" fill="#7a1fd1"/>
  <path d="M19 52 L81 52 L81.3 55 L18.7 55 Z" fill="#d38bff" opacity=".9"/>
  <!-- reflet -->
  <path d="M32 20 L38 20 L33 88 L25 88 Z" fill="#fff" opacity=".35"/>
  <!-- rebord du bas -->
  <path d="M10 92 L90 92 L94 104 Q50 112 6 104 Z" fill="url(#${c}bord)"/>
</svg>`;
}

function creerGobelets() {
  elTable.innerHTML = '';
  etat.gobelets = [];

  for (let id = 0; id < 3; id++) {
    // Conteneur qui se déplace pendant le mélange
    const el = document.createElement('div');
    el.className = 'emplacement';
    el.dataset.id = id;

    // La bille (cachée par défaut)
    const boule = document.createElement('div');
    boule.className = 'boule';
    boule.hidden = true;

    // Le gobelet, posé par-dessus la bille
    const btn = document.createElement('button');
    btn.className = 'gobelet';
    btn.type = 'button';
    btn.disabled = true;
    btn.setAttribute('aria-label', `Gobelet ${id + 1}`);
    btn.innerHTML = dessinGobelet(id);

    // IMPORTANT pour l'exercice : on appelle `choisirGobelet` par son NOM global
    // au moment du clic. Si tu remplaces la fonction depuis la console,
    // c'est ta version qui sera appelée.
    btn.addEventListener('click', () => choisirGobelet(id));

    el.append(boule, btn);
    elTable.append(el);

    const gobelet = { id, emplacement: id, aBoule: false, el, btn, boule };
    etat.gobelets.push(gobelet);
    placer(gobelet, 0);
  }
}

/** Place visuellement un gobelet à son emplacement (0, 1, 2), avec une animation de `duree` ms. */
function placer(gobelet, duree) {
  gobelet.el.style.transitionDuration = `${duree}ms`;
  gobelet.el.style.left = `${gobelet.emplacement * 33.333}%`;
}

/** Lève un gobelet et attend la fin de l'animation. */
async function lever(gobelet) {
  gobelet.btn.classList.add('leve');
  await attendre(DUREE_LEVER);
}

/** Repose un gobelet et attend la fin de l'animation. */
async function baisser(gobelet) {
  gobelet.btn.classList.remove('leve');
  await attendre(DUREE_LEVER);
}

/** Lève (ou baisse) plusieurs gobelets en même temps. */
async function leverPlusieurs(liste) {
  await Promise.all(liste.map(lever));
}
async function baisserPlusieurs(liste) {
  await Promise.all(liste.map(baisser));
}

// ---------------------------------------------------------------------------
// Déroulement d'une partie
// ---------------------------------------------------------------------------

/**
 * Un seul appui sur ▶ : on prend la mise, on montre les billes,
 * on referme, on mélange, puis on attend le choix du joueur.
 */
async function nouvellePartie() {
  if (etat.phase !== 'attente') return;
  if (Date.now() - miseAjusteeA < 600) return;   // la mise vient d'être corrigée
  const mise = validerMise();
  if (mise === null) return;

  // On encaisse la mise
  etat.mise = mise;
  etat.solde = arrondir(etat.solde - mise);
  afficherSolde();
  sauvegarder();

  etat.phase = 'revelation';
  commandesBloquees(true);
  gobeletsCliquables(false);

  // On repart de gobelets propres, chacun à sa place
  creerGobelets();

  // On tire au hasard 1 ou 2 gobelets DIFFÉRENTS qui recevront une bille
  const avecBoule = melangerTableau(etat.gobelets).slice(0, etat.nbBoules);
  for (const g of etat.gobelets) {
    g.aBoule = avecBoule.includes(g);
    g.boule.hidden = !g.aBoule;
  }

  afficherMessage(etat.nbBoules === 1 ? 'Regardez bien la bille…' : 'Regardez bien les billes…');

  await attendre(250);
  son('lever');
  await leverPlusieurs(etat.gobelets);
  await attendre(DUREE_REVELATION);
  await baisserPlusieurs(etat.gobelets);
  await attendre(250);

  await melanger();
}

/** Les gobelets échangent leurs places, de plus en plus vite. */
async function melanger() {
  if (etat.phase !== 'revelation') return;
  etat.phase = 'melange';
  afficherMessage('Suivez bien des yeux…');

  let duree = DUREE_ECHANGE_MAX;

  for (let i = 0; i < NB_ECHANGES; i++) {
    // On choisit deux emplacements différents au hasard
    const a = hasard(3);
    let b = hasard(3);
    while (b === a) b = hasard(3);

    const gA = etat.gobelets.find((g) => g.emplacement === a);
    const gB = etat.gobelets.find((g) => g.emplacement === b);

    // On échange leurs emplacements…
    gA.emplacement = b;
    gB.emplacement = a;

    // …et on anime le déplacement. Un des deux passe "devant".
    gA.el.classList.add('devant');
    placer(gA, duree);
    placer(gB, duree);
    son('echange');
    await attendre(duree);
    gA.el.classList.remove('devant');

    // Le prochain échange sera plus rapide
    duree = Math.max(DUREE_ECHANGE_MIN, duree * ACCELERATION);
  }

  etat.phase = 'choix';
  gobeletsCliquables(true);
  afficherMessage(etat.nbBoules === 1 ? 'Où est la bille ?' : 'Trouvez une bille');
}

/**
 * Le joueur touche un gobelet. C'est LE choix officiel.
 * C'est cette fonction que le guide propose de détourner depuis la console.
 */
async function choisirGobelet(id) {
  if (etat.phase !== 'choix') return;   // un seul choix par partie… en théorie
  etat.phase = 'resultat';
  gobeletsCliquables(false);

  const choisi = etat.gobelets.find((g) => g.id === id);
  const gagne = choisi.aBoule;
  const gain = gagne ? arrondir(etat.mise * MULTIPLICATEURS[etat.nbBoules]) : 0;

  // On lève le gobelet choisi
  await lever(choisi);
  son(gagne ? 'gagne' : 'perdu');
  afficherMessage(
    gagne ? `Gagné ! +${formater(gain)} XOF` : `Perdu… −${formater(etat.mise)} XOF`,
    gagne ? 'gagne' : 'perdu'
  );

  if (gagne) {
    etat.solde = arrondir(etat.solde + gain);
    etat.score.gagnees++;
    elSolde.classList.remove('monte');
    void elSolde.offsetWidth; // relance l'animation
    elSolde.classList.add('monte');
  } else {
    etat.score.perdues++;
  }
  afficherScore();

  await attendre(900);

  // Puis on lève les DEUX autres gobelets en même temps, gagné ou perdu,
  // pour montrer où étaient la ou les billes.
  const autres = etat.gobelets.filter((g) => g !== choisi);
  son('lever');
  await leverPlusieurs(autres);
  await attendre(1500);
  await baisserPlusieurs([choisi, ...autres]);

  etat.mise = 0;
  etat.phase = 'attente';
  commandesBloquees(false);
  afficherMessage(
    gagne ? `Gagné ${formater(gain)} XOF ! Placez un pari` : 'Placez un pari',
    gagne ? 'gagne' : ''
  );
}

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

function choisirMode(nb) {
  etat.nbBoules = nb;
  for (const b of elChoixBoules.querySelectorAll('.mode')) {
    const actif = Number(b.dataset.boules) === nb;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-checked', String(actif));
  }
}

elChoixBoules.addEventListener('click', (e) => {
  const b = e.target.closest('.mode');
  if (!b || b.disabled) return;
  son('clic');
  choisirMode(Number(b.dataset.boules));
});

elJetons.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  son('clic');
  ecrireMise(Number(b.dataset.valeur));
  afficherMessage('Placez un pari');
});

btnEffacer.addEventListener('click', () => {
  elMise.value = '';
  elMise.focus();
});

// En quittant le champ, on corrige la mise si elle sort des limites.
// Si c'est l'appui sur ▶ qui a fait quitter le champ, on ne lance pas
// la partie tout de suite : le joueur doit d'abord voir la mise corrigée.
let miseAjusteeA = 0;
elMise.addEventListener('change', () => {
  const v = lireMise();
  if (isNaN(v)) {
    miseAjusteeA = Date.now();
    afficherMessage(`Entre une mise entre ${formater(MISE_MIN)} et ${formater(MISE_MAX)} XOF`, 'erreur');
    return;
  }
  const bornee = bornerMise(v);
  ecrireMise(bornee);
  if (bornee !== arrondir(v)) {
    miseAjusteeA = Date.now();
    afficherMessage(v < MISE_MIN ? `Mise minimale : ${formater(MISE_MIN)} XOF` : `Mise maximale : ${formater(MISE_MAX)} XOF`, 'erreur');
  } else {
    afficherMessage('Placez un pari');
  }
});
elMise.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { elMise.blur(); nouvellePartie(); }
});

btnJouer.addEventListener('click', nouvellePartie);

btnReset.addEventListener('click', () => {
  if (etat.phase !== 'attente') return;
  etat.solde = SOLDE_DEPART;
  etat.score = { gagnees: 0, perdues: 0 };
  afficherScore();
  afficherMessage(`Solde remis à ${formater(SOLDE_DEPART)} XOF`);
});

btnSon.addEventListener('click', () => {
  etat.son = !etat.son;
  afficherSon();
  sauvegarder();
  son('clic');
});

btnAide.addEventListener('click', () => { elAide.hidden = false; btnFermerAide.focus(); });
btnFermerAide.addEventListener('click', () => { elAide.hidden = true; btnAide.focus(); });
elAide.addEventListener('click', (e) => { if (e.target === elAide) elAide.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') elAide.hidden = true; });

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

charger();
afficherSon();
afficherScore();
ecrireMise(MISE_MIN);
creerGobelets();
