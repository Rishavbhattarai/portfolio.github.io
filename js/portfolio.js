/* ============================================================
   RISHAV BHATTARAI — PORTFOLIO JS
   Vanilla ES6+ · No Dependencies
   ============================================================ */

'use strict';

/* ── NAV SIDEBAR TOGGLE (MOBILE) ────────────────────── */
const navToggle = document.getElementById('navToggle');
const navSidebar = document.getElementById('navSidebar');
const navSidebarLinks = document.querySelectorAll('.nav-sidebar__link');

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = navSidebar.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
  });
}

// Close mobile menu on link click
navSidebarLinks.forEach(link => {
  link.addEventListener('click', () => {
    navSidebar.classList.remove('open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navSidebar) {
    navSidebar.classList.remove('open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
    }
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

// Init with first tab
activateFilter('dashboards');

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

/* ── TIMELINE SCROLL-DRAW ───────────────────────────── */
const timelineLine = document.getElementById('timelineLine');
const timelineSection = document.getElementById('timeline');

function updateTimelineProgress() {
  if (!timelineLine || !timelineSection) return;

  const rect = timelineSection.getBoundingClientRect();
  const windowH = window.innerHeight;

  // Start drawing when section enters viewport, finish when it exits bottom
  const start = windowH * 0.9;
  const end = windowH * 0.1;

  // Range: from when top of section hits `start` to when bottom of section hits `end`
  const sectionH = timelineSection.offsetHeight;
  const total = sectionH + windowH;
  const traveled = windowH - rect.top;
  const progress = Math.min(1, Math.max(0, traveled / total));

  timelineLine.style.height = (progress * 100) + '%';
}

window.addEventListener('scroll', updateTimelineProgress, { passive: true });
updateTimelineProgress(); // run once on load

/* ── SCROLL REVEAL ──────────────────────────────────── */
const revealElements = document.querySelectorAll(
  '.section__header, .filter-bar, .contact-card, .footer'
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

/* ── ACTIVE NAV LINK HIGHLIGHT ──────────────────────── */
const sections = document.querySelectorAll('section[id], header[id]');
const sidebarNavLinks = document.querySelectorAll('.nav-sidebar__link');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      sidebarNavLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        const isActive = linkHref === `#${id}`;
        link.classList.toggle('active', isActive);
      });
    }
  });
}, { threshold: 0.3 });

sections.forEach(section => sectionObserver.observe(section));

console.log('%c⚡ Rishav Bhattarai — Portfolio', 'color:#3b82f6;font-size:1.1rem;font-weight:bold;');
console.log('%cSalesforce Developer | Java Engineer | Las Vegas, NV', 'color:#94a3b8;font-size:0.85rem;');
