/**
 * Foerderkreis-Loader-Modul (Förderkreismitglieder-Loader)
 *
 * Lädt dynamisch die Förderkreismitglieder (Sponsoren) aus
 * assets/data/foerderkreis_data.json und generiert die interaktiven
 * Flip-Cards in der Förderkreis-Sektion.
 *
 * Stufenlose Erweiterbarkeit:
 *   Neues Mitglied hinzufügen = neuer Eintrag in foerderkreis_data.json,
 *   Übersetzungskey in translations.json, Logo in media_config.json.
 *
 * @module FoerderkreisLoader
 */
(function () {
    'use strict';

    /** Gecachte Mitglieder-Daten (nach erstem Laden) */
    let foerderkreisCache = null;
    /** Gecachte Übersetzungen (nach erstem Laden, enthält alle Sprachen) */
    let translationsCache = null;

    /**
     * Ermittelt die aktuelle Sprache aus URL, localStorage oder Cookie.
     * @returns {string} Sprachcode: 'de', 'en' oder 'fr'
     */
    function detectLanguage() {
        const urlParams = new URLSearchParams(window.location.search);
        const lang = urlParams.get('lang');
        if (lang === 'en' || lang === 'fr' || lang === 'de') return lang;
        try {
            const stored = localStorage.getItem('language');
            if (stored === 'en' || stored === 'fr' || stored === 'de') return stored;
        } catch (e) { /* localStorage nicht verfügbar */ }
        const cookieMatch = document.cookie.split(';').find(c => c.trim().startsWith('language='));
        if (cookieMatch) {
            const val = cookieMatch.split('=')[1].trim();
            if (val === 'en' || val === 'fr' || val === 'de') return val;
        }
        return 'de';
    }

    /**
     * Gibt den übersetzten Wert für einen i18n-Schlüssel zurück.
     * Fallback: Deutsch → leerer String.
     *
     * @param {string} key  - i18n-Schlüssel
     * @param {string} lang - Sprachcode
     * @returns {string}
     */
    function translate(key, lang) {
        if (!translationsCache) return '';
        const entry = translationsCache[key];
        if (!entry) return '';
        return entry[lang] || entry['de'] || '';
    }

    /**
     * Erstellt ein einzelnes Flip-Card <li>-Element für ein Förderkreismitglied.
     *
     * @param {Object} member           - Mitgliedsdaten aus foerderkreis_data.json
     * @param {string} member.mediaId   - data-media-id des Logo-Bildes
     * @param {string} member.alt       - Alt-Text des Logo-Bildes
     * @param {string} member.descKey   - i18n-Schlüssel für die Beschreibung
     * @param {string} member.animationDelay - CSS-Delay für Einblend-Animation
     * @param {string} lang             - Aktueller Sprachcode
     * @returns {HTMLLIElement}
     */
    function createFlipCard(member, lang) {
        const li = document.createElement('li');
        li.className = 'col-lg-3 col-md-6 mb-4 align-items-stretch fade-in-up';
        li.setAttribute('data-animation-delay', member.animationDelay || '0ms');

        const button = document.createElement('button');
        button.className = 'flip-card h-100';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('type', 'button');

        const inner = document.createElement('div');
        inner.className = 'flip-card-inner';

        // ── Vorderseite: Logo ───────────────────────────────────────────
        const front = document.createElement('div');
        front.className = 'flip-card-front';

        const iconBox = document.createElement('div');
        iconBox.className = 'icon-box';

        const img = document.createElement('img');
        img.setAttribute('loading', 'lazy');
        img.setAttribute('data-media-id', member.mediaId);
        img.setAttribute('alt', member.alt || '');
        img.className = 'card-logo';

        iconBox.appendChild(img);
        front.appendChild(iconBox);

        // ── Rückseite: Beschreibungstext + Zurück-Hinweis ───────────────
        const back = document.createElement('div');
        back.className = 'flip-card-back';
        back.setAttribute('aria-hidden', 'true');

        const desc = document.createElement('p');
        desc.setAttribute('data-i18n', member.descKey);
        desc.textContent = translate(member.descKey, lang);

        const tapHint = document.createElement('div');
        tapHint.className = 'tap-hint';
        tapHint.setAttribute('aria-hidden', 'true');

        const undoIcon = document.createElement('i');
        undoIcon.className = 'fas fa-undo';
        undoIcon.setAttribute('aria-hidden', 'true');

        const backSpan = document.createElement('span');
        backSpan.setAttribute('data-i18n', 'flip-back');
        backSpan.textContent = translate('flip-back', lang);

        tapHint.appendChild(undoIcon);
        tapHint.appendChild(document.createTextNode(' '));
        tapHint.appendChild(backSpan);

        back.appendChild(desc);
        back.appendChild(tapHint);

        inner.appendChild(front);
        inner.appendChild(back);
        button.appendChild(inner);
        li.appendChild(button);

        return li;
    }

    /**
     * Registriert den IntersectionObserver für die Fade-In-Animationen
     * auf den neu erzeugten Listenelementen.
     *
     * @param {HTMLElement} container
     */
    function registerFadeInObserver(container) {
        if (!('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.transitionDelay = entry.target.dataset.animationDelay || '0ms';
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        container.querySelectorAll('.fade-in-up').forEach(el => observer.observe(el));
    }

    /**
     * Lädt alle benötigten JSON-Daten (mit Cache) und rendert die Flip-Cards.
     *
     * @async
     * @returns {Promise<void>}
     */
    async function loadFoerderkreis() {
        const container = document.getElementById('foerderkreis-list');
        if (!container) return;

        try {
            // Nur bei erstem Laden oder Cache-Miss fetchen
            if (!foerderkreisCache || !translationsCache) {
                const fetches = [];
                if (!foerderkreisCache) fetches.push(fetch('assets/data/foerderkreis_data.json'));
                if (!translationsCache) fetches.push(fetch('assets/data/translations/translations.json'));

                const responses = await Promise.all(fetches);
                for (const res of responses) {
                    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.url}`);
                }

                let idx = 0;
                if (!foerderkreisCache) {
                    foerderkreisCache = await responses[idx++].json();
                }
                if (!translationsCache) {
                    translationsCache = await responses[idx].json();
                }
            }

            const mitglieder = foerderkreisCache.foerderkreismitglieder || [];
            if (mitglieder.length === 0) {
                console.warn('FoerderkreisLoader: Keine Einträge in foerderkreismitglieder gefunden.');
                return;
            }

            const lang = detectLanguage();

            container.innerHTML = '';
            mitglieder.forEach(member => {
                container.appendChild(createFlipCard(member, lang));
            });

            // Bilder nachladen – content-loader nutzt seinen eigenen Cache (kein erneuter Netzwerk-Request)
            if (window.ibcContentLoader && typeof window.ibcContentLoader.loadMediaConfig === 'function') {
                window.ibcContentLoader.loadMediaConfig();
            }

            // Fade-In-Observer für neue Elemente registrieren
            registerFadeInObserver(container);

        } catch (error) {
            console.error('FoerderkreisLoader: Fehler beim Laden:', error);
        }
    }

    /**
     * Initialisiert das Modul.
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', loadFoerderkreis);
        } else {
            loadFoerderkreis();
        }

        // Bei Sprachwechsel: Karten mit neuer Sprache neu rendern
        window.addEventListener('languageChanged', () => {
            loadFoerderkreis();
        });
    }

    init();
})();
