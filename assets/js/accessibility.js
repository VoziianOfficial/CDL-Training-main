(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const LIVE_REGION_ID = "cdl-accessibility-live-region";
  const ALERT_REGION_ID = "cdl-accessibility-alert-region";

  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "iframe",
    "object",
    "embed",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const state = {
    initialized: false,
    announcementTimers: new Map(),
    reducedMotionMedia: window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    )
  };

  const isElement = (value) => value instanceof Element;

  const isHTMLElement = (value) => value instanceof HTMLElement;

  const isVisible = (element) => {
    if (!isHTMLElement(element)) {
      return false;
    }

    if (
      element.hidden ||
      element.closest("[hidden]") ||
      element.closest('[aria-hidden="true"]') ||
      element.closest("[inert]")
    ) {
      return false;
    }

    const styles = window.getComputedStyle(element);

    if (
      styles.display === "none" ||
      styles.visibility === "hidden" ||
      styles.visibility === "collapse"
    ) {
      return false;
    }

    return element.getClientRects().length > 0;
  };

  const isFocusable = (element) => {
    if (!isHTMLElement(element) || !isVisible(element)) {
      return false;
    }

    if (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true"
    ) {
      return false;
    }

    const tabIndexAttribute = element.getAttribute("tabindex");

    if (tabIndexAttribute !== null && Number(tabIndexAttribute) < 0) {
      return false;
    }

    return element.matches(FOCUSABLE_SELECTOR);
  };

  const getFocusableElements = (container = document) => {
    if (
      !(container instanceof Document) &&
      !(container instanceof DocumentFragment) &&
      !isElement(container)
    ) {
      return [];
    }

    return Array.from(
      container.querySelectorAll(FOCUSABLE_SELECTOR)
    ).filter(isFocusable);
  };

  const resolveElement = (target, context = document) => {
    if (isHTMLElement(target)) {
      return target;
    }

    if (
      typeof target !== "string" ||
      target.trim() === "" ||
      !context?.querySelector
    ) {
      return null;
    }

    try {
      const element = context.querySelector(target);

      return isHTMLElement(element) ? element : null;
    } catch {
      return null;
    }
  };

  const focusElement = (
    target,
    {
      preventScroll = false,
      temporaryTabIndex = true
    } = {}
  ) => {
    const element = resolveElement(target);

    if (!element || !isVisible(element)) {
      return false;
    }

    const hadTabIndex = element.hasAttribute("tabindex");
    const originalTabIndex = element.getAttribute("tabindex");
    let addedTemporaryTabIndex = false;

    if (
      temporaryTabIndex &&
      !element.matches(FOCUSABLE_SELECTOR)
    ) {
      element.setAttribute("tabindex", "-1");
      addedTemporaryTabIndex = true;
    }

    try {
      element.focus({
        preventScroll
      });
    } catch {
      element.focus();
    }

    if (addedTemporaryTabIndex) {
      const removeTemporaryTabIndex = () => {
        if (document.activeElement === element) {
          return;
        }

        if (hadTabIndex) {
          element.setAttribute("tabindex", originalTabIndex ?? "");
        } else {
          element.removeAttribute("tabindex");
        }

        element.removeEventListener(
          "blur",
          removeTemporaryTabIndex
        );
      };

      element.addEventListener(
        "blur",
        removeTemporaryTabIndex
      );
    }

    return document.activeElement === element;
  };

  const createLiveRegion = ({
    id,
    politeness,
    role
  }) => {
    const existingRegion = document.getElementById(id);

    if (existingRegion) {
      return existingRegion;
    }

    const region = document.createElement("div");

    region.id = id;
    region.className = "cdl-visually-hidden";
    region.setAttribute("aria-live", politeness);
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("role", role);

    document.body.appendChild(region);

    return region;
  };

  const ensureLiveRegions = () => {
    if (!document.body) {
      return {
        polite: null,
        assertive: null
      };
    }

    return {
      polite: createLiveRegion({
        id: LIVE_REGION_ID,
        politeness: "polite",
        role: "status"
      }),
      assertive: createLiveRegion({
        id: ALERT_REGION_ID,
        politeness: "assertive",
        role: "alert"
      })
    };
  };

  const announce = (
    message,
    {
      priority = "polite",
      clearAfter = 5000
    } = {}
  ) => {
    if (typeof message !== "string" || message.trim() === "") {
      return;
    }

    const regions = ensureLiveRegions();
    const normalizedPriority =
      priority === "assertive" ? "assertive" : "polite";
    const region = regions[normalizedPriority];

    if (!region) {
      return;
    }

    const existingTimer =
      state.announcementTimers.get(normalizedPriority);

    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    region.textContent = "";

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        region.textContent = message.trim();

        if (Number.isFinite(clearAfter) && clearAfter > 0) {
          const timer = window.setTimeout(() => {
            region.textContent = "";
            state.announcementTimers.delete(
              normalizedPriority
            );
          }, clearAfter);

          state.announcementTimers.set(
            normalizedPriority,
            timer
          );
        }
      });
    });
  };

  const setExpanded = (
    trigger,
    expanded,
    controlledElement = null
  ) => {
    const triggerElement = resolveElement(trigger);

    if (!triggerElement) {
      return false;
    }

    const isExpanded = Boolean(expanded);

    triggerElement.setAttribute(
      "aria-expanded",
      String(isExpanded)
    );

    let controlled = resolveElement(controlledElement);

    if (!controlled) {
      const controlledId =
        triggerElement.getAttribute("aria-controls");

      controlled = controlledId
        ? document.getElementById(controlledId)
        : null;
    }

    if (controlled) {
      controlled.hidden = !isExpanded;
      controlled.setAttribute(
        "aria-hidden",
        String(!isExpanded)
      );
    }

    return true;
  };

  const setElementsInert = (
    elements,
    shouldBeInert = true
  ) => {
    const elementList = Array.from(elements || []).filter(
      isHTMLElement
    );

    elementList.forEach((element) => {
      if (shouldBeInert) {
        if (!element.hasAttribute("data-cdl-inert-state")) {
          element.setAttribute(
            "data-cdl-inert-state",
            element.hasAttribute("inert") ? "true" : "false"
          );
        }

        element.setAttribute("inert", "");
        element.setAttribute("aria-hidden", "true");
        return;
      }

      const previousState = element.getAttribute(
        "data-cdl-inert-state"
      );

      if (previousState === "false") {
        element.removeAttribute("inert");
        element.removeAttribute("aria-hidden");
      }

      element.removeAttribute("data-cdl-inert-state");
    });
  };

  const createFocusTrap = (
    container,
    {
      initialFocus = null,
      returnFocus = true,
      escapeDeactivates = true,
      onEscape = null
    } = {}
  ) => {
    const trapContainer = resolveElement(container);

    if (!trapContainer) {
      return {
        activate() {},
        deactivate() {},
        isActive() {
          return false;
        }
      };
    }

    let active = false;
    let previouslyFocusedElement = null;
    let temporaryContainerTabIndex = false;

    const focusInitialElement = () => {
      const requestedInitialFocus = resolveElement(
        initialFocus,
        trapContainer
      );

      if (
        requestedInitialFocus &&
        isFocusable(requestedInitialFocus)
      ) {
        focusElement(requestedInitialFocus, {
          preventScroll: true,
          temporaryTabIndex: false
        });
        return;
      }

      const focusableElements =
        getFocusableElements(trapContainer);

      if (focusableElements.length > 0) {
        focusElement(focusableElements[0], {
          preventScroll: true,
          temporaryTabIndex: false
        });
        return;
      }

      if (!trapContainer.hasAttribute("tabindex")) {
        trapContainer.setAttribute("tabindex", "-1");
        temporaryContainerTabIndex = true;
      }

      focusElement(trapContainer, {
        preventScroll: true,
        temporaryTabIndex: false
      });
    };

    const handleKeydown = (event) => {
      if (!active) {
        return;
      }

      if (
        event.key === "Escape" &&
        escapeDeactivates
      ) {
        event.preventDefault();

        if (typeof onEscape === "function") {
          onEscape(event);
        } else {
          deactivate();
        }

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements =
        getFocusableElements(trapContainer);

      if (focusableElements.length === 0) {
        event.preventDefault();
        focusElement(trapContainer, {
          preventScroll: true,
          temporaryTabIndex: false
        });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement =
        focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (
        event.shiftKey &&
        (
          activeElement === firstElement ||
          !trapContainer.contains(activeElement)
        )
      ) {
        event.preventDefault();
        focusElement(lastElement, {
          preventScroll: true,
          temporaryTabIndex: false
        });
        return;
      }

      if (
        !event.shiftKey &&
        (
          activeElement === lastElement ||
          !trapContainer.contains(activeElement)
        )
      ) {
        event.preventDefault();
        focusElement(firstElement, {
          preventScroll: true,
          temporaryTabIndex: false
        });
      }
    };

    const handleFocusIn = (event) => {
      if (
        !active ||
        trapContainer.contains(event.target)
      ) {
        return;
      }

      focusInitialElement();
    };

    const activate = () => {
      if (active) {
        return;
      }

      active = true;
      previouslyFocusedElement = isHTMLElement(
        document.activeElement
      )
        ? document.activeElement
        : null;

      document.addEventListener(
        "keydown",
        handleKeydown,
        true
      );

      document.addEventListener(
        "focusin",
        handleFocusIn,
        true
      );

      window.requestAnimationFrame(focusInitialElement);
    };

    const deactivate = ({
      restoreFocus = returnFocus
    } = {}) => {
      if (!active) {
        return;
      }

      active = false;

      document.removeEventListener(
        "keydown",
        handleKeydown,
        true
      );

      document.removeEventListener(
        "focusin",
        handleFocusIn,
        true
      );

      if (temporaryContainerTabIndex) {
        trapContainer.removeAttribute("tabindex");
        temporaryContainerTabIndex = false;
      }

      if (
        restoreFocus &&
        previouslyFocusedElement &&
        previouslyFocusedElement.isConnected &&
        isVisible(previouslyFocusedElement)
      ) {
        focusElement(previouslyFocusedElement, {
          preventScroll: true,
          temporaryTabIndex: false
        });
      }

      previouslyFocusedElement = null;
    };

    return {
      activate,
      deactivate,
      isActive() {
        return active;
      }
    };
  };

  const getHeaderOffset = () => {
    const header = document.querySelector(
      ".cdl-site-header"
    );

    if (!header) {
      return 0;
    }

    return Math.ceil(
      header.getBoundingClientRect().height
    );
  };

  const scrollToTarget = (
    target,
    {
      focus = true,
      updateHash = false,
      offset = getHeaderOffset() + 16
    } = {}
  ) => {
    const element = resolveElement(target);

    if (!element) {
      return false;
    }

    const targetTop =
      window.scrollY +
      element.getBoundingClientRect().top -
      Math.max(0, Number(offset) || 0);

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: state.reducedMotionMedia.matches
        ? "auto"
        : "smooth"
    });

    if (updateHash && element.id) {
      const encodedHash = `#${encodeURIComponent(
        element.id
      )}`;

      if (window.location.hash !== encodedHash) {
        window.history.pushState(
          null,
          "",
          encodedHash
        );
      }
    }

    if (focus) {
      const focusDelay =
        state.reducedMotionMedia.matches ? 0 : 350;

      window.setTimeout(() => {
        focusElement(element, {
          preventScroll: true
        });
      }, focusDelay);
    }

    return true;
  };

  const resolveHashTarget = (hash) => {
    if (
      typeof hash !== "string" ||
      hash === "" ||
      hash === "#"
    ) {
      return null;
    }

    let decodedHash = hash.slice(1);

    try {
      decodedHash = decodeURIComponent(decodedHash);
    } catch {
      return null;
    }

    const elementById =
      document.getElementById(decodedHash);

    if (elementById) {
      return elementById;
    }

    try {
      const elementByName = document.querySelector(
        `[name="${CSS.escape(decodedHash)}"]`
      );

      return isHTMLElement(elementByName)
        ? elementByName
        : null;
    } catch {
      return null;
    }
  };

  const isSamePageUrl = (url) => {
    return (
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    );
  };

  const handleHashLinkClick = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link = event.target.closest("a[href*='#']");

    if (
      !link ||
      link.hasAttribute("download") ||
      link.getAttribute("target") === "_blank"
    ) {
      return;
    }

    let url;

    try {
      url = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    if (!isSamePageUrl(url) || !url.hash) {
      return;
    }

    const target = resolveHashTarget(url.hash);

    if (!target) {
      return;
    }

    event.preventDefault();

    scrollToTarget(target, {
      focus: true,
      updateHash: true
    });
  };

  const handleInitialHash = () => {
    if (!window.location.hash) {
      return;
    }

    const target = resolveHashTarget(
      window.location.hash
    );

    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const targetTop =
          window.scrollY +
          target.getBoundingClientRect().top -
          getHeaderOffset() -
          16;

        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "auto"
        });
      });
    });
  };

  const prefersReducedMotion = () => {
    return state.reducedMotionMedia.matches;
  };

  const onReducedMotionChange = (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (event) => {
      callback(event.matches);
    };

    if (
      typeof state.reducedMotionMedia.addEventListener ===
      "function"
    ) {
      state.reducedMotionMedia.addEventListener(
        "change",
        listener
      );

      return () => {
        state.reducedMotionMedia.removeEventListener(
          "change",
          listener
        );
      };
    }

    state.reducedMotionMedia.addListener(listener);

    return () => {
      state.reducedMotionMedia.removeListener(listener);
    };
  };

  const init = () => {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    ensureLiveRegions();

    document.addEventListener(
      "click",
      handleHashLinkClick
    );

    handleInitialHash();
  };

  window[APP_NAMESPACE].accessibility = Object.freeze({
    init,
    announce,
    setExpanded,
    setElementsInert,
    createFocusTrap,
    focusElement,
    getFocusableElements,
    isFocusable,
    isVisible,
    resolveElement,
    scrollToTarget,
    prefersReducedMotion,
    onReducedMotionChange
  });
})();
