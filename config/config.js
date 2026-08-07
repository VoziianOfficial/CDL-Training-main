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
      "footerDisclaimer",
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

  const SITE_CONFIG_DATA = {
  "version": "1.0.0",
  "environment": "demo",
  "locale": "en-US",
  "siteName": "CDLWAY",
  "shortBrandName": "CDLWAY",
  "companyName": "CDLWAY Training Institute",
  "logoText": "CDLWAY",
  "logoIconPath": "/assets/images/brand/truck-logo.svg",
  "logoAlt": "CDLWAY commercial truck logo",
  "siteUrl": "https://www.cdlway.example",
  "canonicalDomain": "https://www.cdlway.example",
  "corporateEmail": "hello@cdlway.example",
  "companyAddress": "Training location details are provided with program information.",
  "faviconPath": "/assets/images/brand/truck-logo.svg",
  "defaultOgImage": "/images/card-6.jpg",
  "copyrightText": "© {year} {siteName}. All rights reserved.",
  "footerDescription": "Professional CDL training pathways designed to help adult learners prepare for commercial driving tests, build practical skills, and explore transportation careers.",
  "footerDisclaimer": "CDLWAY provides informational CDL training content. Program availability, pricing, schedules, eligibility, licensing requirements, and job placement outcomes are not guaranteed and must be confirmed with the training provider and applicable state agencies.",
  "navigationLabels": {
    "start": "Start",
    "whyTrainWithUs": "Why Train With Us",
    "cdlPaths": "CDL Paths",
    "careerSupport": "Career Support",
    "studentStories": "Student Stories",
    "connect": "Connect"
  },
  "navigationLinks": {
    "start": "/",
    "whyTrainWithUs": "/#why-train-with-us",
    "cdlPaths": "/#cdl-paths",
    "careerSupport": "/#career-support",
    "studentStories": "/#student-stories",
    "connect": "/contact/"
  },
  "ctaLabels": {
    "requestInfo": "Request Program Info",
    "comparePrograms": "Compare CDL Programs",
    "exploreClassA": "Explore Class A",
    "exploreClassB": "Explore Class B",
    "viewTrainingPath": "View Training Path",
    "checkRequirements": "Check Requirements",
    "startApplication": "Start Your Application",
    "discussSponsorship": "Discuss Sponsorship",
    "enrollToday": "Enroll Today",
    "requestCurrentStartDates": "Request Current Start Dates",
    "startRequest": "Start Your Request",
    "readProgram": "Read Program",
    "downloadGuide": "Download Guide",
    "submitRequest": "Send Request"
  },
  "servicePages": {
    "classA": {
      "label": "Class A CDL",
      "url": "/services/cdl-class-a.html",
      "formType": "service_cdl_class_a"
    },
    "classB": {
      "label": "Class B CDL",
      "url": "/services/cdl-class-b.html",
      "formType": "service_cdl_class_b"
    },
    "behindTheWheel": {
      "label": "Behind-the-Wheel",
      "url": "/services/behind-the-wheel.html",
      "formType": "service_behind_the_wheel"
    },
    "jobPlacement": {
      "label": "Job Placement",
      "url": "/services/job-placement.html",
      "formType": "service_job_placement"
    },
    "financialAid": {
      "label": "Financial Aid",
      "url": "/services/financial-aid.html",
      "formType": "service_financial_aid"
    },
    "companySponsorships": {
      "label": "Company Sponsorships",
      "url": "/services/company-sponsorships.html",
      "formType": "service_company_sponsorships"
    }
  },
  "socialLinks": [
    {
      "label": "LinkedIn",
      "url": "",
      "icon": "linkedin",
      "enabled": false
    },
    {
      "label": "Facebook",
      "url": "",
      "icon": "facebook",
      "enabled": false
    },
    {
      "label": "Instagram",
      "url": "",
      "icon": "instagram",
      "enabled": false
    }
  ],
  "heroSlides": [
    {
      "id": "hero-01",
      "eyebrow": "Class A CDL Training",
      "title": "Train for the Road Ahead",
      "text": "Build the skills required for Class A commercial driving and prepare for a career in transportation.",
      "ctaLabel": "Explore Class A",
      "ctaLink": "/services/cdl-class-a.html",
      "image": "/images/card-2.jpg",
      "imageAlt": "CDL instructor guiding a trainee inside a commercial truck cab"
    },
    {
      "id": "hero-02",
      "eyebrow": "Hands-On Practice",
      "title": "Hands-On Practice",
      "text": "Develop confidence through structured yard sessions, pre-trip inspection practice, and behind-the-wheel training.",
      "ctaLabel": "View Training Path",
      "ctaLink": "/services/behind-the-wheel.html",
      "image": "/images/card-13.jpg",
      "imageAlt": "Adult CDL trainee beside a commercial tractor-trailer"
    },
    {
      "id": "hero-03",
      "eyebrow": "Career-Focused Support",
      "title": "Earn Your CDL",
      "text": "Compare CDL pathways, explore career support, and request information about your next available start date.",
      "ctaLabel": "Request Program Info",
      "ctaLink": "/contact/#request-info",
      "image": "/images/card-8.jpg",
      "imageAlt": "Commercial driver reviewing career information with a training advisor"
    }
  ],
  "companyStatistics": [
    {
      "value": "2",
      "label": "CDL License Paths",
      "note": "Class A and Class B",
      "verified": true
    },
    {
      "value": "4",
      "label": "Training Stages",
      "note": "Preparation, yard, road, and testing",
      "verified": true
    },
    {
      "value": "1:1",
      "label": "Coaching Options",
      "note": "Availability varies by program",
      "verified": false
    },
    {
      "value": "Available",
      "label": "Career Support",
      "note": "Employment is not guaranteed",
      "verified": true
    }
  ],
  "programOptions": [
    {
      "value": "",
      "label": "Select a program"
    },
    {
      "value": "undecided",
      "label": "I am not sure yet"
    },
    {
      "value": "class-a",
      "label": "Class A CDL Training"
    },
    {
      "value": "class-b",
      "label": "Class B CDL Training"
    },
    {
      "value": "behind-the-wheel",
      "label": "Behind-the-Wheel Training"
    },
    {
      "value": "job-placement",
      "label": "Job Placement Assistance"
    },
    {
      "value": "financial-aid",
      "label": "Financial Aid Information"
    },
    {
      "value": "company-sponsorships",
      "label": "Company Sponsorships"
    }
  ],
  "licenseStatusOptions": [
    "No current driver's license",
    "Valid non-commercial driver's license",
    "Commercial learner's permit",
    "Current Class B CDL",
    "Current Class A CDL",
    "Other or unsure"
  ],
  "trainingFormatOptions": [
    "Weekday",
    "Evening",
    "Weekend",
    "Accelerated",
    "Flexible or unsure"
  ],
  "preferredStartOptions": [
    "As soon as possible",
    "Within 30 days",
    "Within 60 days",
    "Within 90 days",
    "Later this year",
    "I am still planning"
  ],
  "contactFormHeadings": {
    "primaryEyebrow": "Program Inquiry",
    "primaryTitle": "Request CDL Program Information",
    "primaryText": "Share your goals and preferred training path. We will review your request and respond by email.",
    "shortTitle": "Start Your Request",
    "shortText": "Ask about a program, training format, or next available start option.",
    "newsletterTitle": "Stay Ahead of Start Dates",
    "newsletterText": "Subscribe by email for program updates and resource announcements.",
    "scheduleTitle": "Training Schedule Inquiry",
    "scheduleText": "Request current information about weekday, evening, weekend, or accelerated formats."
  },
  "forms": {
    "action": "/contact.php",
    "method": "POST",
    "allowedFormTypes": [
      "program_info",
      "contact",
      "newsletter",
      "schedule_inquiry",
      "advertise_collaborate",
      "service_cdl_class_a",
      "service_cdl_class_b",
      "service_behind_the_wheel",
      "service_job_placement",
      "service_financial_aid",
      "service_company_sponsorships"
    ],
    "honeypotField": "companyWebsite",
    "consentLabel": "I agree that the information I submit may be used to respond to my request.",
    "loadingMessage": "Sending your request...",
    "errorMessage": "We could not send your request. Please review the form and try again.",
    "networkErrorMessage": "A network error occurred. Please try again in a moment.",
    "invalidEmailMessage": "Enter a valid email address.",
    "requiredFieldMessage": "This field is required."
  },
  "successMessage": "Thank you! We have successfully received your request. Our team will review your information and get back to you shortly.",
  "advertiseCollaborate": {
    "heading": "Advertise & Collaborate",
    "text": "We are always open to new opportunities, high-impact collaborations, and tailored business partnerships. Whether you want to advertise your brand to our audience, launch a joint project, or book our professional services, we are ready to bring your ideas to life. Every business is unique, and we don't believe in one-size-fits-all solutions. Please reach out to us using the contact form below, tell us a bit about your goals, and our team will get back to you with an exclusive, custom-tailored proposal designed strictly for your budget and objectives. Let’s build something great together.",
    "emailCardLabel": "Corporate Email",
    "formTitle": "Tell Us About Your Goals",
    "formText": "Share the type of collaboration, your objectives, and any useful timing or budget context."
  },
  "legalBanner": {
    "storageKey": "cdlwayLegalAcknowledged",
    "text": "By continuing, you acknowledge our Privacy Policy, Cookie Policy, and Terms.",
    "buttonLabel": "I Understand",
    "privacyLabel": "Privacy Policy",
    "cookieLabel": "Cookie Policy",
    "termsLabel": "Terms and Conditions"
  },
  "legalLinks": [
    {
      "key": "privacy",
      "label": "Privacy Policy",
      "url": "/legal/privacy-policy.html"
    },
    {
      "key": "terms",
      "label": "Terms and Conditions",
      "url": "/legal/terms-and-conditions.html"
    },
    {
      "key": "cookies",
      "label": "Cookie Policy",
      "url": "/legal/cookie-policy.html"
    }
  ],
  "footerLinks": {
    "quickLinkKeys": [
      "start",
      "whyTrainWithUs",
      "cdlPaths",
      "careerSupport",
      "studentStories",
      "connect"
    ],
    "programLinkKeys": [
      "classA",
      "classB",
      "behindTheWheel",
      "jobPlacement",
      "financialAid",
      "companySponsorships"
    ],
    "supportLinks": [
      {
        "label": "Request Program Info",
        "url": "/contact/#request-info"
      },
      {
        "label": "Training Schedule",
        "url": "/contact/#schedule-inquiry"
      },
      {
        "label": "Advertise",
        "url": "/contact/#advertise-collaborate"
      }
    ]
  },
  "testimonials": {
    "isDemoContent": true,
    "overallRating": "4.8",
    "reviewCountLabel": "Demo rating data",
    "items": [
      {
        "name": "Jordan Brooks",
        "program": "Class A CDL Training",
        "location": "Demo location",
        "rating": 5,
        "quote": "The structured mix of classroom preparation and yard practice helped me understand what to work on before each session.",
        "avatar": "/images/card-12.jpg",
        "isDemo": true
      },
      {
        "name": "Maria Torres",
        "program": "Behind-the-Wheel Training",
        "location": "Demo location",
        "rating": 5,
        "quote": "The instructors explained each maneuver clearly and gave me practical feedback I could apply during the next attempt.",
        "avatar": "/images/card-3.jpg",
        "isDemo": true
      },
      {
        "name": "Ethan Cole",
        "program": "Class B CDL Training",
        "location": "Demo location",
        "rating": 4,
        "quote": "Comparing the program options made it easier to choose the commercial license path that matched my goals.",
        "avatar": "/images/card-7.jpg",
        "isDemo": true
      }
    ]
  },
  "disclaimers": {
    "employment": "Job placement assistance does not guarantee employment. Outcomes depend on qualifications, employer requirements, location, and market conditions.",
    "financialAssistance": "Financial aid and sponsorship availability depend on eligibility, program requirements, provider policies, and available funding.",
    "stateRequirements": "CDL requirements and testing procedures may vary by state.",
    "pricing": "Tuition, fees, and payment options must be confirmed directly with the training provider.",
    "startDates": "Training dates and schedule availability are subject to change."
  },
  "resources": {
    "programGuide": {
      "label": "Download Program Guide",
      "path": "/assets/images/resources/cdl-program-guide.pdf",
      "isPlaceholder": true
    },
    "studyGuide": {
      "label": "Download CDL Study Guide",
      "path": "/assets/images/resources/cdl-study-guide.pdf",
      "isPlaceholder": true
    }
  },
  "seoTitleTemplates": {
    "default": "{pageTitle} | {siteName}",
    "home": "CDL Training Programs & Career Support | {siteName}",
    "contact": "Request CDL Program Information | {siteName}",
    "cdlClassA": "Class A CDL Training Program | {siteName}",
    "cdlClassB": "Class B CDL Training Program | {siteName}",
    "behindTheWheel": "Behind-the-Wheel CDL Training | {siteName}",
    "jobPlacement": "CDL Job Placement Assistance | {siteName}",
    "financialAid": "CDL Financial Aid Information | {siteName}",
    "companySponsorships": "Company-Sponsored CDL Training | {siteName}",
    "privacyPolicy": "Privacy Policy | {siteName}",
    "termsAndConditions": "Terms and Conditions | {siteName}",
    "cookiePolicy": "Cookie Policy | {siteName}"
  },
  "seoDescriptionTemplates": {
    "home": "Compare Class A and Class B CDL training paths, explore behind-the-wheel practice, career support, financial assistance options, and request program information.",
    "contact": "Request information about CDL programs, training schedules, financial assistance, company sponsorships, or business collaboration opportunities.",
    "cdlClassA": "Explore Class A CDL training focused on combination vehicles, pre-trip inspection, backing, yard skills, road preparation, and career directions.",
    "cdlClassB": "Explore Class B CDL training for applicable straight trucks, buses, commercial vehicle controls, backing, road preparation, and program comparison.",
    "behindTheWheel": "Learn how instructor-led CDL practice can develop yard skills, backing fundamentals, turns, observation, vehicle control, and safer road habits.",
    "jobPlacement": "Explore CDL career support services such as resume preparation, employer connections, interview readiness, and application support.",
    "financialAid": "Request information about CDL training payment planning, eligibility-based assistance, documentation, and current financial support options.",
    "companySponsorships": "Compare employer-sponsored CDL training routes, eligibility questions, program expectations, commitments, and application steps.",
    "privacyPolicy": "Read the demonstration privacy policy for the CDLWAY training website and learn how submitted information may be handled.",
    "termsAndConditions": "Read the demonstration terms and conditions governing use of the CDLWAY training website.",
    "cookiePolicy": "Read the demonstration cookie policy for the CDLWAY training website."
  },
  "seoPages": {
    "home": {
      "canonicalPath": "/",
      "ogImage": "/images/card-1.jpg"
    },
    "contact": {
      "canonicalPath": "/contact/",
      "ogImage": "/images/card-4.jpg"
    },
    "cdlClassA": {
      "canonicalPath": "/services/cdl-class-a.html",
      "ogImage": "/images/card-5.jpg"
    },
    "cdlClassB": {
      "canonicalPath": "/services/cdl-class-b.html",
      "ogImage": "/images/card-11.jpg"
    },
    "behindTheWheel": {
      "canonicalPath": "/services/behind-the-wheel.html",
      "ogImage": "/images/card-15.jpg"
    },
    "jobPlacement": {
      "canonicalPath": "/services/job-placement.html",
      "ogImage": "/images/card-10.jpg"
    },
    "financialAid": {
      "canonicalPath": "/services/financial-aid.html",
      "ogImage": "/images/card-9.jpg"
    },
    "companySponsorships": {
      "canonicalPath": "/services/company-sponsorships.html",
      "ogImage": "/images/card-14.jpg"
    },
    "privacyPolicy": {
      "canonicalPath": "/legal/privacy-policy.html",
      "ogImage": "/images/card-6.jpg"
    },
    "termsAndConditions": {
      "canonicalPath": "/legal/terms-and-conditions.html",
      "ogImage": "/images/card-13.jpg"
    },
    "cookiePolicy": {
      "canonicalPath": "/legal/cookie-policy.html",
      "ogImage": "/images/card-2.jpg"
    }
  },
  "organizationSchema": {
    "type": "EducationalOrganization",
    "name": "{companyName}",
    "url": "{siteUrl}",
    "logo": "{siteUrl}{logoIconPath}",
    "email": "{corporateEmail}",
    "description": "{footerDescription}",
    "addressText": "{companyAddress}",
    "areaServed": "United States"
  },
  "demoContent": {
    "requiresReplacementBeforeLaunch": true,
    "items": [
      "The corporate email uses the reserved .example domain.",
      "The canonical domain is a placeholder.",
      "Hero and section image paths require final local image files.",
      "Program and study guide PDF paths are placeholders.",
      "Testimonial names, avatars, ratings, and quotes are demonstration content.",
      "Any unverified coaching availability must be confirmed by the client.",
      "Legal documents must be reviewed by a qualified professional for the applicable jurisdiction."
    ]
  }
};

  const findConfigScript = () => {
    if (
      document.currentScript &&
      document.currentScript.src &&
      /\/config\/config\.js(?:[?#].*)?$/.test(document.currentScript.src)
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
      return configScript.src;
    }

    return new URL("/config/config.js", window.location.href).href;
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
    const validatedConfig = validateConfig(SITE_CONFIG_DATA);

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
