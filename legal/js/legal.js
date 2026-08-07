(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const LEGAL_READY_EVENT = "cdl:legal-ready";

  const LEGAL_PAGE_PATHS = Object.freeze({
    privacy: "/legal/privacy-policy",
    terms: "/legal/terms-and-conditions",
    cookies: "/legal/cookie-policy"
  });

  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");

  window[APP_NAMESPACE] =
    window[APP_NAMESPACE] || {};

  const app = window[APP_NAMESPACE];

  const state = {
    initialized: false,
    ready: false,
    legalKey: "",
    activeSectionId: "",
    sectionObserver: null,
    mutationObserver: null,
    scrollFrame: null,
    sections: [],
    tocLinks: [],
    reducedMotionMedia: window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    )
  };

  const normalizePathname = (pathname) => {
    let normalized = String(pathname || "/")
      .replace(/\/index\.html?$/i, "/")
      .replace(/\.html?$/i, "")
      .replace(/\/{2,}/g, "/");

    if (
      normalized.length > 1 &&
      normalized.endsWith("/")
    ) {
      normalized = normalized.slice(0, -1);
    }

    return normalized || "/";
  };

  const normalizeHash = (hash) => {
    const value = String(hash || "")
      .trim()
      .replace(/^#/, "");

    if (!value) {
      return "";
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const slugify = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
  };

  const prefersReducedMotion = () => {
    if (
      app.animations &&
      typeof app.animations.prefersReducedMotion ===
        "function"
    ) {
      return app.animations.prefersReducedMotion();
    }

    return state.reducedMotionMedia.matches;
  };

  const announce = (
    message,
    priority = "polite"
  ) => {
    if (
      app.accessibility &&
      typeof app.accessibility.announce ===
        "function"
    ) {
      app.accessibility.announce(message, {
        priority
      });
    }
  };

  const refreshAOS = () => {
    if (
      app.animations &&
      typeof app.animations.refreshAOS ===
        "function"
    ) {
      app.animations.refreshAOS();
    }
  };

  const detectLegalKey = () => {
    const explicitKey =
      document.body?.dataset.legalKey;

    if (
      explicitKey &&
      Object.prototype.hasOwnProperty.call(
        LEGAL_PAGE_PATHS,
        explicitKey
      )
    ) {
      return explicitKey;
    }

    const pathname = normalizePathname(
      window.location.pathname
    );

    return (
      Object.keys(LEGAL_PAGE_PATHS).find(
        (key) => {
          return pathname.includes(
            LEGAL_PAGE_PATHS[key]
          );
        }
      ) || ""
    );
  };

  const getHeaderOffset = () => {
    const rootStyles =
      window.getComputedStyle(
        document.documentElement
      );

    const configuredHeight =
      Number.parseFloat(
        rootStyles.getPropertyValue(
          "--header-height-scrolled"
        )
      );

    if (
      Number.isFinite(configuredHeight) &&
      configuredHeight > 0
    ) {
      return configuredHeight + 24;
    }

    const header = document.querySelector(
      ".cdl-header, [data-site-header] header"
    );

    if (header) {
      return (
        header.getBoundingClientRect().height +
        24
      );
    }

    return 96;
  };

  const ensureUniqueSectionId = (
    section,
    index
  ) => {
    if (!(section instanceof HTMLElement)) {
      return "";
    }

    if (section.id) {
      return section.id;
    }

    const title =
      section.querySelector(
        ".legal-section__title, h2, h3"
      );

    const baseId =
      slugify(title?.textContent) ||
      `legal-section-${index + 1}`;

    let candidate = baseId;
    let suffix = 2;

    while (
      document.getElementById(candidate)
    ) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }

    section.id = candidate;

    return candidate;
  };

  const collectSections = () => {
    const sections = Array.from(
      document.querySelectorAll(
        ".legal-section"
      )
    ).filter((section) => {
      return section instanceof HTMLElement;
    });

    sections.forEach((section, index) => {
      ensureUniqueSectionId(
        section,
        index
      );
    });

    state.sections = sections;

    return sections;
  };

  const collectTocLinks = () => {
    state.tocLinks = Array.from(
      document.querySelectorAll(
        ".legal-toc__link"
      )
    ).filter((link) => {
      return link instanceof HTMLAnchorElement;
    });

    return state.tocLinks;
  };

  const getTocLinkSectionId = (link) => {
    if (!(link instanceof HTMLAnchorElement)) {
      return "";
    }

    let hash = "";

    try {
      hash = new URL(
        link.href,
        window.location.href
      ).hash;
    } catch {
      hash = link.hash;
    }

    return normalizeHash(hash);
  };

  const getSectionById = (sectionId) => {
    if (!sectionId) {
      return null;
    }

    const directMatch =
      document.getElementById(sectionId);

    if (
      directMatch instanceof HTMLElement &&
      directMatch.classList.contains(
        "legal-section"
      )
    ) {
      return directMatch;
    }

    return (
      state.sections.find((section) => {
        return section.id === sectionId;
      }) || null
    );
  };

  const updateLegalSwitcher = () => {
    const links = document.querySelectorAll(
      ".legal-switcher__link, [data-legal-switcher-link]"
    );

    links.forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      const explicitKey =
        link.dataset.legalKey;

      let linkPath = "";

      try {
        linkPath = normalizePathname(
          new URL(
            link.href,
            window.location.href
          ).pathname
        );
      } catch {
        linkPath = normalizePathname(
          link.getAttribute("href")
        );
      }

      const isCurrent =
        explicitKey === state.legalKey ||
        (
          state.legalKey &&
          linkPath.includes(
            LEGAL_PAGE_PATHS[
              state.legalKey
            ]
          )
        );

      link.classList.toggle(
        "is-current",
        Boolean(isCurrent)
      );

      if (isCurrent) {
        link.setAttribute(
          "aria-current",
          "page"
        );
      } else {
        link.removeAttribute(
          "aria-current"
        );
      }
    });
  };

  const setActiveSection = (
    sectionId,
    {
      updateHash = false,
      replaceHistory = true,
      announceChange = false
    } = {}
  ) => {
    const normalizedSectionId =
      normalizeHash(sectionId);

    if (!normalizedSectionId) {
      return false;
    }

    const section =
      getSectionById(
        normalizedSectionId
      );

    if (!section) {
      return false;
    }

    const hasChanged =
      state.activeSectionId !==
      normalizedSectionId;

    state.activeSectionId =
      normalizedSectionId;

    state.sections.forEach((item) => {
      item.classList.toggle(
        "is-active",
        item === section
      );
    });

    state.tocLinks.forEach((link) => {
      const linkSectionId =
        getTocLinkSectionId(link);

      const isActive =
        linkSectionId ===
        normalizedSectionId;

      link.classList.toggle(
        "is-active",
        isActive
      );

      if (isActive) {
        link.setAttribute(
          "aria-current",
          "true"
        );
      } else {
        link.removeAttribute(
          "aria-current"
        );
      }
    });

    if (updateHash) {
      const nextUrl = new URL(
        window.location.href
      );

      nextUrl.hash =
        normalizedSectionId;

      if (replaceHistory) {
        window.history.replaceState(
          window.history.state,
          "",
          nextUrl
        );
      } else {
        window.history.pushState(
          window.history.state,
          "",
          nextUrl
        );
      }
    }

    if (
      announceChange &&
      hasChanged
    ) {
      const heading =
        section.querySelector(
          ".legal-section__title, h2, h3"
        );

      if (heading?.textContent) {
        announce(
          `${heading.textContent.trim()} section`
        );
      }
    }

    return true;
  };

  const focusSection = (section) => {
    if (!(section instanceof HTMLElement)) {
      return;
    }

    const heading = section.querySelector(
      ".legal-section__title, h2, h3"
    );

    const focusTarget =
      heading instanceof HTMLElement
        ? heading
        : section;

    const hadTabIndex =
      focusTarget.hasAttribute("tabindex");

    const originalTabIndex =
      focusTarget.getAttribute("tabindex");

    if (!hadTabIndex) {
      focusTarget.setAttribute(
        "tabindex",
        "-1"
      );
    }

    focusTarget.focus({
      preventScroll: true
    });

    if (!hadTabIndex) {
      focusTarget.addEventListener(
        "blur",
        () => {
          focusTarget.removeAttribute(
            "tabindex"
          );
        },
        {
          once: true
        }
      );
    } else if (
      originalTabIndex !== null
    ) {
      focusTarget.setAttribute(
        "tabindex",
        originalTabIndex
      );
    }
  };

  const scrollToSection = (
    section,
    {
      updateHash = true,
      replaceHistory = false,
      focus = true,
      announceChange = false
    } = {}
  ) => {
    if (!(section instanceof HTMLElement)) {
      return false;
    }

    if (
      app.accessibility &&
      typeof app.accessibility.scrollToTarget ===
        "function"
    ) {
      app.accessibility.scrollToTarget(
        section,
        {
          focus,
          updateHash
        }
      );

      setActiveSection(
        section.id,
        {
          updateHash,
          replaceHistory,
          announceChange
        }
      );

      return true;
    }

    const targetTop =
      window.scrollY +
      section.getBoundingClientRect().top -
      getHeaderOffset();

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: prefersReducedMotion()
        ? "auto"
        : "smooth"
    });

    setActiveSection(
      section.id,
      {
        updateHash,
        replaceHistory,
        announceChange
      }
    );

    if (focus) {
      const delay =
        prefersReducedMotion()
          ? 0
          : 460;

      window.setTimeout(() => {
        focusSection(section);
      }, delay);
    }

    return true;
  };

  const handleTocClick = (event) => {
    const link = event.currentTarget;

    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    const sectionId =
      getTocLinkSectionId(link);

    const section =
      getSectionById(sectionId);

    if (!section) {
      return;
    }

    event.preventDefault();

    scrollToSection(
      section,
      {
        updateHash: true,
        replaceHistory: false,
        focus: true,
        announceChange: true
      }
    );
  };

  const initializeTocLinks = () => {
    collectTocLinks();

    state.tocLinks.forEach((link) => {
      if (
        link.dataset.legalTocReady ===
        "true"
      ) {
        return;
      }

      link.dataset.legalTocReady =
        "true";

      link.addEventListener(
        "click",
        handleTocClick
      );
    });
  };

  const getClosestSectionToViewportTop = () => {
    if (state.sections.length === 0) {
      return null;
    }

    const offset =
      getHeaderOffset() + 12;

    let closestSection = null;
    let closestDistance =
      Number.POSITIVE_INFINITY;

    state.sections.forEach((section) => {
      const rect =
        section.getBoundingClientRect();

      const isRelevant =
        rect.bottom > offset &&
        rect.top <
          window.innerHeight * 0.78;

      if (!isRelevant) {
        return;
      }

      const distance =
        Math.abs(rect.top - offset);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSection = section;
      }
    });

    if (closestSection) {
      return closestSection;
    }

    const passedSections =
      state.sections.filter((section) => {
        return (
          section.getBoundingClientRect()
            .top <= offset
        );
      });

    return (
      passedSections[
        passedSections.length - 1
      ] ||
      state.sections[0] ||
      null
    );
  };

  const updateActiveSectionFromScroll = () => {
    state.scrollFrame = null;

    const section =
      getClosestSectionToViewportTop();

    if (!section?.id) {
      return;
    }

    setActiveSection(
      section.id,
      {
        updateHash: false,
        announceChange: false
      }
    );
  };

  const requestScrollUpdate = () => {
    if (state.scrollFrame !== null) {
      return;
    }

    state.scrollFrame =
      window.requestAnimationFrame(
        updateActiveSectionFromScroll
      );
  };

  const initializeIntersectionObserver = () => {
    if (
      !("IntersectionObserver" in window) ||
      state.sections.length === 0
    ) {
      window.addEventListener(
        "scroll",
        requestScrollUpdate,
        {
          passive: true
        }
      );

      window.addEventListener(
        "resize",
        requestScrollUpdate,
        {
          passive: true
        }
      );

      requestScrollUpdate();

      return;
    }

    const visibleSections =
      new Map();

    state.sectionObserver =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              visibleSections.set(
                entry.target.id,
                entry
              );
            } else {
              visibleSections.delete(
                entry.target.id
              );
            }
          });

          const offset =
            getHeaderOffset();

          const candidates = Array.from(
            visibleSections.values()
          ).sort((first, second) => {
            const firstDistance =
              Math.abs(
                first.boundingClientRect.top -
                offset
              );

            const secondDistance =
              Math.abs(
                second.boundingClientRect.top -
                offset
              );

            return (
              firstDistance -
              secondDistance
            );
          });

          const activeEntry =
            candidates[0];

          if (
            activeEntry?.target instanceof
              HTMLElement &&
            activeEntry.target.id
          ) {
            setActiveSection(
              activeEntry.target.id,
              {
                updateHash: false,
                announceChange: false
              }
            );

            return;
          }

          requestScrollUpdate();
        },
        {
          root: null,
          rootMargin:
            "-18% 0px -62% 0px",
          threshold: [
            0,
            0.05,
            0.15,
            0.3,
            0.6
          ]
        }
      );

    state.sections.forEach((section) => {
      state.sectionObserver.observe(
        section
      );
    });

    window.addEventListener(
      "resize",
      requestScrollUpdate,
      {
        passive: true
      }
    );
  };

  const initializeHashState = () => {
    const sectionId =
      normalizeHash(
        window.location.hash
      );

    if (!sectionId) {
      const firstSection =
        state.sections[0];

      if (firstSection?.id) {
        setActiveSection(
          firstSection.id
        );
      }

      return;
    }

    const section =
      getSectionById(sectionId);

    if (!section) {
      return;
    }

    setActiveSection(
      sectionId
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollToSection(
          section,
          {
            updateHash: false,
            focus: false,
            announceChange: false
          }
        );
      });
    });
  };

  const handleHashChange = () => {
    const sectionId =
      normalizeHash(
        window.location.hash
      );

    const section =
      getSectionById(sectionId);

    if (!section) {
      return;
    }

    scrollToSection(
      section,
      {
        updateHash: false,
        focus: true,
        announceChange: true
      }
    );
  };

  const initializeHashHandling = () => {
    window.addEventListener(
      "hashchange",
      handleHashChange
    );

    window.addEventListener(
      "popstate",
      () => {
        const sectionId =
          normalizeHash(
            window.location.hash
          );

        if (!sectionId) {
          return;
        }

        const section =
          getSectionById(sectionId);

        if (!section) {
          return;
        }

        scrollToSection(
          section,
          {
            updateHash: false,
            focus: false,
            announceChange: false
          }
        );
      }
    );
  };

  const initializePrintButtons = () => {
    document
      .querySelectorAll(
        "[data-legal-print]"
      )
      .forEach((button) => {
        if (
          !(button instanceof HTMLElement) ||
          button.dataset.legalPrintReady ===
            "true"
        ) {
          return;
        }

        button.dataset.legalPrintReady =
          "true";

        button.addEventListener(
          "click",
          () => {
            window.print();
          }
        );
      });
  };

  const writeClipboardText = async (
    value
  ) => {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText ===
        "function" &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(
        value
      );

      return true;
    }

    const textArea =
      document.createElement("textarea");

    textArea.value = value;
    textArea.setAttribute(
      "readonly",
      ""
    );

    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";

    document.body.appendChild(
      textArea
    );

    textArea.select();

    let successful = false;

    try {
      successful =
        document.execCommand("copy");
    } catch {
      successful = false;
    }

    textArea.remove();

    return successful;
  };

  const getCopySectionUrl = (
    button
  ) => {
    const explicitTarget =
      button.dataset.copySectionLink ||
      button.dataset.legalCopySection ||
      "";

    const closestSection =
      button.closest(".legal-section");

    const sectionId =
      normalizeHash(explicitTarget) ||
      closestSection?.id ||
      state.activeSectionId;

    const url = new URL(
      window.location.href
    );

    if (sectionId) {
      url.hash = sectionId;
    }

    return url.href;
  };

  const initializeCopyLinkButtons = () => {
    document
      .querySelectorAll(
        "[data-copy-section-link], [data-legal-copy-section]"
      )
      .forEach((button) => {
        if (
          !(button instanceof HTMLElement) ||
          button.dataset.legalCopyReady ===
            "true"
        ) {
          return;
        }

        button.dataset.legalCopyReady =
          "true";

        button.addEventListener(
          "click",
          async () => {
            const url =
              getCopySectionUrl(button);

            try {
              const successful =
                await writeClipboardText(url);

              if (!successful) {
                throw new Error(
                  "Clipboard write failed"
                );
              }

              announce(
                "Section link copied."
              );
            } catch {
              announce(
                "The section link could not be copied.",
                "assertive"
              );
            }
          }
        );
      });
  };

  const initializeBackToTopButtons = () => {
    document
      .querySelectorAll(
        "[data-legal-back-to-top]"
      )
      .forEach((button) => {
        if (
          !(button instanceof HTMLElement) ||
          button.dataset.legalTopReady ===
            "true"
        ) {
          return;
        }

        button.dataset.legalTopReady =
          "true";

        button.addEventListener(
          "click",
          () => {
            window.scrollTo({
              top: 0,
              behavior: prefersReducedMotion()
                ? "auto"
                : "smooth"
            });

            const mainHeading =
              document.querySelector(
                ".legal-hero__title"
              );

            if (
              mainHeading instanceof
              HTMLElement
            ) {
              window.setTimeout(
                () => {
                  const hadTabIndex =
                    mainHeading.hasAttribute(
                      "tabindex"
                    );

                  if (!hadTabIndex) {
                    mainHeading.setAttribute(
                      "tabindex",
                      "-1"
                    );
                  }

                  mainHeading.focus({
                    preventScroll: true
                  });

                  if (!hadTabIndex) {
                    mainHeading.addEventListener(
                      "blur",
                      () => {
                        mainHeading.removeAttribute(
                          "tabindex"
                        );
                      },
                      {
                        once: true
                      }
                    );
                  }
                },
                prefersReducedMotion()
                  ? 0
                  : 450
              );
            }
          }
        );
      });
  };

  const openCookiePreferences = () => {
    if (
      app.siteShell &&
      typeof app.siteShell.openConsentPreferences ===
        "function"
    ) {
      app.siteShell.openConsentPreferences();
      return;
    }

    if (
      app.consent &&
      typeof app.consent.open ===
        "function"
    ) {
      app.consent.open();
      return;
    }

    document.dispatchEvent(
      new CustomEvent(
        "cdl:consent-open",
        {
          detail: {
            source: "legal-page"
          }
        }
      )
    );
  };

  const initializeCookiePreferenceButtons = () => {
    document
      .querySelectorAll(
        [
          "[data-open-cookie-preferences]",
          "[data-open-consent-preferences]",
          "[data-cookie-settings]"
        ].join(",")
      )
      .forEach((button) => {
        if (
          !(button instanceof HTMLElement) ||
          button.dataset.cookieSettingsReady ===
            "true"
        ) {
          return;
        }

        button.dataset.cookieSettingsReady =
          "true";

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            openCookiePreferences();
          }
        );
      });
  };

  const initializeResponsiveTables = () => {
    document
      .querySelectorAll(
        ".legal-section__content table"
      )
      .forEach((table, index) => {
        if (
          !(table instanceof HTMLTableElement)
        ) {
          return;
        }

        table.classList.add(
          "legal-table"
        );

        if (
          table.parentElement?.classList.contains(
            "legal-table-wrap"
          )
        ) {
          return;
        }

        const wrapper =
          document.createElement("div");

        wrapper.className =
          "legal-table-wrap";

        wrapper.tabIndex = 0;
        wrapper.setAttribute(
          "role",
          "region"
        );

        const caption =
          table.querySelector(
            "caption"
          )?.textContent?.trim();

        wrapper.setAttribute(
          "aria-label",
          caption ||
            `Legal information table ${index + 1}`
        );

        table.parentNode?.insertBefore(
          wrapper,
          table
        );

        wrapper.appendChild(table);
      });
  };

  const initializeExternalLinks = () => {
    document
      .querySelectorAll(
        ".legal-section__content a[href]"
      )
      .forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) {
          return;
        }

        let url;

        try {
          url = new URL(
            link.href,
            window.location.href
          );
        } catch {
          return;
        }

        if (
          url.origin ===
          window.location.origin
        ) {
          return;
        }

        link.target = "_blank";

        const relValues = new Set(
          String(link.rel || "")
            .split(/\s+/)
            .filter(Boolean)
        );

        relValues.add("noopener");
        relValues.add("noreferrer");

        link.rel = Array.from(
          relValues
        ).join(" ");

        if (
          !link.getAttribute(
            "aria-label"
          )
        ) {
          const label =
            link.textContent?.trim();

          if (label) {
            link.setAttribute(
              "aria-label",
              `${label} — opens in a new tab`
            );
          }
        }
      });
  };

  const initializeKeyboardNavigation = () => {
    const toc =
      document.querySelector(
        ".legal-toc"
      );

    if (!toc) {
      return;
    }

    toc.addEventListener(
      "keydown",
      (event) => {
        if (
          ![
            "ArrowDown",
            "ArrowUp",
            "Home",
            "End"
          ].includes(event.key)
        ) {
          return;
        }

        const enabledLinks =
          state.tocLinks.filter((link) => {
            return (
              !link.hasAttribute("disabled") &&
              link.getAttribute(
                "aria-disabled"
              ) !== "true"
            );
          });

        if (enabledLinks.length === 0) {
          return;
        }

        const activeElement =
          document.activeElement;

        const currentIndex =
          enabledLinks.indexOf(
            activeElement
          );

        let nextIndex = currentIndex;

        if (event.key === "Home") {
          nextIndex = 0;
        } else if (
          event.key === "End"
        ) {
          nextIndex =
            enabledLinks.length - 1;
        } else if (
          event.key === "ArrowDown"
        ) {
          nextIndex =
            currentIndex < 0
              ? 0
              : (
                  currentIndex + 1
                ) %
                enabledLinks.length;
        } else if (
          event.key === "ArrowUp"
        ) {
          nextIndex =
            currentIndex < 0
              ? enabledLinks.length - 1
              : (
                  currentIndex -
                  1 +
                  enabledLinks.length
                ) %
                enabledLinks.length;
        }

        event.preventDefault();
        enabledLinks[nextIndex]?.focus();
      }
    );
  };

  const refreshDocumentNavigation = () => {
    state.sectionObserver?.disconnect();

    collectSections();
    initializeTocLinks();
    initializeIntersectionObserver();
    initializeHashState();
  };

  const initializeMutationObserver = () => {
    const content =
      document.querySelector(
        ".legal-document__content"
      );

    if (
      !content ||
      !("MutationObserver" in window)
    ) {
      return;
    }

    state.mutationObserver =
      new MutationObserver(
        (mutations) => {
          const hasRelevantChange =
            mutations.some((mutation) => {
              return (
                mutation.type ===
                  "childList" &&
                (
                  mutation.addedNodes.length >
                    0 ||
                  mutation.removedNodes.length >
                    0
                )
              );
            });

          if (!hasRelevantChange) {
            return;
          }

          initializeResponsiveTables();
          initializeExternalLinks();
          initializeCopyLinkButtons();
          refreshDocumentNavigation();
          refreshAOS();
        }
      );

    state.mutationObserver.observe(
      content,
      {
        childList: true,
        subtree: true
      }
    );
  };

  const waitForDocument = () => {
    if (
      document.readyState !== "loading"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      document.addEventListener(
        "DOMContentLoaded",
        resolve,
        {
          once: true
        }
      );
    });
  };

  const waitForSharedApp = () => {
    if (
      app.ready &&
      typeof app.ready.then ===
        "function"
    ) {
      return app.ready;
    }

    return Promise.resolve();
  };

  const completeInitialization = () => {
    if (state.ready) {
      return;
    }

    state.legalKey =
      detectLegalKey();

    collectSections();
    updateLegalSwitcher();
    initializeTocLinks();
    initializeIntersectionObserver();
    initializeHashHandling();
    initializePrintButtons();
    initializeCopyLinkButtons();
    initializeBackToTopButtons();
    initializeCookiePreferenceButtons();
    initializeResponsiveTables();
    initializeExternalLinks();
    initializeKeyboardNavigation();
    initializeHashState();
    initializeMutationObserver();

    state.ready = true;

    document.documentElement.classList.add(
      "cdl-legal-ready"
    );

    if (state.legalKey) {
      document.documentElement.dataset.legalKey =
        state.legalKey;
    }

    document.dispatchEvent(
      new CustomEvent(
        LEGAL_READY_EVENT,
        {
          detail: {
            legalKey:
              state.legalKey,
            sections:
              state.sections.map(
                (section) => section.id
              )
          }
        }
      )
    );

    refreshAOS();
  };

  const init = () => {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    Promise.all([
      waitForDocument(),
      waitForSharedApp()
    ])
      .then(() => {
        completeInitialization();
      })
      .catch(() => {
        completeInitialization();
      });
  };

  app.legal = Object.freeze({
    init,
    refresh:
      refreshDocumentNavigation,
    openCookiePreferences,
    scrollToSection(sectionId) {
      const section =
        getSectionById(
          normalizeHash(sectionId)
        );

      if (!section) {
        return false;
      }

      return scrollToSection(
        section,
        {
          updateHash: true,
          replaceHistory: false,
          focus: true,
          announceChange: true
        }
      );
    },
    get activeSectionId() {
      return state.activeSectionId;
    },
    get legalKey() {
      return state.legalKey;
    },
    get isReady() {
      return state.ready;
    }
  });

  init();
})();
