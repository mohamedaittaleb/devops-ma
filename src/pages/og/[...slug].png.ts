import type { APIContext, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import { SITE } from '../../consts';
import { tousLesArticles, pilierDe, minutesDeLecture, type Article } from '../../lib/articles';

/**
 * Une image de partage par article, generee au build (1200x630, ratio 1.91:1).
 *
 * Sur LinkedIn ou dans une conversation, c'est cette image qui porte le lien :
 * la meme vignette generique pour tous les articles les rendait
 * indiscernables. Le titre, la rubrique et sa couleur suffisent a les
 * distinguer ; rien n'est charge depuis l'exterieur.
 *
 * Les polices viennent de fontconfig (celles du systeme de build) : le rendu
 * varie legerement entre un Mac et le runner Ubuntu, sans consequence ici.
 */

// Les teintes claires des rubriques, eclaircies pour tenir sur fond sombre.
const COULEURS: Record<string, string> = {
  devops: '#3fb6c2',
  devsecops: '#e0707f',
  'ai-devops': '#a58bf0',
  cloud: '#d9a54a',
};

export const getStaticPaths: GetStaticPaths = async () =>
  (await tousLesArticles()).map((article) => ({ params: { slug: article.id }, props: { article } }));

const echapper = (texte: string) =>
  texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Coupe le titre en lignes d'au plus `largeur` caracteres, sans couper les mots. */
function lignes(texte: string, largeur: number, maximum: number): string[] {
  const resultat: string[] = [];
  let courante = '';
  // La ponctuation haute du francais reste collee au mot qui la precede :
  // sans cela, le « : » d'un titre pouvait ouvrir une ligne.
  const insecable = texte.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
  for (const mot of insecable.split(/ +/)) {
    if (courante && `${courante} ${mot}`.length > largeur) {
      resultat.push(courante);
      courante = mot;
    } else {
      courante = courante ? `${courante} ${mot}` : mot;
    }
  }
  if (courante) resultat.push(courante);
  if (resultat.length > maximum) {
    const garde = resultat.slice(0, maximum);
    garde[maximum - 1] = `${garde[maximum - 1].replace(/[\s,:;.]+$/, '')}…`;
    return garde;
  }
  return resultat;
}

function svg(article: Article): string {
  const pilier = pilierDe(article);
  const couleur = COULEURS[pilier.slug] ?? '#e0707f';
  const titre = article.data.titre;
  // Un titre court prend une taille plus grande ; un titre long reste sur quatre lignes.
  const taille = titre.length > 60 ? 58 : 68;
  const largeur = titre.length > 60 ? 30 : 26;
  const texteTitre = lignes(titre, largeur, 4);
  const hauteurLigne = Math.round(taille * 1.16);
  const debut = 300 - ((texteTitre.length - 1) * hauteurLigne) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0e0e10"/>
  <rect x="0" y="0" width="1200" height="8" fill="${couleur}"/>
  <circle cx="102" cy="104" r="9" fill="${couleur}"/>
  <text x="124" y="114" fill="${couleur}" font-family="Menlo, DejaVu Sans Mono, monospace"
        font-size="30" font-weight="600">${echapper(pilier.nom)}</text>
  <g font-family="Inter, Helvetica Neue, Arial, DejaVu Sans, sans-serif" font-size="${taille}"
     font-weight="700" fill="#f2f2f4" letter-spacing="-1">
    ${texteTitre.map((l, i) => `<text x="90" y="${debut + i * hauteurLigne}">${echapper(l)}</text>`).join('\n    ')}
  </g>
  <rect x="90" y="510" width="1020" height="1" fill="#2c2c33"/>
  <text x="90" y="566" fill="#f2f2f4" font-family="Menlo, DejaVu Sans Mono, monospace"
        font-size="32" font-weight="600">${echapper(SITE.title)}</text>
  <text x="1110" y="566" text-anchor="end" fill="#9a9aa3"
        font-family="Inter, Helvetica Neue, Arial, DejaVu Sans, sans-serif" font-size="28">${echapper(`${SITE.auteur} · ${minutesDeLecture(article)} min de lecture`)}</text>
</svg>`;
}

export async function GET({ props }: APIContext) {
  const png = await sharp(Buffer.from(svg(props.article as Article)))
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
