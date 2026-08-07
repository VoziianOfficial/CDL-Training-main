(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const HOME_READY_EVENT = "cdl:home-ready";
  const ROUTE_DESKTOP_BREAKPOINT = 1024;

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const app = window[APP_NAMESPACE];

  const state = {
    initialized: false,
    ready: false,
    routeFrame: null,
    routeMap: null,
    routeSvg: null,
    routePath: null,
    routeTruck: null,
    routeLength: 0,
    heroSwiper: null,
    sliders: new Map(),
    reducedMotionMedia: window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    )
  };

  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]"
  ].join(",");

  const clamp = (value, minimum, maximum) => {
    return Math.min(
      Math.max(Number(value), minimum),
      maximum
    );
  };

  const prefersReducedMotion = () => {
    if (
      app.animations &&
      typeof app.animations.prefersReducedMotion === "function"
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
      typeof app.accessibility.announce === "function"
    ) {
      app.accessibility.announce(message, {
        priority
      });
    }
  };

  const refreshAOS = () => {
    if (
      app.animations &&
      typeof app.animations.refreshAOS === "function"
    ) {
      app.animations.refreshAOS();
    }
  };

  const getSlideCount = (container) => {
    if (!container) {
      return 0;
    }

    return container.querySelectorAll(
      ":scope > .swiper-wrapper > .swiper-slide"
    ).length;
  };

  const storeOriginalTabIndex = (element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (
      element.dataset.cdlTabindexStored === "true"
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
        if (!(element instanceof HTMLElement)) {
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
        if (!(element instanceof HTMLElement)) {
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

  const syncSlideAccessibility = (
    swiper,
    {
      mode = "visible",
      totalSlides = 0
    } = {}
  ) => {
    if (!swiper || !swiper.slides) {
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

        const isExposed =
          mode === "active"
            ? isActive
            : isVisible || isActive;

        const configuredIndex = Number(
          slide.dataset.swiperSlideIndex
        );

        const slideIndex = Number.isFinite(
          configuredIndex
        )
          ? configuredIndex
          : index;

        slide.setAttribute("role", "group");
        slide.setAttribute(
          "aria-roledescription",
          "slide"
        );

        if (totalSlides > 0) {
          slide.setAttribute(
            "aria-label",
            `${slideIndex + 1} of ${totalSlides}`
          );
        }

        slide.setAttribute(
          "aria-hidden",
          String(!isExposed)
        );

        if (isExposed) {
          restoreSlideFocus(slide);
        } else {
          disableSlideFocus(slide);
        }
      }
    );
  };

  const syncHeroPagination = (swiper) => {
    const pagination = document.querySelector(
      "[data-home-hero-pagination]"
    );

    if (!pagination || !swiper) {
      return;
    }

    const activeIndex = swiper.realIndex;

    pagination
      .querySelectorAll(
        ".swiper-pagination-bullet"
      )
      .forEach((bullet, index) => {
        if (!(bullet instanceof HTMLElement)) {
          return;
        }

        if (index === activeIndex) {
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

  const syncSwiperAccessibility = (
    swiper,
    options
  ) => {
    window.requestAnimationFrame(() => {
      syncSlideAccessibility(
        swiper,
        options
      );

      if (options?.hero === true) {
        syncHeroPagination(swiper);
      }
    });
  };

  const registerSlider = (
    name,
    instance
  ) => {
    if (!instance) {
      return null;
    }

    state.sliders.set(name, instance);

    if (
      app.sliders &&
      typeof app.sliders.replace === "function"
    ) {
      app.sliders.replace(name, instance);
    }

    return instance;
  };

  const createHeroSwiper = () => {
    const container = document.querySelector(
      "[data-home-hero-swiper]"
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
        "[data-home-hero-previous]"
      );

    const nextButton =
      document.querySelector(
        "[data-home-hero-next]"
      );

    const pagination =
      document.querySelector(
        "[data-home-hero-pagination]"
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
          previousEl: previousButton,
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
                aria-label="Show hero slide ${index + 1}"
              >
                ${number}
              </button>
            `;
          }
        },
        autoplay: prefersReducedMotion()
          ? false
          : {
              delay: 7500,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
              waitForTransition: true
            },
        a11y: {
          enabled: true,
          containerMessage:
            "Featured CDL training information",
          containerRoleDescriptionMessage:
            "carousel",
          itemRoleDescriptionMessage:
            "slide",
          prevSlideMessage:
            "Show previous training slide",
          nextSlideMessage:
            "Show next training slide",
          firstSlideMessage:
            "This is the first training slide",
          lastSlideMessage:
            "This is the last training slide",
          paginationBulletMessage:
            "Show training slide {{index}}"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            syncSwiperAccessibility(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          },
          slideChangeTransitionStart(instance) {
            syncSwiperAccessibility(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          },
          slideChangeTransitionEnd(instance) {
            syncSwiperAccessibility(
              instance,
              {
                mode: "active",
                totalSlides: slideCount,
                hero: true
              }
            );
          },
          resize(instance) {
            syncSwiperAccessibility(
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

    state.heroSwiper = swiper;

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

    return registerSlider(
      "homeHero",
      swiper
    );
  };

  const createPathsSwiper = () => {
    const container = document.querySelector(
      "[data-home-paths-swiper]"
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
        slidesPerView: 1.08,
        spaceBetween: 16,
        speed: prefersReducedMotion()
          ? 1
          : 720,
        grabCursor: true,
        watchSlidesProgress: true,
        keyboard: {
          enabled: true,
          onlyInViewport: true
        },
        navigation: {
          prevEl:
            "[data-home-paths-previous]",
          nextEl:
            "[data-home-paths-next]"
        },
        pagination: {
          el:
            "[data-home-paths-pagination]",
          clickable: true
        },
        breakpoints: {
          600: {
            slidesPerView: 1.5,
            spaceBetween: 18
          },
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
            "CDL pathway cards",
          containerRoleDescriptionMessage:
            "carousel",
          prevSlideMessage:
            "Show previous CDL pathway",
          nextSlideMessage:
            "Show next CDL pathway"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            syncSwiperAccessibility(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          },
          slideChangeTransitionEnd(instance) {
            syncSwiperAccessibility(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          },
          resize(instance) {
            syncSwiperAccessibility(
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

    return registerSlider(
      "homePaths",
      swiper
    );
  };

  const createProgramsSwiper = () => {
    const container = document.querySelector(
      "[data-home-programs-swiper]"
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
        centeredSlides: false,
        initialSlide: 0,
        spaceBetween: 16,
        speed: prefersReducedMotion()
          ? 1
          : 780,
        grabCursor: true,
        slideToClickedSlide: true,
        watchSlidesProgress: true,
        loop: slideCount > 3,
        keyboard: {
          enabled: true,
          onlyInViewport: true
        },
        navigation: {
          prevEl:
            "[data-home-programs-previous]",
          nextEl:
            "[data-home-programs-next]"
        },
        pagination: {
          el:
            "[data-home-programs-progress]",
          type: "progressbar"
        },
        breakpoints: {
          768: {
            slidesPerView: 2,
            spaceBetween: 22
          },
          1024: {
            slidesPerView: 3,
            spaceBetween: 24
          }
        },
        a11y: {
          enabled: true,
          containerMessage:
            "CDL programs and training formats",
          containerRoleDescriptionMessage:
            "carousel",
          prevSlideMessage:
            "Show previous CDL program",
          nextSlideMessage:
            "Show next CDL program"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            syncSwiperAccessibility(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          },
          slideChangeTransitionEnd(instance) {
            syncSwiperAccessibility(
              instance,
              {
                mode: "visible",
                totalSlides: slideCount
              }
            );
          },
          resize(instance) {
            syncSwiperAccessibility(
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

    return registerSlider(
      "homePrograms",
      swiper
    );
  };

  const createTestimonialsSwiper = () => {
    const container = document.querySelector(
      "[data-home-testimonials-swiper]"
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
          onlyInViewport: true
        },
        navigation: {
          prevEl:
            "[data-home-testimonials-previous]",
          nextEl:
            "[data-home-testimonials-next]"
        },
        pagination: {
          el:
            "[data-home-testimonials-pagination]",
          clickable: true
        },
        a11y: {
          enabled: true,
          containerMessage:
            "Student testimonials",
          containerRoleDescriptionMessage:
            "carousel",
          prevSlideMessage:
            "Show previous student story",
          nextSlideMessage:
            "Show next student story"
        },
        on: {
          init(instance) {
            container.dataset.swiperReady =
              "true";

            syncSwiperAccessibility(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          },
          slideChangeTransitionStart(instance) {
            syncSwiperAccessibility(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          },
          slideChangeTransitionEnd(instance) {
            syncSwiperAccessibility(
              instance,
              {
                mode: "active",
                totalSlides: slideCount
              }
            );
          },
          resize(instance) {
            syncSwiperAccessibility(
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

    return registerSlider(
      "homeTestimonials",
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

    createHeroSwiper();
    createPathsSwiper();
    createProgramsSwiper();
    createTestimonialsSwiper();

    refreshAOS();
  };

  const handleDocumentVisibility = () => {
    const heroSwiper =
      state.heroSwiper;

    if (!heroSwiper?.autoplay) {
      return;
    }

    if (
      document.hidden ||
      prefersReducedMotion()
    ) {
      heroSwiper.autoplay.stop();
      return;
    }

    heroSwiper.autoplay.start();
  };

  const initializeSampleLessonButton = () => {
    const button = document.querySelector(
      "[data-sample-lesson-button]"
    );

    if (!button) {
      return;
    }

    button.addEventListener(
      "click",
      () => {
        const resources =
          document.getElementById(
            "resources"
          );

        if (!resources) {
          window.location.href =
            "contact/#request-info";
          return;
        }

        if (
          app.accessibility &&
          typeof app.accessibility.scrollToTarget ===
            "function"
        ) {
          app.accessibility.scrollToTarget(
            resources,
            {
              focus: true,
              updateHash: true
            }
          );
        } else {
          resources.scrollIntoView({
            behavior: prefersReducedMotion()
              ? "auto"
              : "smooth",
            block: "start"
          });
        }

        announce(
          "CDL study resources and sample lesson information are available in the resources section."
        );
      }
    );
  };

  const cacheRouteElements = () => {
    state.routeMap = document.querySelector(
      ".home-route__map"
    );

    state.routeSvg = document.querySelector(
      ".home-route__line"
    );

    state.routePath = document.querySelector(
      ".home-route__line path"
    );

    state.routeTruck = document.querySelector(
      "[data-route-truck]"
    );

    if (
      !state.routePath ||
      !state.routeTruck ||
      !state.routeMap ||
      !state.routeSvg
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

    return clamp(
      (
        startPosition -
        rect.top
      ) / travelDistance,
      0,
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

  const handleReducedMotionChange = () => {
    if (prefersReducedMotion()) {
      state.heroSwiper?.autoplay?.stop();
      resetRouteTruck();
    } else {
      if (!document.hidden) {
        state.heroSwiper?.autoplay?.start();
      }

      requestRouteUpdate();
    }

    state.sliders.forEach((swiper) => {
      if (
        swiper?.params &&
        typeof swiper.params.speed ===
          "number"
      ) {
        swiper.params.speed =
          prefersReducedMotion()
            ? 1
            : 720;
      }
    });
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

    initializeSwipers();
    initializeSampleLessonButton();
    initializeRouteAnimation();
    initializeReducedMotionListener();

    document.addEventListener(
      "visibilitychange",
      handleDocumentVisibility
    );

    state.ready = true;

    document.documentElement.classList.add(
      "cdl-home-ready"
    );

    document.dispatchEvent(
      new CustomEvent(HOME_READY_EVENT, {
        detail: {
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

  app.home = Object.freeze({
    init,
    updateRoute: requestRouteUpdate,
    getSlider(name) {
      return state.sliders.get(name) || null;
    },
    get isReady() {
      return state.ready;
    }
  });

  init();
})();
