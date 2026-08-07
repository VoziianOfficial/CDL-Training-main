(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const APP_READY_EVENT = "cdl:app-ready";
  const SHELL_READY_EVENT = "cdl:shell-ready";
  const TABLET_BREAKPOINT = 900;

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const app = window[APP_NAMESPACE];

  const state = {
    initialized: false,
    ready: false,
    aosInitialized: false,
    tabs: new WeakSet(),
    accordions: new WeakSet(),
    counters: new WeakSet(),
    parallaxItems: new Map(),
    counterObserver: null,
    parallaxFrame: null,
    resizeFrame: null,
    reducedMotionMedia: window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    )
  };

  const sliderInstances = new Map();

  const clamp = (value, minimum, maximum) => {
    return Math.min(
      Math.max(Number(value), minimum),
      maximum
    );
  };

  const isHTMLElement = (value) => {
    return value instanceof HTMLElement;
  };

  const isElementVisible = (element) => {
    if (!isHTMLElement(element)) {
      return false;
    }

    if (
      element.hidden ||
      element.closest("[hidden]") ||
      element.closest('[aria-hidden="true"]')
    ) {
      return false;
    }

    const styles = window.getComputedStyle(element);

    return (
      styles.display !== "none" &&
      styles.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  };

  const prefersReducedMotion = () => {
    return state.reducedMotionMedia.matches;
  };

  const getAccessibilityApi = () => {
    return app.accessibility || null;
  };

  const announce = (
    message,
    priority = "polite"
  ) => {
    const accessibility = getAccessibilityApi();

    if (
      accessibility &&
      typeof accessibility.announce === "function"
    ) {
      accessibility.announce(message, {
        priority
      });
    }
  };

  const createId = (prefix = "cdl-component") => {
    const randomPart = Math.random()
      .toString(36)
      .slice(2, 9);

    return `${prefix}-${Date.now()}-${randomPart}`;
  };

  const getTargetFromControl = (
    control,
    attributeName
  ) => {
    const targetValue = control.getAttribute(
      attributeName
    );

    if (!targetValue) {
      return null;
    }

    const normalizedTarget = targetValue.startsWith("#")
      ? targetValue.slice(1)
      : targetValue;

    return document.getElementById(normalizedTarget);
  };

  const setCurrentYear = (root = document) => {
    root
      .querySelectorAll("[data-current-year]")
      .forEach((element) => {
        element.textContent = String(
          new Date().getFullYear()
        );
      });
  };

  const initializeAOS = () => {
    if (
      state.aosInitialized ||
      document.documentElement.dataset
        .cdlAosInitialized === "true"
    ) {
      return;
    }

    if (
      !window.AOS ||
      typeof window.AOS.init !== "function"
    ) {
      return;
    }

    state.aosInitialized = true;
    document.documentElement.dataset.cdlAosInitialized =
      "true";

    window.AOS.init({
      once: true,
      mirror: false,
      offset: 72,
      duration: prefersReducedMotion() ? 1 : 680,
      delay: 0,
      easing: "ease-out-cubic",
      anchorPlacement: "top-bottom",
      disableMutationObserver: false
    });
  };

  const refreshAOS = () => {
    if (
      !state.aosInitialized ||
      !window.AOS
    ) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (
        typeof window.AOS.refreshHard === "function"
      ) {
        window.AOS.refreshHard();
        return;
      }

      if (typeof window.AOS.refresh === "function") {
        window.AOS.refresh();
      }
    });
  };

  const getTabsFromContainer = (container) => {
    const tabList =
      container.querySelector('[role="tablist"]') ||
      container.querySelector(".cdl-tabs__list");

    const tabs = Array.from(
      container.querySelectorAll(
        '[role="tab"], [data-tab-target]'
      )
    );

    const panels = Array.from(
      container.querySelectorAll(
        '[role="tabpanel"], [data-tab-panel]'
      )
    );

    return {
      tabList,
      tabs,
      panels
    };
  };

  const resolveTabPanel = (
    tab,
    container,
    panels
  ) => {
    const controlledId =
      tab.getAttribute("aria-controls");

    if (controlledId) {
      const controlledPanel =
        document.getElementById(controlledId);

      if (
        controlledPanel &&
        container.contains(controlledPanel)
      ) {
        return controlledPanel;
      }
    }

    const targetPanel = getTargetFromControl(
      tab,
      "data-tab-target"
    );

    if (
      targetPanel &&
      container.contains(targetPanel)
    ) {
      return targetPanel;
    }

    const tabIndex = Array.from(
      container.querySelectorAll(
        '[role="tab"], [data-tab-target]'
      )
    ).indexOf(tab);

    return panels[tabIndex] || null;
  };

  const activateTab = (
    container,
    selectedTab,
    {
      focus = false,
      announceChange = false
    } = {}
  ) => {
    const {
      tabs,
      panels
    } = getTabsFromContainer(container);

    if (
      !tabs.includes(selectedTab) ||
      selectedTab.disabled
    ) {
      return;
    }

    tabs.forEach((tab) => {
      const panel = resolveTabPanel(
        tab,
        container,
        panels
      );

      const isSelected = tab === selectedTab;

      tab.setAttribute(
        "aria-selected",
        String(isSelected)
      );

      tab.setAttribute(
        "tabindex",
        isSelected ? "0" : "-1"
      );

      tab.classList.toggle(
        "is-active",
        isSelected
      );

      if (panel) {
        panel.hidden = !isSelected;
        panel.classList.toggle(
          "is-active",
          isSelected
        );

        panel.setAttribute(
          "aria-hidden",
          String(!isSelected)
        );
      }
    });

    if (focus) {
      selectedTab.focus({
        preventScroll: true
      });
    }

    if (announceChange) {
      announce(
        `${selectedTab.textContent.trim()} tab selected.`
      );
    }

    container.dispatchEvent(
      new CustomEvent("cdl:tab-change", {
        bubbles: true,
        detail: {
          tab: selectedTab,
          panel: resolveTabPanel(
            selectedTab,
            container,
            panels
          )
        }
      })
    );

    refreshAOS();
  };

  const handleTabsClick = (
    event,
    container
  ) => {
    const tab = event.target.closest(
      '[role="tab"], [data-tab-target]'
    );

    if (
      !tab ||
      !container.contains(tab)
    ) {
      return;
    }

    event.preventDefault();

    activateTab(container, tab, {
      focus: false,
      announceChange: true
    });
  };

  const handleTabsKeyboard = (
    event,
    container
  ) => {
    const currentTab = event.target.closest(
      '[role="tab"], [data-tab-target]'
    );

    if (!currentTab) {
      return;
    }

    const {
      tabs
    } = getTabsFromContainer(container);

    const enabledTabs = tabs.filter(
      (tab) => !tab.disabled
    );

    const currentIndex =
      enabledTabs.indexOf(currentTab);

    if (currentIndex < 0) {
      return;
    }

    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex =
          (currentIndex + 1) %
          enabledTabs.length;
        break;

      case "ArrowLeft":
      case "ArrowUp":
        nextIndex =
          (
            currentIndex -
            1 +
            enabledTabs.length
          ) % enabledTabs.length;
        break;

      case "Home":
        nextIndex = 0;
        break;

      case "End":
        nextIndex = enabledTabs.length - 1;
        break;

      case "Enter":
      case " ":
        event.preventDefault();

        activateTab(container, currentTab, {
          focus: true,
          announceChange: true
        });

        return;

      default:
        return;
    }

    event.preventDefault();

    activateTab(
      container,
      enabledTabs[nextIndex],
      {
        focus: true,
        announceChange: true
      }
    );
  };

  const initializeTabs = (root = document) => {
    root
      .querySelectorAll(
        "[data-cdl-tabs], .cdl-tabs"
      )
      .forEach((container) => {
        if (
          !isHTMLElement(container) ||
          state.tabs.has(container)
        ) {
          return;
        }

        const {
          tabList,
          tabs,
          panels
        } = getTabsFromContainer(container);

        if (
          tabs.length === 0 ||
          panels.length === 0
        ) {
          return;
        }

        if (tabList) {
          tabList.setAttribute(
            "role",
            "tablist"
          );
        }

        tabs.forEach((tab, index) => {
          let panel = resolveTabPanel(
            tab,
            container,
            panels
          );

          if (!tab.id) {
            tab.id = createId("cdl-tab");
          }

          tab.setAttribute("role", "tab");

          if (!panel) {
            panel = panels[index] || null;
          }

          if (panel) {
            if (!panel.id) {
              panel.id = createId(
                "cdl-tab-panel"
              );
            }

            tab.setAttribute(
              "aria-controls",
              panel.id
            );

            panel.setAttribute(
              "role",
              "tabpanel"
            );

            panel.setAttribute(
              "aria-labelledby",
              tab.id
            );

            if (!panel.hasAttribute("tabindex")) {
              panel.setAttribute(
                "tabindex",
                "0"
              );
            }
          }
        });

        const initiallySelected =
          tabs.find((tab) => {
            return (
              tab.getAttribute(
                "aria-selected"
              ) === "true" ||
              tab.classList.contains(
                "is-active"
              )
            );
          }) || tabs[0];

        activateTab(
          container,
          initiallySelected
        );

        container.addEventListener(
          "click",
          (event) => {
            handleTabsClick(event, container);
          }
        );

        container.addEventListener(
          "keydown",
          (event) => {
            handleTabsKeyboard(
              event,
              container
            );
          }
        );

        state.tabs.add(container);
      });
  };

  const getAccordionItems = (accordion) => {
    return Array.from(
      accordion.querySelectorAll(
        ".cdl-faq__item, [data-accordion-item]"
      )
    );
  };

  const getAccordionParts = (item) => {
    const trigger = item.querySelector(
      ".cdl-faq__question, [data-accordion-trigger]"
    );

    let panel = item.querySelector(
      ".cdl-faq__answer, [data-accordion-panel]"
    );

    if (
      trigger &&
      !panel &&
      trigger.getAttribute("aria-controls")
    ) {
      panel = document.getElementById(
        trigger.getAttribute("aria-controls")
      );
    }

    return {
      trigger,
      panel
    };
  };

  const setAccordionItemState = (
    item,
    isOpen,
    {
      focus = false,
      emitEvent = true
    } = {}
  ) => {
    const {
      trigger,
      panel
    } = getAccordionParts(item);

    if (!trigger || !panel) {
      return;
    }

    trigger.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

    trigger.classList.toggle(
      "is-active",
      isOpen
    );

    item.classList.toggle(
      "is-open",
      isOpen
    );

    panel.classList.toggle(
      "is-open",
      isOpen
    );

    panel.setAttribute(
      "aria-hidden",
      String(!isOpen)
    );

    if (focus) {
      trigger.focus({
        preventScroll: true
      });
    }

    if (emitEvent) {
      item.dispatchEvent(
        new CustomEvent(
          isOpen
            ? "cdl:accordion-open"
            : "cdl:accordion-close",
          {
            bubbles: true,
            detail: {
              trigger,
              panel
            }
          }
        )
      );
    }
  };

  const closeSiblingAccordionItems = (
    accordion,
    activeItem
  ) => {
    const allowMultiple =
      accordion.dataset.allowMultiple ===
      "true";

    if (allowMultiple) {
      return;
    }

    getAccordionItems(accordion).forEach(
      (item) => {
        if (item !== activeItem) {
          setAccordionItemState(
            item,
            false
          );
        }
      }
    );
  };

  const toggleAccordionItem = (
    accordion,
    item
  ) => {
    const {
      trigger
    } = getAccordionParts(item);

    if (!trigger) {
      return;
    }

    const willOpen =
      trigger.getAttribute("aria-expanded") !==
      "true";

    if (willOpen) {
      closeSiblingAccordionItems(
        accordion,
        item
      );
    }

    setAccordionItemState(
      item,
      willOpen
    );

    refreshAOS();
  };

  const initializeAccordionItem = (
    item,
    index
  ) => {
    const {
      trigger,
      panel
    } = getAccordionParts(item);

    if (!trigger || !panel) {
      return false;
    }

    if (!trigger.id) {
      trigger.id = createId(
        `cdl-accordion-trigger-${index + 1}`
      );
    }

    if (!panel.id) {
      panel.id = createId(
        `cdl-accordion-panel-${index + 1}`
      );
    }

    trigger.setAttribute(
      "aria-controls",
      panel.id
    );

    panel.setAttribute(
      "aria-labelledby",
      trigger.id
    );

    const initiallyOpen =
      trigger.getAttribute("aria-expanded") ===
        "true" ||
      item.classList.contains("is-open") ||
      panel.classList.contains("is-open");

    setAccordionItemState(
      item,
      initiallyOpen,
      {
        emitEvent: false
      }
    );

    return true;
  };

  const handleAccordionKeyboard = (
    event,
    accordion
  ) => {
    const trigger = event.target.closest(
      ".cdl-faq__question, [data-accordion-trigger]"
    );

    if (!trigger) {
      return;
    }

    const triggers = getAccordionItems(
      accordion
    )
      .map((item) => {
        return getAccordionParts(item).trigger;
      })
      .filter(Boolean);

    const currentIndex =
      triggers.indexOf(trigger);

    if (currentIndex < 0) {
      return;
    }

    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowDown":
        nextIndex =
          (currentIndex + 1) %
          triggers.length;
        break;

      case "ArrowUp":
        nextIndex =
          (
            currentIndex -
            1 +
            triggers.length
          ) % triggers.length;
        break;

      case "Home":
        nextIndex = 0;
        break;

      case "End":
        nextIndex = triggers.length - 1;
        break;

      default:
        return;
    }

    event.preventDefault();

    triggers[nextIndex].focus({
      preventScroll: true
    });
  };

  const initializeAccordions = (
    root = document
  ) => {
    root
      .querySelectorAll(
        "[data-cdl-accordion], .cdl-faq"
      )
      .forEach((accordion) => {
        if (
          !isHTMLElement(accordion) ||
          state.accordions.has(accordion)
        ) {
          return;
        }

        const items =
          getAccordionItems(accordion);

        const validItems = items.filter(
          (item, index) => {
            return initializeAccordionItem(
              item,
              index
            );
          }
        );

        if (validItems.length === 0) {
          return;
        }

        if (
          accordion.dataset.allowMultiple !==
          "true"
        ) {
          let openItemFound = false;

          validItems.forEach((item) => {
            const {
              trigger
            } = getAccordionParts(item);

            const isOpen =
              trigger?.getAttribute(
                "aria-expanded"
              ) === "true";

            if (isOpen && !openItemFound) {
              openItemFound = true;
              return;
            }

            if (isOpen) {
              setAccordionItemState(
                item,
                false,
                {
                  emitEvent: false
                }
              );
            }
          });
        }

        accordion.addEventListener(
          "click",
          (event) => {
            const trigger =
              event.target.closest(
                ".cdl-faq__question, [data-accordion-trigger]"
              );

            if (
              !trigger ||
              !accordion.contains(trigger)
            ) {
              return;
            }

            const item = trigger.closest(
              ".cdl-faq__item, [data-accordion-item]"
            );

            if (!item) {
              return;
            }

            event.preventDefault();

            toggleAccordionItem(
              accordion,
              item
            );
          }
        );

        accordion.addEventListener(
          "keydown",
          (event) => {
            handleAccordionKeyboard(
              event,
              accordion
            );
          }
        );

        state.accordions.add(accordion);
      });
  };

  const formatCounterValue = (
    value,
    decimals,
    locale
  ) => {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  };

  const animateCounter = (element) => {
    const target = Number(
      element.dataset.countTo
    );

    if (!Number.isFinite(target)) {
      return;
    }

    const configLocale =
      window.SITE_CONFIG?.locale || "en-US";

    const startValue = Number(
      element.dataset.countFrom || 0
    );

    const duration = clamp(
      Number(
        element.dataset.countDuration || 1400
      ),
      100,
      5000
    );

    const decimals = clamp(
      Number(
        element.dataset.countDecimals || 0
      ),
      0,
      4
    );

    const prefix =
      element.dataset.countPrefix || "";

    const suffix =
      element.dataset.countSuffix || "";

    if (prefersReducedMotion()) {
      element.textContent =
        `${prefix}${formatCounterValue(
          target,
          decimals,
          configLocale
        )}${suffix}`;

      return;
    }

    const startTime = performance.now();

    const update = (currentTime) => {
      const elapsed = currentTime - startTime;

      const progress = clamp(
        elapsed / duration,
        0,
        1
      );

      const easedProgress =
        1 - Math.pow(1 - progress, 3);

      const currentValue =
        startValue +
        (target - startValue) *
          easedProgress;

      element.textContent =
        `${prefix}${formatCounterValue(
          currentValue,
          decimals,
          configLocale
        )}${suffix}`;

      if (progress < 1) {
        window.requestAnimationFrame(update);
      }
    };

    window.requestAnimationFrame(update);
  };

  const createCounterObserver = () => {
    if (
      state.counterObserver ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    state.counterObserver =
      new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            animateCounter(entry.target);
            observer.unobserve(entry.target);
          });
        },
        {
          threshold: 0.35
        }
      );
  };

  const initializeCounters = (
    root = document
  ) => {
    createCounterObserver();

    root
      .querySelectorAll("[data-count-to]")
      .forEach((element) => {
        if (
          !isHTMLElement(element) ||
          state.counters.has(element)
        ) {
          return;
        }

        state.counters.add(element);

        if (state.counterObserver) {
          state.counterObserver.observe(
            element
          );
        } else {
          animateCounter(element);
        }
      });
  };

  const resolveParallaxTarget = (
    container
  ) => {
    const innerLayer =
      container.querySelector(
        "[data-parallax-layer]"
      );

    if (innerLayer) {
      return innerLayer;
    }

    if (container.hasAttribute("data-aos")) {
      return null;
    }

    return container;
  };

  const initializeParallax = (
    root = document
  ) => {
    root
      .querySelectorAll("[data-parallax]")
      .forEach((container) => {
        if (
          !isHTMLElement(container) ||
          state.parallaxItems.has(container)
        ) {
          return;
        }

        const target =
          resolveParallaxTarget(container);

        if (!target) {
          return;
        }

        const speed = clamp(
          Number(
            container.dataset.parallaxSpeed ||
              0.12
          ),
          -0.35,
          0.35
        );

        state.parallaxItems.set(
          container,
          {
            target,
            speed
          }
        );
      });

    requestParallaxUpdate();
  };

  const resetParallax = () => {
    state.parallaxItems.forEach(
      ({ target }) => {
        target.style.removeProperty(
          "transform"
        );
      }
    );
  };

  const updateParallax = () => {
    state.parallaxFrame = null;

    if (
      prefersReducedMotion() ||
      window.innerWidth <=
        TABLET_BREAKPOINT
    ) {
      resetParallax();
      return;
    }

    const viewportHeight =
      window.innerHeight;

    state.parallaxItems.forEach(
      ({ target, speed }, container) => {
        if (!isElementVisible(container)) {
          return;
        }

        const rect =
          container.getBoundingClientRect();

        if (
          rect.bottom < 0 ||
          rect.top > viewportHeight
        ) {
          return;
        }

        const elementCenter =
          rect.top + rect.height / 2;

        const viewportCenter =
          viewportHeight / 2;

        const distance =
          elementCenter - viewportCenter;

        const offset = clamp(
          distance * speed * -0.22,
          -48,
          48
        );

        target.style.transform =
          `translate3d(0, ${offset.toFixed(
            2
          )}px, 0)`;
      }
    );
  };

  const requestParallaxUpdate = () => {
    if (state.parallaxFrame !== null) {
      return;
    }

    state.parallaxFrame =
      window.requestAnimationFrame(
        updateParallax
      );
  };

  const handleScroll = () => {
    requestParallaxUpdate();
  };

  const handleResize = () => {
    if (state.resizeFrame !== null) {
      return;
    }

    state.resizeFrame =
      window.requestAnimationFrame(() => {
        state.resizeFrame = null;

        requestParallaxUpdate();
        refreshAOS();
      });
  };

  const handleReducedMotionChange = () => {
    document.documentElement.classList.toggle(
      "cdl-reduced-motion",
      prefersReducedMotion()
    );

    if (prefersReducedMotion()) {
      resetParallax();
    } else {
      requestParallaxUpdate();
    }

    refreshAOS();
  };

  const initializeReducedMotionListener = () => {
    document.documentElement.classList.toggle(
      "cdl-reduced-motion",
      prefersReducedMotion()
    );

    if (
      typeof state.reducedMotionMedia
        .addEventListener === "function"
    ) {
      state.reducedMotionMedia.addEventListener(
        "change",
        handleReducedMotionChange
      );
      return;
    }

    state.reducedMotionMedia.addListener(
      handleReducedMotionChange
    );
  };

  const registerSlider = (
    name,
    instance
  ) => {
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      !instance
    ) {
      return false;
    }

    const normalizedName = name.trim();

    if (sliderInstances.has(normalizedName)) {
      return false;
    }

    sliderInstances.set(
      normalizedName,
      instance
    );

    return true;
  };

  const replaceSlider = (
    name,
    instance
  ) => {
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      !instance
    ) {
      return false;
    }

    const normalizedName = name.trim();
    const existingInstance =
      sliderInstances.get(normalizedName);

    if (
      existingInstance &&
      existingInstance !== instance &&
      typeof existingInstance.destroy ===
        "function"
    ) {
      existingInstance.destroy(
        true,
        true
      );
    }

    sliderInstances.set(
      normalizedName,
      instance
    );

    return true;
  };

  const getSlider = (name) => {
    return sliderInstances.get(name) || null;
  };

  const hasSlider = (name) => {
    return sliderInstances.has(name);
  };

  const destroySlider = (name) => {
    const instance =
      sliderInstances.get(name);

    if (!instance) {
      return false;
    }

    if (
      typeof instance.destroy === "function"
    ) {
      instance.destroy(true, true);
    }

    sliderInstances.delete(name);

    return true;
  };

  const destroyAllSliders = () => {
    Array.from(
      sliderInstances.keys()
    ).forEach((name) => {
      destroySlider(name);
    });
  };

  const initializeSharedComponents = (
    root = document
  ) => {
    setCurrentYear(root);
    initializeTabs(root);
    initializeAccordions(root);
    initializeCounters(root);
    initializeParallax(root);
    initializeAOS();
    refreshAOS();
  };

  const refresh = (root = document) => {
    initializeSharedComponents(root);

    if (
      app.forms &&
      typeof app.forms.init === "function"
    ) {
      app.forms.init(root);
    }
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

  const waitForConfig = () => {
    if (app.config?.ready) {
      return app.config.ready;
    }

    if (window.SITE_CONFIG) {
      return Promise.resolve(
        window.SITE_CONFIG
      );
    }

    return Promise.resolve(null);
  };

  const completeInitialization = (
    config
  ) => {
    if (state.ready) {
      return config;
    }

    initializeReducedMotionListener();
    initializeSharedComponents(document);

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true
      }
    );

    window.addEventListener(
      "resize",
      handleResize,
      {
        passive: true
      }
    );

    document.addEventListener(
      SHELL_READY_EVENT,
      () => {
        refresh(document);
      }
    );

    state.ready = true;
    document.documentElement.classList.add(
      "cdl-app-ready"
    );

    document.dispatchEvent(
      new CustomEvent(APP_READY_EVENT, {
        detail: {
          config
        }
      })
    );

    return config;
  };

  const init = () => {
    if (state.initialized) {
      return app.ready;
    }

    state.initialized = true;
    document.documentElement.classList.add(
      "cdl-js"
    );

    app.ready = Promise.all([
      waitForDocument(),
      waitForConfig()
    ])
      .then(([, config]) => {
        return completeInitialization(
          config
        );
      })
      .catch(() => {
        return completeInitialization(
          window.SITE_CONFIG || null
        );
      });

    return app.ready;
  };

  app.sliders = Object.freeze({
    register: registerSlider,
    replace: replaceSlider,
    get: getSlider,
    has: hasSlider,
    destroy: destroySlider,
    destroyAll: destroyAllSliders,
    names() {
      return Array.from(
        sliderInstances.keys()
      );
    },
    get size() {
      return sliderInstances.size;
    }
  });

  app.animations = Object.freeze({
    initAOS: initializeAOS,
    refreshAOS,
    initializeCounters,
    initializeParallax,
    requestParallaxUpdate,
    prefersReducedMotion
  });

  app.ui = Object.freeze({
    initializeTabs,
    initializeAccordions,
    activateTab,
    setAccordionItemState,
    refresh
  });

  app.utils = Object.freeze({
    clamp,
    createId,
    isElementVisible,
    prefersReducedMotion,
    announce
  });

  app.app = Object.freeze({
    init,
    refresh,
    get isReady() {
      return state.ready;
    }
  });

  init();
})();
