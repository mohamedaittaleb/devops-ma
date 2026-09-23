import { defineHastPlugin } from 'satteri';

/**
 * Habille les blocs produits par Markdown :
 *
 *   <pre>   -> <div class="bloc-code"> en-tete (langue + bouton copier) + <pre>
 *   <table> -> <div class="tableau">  pour un defilement horizontal propre
 *
 * Ecrit avec l'API native de Satteri (le processeur Markdown d'Astro) plutot
 * qu'avec un plugin rehype : rehype demanderait de reinstaller l'ancienne
 * chaine unified, plus lente, pour le meme resultat.
 */

const LANGUES = {
  sh: 'shell', zsh: 'shell', bash: 'bash', console: 'console',
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  yml: 'yaml', docker: 'dockerfile', hcl: 'terraform', tf: 'terraform',
  py: 'python', md: 'markdown',
};

function element(tagName, properties, children = []) {
  return { type: 'element', tagName, properties, children };
}

function enTete(langue) {
  return element('div', { className: ['bloc-code-tete'] }, [
    element('span', { className: ['bloc-code-langue'] }, [{ type: 'text', value: langue }]),
    element(
      'button',
      {
        type: 'button',
        className: ['bloc-code-copier'],
        dataCopier: '',
        ariaLabel: 'Copier le code',
      },
      [{ type: 'text', value: 'copier' }],
    ),
  ]);
}

/** Collecte les elements retenus, du plus profond au plus superficiel. */
function collecter(noeud, retient, trouves = []) {
  for (const enfant of noeud?.children ?? []) {
    collecter(enfant, retient, trouves);
    if (enfant.type === 'element' && retient(enfant)) trouves.push(enfant);
  }
  return trouves;
}

export const blocsPlugin = defineHastPlugin({
  name: 'devops-ma-blocs',

  /**
   * Tout se joue dans `after`, pas dans un visiteur d'element.
   *
   * Astro colore le code avec son propre plugin, qui remplace le <pre> qu'un
   * visiteur vient de voir. Deux remplacements du meme noeud entrent en
   * conflit et l'enrobage finissait a cote du bloc au lieu de le contenir.
   * `after` s'execute une fois tous les visiteurs stabilises : le <pre> qu'on
   * lit ici est celui qui sera rendu, coloration comprise.
   */
  after(racine, ctx) {
    const cibles = collecter(
      racine,
      (noeud) => noeud.tagName === 'pre' || noeud.tagName === 'table',
    );

    for (const noeud of cibles) {
      if (noeud.tagName === 'table') {
        ctx.replaceNode(noeud, element('div', { className: ['tableau'] }, [noeud]));
        continue;
      }

      const brute = String(noeud.properties?.dataLanguage ?? '').toLowerCase();
      const langue = LANGUES[brute] ?? (brute && brute !== 'plaintext' ? brute : 'texte');

      ctx.replaceNode(
        noeud,
        element('div', { className: ['bloc-code'] }, [enTete(langue), noeud]),
      );
    }
  },
});
