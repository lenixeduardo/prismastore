const hero = document.querySelector('#hero-page');
const app = document.querySelector('#app');
const heroArt = document.querySelector('[data-hero-art]');
const enterButton = document.querySelector('[data-enter-dashboard]');

const HERO_PARTS = [
  '/assets/hero/hero-part-1.txt',
  '/assets/hero/hero-part-2.txt',
  '/assets/hero/hero-part-3.txt',
  '/assets/hero/hero-part-4.txt',
];

async function loadHeroArtwork() {
  if (!heroArt) return;
  try {
    const chunks = await Promise.all(HERO_PARTS.map(async (path) => {
      const response = await fetch(path, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Falha ao carregar ${path}`);
      return response.text();
    }));
    heroArt.src = `data:image/webp;base64,${chunks.join('')}`;
    heroArt.classList.add('loaded');
  } catch (error) {
    console.error('Não foi possível carregar a heropage PrismaStore:', error);
    hero?.classList.add('hero-load-error');
  }
}

function enterDashboard() {
  if (!hero || !app) return;
  hero.hidden = true;
  app.hidden = false;
  document.body.classList.add('dashboard-active');
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

enterButton?.addEventListener('click', enterDashboard);
loadHeroArtwork();
