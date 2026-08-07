(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const SHELL_READY_EVENT = "cdl:shell-ready";
  const MOBILE_BREAKPOINT = 1080;
  const HEADER_SCROLL_THRESHOLD = 24;
  const BACK_TO_TOP_THRESHOLD = 520;

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const state = {
    initialized: false,
    rendered: false,
    menuOpen: false,
    legalAcknowledged: false,
    headerScrollFrame: null,
    backToTopFrame: null,
    focusTrap: null,
    legalResizeObserver: null,
    elements: {
      header: null,
      menuToggle: null,
      mobilePanel: null,
      mobileClose: null,
      footer: null,
      legalConsent: null,
      legalButton: null,
      backToTop: null
    }
  };

  const icons = Object.freeze({
    arrow: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14"></path>
        <path d="m13 6 6 6-6 6"></path>
      </svg>
    `,
    close: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12"></path>
        <path d="M18 6 6 18"></path>
      </svg>
    `,
    up: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5"></path>
        <path d="m6 11 6-6 6 6"></path>
      </svg>
    `
  });

  const isPlainObject = (value) => {
    if (value === null || typeof value !== "object") {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  };

  const getByPath = (source, path, fallback = undefined) => {
    if (
      !source ||
      typeof path !== "string" ||
      path.trim() === ""
    ) {
      return fallback;
    }

    const value = path
      .split(".")
      .filter(Boolean)
      .reduce((current, key) => {
        if (
          current === null ||
          current === undefined ||
          !Object.prototype.hasOwnProperty.call(current, key)
        ) {
          return undefined;
        }

        return current[key];
      }, source);

    return value === undefined ? fallback : value;
  };

  const escapeHTML = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const escapeRegExp = (value) => {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  };

  const slugify = (value) => {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const normalizePathname = (pathname) => {
    let normalized = String(pathname || "/")
      .replace(/\/index\.html?$/i, "/")
      .replace(/\/{2,}/g, "/");

    if (
      normalized.length > 1 &&
      normalized.endsWith("/")
    ) {
      normalized = normalized.slice(0, -1);
    }

    return normalized || "/";
  };

  const formatTemplate = (
    config,
    template,
    extraTokens = {}
  ) => {
    if (typeof template !== "string") {
      return "";
    }

    const configApi = window[APP_NAMESPACE].config;

    if (
      configApi &&
      typeof configApi.format === "function"
    ) {
      return configApi.format(template, extraTokens);
    }

    const tokens = {
      ...config,
      year: String(new Date().getFullYear()),
      ...extraTokens
    };

    return template.replace(
      /\{([a-zA-Z0-9_.-]+)\}/g,
      (match, tokenPath) => {
        const value = getByPath(tokens, tokenPath);

        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return String(value);
        }

        return match;
      }
    );
  };

  const resolveUrl = (path) => {
    if (
      typeof path !== "string" ||
      path.trim() === ""
    ) {
      return "";
    }

    const configApi = window[APP_NAMESPACE].config;

    if (
      configApi &&
      typeof configApi.resolveUrl === "function"
    ) {
      return configApi.resolveUrl(path);
    }

    try {
      return new URL(path, window.location.href).href;
    } catch {
      return path;
    }
  };

  const safeLinkUrl = (url, fallback = "#") => {
    if (
      typeof url !== "string" ||
      url.trim() === ""
    ) {
      return fallback;
    }

    const normalizedUrl = url.trim();

    if (
      normalizedUrl.startsWith("#") ||
      normalizedUrl.startsWith("/") ||
      normalizedUrl.startsWith("./") ||
      normalizedUrl.startsWith("../")
    ) {
      return normalizedUrl;
    }

    try {
      const parsedUrl = new URL(
        normalizedUrl,
        window.location.href
      );

      if (
        ["http:", "https:", "mailto:"].includes(
          parsedUrl.protocol
        )
      ) {
        return parsedUrl.href;
      }
    } catch {
      return fallback;
    }

    return fallback;
  };

  const ensureSkipLink = () => {
    if (document.querySelector(".cdl-skip-link")) {
      return;
    }

    const main = document.querySelector("main");

    if (!main) {
      return;
    }

    if (!main.id) {
      main.id = "main-content";
    }

    const skipLink = document.createElement("a");

    skipLink.className = "cdl-skip-link";
    skipLink.href = `#${main.id}`;
    skipLink.textContent = "Skip to main content";

    document.body.prepend(skipLink);
  };

  const getCurrentNavigationKey = (config) => {
    const explicitKey = document.body?.dataset.navKey;

    if (
      explicitKey &&
      Object.prototype.hasOwnProperty.call(
        config.navigationLinks,
        explicitKey
      )
    ) {
      return explicitKey;
    }

    const pathname = normalizePathname(
      window.location.pathname
    );

    if (pathname === "/") {
      return "start";
    }

    if (pathname.includes("/contact")) {
      return "connect";
    }

    if (pathname.includes("/services/job-placement")) {
      return "careerSupport";
    }

    if (pathname.includes("/services/")) {
      return "cdlPaths";
    }

    return "";
  };

  const createNavigationItems = (
    config,
    {
      mobile = false
    } = {}
  ) => {
    const navigationOrder = [
      "start",
      "whyTrainWithUs",
      "cdlPaths",
      "careerSupport",
      "studentStories",
      "connect"
    ];

    const currentKey =
      getCurrentNavigationKey(config);

    return navigationOrder
      .map((key) => {
        const label =
          config.navigationLabels[key];
        const link =
          config.navigationLinks[key];

        if (
          typeof label !== "string" ||
          typeof link !== "string"
        ) {
          return "";
        }

        const isCurrent = key === currentKey;
        const itemClass = mobile
          ? "cdl-mobile-nav__item"
          : "cdl-primary-nav__item";
        const linkClass = mobile
          ? "cdl-mobile-nav__link"
          : "cdl-primary-nav__link";

        return `
          <li class="${itemClass}">
            <a
              class="${linkClass}${isCurrent ? " is-current" : ""}"
              href="${escapeHTML(safeLinkUrl(link))}"
              data-nav-key="${escapeHTML(key)}"
              ${isCurrent ? 'aria-current="page"' : ""}
            >
              ${escapeHTML(label)}
            </a>
          </li>
        `;
      })
      .join("");
  };

  const createBrandMarkup = (
    config,
    {
      footer = false
    } = {}
  ) => {
    const iconPath = resolveUrl(
      config.logoIconPath
    );

    return `
      <a
        class="cdl-brand${footer ? " cdl-footer__brand" : ""}"
        href="${escapeHTML(
          safeLinkUrl(config.navigationLinks.start || "/")
        )}"
        aria-label="${escapeHTML(
          `${config.logoText} home`
        )}"
      >
        <img
          class="cdl-brand__icon"
          src="${escapeHTML(iconPath)}"
          width="58"
          height="44"
          alt="${escapeHTML(config.logoAlt)}"
          decoding="async"
        >
        <span
          class="cdl-brand__text"
          data-config-text="logoText"
        >
          ${escapeHTML(config.logoText)}
        </span>
      </a>
    `;
  };

  const createHeaderMarkup = (config) => {
    const requestLabel =
      config.ctaLabels.requestInfo ||
      "Request Program Info";
    const requestUrl =
      config.navigationLinks.connect ||
      "/contact/";

    return `
      <header
        class="cdl-site-header"
        data-site-header
        data-cdl-shell-component="header"
      >
        <div class="cdl-header__shell">
          <div class="cdl-header__brand">
            ${createBrandMarkup(config)}
          </div>

          <nav
            class="cdl-primary-nav"
            aria-label="Primary navigation"
          >
            <ul class="cdl-primary-nav__list">
              ${createNavigationItems(config)}
            </ul>
          </nav>

          <div class="cdl-header__actions">
            <a
              class="cdl-btn cdl-btn--accent cdl-btn--cut cdl-btn--small cdl-header__request"
              href="${escapeHTML(safeLinkUrl(requestUrl))}"
            >
              <span class="cdl-btn__label">
                ${escapeHTML(requestLabel)}
              </span>
            </a>

            <button
              class="cdl-mobile-toggle"
              type="button"
              aria-label="Open navigation menu"
              aria-expanded="false"
              aria-controls="cdl-mobile-panel"
              data-mobile-menu-toggle
            >
              <span
                class="cdl-mobile-toggle__lines"
                aria-hidden="true"
              >
                <span class="cdl-mobile-toggle__line"></span>
                <span class="cdl-mobile-toggle__line"></span>
                <span class="cdl-mobile-toggle__line"></span>
              </span>
            </button>
          </div>
        </div>

        <div
          class="cdl-mobile-panel"
          id="cdl-mobile-panel"
          aria-hidden="true"
          inert
          data-mobile-menu-panel
        >
          <div class="cdl-mobile-panel__inner">
            <div class="cdl-mobile-panel__brand">
              ${createBrandMarkup(config)}

              <button
                class="cdl-mobile-panel__close"
                type="button"
                aria-label="Close navigation menu"
                data-mobile-menu-close
              >
                ${icons.close}
              </button>
            </div>

            <nav
              class="cdl-mobile-nav"
              aria-label="Mobile navigation"
            >
              <ul class="cdl-mobile-nav__list">
                ${createNavigationItems(config, {
                  mobile: true
                })}
              </ul>
            </nav>

            <div class="cdl-mobile-panel__cta">
              <a
                class="cdl-btn cdl-btn--accent cdl-btn--cut cdl-btn--full"
                href="${escapeHTML(safeLinkUrl(requestUrl))}"
              >
                <span class="cdl-btn__label">
                  ${escapeHTML(requestLabel)}
                </span>
                <span
                  class="cdl-btn__icon"
                  aria-hidden="true"
                >
                  ${icons.arrow}
                </span>
              </a>
            </div>

            <div class="cdl-mobile-panel__meta">
              <span>Program inquiries by email</span>
              <a
                class="cdl-mobile-panel__email"
                href="mailto:${escapeHTML(config.corporateEmail)}"
                data-config-text="corporateEmail"
              >
                ${escapeHTML(config.corporateEmail)}
              </a>
            </div>
          </div>
        </div>
      </header>
    `;
  };

  const createFooterLinkList = (items) => {
    return items
      .map((item) => {
        if (
          !item ||
          typeof item.label !== "string" ||
          typeof item.url !== "string"
        ) {
          return "";
        }

        return `
          <li>
            <a
              class="cdl-footer__link"
              href="${escapeHTML(safeLinkUrl(item.url))}"
            >
              ${escapeHTML(item.label)}
            </a>
          </li>
        `;
      })
      .join("");
  };

  const getFooterQuickLinks = (config) => {
    const keys =
      config.footerLinks.quickLinkKeys || [];

    return keys
      .map((key) => {
        const label =
          config.navigationLabels[key];
        const url =
          config.navigationLinks[key];

        if (!label || !url) {
          return null;
        }

        return {
          label,
          url
        };
      })
      .filter(Boolean);
  };

  const getFooterProgramLinks = (config) => {
    const keys =
      config.footerLinks.programLinkKeys || [];

    return keys
      .map((key) => {
        const service =
          config.servicePages[key];

        if (!service) {
          return null;
        }

        return {
          label: service.label,
          url: service.url
        };
      })
      .filter(Boolean);
  };

  const createFooterMarkup = (config) => {
    const quickLinks =
      getFooterQuickLinks(config);
    const programLinks =
      getFooterProgramLinks(config);
    const supportLinks =
      Array.isArray(config.footerLinks.supportLinks)
        ? config.footerLinks.supportLinks
        : [];
    const legalLinks =
      Array.isArray(config.legalLinks)
        ? config.legalLinks
        : [];
    const copyright = formatTemplate(
      config,
      config.copyrightText
    );

    return `
      <footer
        class="cdl-site-footer"
        data-site-footer
        data-cdl-shell-component="footer"
      >
        <div class="cdl-container">
          <div class="cdl-footer__main">
            <div class="cdl-footer__brand-column">
              ${createBrandMarkup(config, {
                footer: true
              })}

              <p
                class="cdl-footer__description"
                data-config-text="footerDescription"
              >
                ${escapeHTML(config.footerDescription)}
              </p>

              <a
                class="cdl-footer__email"
                href="mailto:${escapeHTML(config.corporateEmail)}"
                data-config-text="corporateEmail"
              >
                ${escapeHTML(config.corporateEmail)}
              </a>

              <p
                class="cdl-footer__address"
                data-config-text="companyAddress"
              >
                ${escapeHTML(config.companyAddress)}
              </p>
            </div>

            <div class="cdl-footer__column">
              <h2 class="cdl-footer__heading">
                Explore
              </h2>

              <ul class="cdl-footer__links">
                ${createFooterLinkList(quickLinks)}
              </ul>
            </div>

            <div class="cdl-footer__column">
              <h2 class="cdl-footer__heading">
                CDL Programs
              </h2>

              <ul class="cdl-footer__links">
                ${createFooterLinkList(programLinks)}
              </ul>
            </div>

            <div class="cdl-footer__column">
              <h2 class="cdl-footer__heading">
                Support
              </h2>

              <ul class="cdl-footer__links">
                ${createFooterLinkList(supportLinks)}
              </ul>
            </div>
          </div>
        </div>

        <div class="cdl-footer__bottom">
          <div class="cdl-container cdl-footer__bottom-inner">
            <p
              class="cdl-footer__copyright"
              data-config-template="copyrightText"
            >
              ${escapeHTML(copyright)}
            </p>

            <ul
              class="cdl-footer__legal"
              aria-label="Legal pages"
            >
              ${legalLinks
                .map((link) => {
                  return `
                    <li>
                      <a
                        class="cdl-footer__legal-link"
                        href="${escapeHTML(
                          safeLinkUrl(link.url)
                        )}"
                      >
                        ${escapeHTML(link.label)}
                      </a>
                    </li>
                  `;
                })
                .join("")}
            </ul>
          </div>
        </div>
      </footer>
    `;
  };

  const linkifyLegalText = (config) => {
    let output = escapeHTML(
      config.legalBanner.text
    );

    const legalLinks =
      Array.isArray(config.legalLinks)
        ? config.legalLinks
        : [];

    legalLinks.forEach((link) => {
      if (
        typeof link.label !== "string" ||
        typeof link.url !== "string"
      ) {
        return;
      }

      const escapedLabel = escapeHTML(link.label);
      const pattern = new RegExp(
        escapeRegExp(escapedLabel),
        "g"
      );

      output = output.replace(
        pattern,
        `<a class="cdl-legal-consent__link" href="${escapeHTML(
          safeLinkUrl(link.url)
        )}">${escapedLabel}</a>`
      );
    });

    return output;
  };

  const createLegalConsentMarkup = (config) => {
    return `
      <aside
        class="cdl-legal-consent"
        aria-label="Legal information acknowledgement"
        data-legal-consent
        data-cdl-shell-component="legal-consent"
      >
        <div class="cdl-legal-consent__inner">
          <p class="cdl-legal-consent__text">
            ${linkifyLegalText(config)}
          </p>

          <button
            class="cdl-btn cdl-btn--accent cdl-btn--small cdl-legal-consent__button"
            type="button"
            data-legal-consent-button
          >
            <span class="cdl-btn__label">
              ${escapeHTML(
                config.legalBanner.buttonLabel
              )}
            </span>
          </button>
        </div>
      </aside>
    `;
  };

  const createBackToTopMarkup = () => {
    return `
      <button
        class="cdl-back-to-top"
        type="button"
        aria-label="Back to top"
        data-back-to-top
      >
        <span
          class="cdl-back-to-top__label"
          aria-hidden="true"
        >
          Back to top
        </span>
        ${icons.up}
      </button>
    `;
  };

  const replaceShellPlaceholder = (
    selector,
    markup,
    fallbackPosition
  ) => {
    const template = document.createElement("template");

    template.innerHTML = markup.trim();

    const component =
      template.content.firstElementChild;

    if (!component) {
      return null;
    }

    const placeholder =
      document.querySelector(selector);

    if (placeholder) {
      placeholder.replaceWith(component);
      return component;
    }

    const main = document.querySelector("main");

    if (
      fallbackPosition === "before-main" &&
      main
    ) {
      main.before(component);
      return component;
    }

    if (
      fallbackPosition === "after-main" &&
      main
    ) {
      main.after(component);
      return component;
    }

    document.body.appendChild(component);

    return component;
  };

  const renderHeader = (config) => {
    const existingHeader = document.querySelector(
      '[data-site-header][data-cdl-shell-component="header"]'
    );

    if (existingHeader) {
      return existingHeader;
    }

    return replaceShellPlaceholder(
      "[data-site-header]",
      createHeaderMarkup(config),
      "before-main"
    );
  };

  const renderFooter = (config) => {
    const existingFooter = document.querySelector(
      '[data-site-footer][data-cdl-shell-component="footer"]'
    );

    if (existingFooter) {
      return existingFooter;
    }

    return replaceShellPlaceholder(
      "[data-site-footer]",
      createFooterMarkup(config),
      "after-main"
    );
  };

  const renderLegalConsent = (config) => {
    const existingConsent = document.querySelector(
      '[data-legal-consent][data-cdl-shell-component="legal-consent"]'
    );

    if (existingConsent) {
      return existingConsent;
    }

    return replaceShellPlaceholder(
      "[data-legal-consent]",
      createLegalConsentMarkup(config),
      "append"
    );
  };

  const renderBackToTop = () => {
    const existingButton =
      document.querySelector("[data-back-to-top]");

    if (existingButton) {
      return existingButton;
    }

    const template = document.createElement("template");

    template.innerHTML =
      createBackToTopMarkup().trim();

    const button =
      template.content.firstElementChild;

    if (!button) {
      return null;
    }

    document.body.appendChild(button);

    return button;
  };

  const populateSelectOptions = (
    select,
    options
  ) => {
    if (
      !(select instanceof HTMLSelectElement) ||
      !Array.isArray(options)
    ) {
      return;
    }

    const fragment =
      document.createDocumentFragment();

    options.forEach((item, index) => {
      const option =
        document.createElement("option");

      if (isPlainObject(item)) {
        const label =
          item.label ?? item.value ?? "";
        const value =
          item.value ?? slugify(label);

        option.value = String(value);
        option.textContent = String(label);

        if (item.disabled === true) {
          option.disabled = true;
        }

        if (item.selected === true) {
          option.selected = true;
        }
      } else {
        const label = String(item);

        option.value =
          index === 0 && /select/i.test(label)
            ? ""
            : slugify(label);
        option.textContent = label;
      }

      fragment.appendChild(option);
    });

    select.replaceChildren(fragment);
  };

  const hydrateConfigBindings = (
    root = document,
    config = window.SITE_CONFIG
  ) => {
    if (!root || !config) {
      return;
    }

    root
      .querySelectorAll("[data-config-text]")
      .forEach((element) => {
        const path =
          element.dataset.configText;
        const value =
          getByPath(config, path);

        if (
          typeof value === "string" ||
          typeof value === "number"
        ) {
          element.textContent = String(value);
        }

        element.dataset.configPending = "false";
      });

    root
      .querySelectorAll("[data-config-template]")
      .forEach((element) => {
        const path =
          element.dataset.configTemplate;
        const template =
          getByPath(config, path);

        if (typeof template === "string") {
          element.textContent = formatTemplate(
            config,
            template
          );
        }

        element.dataset.configPending = "false";
      });

    root
      .querySelectorAll("[data-config-link]")
      .forEach((element) => {
        const path =
          element.dataset.configLink;
        const value =
          getByPath(config, path);

        if (
          element instanceof HTMLAnchorElement &&
          typeof value === "string"
        ) {
          element.href = safeLinkUrl(value);
        }

        element.dataset.configPending = "false";
      });

    root
      .querySelectorAll("[data-config-mailto]")
      .forEach((element) => {
        const path =
          element.dataset.configMailto;
        const value =
          getByPath(config, path);

        if (
          element instanceof HTMLAnchorElement &&
          typeof value === "string"
        ) {
          element.href = `mailto:${value}`;
        }

        element.dataset.configPending = "false";
      });

    root
      .querySelectorAll("[data-config-src]")
      .forEach((element) => {
        const path =
          element.dataset.configSrc;
        const value =
          getByPath(config, path);

        if (
          (
            element instanceof HTMLImageElement ||
            element instanceof HTMLSourceElement
          ) &&
          typeof value === "string"
        ) {
          element.src = resolveUrl(value);
        }

        element.dataset.configPending = "false";
      });

    root
      .querySelectorAll("[data-config-alt]")
      .forEach((element) => {
        const path =
          element.dataset.configAlt;
        const value =
          getByPath(config, path);

        if (
          element instanceof HTMLImageElement &&
          typeof value === "string"
        ) {
          element.alt = value;
        }

        element.dataset.configPending = "false";
      });

    root
      .querySelectorAll("[data-config-options]")
      .forEach((element) => {
        const path =
          element.dataset.configOptions;
        const value =
          getByPath(config, path);

        populateSelectOptions(element, value);
        element.dataset.configPending = "false";
      });
  };

  const setMetaContent = (
    selector,
    attributeName,
    attributeValue,
    content
  ) => {
    if (
      typeof content !== "string" ||
      content.trim() === ""
    ) {
      return;
    }

    let element = document.querySelector(selector);

    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(
        attributeName,
        attributeValue
      );
      document.head.appendChild(element);
    }

    element.setAttribute("content", content);
  };

  const setCanonicalUrl = (url) => {
    if (!url) {
      return;
    }

    let canonical = document.querySelector(
      'link[rel="canonical"]'
    );

    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }

    canonical.href = url;
  };

  const createAbsoluteConfiguredUrl = (
    config,
    path
  ) => {
    if (
      typeof path !== "string" ||
      path.trim() === ""
    ) {
      return "";
    }

    try {
      return new URL(
        path,
        `${config.canonicalDomain.replace(/\/+$/, "")}/`
      ).href;
    } catch {
      return "";
    }
  };

  const applyOrganizationSchema = (config) => {
    const schemaConfig =
      config.organizationSchema;

    if (!isPlainObject(schemaConfig)) {
      return;
    }

    const enabledSocialLinks =
      Array.isArray(config.socialLinks)
        ? config.socialLinks
            .filter((item) => {
              return (
                item &&
                item.enabled === true &&
                typeof item.url === "string" &&
                item.url.trim() !== ""
              );
            })
            .map((item) => item.url)
        : [];

    const schema = {
      "@context": "https://schema.org",
      "@type":
        schemaConfig.type ||
        "EducationalOrganization",
      name: config.companyName,
      url: config.siteUrl,
      logo: createAbsoluteConfiguredUrl(
        config,
        config.logoIconPath
      ),
      email: config.corporateEmail,
      description: config.footerDescription,
      address: config.companyAddress,
      areaServed:
        schemaConfig.areaServed || "United States"
    };

    if (enabledSocialLinks.length > 0) {
      schema.sameAs = enabledSocialLinks;
    }

    let script = document.getElementById(
      "cdl-organization-schema"
    );

    if (!script) {
      script = document.createElement("script");
      script.id = "cdl-organization-schema";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(schema);
  };

  const applySeoMetadata = (config) => {
    const seoKey =
      document.body?.dataset.seoKey || "home";
    const pageTitle =
      document.body?.dataset.pageTitle || "";
    const titleTemplate =
      config.seoTitleTemplates?.[seoKey] ||
      config.seoTitleTemplates?.default ||
      "{pageTitle} | {siteName}";
    const title = formatTemplate(
      config,
      titleTemplate,
      {
        pageTitle
      }
    );
    const description =
      config.seoDescriptionTemplates?.[seoKey] ||
      "";
    const seoPage =
      config.seoPages?.[seoKey] || {};
    const canonicalUrl =
      createAbsoluteConfiguredUrl(
        config,
        seoPage.canonicalPath ||
          window.location.pathname
      );
    const ogImage =
      createAbsoluteConfiguredUrl(
        config,
        seoPage.ogImage ||
          config.defaultOgImage
      );
    const language =
      String(config.locale || "en-US")
        .split("-")[0]
        .toLowerCase();
    const ogLocale =
      String(config.locale || "en-US")
        .replace("-", "_");

    document.documentElement.lang =
      language || "en";
    document.title = title;

    setMetaContent(
      'meta[name="description"]',
      "name",
      "description",
      description
    );

    setMetaContent(
      'meta[property="og:title"]',
      "property",
      "og:title",
      title
    );

    setMetaContent(
      'meta[property="og:description"]',
      "property",
      "og:description",
      description
    );

    setMetaContent(
      'meta[property="og:type"]',
      "property",
      "og:type",
      "website"
    );

    setMetaContent(
      'meta[property="og:url"]',
      "property",
      "og:url",
      canonicalUrl
    );

    setMetaContent(
      'meta[property="og:image"]',
      "property",
      "og:image",
      ogImage
    );

    setMetaContent(
      'meta[property="og:locale"]',
      "property",
      "og:locale",
      ogLocale
    );

    setMetaContent(
      'meta[name="twitter:card"]',
      "name",
      "twitter:card",
      "summary_large_image"
    );

    setMetaContent(
      'meta[name="twitter:title"]',
      "name",
      "twitter:title",
      title
    );

    setMetaContent(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      description
    );

    setMetaContent(
      'meta[name="twitter:image"]',
      "name",
      "twitter:image",
      ogImage
    );

    setCanonicalUrl(canonicalUrl);
    applyOrganizationSchema(config);
  };

  const getAccessibilityApi = () => {
    return window[APP_NAMESPACE].accessibility || null;
  };

  const announce = (
    message,
    priority = "polite"
  ) => {
    const accessibility =
      getAccessibilityApi();

    if (
      accessibility &&
      typeof accessibility.announce === "function"
    ) {
      accessibility.announce(message, {
        priority
      });
    }
  };

  const createMenuFocusTrap = () => {
    const accessibility =
      getAccessibilityApi();

    if (
      !accessibility ||
      typeof accessibility.createFocusTrap !==
        "function" ||
      !state.elements.mobilePanel
    ) {
      return null;
    }

    return accessibility.createFocusTrap(
      state.elements.mobilePanel,
      {
        initialFocus:
          state.elements.mobileClose,
        returnFocus: true,
        escapeDeactivates: true,
        onEscape: () => {
          closeMobileMenu();
        }
      }
    );
  };

  const syncPageScrollLock = () => {
    document.body.classList.toggle(
      "is-menu-open",
      Boolean(state.menuOpen)
    );
  };

  const openMobileMenu = () => {
    const {
      menuToggle,
      mobilePanel
    } = state.elements;

    if (
      state.menuOpen ||
      !menuToggle ||
      !mobilePanel
    ) {
      return;
    }

    state.menuOpen = true;

    menuToggle.setAttribute(
      "aria-expanded",
      "true"
    );
    menuToggle.setAttribute(
      "aria-label",
      "Close navigation menu"
    );

    mobilePanel.removeAttribute("inert");
    mobilePanel.setAttribute(
      "aria-hidden",
      "false"
    );
    mobilePanel.classList.add("is-open");
    syncPageScrollLock();

    if (!state.focusTrap) {
      state.focusTrap =
        createMenuFocusTrap();
    }

    if (state.focusTrap) {
      state.focusTrap.activate();
    } else if (state.elements.mobileClose) {
      state.elements.mobileClose.focus();
    }

    announce("Navigation menu opened.");
  };

  const closeMobileMenu = ({
    restoreFocus = true
  } = {}) => {
    const {
      menuToggle,
      mobilePanel
    } = state.elements;

    if (
      !state.menuOpen ||
      !menuToggle ||
      !mobilePanel
    ) {
      state.menuOpen = false;
      syncPageScrollLock();
      return;
    }

    state.menuOpen = false;

    menuToggle.setAttribute(
      "aria-expanded",
      "false"
    );
    menuToggle.setAttribute(
      "aria-label",
      "Open navigation menu"
    );

    mobilePanel.classList.remove("is-open");
    mobilePanel.setAttribute(
      "aria-hidden",
      "true"
    );
    mobilePanel.setAttribute("inert", "");
    syncPageScrollLock();

    if (state.focusTrap) {
      state.focusTrap.deactivate({
        restoreFocus
      });
    } else if (restoreFocus) {
      menuToggle.focus();
    }

    announce("Navigation menu closed.");
  };

  const toggleMobileMenu = () => {
    if (state.menuOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  };

  const handleDocumentClick = (event) => {
    if (!state.menuOpen) {
      return;
    }

    const {
      mobilePanel,
      menuToggle
    } = state.elements;

    if (
      mobilePanel?.contains(event.target) ||
      menuToggle?.contains(event.target)
    ) {
      return;
    }

    closeMobileMenu();
  };

  const handleMobileLinkClick = (event) => {
    const link = event.target.closest(
      ".cdl-mobile-nav__link, .cdl-mobile-panel__cta a"
    );

    if (!link) {
      return;
    }

    closeMobileMenu({
      restoreFocus: false
    });
  };

  const handleWindowResize = () => {
    if (
      window.innerWidth > MOBILE_BREAKPOINT &&
      state.menuOpen
    ) {
      closeMobileMenu({
        restoreFocus: false
      });
    }

    syncPageScrollLock();
    updateBackToTopOffset();
  };

  const updateHeaderState = () => {
    state.headerScrollFrame = null;

    if (!state.elements.header) {
      return;
    }

    state.elements.header.classList.toggle(
      "is-scrolled",
      window.scrollY > HEADER_SCROLL_THRESHOLD
    );
  };

  const requestHeaderStateUpdate = () => {
    if (state.headerScrollFrame !== null) {
      return;
    }

    state.headerScrollFrame =
      window.requestAnimationFrame(
        updateHeaderState
      );
  };

  const updateBackToTopState = () => {
    state.backToTopFrame = null;

    if (!state.elements.backToTop) {
      return;
    }

    state.elements.backToTop.classList.toggle(
      "is-visible",
      window.scrollY > BACK_TO_TOP_THRESHOLD
    );
  };

  const requestBackToTopStateUpdate = () => {
    if (state.backToTopFrame !== null) {
      return;
    }

    state.backToTopFrame =
      window.requestAnimationFrame(
        updateBackToTopState
      );
  };

  const handleWindowScroll = () => {
    requestHeaderStateUpdate();
    requestBackToTopStateUpdate();
  };

  const scrollBackToTop = () => {
    const accessibility =
      getAccessibilityApi();
    const reducedMotion =
      accessibility &&
      typeof accessibility.prefersReducedMotion ===
        "function"
        ? accessibility.prefersReducedMotion()
        : window.matchMedia(
            "(prefers-reduced-motion: reduce)"
          ).matches;

    window.scrollTo({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth"
    });

    const main = document.querySelector("main");

    if (
      main &&
      accessibility &&
      typeof accessibility.focusElement ===
        "function"
    ) {
      window.setTimeout(
        () => {
          accessibility.focusElement(main, {
            preventScroll: true
          });
        },
        reducedMotion ? 0 : 450
      );
    }
  };

  const readLegalConsent = (storageKey) => {
    try {
      return (
        window.localStorage.getItem(storageKey) ===
        "true"
      );
    } catch {
      return state.legalAcknowledged;
    }
  };

  const storeLegalConsent = (storageKey) => {
    state.legalAcknowledged = true;

    try {
      window.localStorage.setItem(
        storageKey,
        "true"
      );
    } catch {
      return false;
    }

    return true;
  };

  const updateBackToTopOffset = () => {
    const {
      legalConsent,
      backToTop
    } = state.elements;

    if (!backToTop) {
      return;
    }

    if (
      legalConsent &&
      legalConsent.classList.contains(
        "is-visible"
      )
    ) {
      const legalHeight = Math.ceil(
        legalConsent.getBoundingClientRect().height
      );

      backToTop.style.bottom =
        `${legalHeight + 28}px`;
      return;
    }

    backToTop.style.removeProperty("bottom");
  };

  const showLegalConsent = (config) => {
    const consent =
      state.elements.legalConsent;

    if (!consent) {
      return;
    }

    const storageKey =
      config.legalBanner.storageKey;

    if (readLegalConsent(storageKey)) {
      consent.classList.remove("is-visible");
      consent.hidden = true;
      updateBackToTopOffset();
      return;
    }

    consent.hidden = false;

    window.requestAnimationFrame(() => {
      consent.classList.add("is-visible");
      updateBackToTopOffset();
    });

    if (
      "ResizeObserver" in window &&
      !state.legalResizeObserver
    ) {
      state.legalResizeObserver =
        new ResizeObserver(() => {
          updateBackToTopOffset();
        });

      state.legalResizeObserver.observe(
        consent
      );
    }
  };

  const acknowledgeLegalConsent = (config) => {
    const consent =
      state.elements.legalConsent;

    if (!consent) {
      return;
    }

    storeLegalConsent(
      config.legalBanner.storageKey
    );

    consent.classList.remove("is-visible");

    window.setTimeout(() => {
      consent.hidden = true;
      updateBackToTopOffset();
    }, 280);

    announce(
      "Legal information acknowledgement saved."
    );
  };

  const clearLegalConsent = () => {
    const config = window.SITE_CONFIG;

    if (!config?.legalBanner?.storageKey) {
      return false;
    }

    state.legalAcknowledged = false;

    try {
      window.localStorage.removeItem(
        config.legalBanner.storageKey
      );
    } catch {
      return false;
    }

    showLegalConsent(config);

    return true;
  };

  const cacheElements = () => {
    state.elements.header =
      document.querySelector(
        '[data-cdl-shell-component="header"]'
      );

    state.elements.menuToggle =
      document.querySelector(
        "[data-mobile-menu-toggle]"
      );

    state.elements.mobilePanel =
      document.querySelector(
        "[data-mobile-menu-panel]"
      );

    state.elements.mobileClose =
      document.querySelector(
        "[data-mobile-menu-close]"
      );

    state.elements.footer =
      document.querySelector(
        '[data-cdl-shell-component="footer"]'
      );

    state.elements.legalConsent =
      document.querySelector(
        '[data-cdl-shell-component="legal-consent"]'
      );

    state.elements.legalButton =
      document.querySelector(
        "[data-legal-consent-button]"
      );

    state.elements.backToTop =
      document.querySelector(
        "[data-back-to-top]"
      );
  };

  const bindEvents = (config) => {
    state.elements.menuToggle?.addEventListener(
      "click",
      toggleMobileMenu
    );

    state.elements.mobileClose?.addEventListener(
      "click",
      () => {
        closeMobileMenu();
      }
    );

    state.elements.mobilePanel?.addEventListener(
      "click",
      handleMobileLinkClick
    );

    state.elements.legalButton?.addEventListener(
      "click",
      () => {
        acknowledgeLegalConsent(config);
      }
    );

    state.elements.backToTop?.addEventListener(
      "click",
      scrollBackToTop
    );

    document.addEventListener(
      "click",
      handleDocumentClick
    );

    window.addEventListener(
      "resize",
      handleWindowResize,
      {
        passive: true
      }
    );

    window.addEventListener(
      "scroll",
      handleWindowScroll,
      {
        passive: true
      }
    );

    window.addEventListener(
      "pageshow",
      syncPageScrollLock
    );
  };

  const render = (config) => {
    if (state.rendered) {
      return;
    }

    ensureSkipLink();
    renderHeader(config);
    renderFooter(config);
    renderLegalConsent(config);
    renderBackToTop();

    cacheElements();
    hydrateConfigBindings(document, config);
    applySeoMetadata(config);
    syncPageScrollLock();
    bindEvents(config);
    showLegalConsent(config);
    updateHeaderState();
    updateBackToTopState();

    state.rendered = true;

    document.dispatchEvent(
      new CustomEvent(SHELL_READY_EVENT, {
        detail: {
          config,
          header: state.elements.header,
          footer: state.elements.footer
        }
      })
    );
  };

  const showConfigError = () => {
    let errorBanner = document.querySelector(
      "[data-config-error]"
    );

    if (!errorBanner) {
      errorBanner =
        document.createElement("div");
      errorBanner.className =
        "cdl-config-error";
      errorBanner.dataset.configError = "";
      errorBanner.setAttribute("role", "alert");

      document.body.prepend(errorBanner);
    }

    errorBanner.textContent =
      "The site configuration could not be loaded. Please refresh the page or contact the site administrator.";

    errorBanner.classList.add("is-visible");
  };

  const initializeAccessibility = () => {
    const accessibility =
      getAccessibilityApi();

    if (
      accessibility &&
      typeof accessibility.init === "function"
    ) {
      accessibility.init();
    }
  };

  const initializeWithConfig = () => {
    const configApi =
      window[APP_NAMESPACE].config;

    if (
      !configApi ||
      !configApi.ready
    ) {
      showConfigError();
      return;
    }

    configApi.ready
      .then((config) => {
        initializeAccessibility();
        render(config);
      })
      .catch(() => {
        showConfigError();
      });
  };

  const init = () => {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        initializeWithConfig,
        {
          once: true
        }
      );
      return;
    }

    initializeWithConfig();
  };

  window[APP_NAMESPACE].siteShell =
    Object.freeze({
      init,
      render,
      openMobileMenu,
      closeMobileMenu,
      hydrateConfigBindings,
      applySeoMetadata,
      clearLegalConsent,
      get isRendered() {
        return state.rendered;
      },
      get isMenuOpen() {
        return state.menuOpen;
      }
    });

  init();
})();
