(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const SERVICES_READY_EVENT = "cdl:services-ready";
  const ROUTE_DESKTOP_BREAKPOINT = 1024;

  const SERVICE_ORDER = Object.freeze([
    "classA",
    "classB",
    "behindTheWheel",
    "jobPlacement",
    "financialAid",
    "companySponsorships"
  ]);

  const SERVICE_PROGRAM_VALUES = Object.freeze({
    classA: "class-a",
    classB: "class-b",
    behindTheWheel: "behind-the-wheel",
    jobPlacement: "job-placement",
    financialAid: "financial-aid",
    companySponsorships: "company-sponsorships"
  });

  const SERVICE_PATH_MATCHERS = Object.freeze({
    classA: "/services/cdl-class-a",
    classB: "/services/cdl-class-b",
    behindTheWheel: "/services/behind-the-wheel",
    jobPlacement: "/services/job-placement",
    financialAid: "/services/financial-aid",
    companySponsorships: "/services/company-sponsorships"
  });

  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]"
  ].join(",");

  window[APP_NAMESPACE] =
    window[APP_NAMESPACE] || {};

  const app = window[APP_NAMESPACE];

  const state = {
    initialized: false,
    ready: false,
    serviceKey: "",
    heroSwiper: null,
    programSwiper: null,
    testimonialSwiper: null,
    sliders: new Map(),
    routeFrame: null,
    routeMap: null,
    routeSvg: null,
    routePath: null,
    routeTruck: null,
    routeLength: 0,
    reducedMotionMedia: window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    )
  };

  const isHTMLElement = (value) => {
    return value instanceof HTMLElement;
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

  const normalizeValue = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
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

  const getConfig = () => {
    return window.SITE_CONFIG || null;
  };

  const getSlideCount = (container) => {
    if (!container) {
      return 0;
    }

    const wrapper = container.querySelector(
      ":scope > .swiper-wrapper"
    );

    if (!wrapper) {
      return 0;
    }

    return wrapper.querySelectorAll(
      ":scope > .swiper-slide"
    ).length;
  };

  const storeOriginalTabIndex = (element) => {
    if (
      !isHTMLElement(element) ||
      element.dataset.cdlTabindexStored ===
        "true"
    ) {
      return;
    }

    element.dataset.cdlTabindexStored = "true";
    element.dataset.cdlOriginalTabindex =
      element.getAttribute("tabindex") ?? "";
  };

  const disableSlideFocus = (slide) => {
    slide
      .querySelectorAll(FOCUSABLE_SELECTOR)
      .forEach((element) => {
        if (!isHTMLElement(element)) {
          return;
        }

        storeOriginalTabIndex(element);
        element.setAttribute("tabindex", "-1");
      });
  };

  const restoreSlideFocus = (slide) => {
    slide
      .querySelectorAll(
        '[data-cdl-tabindex-stored="true"]'
      )
      .forEach((element) => {
        if (!isHTMLElement(element)) {
          return;
        }

        const originalTabIndex =
          element.dataset.cdlOriginalTabindex;

        if (originalTabIndex === "") {
          element.removeAttribute("tabindex");
        } else {
          element.setAttribute(
            "tabindex",
            originalTabIndex
          );
        }

        delete element.dataset.cdlOriginalTabindex;
        delete element.dataset.cdlTabindexStored;
      });
  };

  const synchronizeSlideAccessibility = (
    swiper,
    {
      mode = "visible",
      totalSlides = 0
    } = {}
  ) => {
    if (!swiper?.slides) {
      return;
    }

    Array.from(swiper.slides).forEach(
      (slide, index) => {
        const isActive =
          slide.classList.contains(
            "swiper-slide-active"
          );

        const isVisible =
          slide.classList.contains(
            "swiper-slide-visible"
          );

        const shouldExpose =
          mode === "active"
            ? isActive
            : isActive || isVisible;

        const originalIndex = Number(
          slide.dataset.swiperSlideIndex
        );

        const displayedIndex = Number.isFinite(
          originalIndex
        )
          ? originalIndex
          : index;

        slide.setAttribute("role", "group");
        slide.setAttribute(
          "aria-roledescription",
          "slide"
        );

        if (totalSlides > 0) {
          slide.setAttribute(
            "aria-label",
            `${displayedIndex + 1} of ${totalSlides}`
          );
        }

        slide.setAttribute(
          "aria-hidden",
          String(!shouldExpose)
        );

        if (shouldExpose) {
          restoreSlideFocus(slide);
        } else {
          disableSlideFocus(slide);
        }
      }
    );
  };

  const synchronizeHeroPagination = (swiper) => {
    const pagination = document.querySelector(
      "[data-service-hero-pagination]"
    );

    if (!pagination || !swiper) {
      return;
    }

    pagination
      .querySelectorAll(
        ".swiper-pagination-bullet"
      )
      .forEach((bullet, index) => {
        if (!isHTMLElement(bullet)) {
          return;
        }

        if (index === swiper.realIndex) {
          bullet.setAttribute(
            "aria-current",
            "true"
          );
        } else {
          bullet.removeAttribute(
            "aria-current"
          );
        }
      });
  };

  const synchronizeSwiper = (
    swiper,
    options = {}
  ) => {
    window.requestAnimationFrame(() => {
      synchronizeSlideAccessibility(
        swiper,
        options
      );

      if (options.hero === true) {
        synchronizeHeroPagination(swiper);
      }
    });
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
      return null;
    }

    const normalizedName = name.trim();

    state.sliders.set(
      normalizedName,
      instance
    );

    if (
      app.sliders &&
      typeof app.sliders.replace === "function"
    ) {
      app.sliders.replace(
        normalizedName,
        instance
      );
    }

    return instance;
  };

  const detectServiceKey = () => {
    const explicitKey =
      document.body?.dataset.serviceKey;

    if (SERVICE_ORDER.includes(explicitKey)) {
      return explicitKey;
    }

    const pathname = normalizePathname(
      window.location.pathname
    );

    return (
      SERVICE_ORDER.find((key) => {
        return pathname.includes(
          SERVICE_PATH_MATCHERS[key]
        );
      }) || ""
    );
  };

  const getServiceConfig = () => {
    const config = getConfig();

    if (
      !config ||
      !state.serviceKey ||
      !config.servicePages?.[state.serviceKey]
    ) {
      return null;
    }

    return config.servicePages[
      state.serviceKey
    ];
  };

  const getCurrentProgramValue = () => {
    return (
      SERVICE_PROGRAM_VALUES[
        state.serviceKey
      ] || ""
    );
  };

  const initializeHeroSwiper = () => {
    const container = document.querySelector(
      "[data-service-hero-swiper]"
    );

    if (
      !container ||
      typeof window.Swiper !== "function"
    ) {
      return null;
    }

    const slideCount =
      getSlideCount(container);

    const previousButton =
      document.querySelector(
        "[data-service-hero-previous]"
      );

    const nextButton =
      document.querySelector(
        "[data-service-hero-next]"
      );

    const pagination =
      document.querySelector(
        "[data-service-hero-pagination]"
      );

    const swiper = new window.Swiper(
      container,
      {
        slidesPerView: 1,
        spaceBetween: 0,
        speed: prefersReducedMotion()
          ? 1
          : 900,
        loop: slideCount > 1,
        grabCursor: true,
        simulateTouch: true,
        allowTouchMove: true,
        watchSlidesProgress: true,
        observer: true,
        observeParents: true,
        keyboard: {
          enabled: true,
          onlyInViewport: true,
          pageUpDown: false
        },
        navigation: {
          prevEl: previousButton,
          nextEl: nextButton
        },
        pagination: {
          el: pagination,
          clickable: true,
          bulletElement: "button",
          renderBullet(index, className) {
            const number = String(
              index + 1
            ).padStart(2, "0");

            return `
              <button
                class="${className}"
                type="button"
                aria-label="Show service slide ${index + 1}"
              >
                ${number}
              </button>
            `;
          }
        },
        autoplay: prefersReducedMotion()
          ? false
          : {
              delay: 7600,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
              waitForTransition: true
            },
        a11y: {
          enabled: true,
          containerMessage:
            "CDL program information",
          containerRoleDescriptionMessage:
            "carousel",
          itemRoleDescriptionMessage:
            "slide",
          prevSlideMessage:
            "Show previous program slide",
          nextSlideMessage:
            "Show next program slide",
          firstSlideMessage:
            "This is the first program slide",
          lastSlideMessage:
            "This is the last program slide",
          paginationBulletMessage:
            "Show program slide {{index}}"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          },

          slideChangeTransitionStart(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          },

          slideChangeTransitionEnd(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          },

          resize(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          }
        }
      }
    );

    container.addEventListener(
      "focusin",
      () => {
        swiper.autoplay?.stop();
      }
    );

    container.addEventListener(
      "focusout",
      () => {
        window.setTimeout(() => {
          if (
            container.contains(
              document.activeElement
            ) ||
            prefersReducedMotion()
          ) {
            return;
          }

          swiper.autoplay?.start();
        }, 0);
      }
    );

    state.heroSwiper = swiper;

    return registerSlider(
      "serviceHero",
      swiper
    );
  };

  const initializeProgramsSwiper = () => {
    const container = document.querySelector(
      "[data-service-programs-swiper]"
    );

    if (
      !container ||
      typeof window.Swiper !== "function"
    ) {
      return null;
    }

    const slideCount =
      getSlideCount(container);

    const swiper = new window.Swiper(
      container,
      {
        slidesPerView: 1,
        spaceBetween: 16,
        speed: prefersReducedMotion()
          ? 1
          : 740,
        grabCursor: true,
        watchSlidesProgress: true,
        loop: slideCount > 1,
        loopAdditionalSlides: 1,
        keyboard: {
          enabled: true,
          onlyInViewport: true,
          pageUpDown: false
        },
        navigation: {
          prevEl:
            "[data-service-programs-previous]",
          nextEl:
            "[data-service-programs-next]"
        },
        pagination: {
          el:
            "[data-service-programs-progress]",
          type: "progressbar"
        },
        breakpoints: {
          768: {
            slidesPerView: 2,
            spaceBetween: 20
          },
          1100: {
            slidesPerView: 3,
            spaceBetween: 24
          }
        },
        a11y: {
          enabled: true,
          containerMessage:
            "Related CDL programs",
          containerRoleDescriptionMessage:
            "carousel",
          itemRoleDescriptionMessage:
            "program",
          prevSlideMessage:
            "Show previous related program",
          nextSlideMessage:
            "Show next related program"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            synchronizeSwiper(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          },

          slideChangeTransitionEnd(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          },

          resize(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          }
        }
      }
    );

    state.programSwiper = swiper;

    return registerSlider(
      "servicePrograms",
      swiper
    );
  };

  const initializeTestimonialsSwiper = () => {
    const container = document.querySelector(
      "[data-service-testimonials-swiper]"
    );

    if (
      !container ||
      typeof window.Swiper !== "function"
    ) {
      return null;
    }

    const slideCount =
      getSlideCount(container);

    const swiper = new window.Swiper(
      container,
      {
        slidesPerView: 1,
        spaceBetween: 18,
        speed: prefersReducedMotion()
          ? 1
          : 720,
        loop: slideCount > 1,
        grabCursor: true,
        watchSlidesProgress: true,
        autoHeight: true,
        keyboard: {
          enabled: true,
          onlyInViewport: true,
          pageUpDown: false
        },
        navigation: {
          prevEl:
            "[data-service-testimonials-previous]",
          nextEl:
            "[data-service-testimonials-next]"
        },
        pagination: {
          el:
            "[data-service-testimonials-pagination]",
          clickable: true
        },
        a11y: {
          enabled: true,
          containerMessage:
            "Student program testimonials",
          containerRoleDescriptionMessage:
            "carousel",
          itemRoleDescriptionMessage:
            "testimonial",
          prevSlideMessage:
            "Show previous testimonial",
          nextSlideMessage:
            "Show next testimonial"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          },

          slideChangeTransitionStart(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          },

          slideChangeTransitionEnd(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          },

          resize(instance) {
            synchronizeSwiper(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          }
        }
      }
    );

    state.testimonialSwiper = swiper;

    return registerSlider(
      "serviceTestimonials",
      swiper
    );
  };

  const initializeSwipers = () => {
    if (typeof window.Swiper !== "function") {
      document.documentElement.classList.add(
        "cdl-swiper-unavailable"
      );

      return;
    }

    initializeHeroSwiper();
    initializeProgramsSwiper();
    initializeTestimonialsSwiper();
    refreshAOS();
  };

  const linkMatchesCurrentService = (
    link,
    serviceKey
  ) => {
    if (!(link instanceof HTMLAnchorElement)) {
      return false;
    }

    const explicitKey =
      link.dataset.serviceKey;

    if (
      explicitKey &&
      explicitKey === serviceKey
    ) {
      return true;
    }

    let pathname;

    try {
      pathname = normalizePathname(
        new URL(
          link.href,
          window.location.href
        ).pathname
      );
    } catch {
      return false;
    }

    return pathname.includes(
      SERVICE_PATH_MATCHERS[serviceKey]
    );
  };

  const initializeServiceNavigation = () => {
    if (!state.serviceKey) {
      return;
    }

    const links = document.querySelectorAll(
      ".cdl-service-nav__link, [data-service-nav-link]"
    );

    links.forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      const isCurrent =
        linkMatchesCurrentService(
          link,
          state.serviceKey
        );

      link.classList.toggle(
        "is-current",
        isCurrent
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

  const getAdjacentServiceKeys = () => {
    const currentIndex =
      SERVICE_ORDER.indexOf(
        state.serviceKey
      );

    if (currentIndex < 0) {
      return {
        previousKey: "",
        nextKey: ""
      };
    }

    const previousIndex =
      (
        currentIndex -
        1 +
        SERVICE_ORDER.length
      ) % SERVICE_ORDER.length;

    const nextIndex =
      (
        currentIndex +
        1
      ) % SERVICE_ORDER.length;

    return {
      previousKey:
        SERVICE_ORDER[previousIndex],
      nextKey:
        SERVICE_ORDER[nextIndex]
    };
  };

  const applyAdjacentLink = (
    linkSelector,
    labelSelector,
    serviceKey
  ) => {
    const config = getConfig();
    const service =
      config?.servicePages?.[serviceKey];

    if (!service) {
      return;
    }

    document
      .querySelectorAll(linkSelector)
      .forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) {
          return;
        }

        link.href = service.url;
        link.dataset.serviceKey = serviceKey;
      });

    document
      .querySelectorAll(labelSelector)
      .forEach((label) => {
        label.textContent = service.label;
      });
  };

  const initializeAdjacentNavigation = () => {
    const {
      previousKey,
      nextKey
    } = getAdjacentServiceKeys();

    if (previousKey) {
      applyAdjacentLink(
        "[data-service-previous-link]",
        "[data-service-previous-label]",
        previousKey
      );
    }

    if (nextKey) {
      applyAdjacentLink(
        "[data-service-next-link]",
        "[data-service-next-label]",
        nextKey
      );
    }
  };

  const setProgramFieldValue = (
    field,
    programValue
  ) => {
    if (
      !programValue ||
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement
      )
    ) {
      return false;
    }

    if (field instanceof HTMLSelectElement) {
      const normalizedProgram =
        normalizeValue(programValue);

      const matchingOption = Array.from(
        field.options
      ).find((option) => {
        return (
          normalizeValue(option.value) ===
          normalizedProgram
        );
      });

      if (!matchingOption) {
        return false;
      }

      if (
        field.value &&
        normalizeValue(field.value) !==
          normalizedProgram
      ) {
        return false;
      }

      field.value = matchingOption.value;

      field.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );

      return true;
    }

    if (
      field.type === "hidden" ||
      field.value.trim() === ""
    ) {
      field.value = programValue;
      field.defaultValue = programValue;

      return true;
    }

    return false;
  };

  const ensureHiddenInput = (
    form,
    name,
    value
  ) => {
    let field = form.elements.namedItem(name);

    if (!(field instanceof HTMLInputElement)) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      form.appendChild(field);
    }

    field.value = String(value || "");
    field.defaultValue = field.value;

    return field;
  };

  const initializeServiceForms = () => {
    const serviceConfig =
      getServiceConfig();

    if (!serviceConfig) {
      return;
    }

    const programValue =
      getCurrentProgramValue();

    const forms = document.querySelectorAll(
      "form[data-service-form], form[data-cdl-form][data-form-type^='service_']"
    );

    forms.forEach((form) => {
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      form.dataset.formType =
        serviceConfig.formType;

      ensureHiddenInput(
        form,
        "formType",
        serviceConfig.formType
      );

      ensureHiddenInput(
        form,
        "sourcePage",
        window.location.href
      );

      const programField =
        form.elements.namedItem("program");

      if (
        programField instanceof
          HTMLSelectElement ||
        programField instanceof
          HTMLInputElement
      ) {
        setProgramFieldValue(
          programField,
          programValue
        );
      } else {
        ensureHiddenInput(
          form,
          "program",
          programValue
        );
      }

      if (
        app.forms &&
        typeof app.forms.registerForm ===
          "function"
      ) {
        app.forms.registerForm(form);
      }
    });
  };

  const initializeRequestLinks = () => {
    const serviceKey =
      state.serviceKey;

    document
      .querySelectorAll(
        "[data-service-request-link]"
      )
      .forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) {
          return;
        }

        const programValue =
          SERVICE_PROGRAM_VALUES[serviceKey];

        if (!programValue) {
          return;
        }

        let targetUrl;

        try {
          targetUrl = new URL(
            link.getAttribute("href") ||
              "../contact/#request-info",
            window.location.href
          );
        } catch {
          return;
        }

        targetUrl.searchParams.set(
          "program",
          programValue
        );

        link.href = targetUrl.href;
      });
  };

  const cacheRouteElements = () => {
    state.routeMap =
      document.querySelector(
        "[data-service-route-map]"
      ) ||
      document.querySelector(
        ".service-route__map"
      );

    state.routeSvg =
      state.routeMap?.querySelector(
        ".service-route__line"
      ) || null;

    state.routePath =
      state.routeSvg?.querySelector(
        "path"
      ) || null;

    state.routeTruck =
      state.routeMap?.querySelector(
        "[data-service-route-truck]"
      ) ||
      state.routeMap?.querySelector(
        ".service-route__truck"
      ) ||
      null;

    if (
      !state.routeMap ||
      !state.routeSvg ||
      !state.routePath ||
      !state.routeTruck
    ) {
      return false;
    }

    try {
      state.routeLength =
        state.routePath.getTotalLength();
    } catch {
      state.routeLength = 0;
    }

    return state.routeLength > 0;
  };

  const resetRouteTruck = () => {
    if (!state.routeTruck) {
      return;
    }

    state.routeTruck.style.removeProperty(
      "left"
    );

    state.routeTruck.style.removeProperty(
      "top"
    );

    state.routeTruck.style.removeProperty(
      "transform"
    );

    state.routeTruck.style.removeProperty(
      "will-change"
    );
  };

  const getRouteProgress = () => {
    if (!state.routeMap) {
      return 0;
    }

    const rect =
      state.routeMap.getBoundingClientRect();

    const viewportHeight =
      window.innerHeight;

    const startPosition =
      viewportHeight * 0.82;

    const travelDistance =
      rect.height +
      viewportHeight * 0.42;

    return Math.min(
      Math.max(
        (
          startPosition -
          rect.top
        ) / travelDistance,
        0
      ),
      1
    );
  };

  const updateRouteTruck = () => {
    state.routeFrame = null;

    if (
      !state.routeMap ||
      !state.routeSvg ||
      !state.routePath ||
      !state.routeTruck ||
      !state.routeLength
    ) {
      return;
    }

    if (
      prefersReducedMotion() ||
      window.innerWidth <=
        ROUTE_DESKTOP_BREAKPOINT
    ) {
      resetRouteTruck();
      return;
    }

    const mapRect =
      state.routeMap.getBoundingClientRect();

    if (
      mapRect.bottom < 0 ||
      mapRect.top > window.innerHeight
    ) {
      return;
    }

    const svgRect =
      state.routeSvg.getBoundingClientRect();

    const progress =
      getRouteProgress();

    const currentLength =
      state.routeLength * progress;

    const nextLength = Math.min(
      state.routeLength,
      currentLength + 3
    );

    const point =
      state.routePath.getPointAtLength(
        currentLength
      );

    const nextPoint =
      state.routePath.getPointAtLength(
        nextLength
      );

    const viewBox =
      state.routeSvg.viewBox.baseVal;

    if (
      !viewBox ||
      viewBox.width <= 0 ||
      viewBox.height <= 0
    ) {
      return;
    }

    const horizontalScale =
      svgRect.width / viewBox.width;

    const verticalScale =
      svgRect.height / viewBox.height;

    const left =
      svgRect.left -
      mapRect.left +
      (
        point.x -
        viewBox.x
      ) * horizontalScale;

    const top =
      svgRect.top -
      mapRect.top +
      (
        point.y -
        viewBox.y
      ) * verticalScale;

    const angle =
      Math.atan2(
        (
          nextPoint.y -
          point.y
        ) * verticalScale,
        (
          nextPoint.x -
          point.x
        ) * horizontalScale
      ) *
      (
        180 / Math.PI
      );

    state.routeTruck.style.left =
      `${left}px`;

    state.routeTruck.style.top =
      `${top}px`;

    state.routeTruck.style.transform =
      `translate(-50%, -50%) rotate(${angle.toFixed(2)}deg)`;

    state.routeTruck.style.willChange =
      "left, top, transform";
  };

  const requestRouteUpdate = () => {
    if (state.routeFrame !== null) {
      return;
    }

    state.routeFrame =
      window.requestAnimationFrame(
        updateRouteTruck
      );
  };

  const initializeRouteAnimation = () => {
    if (!cacheRouteElements()) {
      return;
    }

    window.addEventListener(
      "scroll",
      requestRouteUpdate,
      {
        passive: true
      }
    );

    window.addEventListener(
      "resize",
      requestRouteUpdate,
      {
        passive: true
      }
    );

    requestRouteUpdate();
  };

  const initializeFormSuccessHandling = () => {
    document.addEventListener(
      "cdl:form-success",
      (event) => {
        const serviceConfig =
          getServiceConfig();

        if (
          !serviceConfig ||
          event.detail?.formType !==
            serviceConfig.formType
        ) {
          return;
        }

        announce(
          `Your request about ${serviceConfig.label} was submitted successfully.`
        );
      }
    );
  };

  const handleDocumentVisibility = () => {
    if (!state.heroSwiper?.autoplay) {
      return;
    }

    if (
      document.hidden ||
      prefersReducedMotion()
    ) {
      state.heroSwiper.autoplay.stop();
      return;
    }

    state.heroSwiper.autoplay.start();
  };

  const handleReducedMotionChange = () => {
    state.sliders.forEach(
      (swiper, name) => {
        if (!swiper?.params) {
          return;
        }

        if (name === "serviceHero") {
          swiper.params.speed =
            prefersReducedMotion()
              ? 1
              : 900;

          return;
        }

        swiper.params.speed =
          prefersReducedMotion()
            ? 1
            : name ===
                "serviceTestimonials"
              ? 720
              : 740;
      }
    );

    if (prefersReducedMotion()) {
      state.heroSwiper?.autoplay?.stop();
      resetRouteTruck();
      return;
    }

    if (!document.hidden) {
      state.heroSwiper?.autoplay?.start();
    }

    requestRouteUpdate();
  };

  const initializeReducedMotionListener = () => {
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
      typeof app.ready.then === "function"
    ) {
      return app.ready;
    }

    return Promise.resolve();
  };

  const completeInitialization = () => {
    if (state.ready) {
      return;
    }

    state.serviceKey =
      detectServiceKey();

    initializeServiceNavigation();
    initializeAdjacentNavigation();
    initializeServiceForms();
    initializeRequestLinks();
    initializeSwipers();
    initializeRouteAnimation();
    initializeFormSuccessHandling();
    initializeReducedMotionListener();

    document.addEventListener(
      "visibilitychange",
      handleDocumentVisibility
    );

    state.ready = true;

    document.documentElement.classList.add(
      "cdl-services-ready"
    );

    if (state.serviceKey) {
      document.documentElement.dataset.serviceKey =
        state.serviceKey;
    }

    document.dispatchEvent(
      new CustomEvent(SERVICES_READY_EVENT, {
        detail: {
          serviceKey:
            state.serviceKey,
          sliders: Array.from(
            state.sliders.keys()
          )
        }
      })
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

  app.services = Object.freeze({
    init,
    refreshNavigation:
      initializeServiceNavigation,
    refreshForms:
      initializeServiceForms,
    updateRoute:
      requestRouteUpdate,
    getSlider(name) {
      return state.sliders.get(name) || null;
    },
    get serviceKey() {
      return state.serviceKey;
    },
    get isReady() {
      return state.ready;
    }
  });

  init();
})();
