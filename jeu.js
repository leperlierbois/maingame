/*
 * Jeu des 3 gobelets
 * ------------------
 * Tout le jeu tourne dans le navigateur (côté "client").
 * C'est volontaire : le but de l'exercice est d'ouvrir les DevTools de Chrome
 * et de voir qu'un jeu qui fait confiance au client peut être manipulé.
 * Voir GUIDE-DEVTOOLS.md.
 *
 * Ce fichier est un script "classique" (pas un module ES) : la constante
 * `etat` et les fonctions déclarées ici sont accessibles depuis la console.
 */

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

const DUREE_LEVER = 450;          // ms, doit correspondre au CSS (.gobelet transition)
const DUREE_REVELATION = 1400;    // ms pendant lesquelles on montre les boules au début
const NB_ECHANGES = 22;           // nombre d'échanges pendant le mélange
const DUREE_ECHANGE_MAX = 750;    // ms, premier échange (lent)
const DUREE_ECHANGE_MIN = 70;     // ms, derniers échanges (très rapides)
const ACCELERATION = 0.85;        // chaque échange dure 85 % du précédent

// ---------------------------------------------------------------------------
// L'état du jeu : TOUTE la vérité est ici, dans la mémoire du navigateur.
// ---------------------------------------------------------------------------

const etat = {
  nbBoules: 1,
  // 'attente'   : on n'a pas encore lancé
  // 'revelation': les gobelets sont levés, on voit les boules
  // 'pret'      : gobelets fermés, on attend le clic sur « Mélanger »
  // 'melange'   : les gobelets échangent leurs places
  // 'choix'     : le joueur doit cliquer sur un gobelet
  // 'resultat'  : on montre le résultat
  phase: 'attente',
  // Un objet par gobelet : { id, emplacement (0, 1 ou 2), aBoule, el, btn, boule }
  gobelets: [],
  score: { gagnees: 0, perdues: 0 },
};

// Raccourcis vers les éléments de la page
const elTable = document.getElementById('table');
const elMessage = document.getElementById('message');
const elScore = document.getElementById('score');
const elChoixBoules = document.getElementById('choix-boules');
const btnLancer = document.getElementById('btn-lancer');
const btnMelanger = document.getElementById('btn-melanger');

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

function afficherMessage(texte, classe = '') {
  elMessage.textContent = texte;
  elMessage.className = classe;
}

function afficherScore() {
  elScore.textContent = `Gagnées : ${etat.score.gagnees} · Perdues : ${etat.score.perdues}`;
}

/** Active ou désactive le clic sur les 3 gobelets. */
function gobeletsCliquables(oui) {
  for (const g of etat.gobelets) g.btn.disabled = !oui;
}

// ---------------------------------------------------------------------------
// Création des gobelets dans la page
// ---------------------------------------------------------------------------

function creerGobelets() {
  elTable.innerHTML = '';
  etat.gobelets = [];

  for (let id = 0; id < 3; id++) {
    // Conteneur qui se déplace pendant le mélange
    const el = document.createElement('div');
    el.className = 'emplacement';
    el.dataset.id = id;

    // La boule (cachée par défaut)
    const boule = document.createElement('div');
    boule.className = 'boule';
    boule.hidden = true;

    // Le gobelet, posé par-dessus la boule
    const btn = document.createElement('button');
    btn.className = 'gobelet';
    btn.disabled = true;
    btn.setAttribute('aria-label', `Gobelet ${id + 1}`);

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

/** Étape 1 : on place les boules au hasard et on les montre. */
async function nouvellePartie() {
  etat.nbBoules = Number(document.querySelector('input[name="nb-boules"]:checked').value);
  etat.phase = 'revelation';

  btnLancer.disabled = true;
  btnMelanger.disabled = true;
  elChoixBoules.disabled = true;
  gobeletsCliquables(false);

  // On repart de gobelets propres, chacun à sa place
  creerGobelets();

  // On tire au hasard 1 ou 2 gobelets DIFFÉRENTS qui recevront une boule
  const avecBoule = melangerTableau(etat.gobelets).slice(0, etat.nbBoules);
  for (const g of etat.gobelets) {
    g.aBoule = avecBoule.includes(g);
    g.boule.hidden = !g.aBoule;
  }

  afficherMessage(etat.nbBoules === 1 ? 'Regarde bien où est la boule…' : 'Regarde bien où sont les boules…');

  await attendre(300);
  await leverPlusieurs(etat.gobelets);
  await attendre(DUREE_REVELATION);
  await baisserPlusieurs(etat.gobelets);

  etat.phase = 'pret';
  btnMelanger.disabled = false;
  afficherMessage('Clique sur « Mélanger » quand tu es prêt.');
}

/** Étape 2 : les gobelets échangent leurs places, de plus en plus vite. */
async function melanger() {
  if (etat.phase !== 'pret') return;
  etat.phase = 'melange';
  btnMelanger.disabled = true;
  afficherMessage('Suis bien des yeux…');

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
    await attendre(duree);
    gA.el.classList.remove('devant');

    // Le prochain échange sera plus rapide
    duree = Math.max(DUREE_ECHANGE_MIN, duree * ACCELERATION);
  }

  etat.phase = 'choix';
  gobeletsCliquables(true);
  afficherMessage(etat.nbBoules === 1 ? 'À toi : sous quel gobelet est la boule ?' : 'À toi : choisis un gobelet qui cache une boule.');
}

/**
 * Étape 3 : le joueur clique sur un gobelet. C'est LE choix officiel.
 * C'est cette fonction que le guide propose de détourner depuis la console.
 */
async function choisirGobelet(id) {
  if (etat.phase !== 'choix') return;   // un seul choix par partie… en théorie
  etat.phase = 'resultat';
  gobeletsCliquables(false);

  const choisi = etat.gobelets.find((g) => g.id === id);
  const gagne = choisi.aBoule;

  // On lève le gobelet choisi
  await lever(choisi);
  afficherMessage(gagne ? 'Gagné ! 🎉' : 'Perdu… il n’y a rien ici.', gagne ? 'gagne' : 'perdu');
  await attendre(900);
  await baisser(choisi);

  // Puis on montre les autres :
  //  - si gagné : les gobelets vides se lèvent (on voit qu'il n'y avait rien)
  //  - si perdu : les gobelets qui avaient une boule se lèvent
  const autres = etat.gobelets.filter((g) => g !== choisi && g.aBoule !== gagne);
  await attendre(200);
  await leverPlusieurs(autres);
  await attendre(1200);
  await baisserPlusieurs(autres);

  if (gagne) etat.score.gagnees++;
  else etat.score.perdues++;
  afficherScore();

  afficherMessage(
    (gagne ? 'Gagné ! ' : 'Perdu. ') + 'Clique sur « Lancer » pour rejouer.',
    gagne ? 'gagne' : 'perdu'
  );
  btnLancer.disabled = false;
  elChoixBoules.disabled = false;
  etat.phase = 'attente';
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

btnLancer.addEventListener('click', nouvellePartie);
btnMelanger.addEventListener('click', melanger);
creerGobelets();
