(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const CONTACT_READY_EVENT = "cdl:contact-ready";

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const app = window[APP_NAMESPACE];

  const state = {
    initialized: false,
    ready: false,
    heroSwiper: null,
    programSwiper: null,
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
      "[data-contact-hero-pagination]"
    );

    if (!pagination || !swiper) {
      return;
    }

    pagination
      .querySelectorAll(
        ".swiper-pagination-bullet"
      )
      .forEach((bullet, index) => {
        if (!(bullet instanceof HTMLElement)) {
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

  const initializeHeroSwiper = () => {
    const container = document.querySelector(
      "[data-contact-hero-swiper]"
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
        "[data-contact-hero-previous]"
      );

    const nextButton =
      document.querySelector(
        "[data-contact-hero-next]"
      );

    const pagination =
      document.querySelector(
        "[data-contact-hero-pagination]"
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
                aria-label="Show contact slide ${index + 1}"
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
            "Contact and program inquiry information",
          containerRoleDescriptionMessage:
            "carousel",
          itemRoleDescriptionMessage:
            "slide",
          prevSlideMessage:
            "Show previous contact slide",
          nextSlideMessage:
            "Show next contact slide",
          firstSlideMessage:
            "This is the first contact slide",
          lastSlideMessage:
            "This is the last contact slide",
          paginationBulletMessage:
            "Show contact slide {{index}}"
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
      "contactHero",
      swiper
    );
  };

  const initializeProgramsSwiper = () => {
    const container = document.querySelector(
      "[data-contact-programs-swiper]"
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
        loop: slideCount > 3,
        loopAdditionalSlides: 3,
        keyboard: {
          enabled: true,
          onlyInViewport: true,
          pageUpDown: false
        },
        navigation: {
          prevEl:
            "[data-contact-programs-previous]",
          nextEl:
            "[data-contact-programs-next]"
        },
        pagination: {
          el:
            "[data-contact-programs-progress]",
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
            "CDL program inquiry categories",
          containerRoleDescriptionMessage:
            "carousel",
          itemRoleDescriptionMessage:
            "program category",
          prevSlideMessage:
            "Show previous inquiry category",
          nextSlideMessage:
            "Show next inquiry category"
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
      "contactPrograms",
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
    refreshAOS();
  };

  const normalizeProgramValue = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
  };

  const selectOptionByValue = (
    select,
    requestedValue
  ) => {
    if (
      !(select instanceof HTMLSelectElement) ||
      !requestedValue
    ) {
      return false;
    }

    const normalizedRequestedValue =
      normalizeProgramValue(requestedValue);

    const matchingOption = Array.from(
      select.options
    ).find((option) => {
      return (
        normalizeProgramValue(option.value) ===
        normalizedRequestedValue
      );
    });

    if (!matchingOption) {
      return false;
    }

    select.value = matchingOption.value;

    select.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    return true;
  };

  const getProgramFromUrl = () => {
    const parameters = new URLSearchParams(
      window.location.search
    );

    return (
      parameters.get("program") ||
      parameters.get("interest") ||
      ""
    );
  };

  const preselectProgramFromUrl = () => {
    const requestedProgram =
      getProgramFromUrl();

    if (!requestedProgram) {
      return;
    }

    const programSelects = document.querySelectorAll(
      'select[name="program"]'
    );

    let selectionMade = false;

    programSelects.forEach((select) => {
      if (
        selectOptionByValue(
          select,
          requestedProgram
        )
      ) {
        selectionMade = true;
      }
    });

    if (selectionMade) {
      announce(
        "The requested CDL program has been selected in the inquiry forms."
      );
    }
  };

  const scrollToRequestForm = () => {
    const requestSection =
      document.getElementById("request-info");

    if (!requestSection) {
      return;
    }

    if (
      app.accessibility &&
      typeof app.accessibility.scrollToTarget ===
        "function"
    ) {
      app.accessibility.scrollToTarget(
        requestSection,
        {
          focus: false,
          updateHash: true
        }
      );

      return;
    }

    requestSection.scrollIntoView({
      behavior: prefersReducedMotion()
        ? "auto"
        : "smooth",
      block: "start"
    });
  };

  const initializeProgramCardActions = () => {
    const programCards =
      document.querySelectorAll(
        ".contact-programs__card"
      );

    programCards.forEach((card) => {
      const link = card.querySelector(
        ".cdl-text-link"
      );

      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      card.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key !== "Enter" ||
            event.target !== card
          ) {
            return;
          }

          link.click();
        }
      );
    });
  };

  const initializeFormSuccessHandling = () => {
    document.addEventListener(
      "cdl:form-success",
      (event) => {
        const formType =
          event.detail?.formType || "";

        if (formType === "contact") {
          announce(
            "Your CDL program inquiry was submitted successfully."
          );
          return;
        }

        if (formType === "schedule_inquiry") {
          announce(
            "Your training schedule inquiry was submitted successfully."
          );
          return;
        }

        if (
          formType ===
          "advertise_collaborate"
        ) {
          announce(
            "Your collaboration inquiry was submitted successfully."
          );
        }
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

        swiper.params.speed =
          prefersReducedMotion()
            ? 1
            : name === "contactHero"
              ? 900
              : 740;
      }
    );

    if (prefersReducedMotion()) {
      state.heroSwiper?.autoplay?.stop();
      return;
    }

    if (!document.hidden) {
      state.heroSwiper?.autoplay?.start();
    }
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
    initializeProgramCardActions();
    initializeFormSuccessHandling();
    initializeReducedMotionListener();

    window.requestAnimationFrame(() => {
      preselectProgramFromUrl();
    });

    document.addEventListener(
      "visibilitychange",
      handleDocumentVisibility
    );

    state.ready = true;

    document.documentElement.classList.add(
      "cdl-contact-ready"
    );

    document.dispatchEvent(
      new CustomEvent(CONTACT_READY_EVENT, {
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

  app.contact = Object.freeze({
    init,
    preselectProgram: preselectProgramFromUrl,
    scrollToRequestForm,
    getSlider(name) {
      return state.sliders.get(name) || null;
    },
    get isReady() {
      return state.ready;
    }
  });

  init();
})();
