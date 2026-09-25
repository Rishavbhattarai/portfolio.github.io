/* ============================================================
   RISHAV BHATTARAI: PORTFOLIO JS
   Vanilla ES6+ · No Dependencies
   ============================================================ */

'use strict';

/* ── NAV TOP TOGGLE (TABLET + MOBILE HAMBURGER) ──────── */
const navTopToggle = document.getElementById('navTopToggle');
const navTopMenu = document.getElementById('navTopMenu');
const navTopLinks = navTopMenu ? navTopMenu.querySelectorAll('a') : [];

if (navTopToggle && navTopMenu) {
  navTopToggle.addEventListener('click', () => {
    const isOpen = navTopMenu.classList.toggle('open');
    navTopToggle.setAttribute('aria-expanded', isOpen);
  });
}

navTopLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (navTopMenu) navTopMenu.classList.remove('open');
    if (navTopToggle) navTopToggle.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navTopMenu) {
    navTopMenu.classList.remove('open');
    if (navTopToggle) navTopToggle.setAttribute('aria-expanded', 'false');
  }
});

/* ── PROJECT FILTER ─────────────────────────────────── */
const filterBtns = document.querySelectorAll('.filter-btn');
const cards = document.querySelectorAll('.card');

function activateFilter(targetFilter) {
  // Update button states
  filterBtns.forEach(btn => {
    const isActive = btn.dataset.filter === targetFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  // Animate cards
  let visibleIndex = 0;
  cards.forEach(card => {
    const matches = card.dataset.category === targetFilter;

    if (matches) {
      card.classList.remove('hidden');
      card.classList.remove('animating-in');
      // Stagger reveal
      setTimeout(() => {
        card.classList.add('animating-in');
      }, visibleIndex * 65);
      visibleIndex++;
    } else {
      card.classList.add('hidden');
      card.classList.remove('animating-in');
    }
  });
}

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => activateFilter(btn.dataset.filter));
});

// Init with first tab (only on pages that actually have a filter bar)
if (filterBtns.length) {
  activateFilter('ai-infra');
}

/* ── TIMELINE INTERACTION ───────────────────────────── */
const tnodes = document.querySelectorAll('.tnode');
const tdetails = document.querySelectorAll('.tdetail');

function activateNode(targetKey) {
  // Update node states
  tnodes.forEach(node => {
    const isActive = node.dataset.tnode === targetKey;
    node.classList.toggle('tnode--active', isActive);
    node.setAttribute('aria-expanded', isActive);
  });

  // Swap detail panels with fade
  tdetails.forEach(detail => {
    if (detail.dataset.detail === targetKey) {
      detail.style.display = 'block';
      // Trigger animation restart
      detail.style.animation = 'none';
      detail.offsetHeight; // reflow
      detail.style.animation = '';
    } else {
      detail.style.display = 'none';
    }
  });
}

tnodes.forEach(node => {
  node.addEventListener('click', () => activateNode(node.dataset.tnode));
  // Keyboard support
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateNode(node.dataset.tnode);
    }
  });
});

/* ── TIMELINE LINE ──────────────────────────────────── */
// Draw the timeline rail once when the section comes into view.
const timelineLine = document.getElementById('timelineLine');
if (timelineLine) {
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      timelineLine.style.transform = 'scaleY(1)';
      obs.disconnect();
    }
  }, { threshold: 0.2 }).observe(timelineLine.closest('section') || timelineLine);
}

/* ── SCROLL REVEAL ──────────────────────────────────── */
const revealElements = document.querySelectorAll(
  '.section__header, .filter-bar, .contact-card'
);

// Mark them initially
revealElements.forEach(el => el.classList.add('reveal'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

/* ── CARD STAGGER REVEAL ────────────────────────────── */
// Cards not hidden get revealed on scroll too
const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.classList.contains('hidden')) {
      entry.target.classList.add('reveal', 'revealed');
    }
  });
}, { threshold: 0.08 });

cards.forEach(card => cardObserver.observe(card));

/* ── SMOOTH SCROLL FOR NAV LINKS ────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ── CURRENT PAGE IN TOP NAV ────────────────────────── */
const currentPage = location.pathname.split('/').pop() || 'index.html';
navTopLinks.forEach(link => {
  if (link.getAttribute('href') === currentPage) link.setAttribute('aria-current', 'page');
});
