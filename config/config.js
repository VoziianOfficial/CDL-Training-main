(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const CONFIG_READY_EVENT = "cdl:config-ready";
  const CONFIG_ERROR_EVENT = "cdl:config-error";

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const state = {
    value: null,
    error: null
  };

  const isPlainObject = (value) => {
    if (value === null || typeof value !== "object") {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  };

  const getByPath = (source, path, fallback = undefined) => {
    if (!source || typeof path !== "string" || path.trim() === "") {
      return fallback;
    }

    const result = path
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

    return result === undefined ? fallback : result;
  };

  const deepFreeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach((property) => {
      deepFreeze(value[property]);
    });

    return Object.freeze(value);
  };

  const assertSafeObjectKeys = (value, currentPath = "config") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        assertSafeObjectKeys(item, `${currentPath}[${index}]`);
      });

      return;
    }

    if (!isPlainObject(value)) {
      return;
    }

    Object.keys(value).forEach((key) => {
      if (
        key === "__proto__" ||
        key === "prototype" ||
        key === "constructor"
      ) {
        throw new Error(`Unsafe config key found at ${currentPath}.${key}.`);
      }

      assertSafeObjectKeys(value[key], `${currentPath}.${key}`);
    });
  };

  const assertRequiredString = (config, path) => {
    const value = getByPath(config, path);

    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Missing or invalid config value: ${path}.`);
    }
  };

  const assertRequiredObject = (config, path) => {
    const value = getByPath(config, path);

    if (!isPlainObject(value)) {
      throw new Error(`Missing or invalid config object: ${path}.`);
    }
  };

  const assertRequiredArray = (config, path, minimumLength = 1) => {
    const value = getByPath(config, path);

    if (!Array.isArray(value) || value.length < minimumLength) {
      throw new Error(`Missing or invalid config array: ${path}.`);
    }
  };

  const validateEmail = (email) => {
    const emailPattern =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    return emailPattern.test(email);
  };

  const validateUrl = (url, fieldName) => {
    try {
      const parsedUrl = new URL(url);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error();
      }
    } catch {
      throw new Error(`Invalid URL in config value: ${fieldName}.`);
    }
  };

  const validateNoPhoneData = (value, currentPath = "config") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        validateNoPhoneData(item, `${currentPath}[${index}]`);
      });

      return;
    }

    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, item]) => {
        if (/phone|telephone/i.test(key)) {
          throw new Error(`Phone-related config key is not allowed: ${currentPath}.${key}.`);
        }

        validateNoPhoneData(item, `${currentPath}.${key}`);
      });

      return;
    }

    if (typeof value === "string" && /^\s*tel:/i.test(value)) {
      throw new Error(`Telephone links are not allowed at ${currentPath}.`);
    }
  };

  const validateNavigation = (config) => {
    const labels = config.navigationLabels;
    const links = config.navigationLinks;
    const requiredNavigationKeys = [
      "start",
      "whyTrainWithUs",
      "cdlPaths",
      "careerSupport",
      "studentStories",
      "connect"
    ];

    requiredNavigationKeys.forEach((key) => {
      if (
        typeof labels[key] !== "string" ||
        labels[key].trim() === "" ||
        typeof links[key] !== "string" ||
        links[key].trim() === ""
      ) {
        throw new Error(`Missing navigation configuration for: ${key}.`);
      }
    });
  };

  const validateServicePages = (config) => {
    const requiredServiceKeys = [
      "classA",
      "classB",
      "behindTheWheel",
      "jobPlacement",
      "financialAid",
      "companySponsorships"
    ];

    requiredServiceKeys.forEach((key) => {
      const service = config.servicePages[key];

      if (!isPlainObject(service)) {
        throw new Error(`Missing service configuration: ${key}.`);
      }

      ["label", "url", "formType"].forEach((property) => {
        if (
          typeof service[property] !== "string" ||
          service[property].trim() === ""
        ) {
          throw new Error(
            `Missing service configuration value: servicePages.${key}.${property}.`
          );
        }
      });
    });
  };

  const validateHeroSlides = (config) => {
    if (config.heroSlides.length !== 3) {
      throw new Error("The main hero must contain exactly three slides.");
    }

    config.heroSlides.forEach((slide, index) => {
      if (!isPlainObject(slide)) {
        throw new Error(`Invalid hero slide at index ${index}.`);
      }

      [
        "id",
        "eyebrow",
        "title",
        "text",
        "ctaLabel",
        "ctaLink",
        "image",
        "imageAlt"
      ].forEach((property) => {
        if (
          typeof slide[property] !== "string" ||
          slide[property].trim() === ""
        ) {
          throw new Error(
            `Missing hero slide value: heroSlides[${index}].${property}.`
          );
        }
      });
    });
  };

  const validateForms = (config) => {
    const { forms } = config;

    if (!Array.isArray(forms.allowedFormTypes) || !forms.allowedFormTypes.length) {
      throw new Error("The forms.allowedFormTypes array cannot be empty.");
    }

    const uniqueFormTypes = new Set();

    forms.allowedFormTypes.forEach((formType) => {
      if (typeof formType !== "string" || formType.trim() === "") {
        throw new Error("Every allowed form type must be a non-empty string.");
      }

      if (uniqueFormTypes.has(formType)) {
        throw new Error(`Duplicate form type found: ${formType}.`);
      }

      uniqueFormTypes.add(formType);
    });

    Object.values(config.servicePages).forEach((service) => {
      if (!uniqueFormTypes.has(service.formType)) {
        throw new Error(
          `Service form type is not allowed: ${service.formType}.`
        );
      }
    });
  };

  const validateConfig = (config) => {
    if (!isPlainObject(config)) {
      throw new Error("The site config root must be a JSON object.");
    }

    assertSafeObjectKeys(config);
    validateNoPhoneData(config);

    [
      "version",
      "environment",
      "locale",
      "siteName",
      "shortBrandName",
      "companyName",
      "logoText",
      "logoIconPath",
      "logoAlt",
      "siteUrl",
      "canonicalDomain",
      "corporateEmail",
      "companyAddress",
      "copyrightText",
      "footerDescription",
      "successMessage",
      "forms.action",
      "forms.method",
      "forms.honeypotField",
      "legalBanner.storageKey",
      "legalBanner.text",
      "legalBanner.buttonLabel"
    ].forEach((path) => {
      assertRequiredString(config, path);
    });

    [
      "navigationLabels",
      "navigationLinks",
      "ctaLabels",
      "servicePages",
      "contactFormHeadings",
      "forms",
      "advertiseCollaborate",
      "legalBanner",
      "footerLinks",
      "seoTitleTemplates",
      "seoDescriptionTemplates",
      "seoPages",
      "organizationSchema",
      "disclaimers"
    ].forEach((path) => {
      assertRequiredObject(config, path);
    });

    [
      ["heroSlides", 3],
      ["companyStatistics", 1],
      ["programOptions", 1],
      ["trainingFormatOptions", 1],
      ["preferredStartOptions", 1],
      ["legalLinks", 3],
      ["forms.allowedFormTypes", 1]
    ].forEach(([path, minimumLength]) => {
      assertRequiredArray(config, path, minimumLength);
    });

    if (!validateEmail(config.corporateEmail)) {
      throw new Error("The corporateEmail config value is invalid.");
    }

    validateUrl(config.siteUrl, "siteUrl");
    validateUrl(config.canonicalDomain, "canonicalDomain");
    validateNavigation(config);
    validateServicePages(config);
    validateHeroSlides(config);
    validateForms(config);

    return config;
  };

  const findConfigScript = () => {
    if (
      document.currentScript &&
      document.currentScript.src
    ) {
      return document.currentScript;
    }

    return Array.from(document.scripts)
      .reverse()
      .find((script) => {
        return /\/config\/config\.js(?:[?#].*)?$/.test(script.src);
      }) || null;
  };

  const getConfigUrl = () => {
    const configScript = findConfigScript();

    if (configScript?.src) {
      return new URL("./site-config.json", configScript.src).href;
    }

    return new URL("/config/site-config.json", window.location.href).href;
  };

  const getSiteBaseUrl = () => {
    const configScript = findConfigScript();

    if (configScript?.src) {
      return new URL("../", configScript.src).href;
    }

    return window.location.origin !== "null"
      ? `${window.location.origin}/`
      : new URL("./", window.location.href).href;
  };

  const loadConfig = async () => {
    const response = await fetch(getConfigUrl(), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-cache",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Unable to load site config. HTTP status: ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("The site config response is not valid JSON content.");
    }

    const config = await response.json();
    const validatedConfig = validateConfig(config);

    return deepFreeze(validatedConfig);
  };

  const format = (template, extraTokens = {}) => {
    if (typeof template !== "string") {
      return "";
    }

    const config = state.value || {};
    const tokens = {
      ...config,
      year: String(new Date().getFullYear()),
      ...extraTokens
    };

    return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, tokenPath) => {
      const value = getByPath(tokens, tokenPath);

      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return String(value);
      }

      return match;
    });
  };

  const resolveUrl = (path, options = {}) => {
    if (typeof path !== "string" || path.trim() === "") {
      return "";
    }

    const normalizedPath = path.trim();

    if (
      /^(?:https?:|mailto:|data:|blob:)/i.test(normalizedPath) ||
      normalizedPath.startsWith("#")
    ) {
      return normalizedPath;
    }

    const useConfiguredDomain = options.useConfiguredDomain === true;
    const configuredBase = state.value?.siteUrl;
    const baseUrl = useConfiguredDomain && configuredBase
      ? `${configuredBase.replace(/\/+$/, "")}/`
      : normalizedPath.startsWith("/")
        ? getSiteBaseUrl()
        : window.location.href;
    const urlPath = normalizedPath.startsWith("/")
      ? normalizedPath.replace(/^\/+/, "")
      : normalizedPath;

    try {
      return new URL(urlPath, baseUrl).href;
    } catch {
      return normalizedPath;
    }
  };

  const ready = loadConfig()
    .then((config) => {
      state.value = config;
      window.SITE_CONFIG = config;

      document.dispatchEvent(
        new CustomEvent(CONFIG_READY_EVENT, {
          detail: {
            config
          }
        })
      );

      return config;
    })
    .catch((error) => {
      state.error =
        error instanceof Error
          ? error
          : new Error("An unknown site config error occurred.");

      window.SITE_CONFIG = null;

      document.dispatchEvent(
        new CustomEvent(CONFIG_ERROR_EVENT, {
          detail: {
            error: state.error
          }
        })
      );

      throw state.error;
    });

  void ready.catch(() => undefined);

  const configApi = {
    ready,
    get(path, fallback = undefined) {
      return getByPath(state.value, path, fallback);
    },
    has(path) {
      return getByPath(state.value, path) !== undefined;
    },
    format,
    resolveUrl,
    getConfigUrl,
    whenReady(callback) {
      if (typeof callback !== "function") {
        return ready;
      }

      return ready.then((config) => callback(config));
    }
  };

  Object.defineProperties(configApi, {
    value: {
      enumerable: true,
      get() {
        return state.value;
      }
    },
    error: {
      enumerable: true,
      get() {
        return state.error;
      }
    },
    isReady: {
      enumerable: true,
      get() {
        return state.value !== null;
      }
    }
  });

  window[APP_NAMESPACE].config = Object.freeze(configApi);
})();
