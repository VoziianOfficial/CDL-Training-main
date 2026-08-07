(() => {
  "use strict";

  const APP_NAMESPACE = "CDLApp";
  const FORM_SELECTOR = "form[data-cdl-form]";
  const FORM_STATUS_SELECTOR = "[data-form-status]";
  const FORM_READY_EVENT = "cdl:forms-ready";
  const REQUEST_TIMEOUT = 25000;

  const DEFAULT_LIMITS = Object.freeze({
    fullName: 120,
    email: 254,
    program: 120,
    licenseStatus: 160,
    trainingFormat: 160,
    startPeriod: 160,
    message: 5000,
    collaborationType: 160,
    goals: 5000,
    generic: 500
  });

  const EMAIL_PATTERN =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  const HEADER_INJECTION_PATTERN = /[\r\n]/;

  window[APP_NAMESPACE] = window[APP_NAMESPACE] || {};

  const state = {
    initialized: false,
    registeredForms: new WeakSet(),
    formStates: new WeakMap(),
    fieldCounter: 0
  };

  const isPlainObject = (value) => {
    if (value === null || typeof value !== "object") {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  };

  const getConfigApi = () => {
    return window[APP_NAMESPACE].config || null;
  };

  const getAccessibilityApi = () => {
    return window[APP_NAMESPACE].accessibility || null;
  };

  const getSiteShellApi = () => {
    return window[APP_NAMESPACE].siteShell || null;
  };

  const getConfig = () => {
    return window.SITE_CONFIG || null;
  };

  const escapeSelector = (value) => {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(
      /([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g,
      "\\$1"
    );
  };

  const normalizeString = (value) => {
    return typeof value === "string" ? value.trim() : "";
  };

  const normalizeFieldName = (value) => {
    return String(value || "")
      .trim()
      .replace(/\[\]$/, "");
  };

  const createUniqueId = (prefix = "cdl-form-field") => {
    state.fieldCounter += 1;

    return `${prefix}-${state.fieldCounter}`;
  };

  const resolveFormType = (form, config) => {
    const hiddenField = form.elements.namedItem("formType");
    const requestedType =
      normalizeString(form.dataset.formType) ||
      normalizeString(hiddenField?.value);
    const allowedTypes = Array.isArray(
      config.forms?.allowedFormTypes
    )
      ? config.forms.allowedFormTypes
      : [];

    if (allowedTypes.includes(requestedType)) {
      return requestedType;
    }

    if (allowedTypes.includes("contact")) {
      return "contact";
    }

    return allowedTypes[0] || "contact";
  };

  const resolveFormAction = (form, config) => {
    const configuredAction =
      normalizeString(config.forms?.action) || "/contact.php";
    const formActionAttribute =
      normalizeString(form.getAttribute("action"));
    const selectedAction =
      formActionAttribute &&
      formActionAttribute !== "#" &&
      !formActionAttribute.toLowerCase().startsWith("javascript:")
        ? formActionAttribute
        : configuredAction;

    try {
      return new URL(selectedAction, window.location.href).href;
    } catch {
      return configuredAction;
    }
  };

  const ensureHiddenField = (form, name, value) => {
    let field = form.elements.namedItem(name);

    if (!(field instanceof HTMLInputElement)) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      form.appendChild(field);
    }

    field.value = String(value ?? "");
    field.defaultValue = field.value;

    return field;
  };

  const ensureFormMetadata = (form, config) => {
    const formType = resolveFormType(form, config);
    const sourcePage = window.location.href;
    const honeypotName =
      normalizeString(config.forms?.honeypotField) ||
      "companyWebsite";

    ensureHiddenField(form, "formType", formType);
    ensureHiddenField(form, "sourcePage", sourcePage);

    let honeypot = form.elements.namedItem(honeypotName);

    if (!(honeypot instanceof HTMLInputElement)) {
      const honeypotWrapper = document.createElement("div");

      honeypotWrapper.className = "cdl-form__honeypot";
      honeypotWrapper.setAttribute("aria-hidden", "true");

      const honeypotLabel = document.createElement("label");

      honeypotLabel.textContent = "Leave this field empty";

      honeypot = document.createElement("input");
      honeypot.type = "text";
      honeypot.name = honeypotName;
      honeypot.tabIndex = -1;
      honeypot.autocomplete = "off";

      honeypotLabel.appendChild(honeypot);
      honeypotWrapper.appendChild(honeypotLabel);
      form.appendChild(honeypotWrapper);
    }

    form.action = resolveFormAction(form, config);
    form.method = "post";
    form.noValidate = true;
    form.dataset.formType = formType;
  };

  const ensureStatusContainer = (form) => {
    let status = form.querySelector(FORM_STATUS_SELECTOR);

    if (status) {
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");

      if (!status.hasAttribute("role")) {
        status.setAttribute("role", "status");
      }

      return status;
    }

    status = document.createElement("div");
    status.className = "cdl-status";
    status.dataset.formStatus = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");

    form.appendChild(status);

    return status;
  };

  const setFormStatus = (
    form,
    type,
    message,
    {
      focus = false
    } = {}
  ) => {
    const status = ensureStatusContainer(form);
    const normalizedMessage = normalizeString(message);

    status.classList.remove(
      "is-visible",
      "is-success",
      "has-error",
      "is-loading"
    );

    if (!normalizedMessage) {
      status.textContent = "";
      status.setAttribute("role", "status");
      return;
    }

    status.textContent = normalizedMessage;
    status.classList.add("is-visible");

    if (type === "success") {
      status.classList.add("is-success");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
    } else if (type === "loading") {
      status.classList.add("is-loading");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
    } else {
      status.classList.add("has-error");
      status.setAttribute("role", "alert");
      status.setAttribute("aria-live", "assertive");
    }

    if (focus) {
      const accessibility = getAccessibilityApi();

      if (
        accessibility &&
        typeof accessibility.focusElement === "function"
      ) {
        accessibility.focusElement(status, {
          preventScroll: false
        });
      } else {
        if (!status.hasAttribute("tabindex")) {
          status.setAttribute("tabindex", "-1");
        }

        status.focus();
      }
    }
  };

  const getFieldWrapper = (field) => {
    return (
      field.closest(".cdl-form__field") ||
      field.closest("[data-form-field]") ||
      field.parentElement
    );
  };

  const getFieldLabel = (field) => {
    if (field.id) {
      const explicitLabel = field.form?.querySelector(
        `label[for="${escapeSelector(field.id)}"]`
      );

      if (explicitLabel) {
        return normalizeString(explicitLabel.textContent);
      }
    }

    const wrappingLabel = field.closest("label");

    if (wrappingLabel) {
      return normalizeString(wrappingLabel.textContent);
    }

    return (
      normalizeString(field.getAttribute("aria-label")) ||
      normalizeString(field.dataset.fieldLabel) ||
      normalizeString(field.name)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase()) ||
      "This field"
    );
  };

  const ensureFieldError = (field) => {
    const wrapper = getFieldWrapper(field);
    const fieldName =
      normalizeFieldName(field.name) || createUniqueId("field");
    let errorElement = wrapper?.querySelector(
      `[data-field-error="${escapeSelector(fieldName)}"]`
    );

    if (!errorElement) {
      errorElement = document.createElement("span");
      errorElement.className = "cdl-form__error";
      errorElement.dataset.fieldError = fieldName;
      errorElement.id = createUniqueId(
        `cdl-error-${fieldName.replace(/[^a-zA-Z0-9_-]/g, "-")}`
      );

      if (wrapper) {
        wrapper.appendChild(errorElement);
      } else {
        field.insertAdjacentElement("afterend", errorElement);
      }
    }

    if (!errorElement.id) {
      errorElement.id = createUniqueId("cdl-field-error");
    }

    return errorElement;
  };

  const updateDescribedBy = (field, errorId, add) => {
    const existingIds = normalizeString(
      field.getAttribute("aria-describedby")
    )
      .split(/\s+/)
      .filter(Boolean);

    const idSet = new Set(existingIds);

    if (add) {
      idSet.add(errorId);
    } else {
      idSet.delete(errorId);
    }

    if (idSet.size > 0) {
      field.setAttribute(
        "aria-describedby",
        Array.from(idSet).join(" ")
      );
    } else {
      field.removeAttribute("aria-describedby");
    }
  };

  const setFieldError = (field, message) => {
    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    const wrapper = getFieldWrapper(field);
    const errorElement = ensureFieldError(field);
    const normalizedMessage = normalizeString(message);

    errorElement.textContent = normalizedMessage;
    errorElement.hidden = false;

    field.setAttribute("aria-invalid", "true");
    updateDescribedBy(field, errorElement.id, true);

    wrapper?.classList.add("has-error");
  };

  const clearFieldError = (field) => {
    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    const wrapper = getFieldWrapper(field);
    const fieldName = normalizeFieldName(field.name);
    const errorElement = fieldName
      ? wrapper?.querySelector(
          `[data-field-error="${escapeSelector(fieldName)}"]`
        )
      : null;

    field.removeAttribute("aria-invalid");
    wrapper?.classList.remove("has-error");

    if (errorElement) {
      errorElement.textContent = "";
      errorElement.hidden = true;
      updateDescribedBy(field, errorElement.id, false);
    }
  };

  const clearFormErrors = (form) => {
    form
      .querySelectorAll('[aria-invalid="true"]')
      .forEach((field) => {
        clearFieldError(field);
      });

    form
      .querySelectorAll(".cdl-form__field.has-error")
      .forEach((wrapper) => {
        wrapper.classList.remove("has-error");
      });

    form
      .querySelectorAll(".cdl-form__error")
      .forEach((errorElement) => {
        errorElement.textContent = "";
        errorElement.hidden = true;
      });
  };

  const getFieldLimit = (field) => {
    if (
      Number.isInteger(field.maxLength) &&
      field.maxLength > 0
    ) {
      return field.maxLength;
    }

    const fieldName = normalizeFieldName(field.name);
    const normalizedName = fieldName.toLowerCase();

    if (
      normalizedName === "fullname" ||
      normalizedName === "full_name" ||
      normalizedName === "name"
    ) {
      return DEFAULT_LIMITS.fullName;
    }

    if (normalizedName.includes("email")) {
      return DEFAULT_LIMITS.email;
    }

    if (normalizedName.includes("program")) {
      return DEFAULT_LIMITS.program;
    }

    if (
      normalizedName.includes("license") ||
      normalizedName.includes("licence")
    ) {
      return DEFAULT_LIMITS.licenseStatus;
    }

    if (
      normalizedName.includes("trainingformat") ||
      normalizedName.includes("training_format")
    ) {
      return DEFAULT_LIMITS.trainingFormat;
    }

    if (
      normalizedName.includes("startperiod") ||
      normalizedName.includes("start_period")
    ) {
      return DEFAULT_LIMITS.startPeriod;
    }

    if (
      normalizedName.includes("message") ||
      normalizedName.includes("goals") ||
      field instanceof HTMLTextAreaElement
    ) {
      return DEFAULT_LIMITS.message;
    }

    if (normalizedName.includes("collaboration")) {
      return DEFAULT_LIMITS.collaborationType;
    }

    return DEFAULT_LIMITS.generic;
  };

  const validateTextField = (field, config) => {
    const label = getFieldLabel(field);
    const value = normalizeString(field.value);
    const requiredMessage =
      config.forms?.requiredFieldMessage ||
      "This field is required.";

    if (field.required && value === "") {
      return requiredMessage;
    }

    if (value === "") {
      return "";
    }

    const maximumLength = getFieldLimit(field);

    if (value.length > maximumLength) {
      return `${label} must contain no more than ${maximumLength} characters.`;
    }

    if (HEADER_INJECTION_PATTERN.test(value)) {
      return `${label} contains unsupported line breaks.`;
    }

    if (
      field.type === "email" ||
      normalizeFieldName(field.name)
        .toLowerCase()
        .includes("email")
    ) {
      if (
        value.length > DEFAULT_LIMITS.email ||
        !EMAIL_PATTERN.test(value)
      ) {
        return (
          config.forms?.invalidEmailMessage ||
          "Enter a valid email address."
        );
      }
    }

    if (field.pattern) {
      try {
        const pattern = new RegExp(
          `^(?:${field.pattern})$`,
          "u"
        );

        if (!pattern.test(value)) {
          return (
            field.dataset.patternMessage ||
            `${label} is not in the expected format.`
          );
        }
      } catch {
        return "";
      }
    }

    return "";
  };

  const validateSelectField = (field, config) => {
    const value = normalizeString(field.value);

    if (field.required && value === "") {
      return (
        config.forms?.requiredFieldMessage ||
        "This field is required."
      );
    }

    return "";
  };

  const validateCheckboxField = (field, config) => {
    if (field.required && !field.checked) {
      return (
        field.dataset.requiredMessage ||
        config.forms?.requiredFieldMessage ||
        "This field is required."
      );
    }

    return "";
  };

  const validateRadioGroup = (field, config) => {
    if (!field.required || !field.name) {
      return "";
    }

    const group = field.form.querySelectorAll(
      `input[type="radio"][name="${escapeSelector(field.name)}"]`
    );

    const hasSelection = Array.from(group).some(
      (radio) => radio.checked
    );

    if (!hasSelection) {
      return (
        field.dataset.requiredMessage ||
        config.forms?.requiredFieldMessage ||
        "This field is required."
      );
    }

    return "";
  };

  const isPhoneRelatedField = (field) => {
    const fieldIdentity = [
      field.name,
      field.id,
      field.getAttribute("autocomplete"),
      field.dataset.fieldLabel,
      getFieldLabel(field)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return /\b(phone|telephone|mobile number|cell number)\b/.test(
      fieldIdentity
    );
  };

  const validateField = (field, config) => {
    if (
      field.disabled ||
      field.type === "hidden" ||
      field.closest(".cdl-form__honeypot")
    ) {
      return "";
    }

    if (isPhoneRelatedField(field)) {
      return "Phone fields are not used on this form.";
    }

    if (field instanceof HTMLSelectElement) {
      return validateSelectField(field, config);
    }

    if (
      field instanceof HTMLInputElement &&
      field.type === "checkbox"
    ) {
      return validateCheckboxField(field, config);
    }

    if (
      field instanceof HTMLInputElement &&
      field.type === "radio"
    ) {
      return validateRadioGroup(field, config);
    }

    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      return validateTextField(field, config);
    }

    return "";
  };

  const getValidatableFields = (form) => {
    return Array.from(form.elements).filter((field) => {
      return (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      );
    });
  };

  const validateForm = (form, config) => {
    clearFormErrors(form);

    const errors = new Map();
    const processedRadioGroups = new Set();

    getValidatableFields(form).forEach((field) => {
      if (
        field instanceof HTMLInputElement &&
        field.type === "radio"
      ) {
        if (
          !field.name ||
          processedRadioGroups.has(field.name)
        ) {
          return;
        }

        processedRadioGroups.add(field.name);
      }

      const message = validateField(field, config);

      if (!message) {
        return;
      }

      errors.set(field, message);
      setFieldError(field, message);
    });

    return {
      valid: errors.size === 0,
      errors
    };
  };

  const focusFirstInvalidField = (form) => {
    const invalidField = form.querySelector(
      '[aria-invalid="true"]'
    );

    if (!invalidField) {
      return;
    }

    const accessibility = getAccessibilityApi();

    invalidField.scrollIntoView({
      behavior:
        accessibility &&
        typeof accessibility.prefersReducedMotion === "function" &&
        accessibility.prefersReducedMotion()
          ? "auto"
          : "smooth",
      block: "center"
    });

    window.setTimeout(() => {
      invalidField.focus({
        preventScroll: true
      });
    }, 150);
  };

  const applyServerErrors = (form, errors) => {
    if (!isPlainObject(errors)) {
      return false;
    }

    let appliedError = false;

    Object.entries(errors).forEach(([fieldName, message]) => {
      if (typeof message !== "string") {
        return;
      }

      const field = form.elements.namedItem(fieldName);

      if (
        field instanceof RadioNodeList
      ) {
        const firstField = Array.from(field).find(
          (item) =>
            item instanceof HTMLInputElement ||
            item instanceof HTMLSelectElement ||
            item instanceof HTMLTextAreaElement
        );

        if (firstField) {
          setFieldError(firstField, message);
          appliedError = true;
        }

        return;
      }

      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        setFieldError(field, message);
        appliedError = true;
      }
    });

    return appliedError;
  };

  const sanitizeFormData = (formData) => {
    const sanitizedData = new FormData();

    formData.forEach((value, key) => {
      const normalizedKey = normalizeFieldName(key);

      if (value instanceof File) {
        if (value.size > 0) {
          sanitizedData.append(normalizedKey, value, value.name);
        }

        return;
      }

      sanitizedData.append(
        normalizedKey,
        normalizeString(String(value))
      );
    });

    return sanitizedData;
  };

  const setSubmittingState = (form, isSubmitting) => {
    const formState = state.formStates.get(form);
    const submitControls = Array.from(
      form.querySelectorAll(
        'button[type="submit"], input[type="submit"]'
      )
    );

    if (formState) {
      formState.submitting = isSubmitting;
    }

    form.setAttribute(
      "aria-busy",
      String(isSubmitting)
    );

    submitControls.forEach((control) => {
      if (
        control instanceof HTMLButtonElement
      ) {
        if (isSubmitting) {
          control.dataset.wasDisabled = String(
            control.disabled
          );
          control.disabled = true;
          control.classList.add("is-loading");

          let spinner = control.querySelector(
            ".cdl-btn__spinner"
          );

          if (!spinner) {
            spinner = document.createElement("span");
            spinner.className = "cdl-btn__spinner";
            spinner.setAttribute("aria-hidden", "true");
            control.appendChild(spinner);
          }
        } else {
          control.disabled =
            control.dataset.wasDisabled === "true";
          control.classList.remove("is-loading");
          delete control.dataset.wasDisabled;
        }
      }

      if (
        control instanceof HTMLInputElement
      ) {
        if (isSubmitting) {
          control.dataset.originalValue = control.value;
          control.dataset.wasDisabled = String(
            control.disabled
          );
          control.disabled = true;
        } else {
          if (control.dataset.originalValue) {
            control.value = control.dataset.originalValue;
          }

          control.disabled =
            control.dataset.wasDisabled === "true";

          delete control.dataset.originalValue;
          delete control.dataset.wasDisabled;
        }
      }
    });
  };

  const parseJsonResponse = async (response) => {
    const contentType =
      response.headers.get("content-type") || "";

    if (
      !contentType.toLowerCase().includes(
        "application/json"
      )
    ) {
      throw new Error("INVALID_RESPONSE");
    }

    try {
      return await response.json();
    } catch {
      throw new Error("INVALID_RESPONSE");
    }
  };

  const submitForm = async (form, config) => {
    const formState = state.formStates.get(form);

    if (!formState || formState.submitting) {
      return;
    }

    ensureFormMetadata(form, config);

    const validationResult = validateForm(
      form,
      config
    );

    if (!validationResult.valid) {
      setFormStatus(
        form,
        "error",
        "Please review the highlighted fields and try again."
      );

      focusFirstInvalidField(form);

      const accessibility = getAccessibilityApi();

      accessibility?.announce?.(
        "The form contains errors. Please review the highlighted fields.",
        {
          priority: "assertive"
        }
      );

      return;
    }

    const honeypotName =
      config.forms?.honeypotField ||
      "companyWebsite";
    const honeypot = form.elements.namedItem(
      honeypotName
    );

    if (
      honeypot instanceof HTMLInputElement &&
      normalizeString(honeypot.value) !== ""
    ) {
      setFormStatus(
        form,
        "error",
        config.forms?.errorMessage ||
          "We could not send your request. Please review the form and try again."
      );

      return;
    }

    const loadingMessage =
      config.forms?.loadingMessage ||
      "Sending your request...";

    setSubmittingState(form, true);
    setFormStatus(form, "loading", loadingMessage);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT);

    try {
      const rawFormData = new FormData(form);
      const formData = sanitizeFormData(rawFormData);
      const response = await fetch(
        resolveFormAction(form, config),
        {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest"
          },
          signal: controller.signal
        }
      );

      const payload = await parseJsonResponse(response);

      if (
        response.ok &&
        payload &&
        payload.success === true
      ) {
        const successMessage =
          normalizeString(payload.message) ||
          config.successMessage;

        form.reset();
        ensureFormMetadata(form, config);
        clearFormErrors(form);

        setFormStatus(
          form,
          "success",
          successMessage,
          {
            focus: true
          }
        );

        const accessibility = getAccessibilityApi();

        accessibility?.announce?.(successMessage, {
          priority: "polite",
          clearAfter: 8000
        });

        form.dispatchEvent(
          new CustomEvent("cdl:form-success", {
            bubbles: true,
            detail: {
              formType: resolveFormType(
                form,
                config
              ),
              response: payload
            }
          })
        );

        return;
      }

      const hasFieldErrors = applyServerErrors(
        form,
        payload?.errors
      );

      const errorMessage =
        normalizeString(payload?.message) ||
        config.forms?.errorMessage ||
        "We could not send your request. Please review the form and try again.";

      setFormStatus(
        form,
        "error",
        errorMessage
      );

      if (hasFieldErrors) {
        focusFirstInvalidField(form);
      }

      const accessibility = getAccessibilityApi();

      accessibility?.announce?.(errorMessage, {
        priority: "assertive"
      });

      form.dispatchEvent(
        new CustomEvent("cdl:form-error", {
          bubbles: true,
          detail: {
            formType: resolveFormType(
              form,
              config
            ),
            response: payload
          }
        })
      );
    } catch (error) {
      const isTimeout =
        error instanceof DOMException &&
        error.name === "AbortError";

      const errorMessage = isTimeout
        ? "The request took too long. Please try again."
        : config.forms?.networkErrorMessage ||
          "A network error occurred. Please try again in a moment.";

      setFormStatus(
        form,
        "error",
        errorMessage
      );

      const accessibility = getAccessibilityApi();

      accessibility?.announce?.(errorMessage, {
        priority: "assertive"
      });

      form.dispatchEvent(
        new CustomEvent("cdl:form-error", {
          bubbles: true,
          detail: {
            formType: resolveFormType(
              form,
              config
            ),
            reason: isTimeout
              ? "timeout"
              : "network"
          }
        })
      );
    } finally {
      window.clearTimeout(timeoutId);
      setSubmittingState(form, false);
    }
  };

  const handleFieldInput = (event) => {
    const field = event.target;

    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    if (field.getAttribute("aria-invalid") === "true") {
      clearFieldError(field);
    }

    const form = field.form;

    if (form) {
      const status = form.querySelector(
        FORM_STATUS_SELECTOR
      );

      if (
        status &&
        (
          status.classList.contains("has-error") ||
          status.classList.contains("is-success")
        )
      ) {
        setFormStatus(form, "", "");
      }
    }
  };

  const handleFieldBlur = (event) => {
    const field = event.target;
    const config = getConfig();

    if (
      !config ||
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    if (
      field.type === "hidden" ||
      field.closest(".cdl-form__honeypot")
    ) {
      return;
    }

    const hasContent =
      field instanceof HTMLInputElement &&
      (
        field.type === "checkbox" ||
        field.type === "radio"
      )
        ? field.checked
        : normalizeString(field.value) !== "";

    if (!field.required && !hasContent) {
      clearFieldError(field);
      return;
    }

    const message = validateField(field, config);

    if (message) {
      setFieldError(field, message);
    } else {
      clearFieldError(field);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const config = getConfig();

    if (
      !(form instanceof HTMLFormElement) ||
      !config
    ) {
      return;
    }

    void submitForm(form, config);
  };

  const prepareFields = (form) => {
    getValidatableFields(form).forEach((field) => {
      if (
        field.type === "hidden" ||
        field.closest(".cdl-form__honeypot")
      ) {
        return;
      }

      if (!field.id) {
        field.id = createUniqueId(
          `cdl-${normalizeFieldName(field.name) || "field"}`
        );
      }

      if (
        field instanceof HTMLInputElement &&
        field.type === "email"
      ) {
        field.autocomplete =
          field.autocomplete || "email";
        field.inputMode = "email";
        field.maxLength = Math.min(
          field.maxLength > 0
            ? field.maxLength
            : DEFAULT_LIMITS.email,
          DEFAULT_LIMITS.email
        );
      }

      if (
        field instanceof HTMLInputElement &&
        (
          normalizeFieldName(field.name)
            .toLowerCase() === "fullname" ||
          normalizeFieldName(field.name)
            .toLowerCase() === "full_name"
        )
      ) {
        field.autocomplete =
          field.autocomplete || "name";

        if (field.maxLength <= 0) {
          field.maxLength =
            DEFAULT_LIMITS.fullName;
        }
      }

      if (
        (
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement
        ) &&
        field.maxLength <= 0
      ) {
        field.maxLength = getFieldLimit(field);
      }

      const existingError = ensureFieldError(field);

      existingError.hidden = true;
    });
  };

  const hydrateFormOptions = (form) => {
    const siteShell = getSiteShellApi();

    if (
      siteShell &&
      typeof siteShell.hydrateConfigBindings ===
        "function"
    ) {
      siteShell.hydrateConfigBindings(
        form,
        getConfig()
      );
    }
  };

  const registerForm = (form, config) => {
    if (
      !(form instanceof HTMLFormElement) ||
      state.registeredForms.has(form)
    ) {
      return false;
    }

    ensureFormMetadata(form, config);
    hydrateFormOptions(form);
    prepareFields(form);
    ensureStatusContainer(form);

    state.formStates.set(form, {
      submitting: false
    });

    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", handleFieldInput);
    form.addEventListener("change", handleFieldInput);
    form.addEventListener(
      "focusout",
      handleFieldBlur
    );

    state.registeredForms.add(form);
    form.dataset.formReady = "true";

    return true;
  };

  const initializeForms = (
    root = document,
    config = getConfig()
  ) => {
    if (
      !config ||
      !root ||
      typeof root.querySelectorAll !== "function"
    ) {
      return [];
    }

    const forms = Array.from(
      root.querySelectorAll(FORM_SELECTOR)
    );

    forms.forEach((form) => {
      registerForm(form, config);
    });

    if (
      root instanceof HTMLFormElement &&
      root.matches(FORM_SELECTOR)
    ) {
      registerForm(root, config);

      if (!forms.includes(root)) {
        forms.unshift(root);
      }
    }

    return forms;
  };

  const initializeWhenReady = () => {
    const configApi = getConfigApi();

    if (!configApi?.ready) {
      return;
    }

    configApi.ready
      .then((config) => {
        const forms = initializeForms(
          document,
          config
        );

        document.dispatchEvent(
          new CustomEvent(FORM_READY_EVENT, {
            detail: {
              forms
            }
          })
        );
      })
      .catch(() => undefined);
  };

  const init = (root = document) => {
    if (root !== document) {
      const config = getConfig();

      return config
        ? initializeForms(root, config)
        : [];
    }

    if (state.initialized) {
      return initializeForms(
        document,
        getConfig()
      );
    }

    state.initialized = true;

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        initializeWhenReady,
        {
          once: true
        }
      );
    } else {
      initializeWhenReady();
    }

    document.addEventListener(
      "cdl:shell-ready",
      () => {
        initializeForms(document, getConfig());
      }
    );

    return [];
  };

  window[APP_NAMESPACE].forms = Object.freeze({
    init,
    registerForm(form) {
      const config = getConfig();

      return config
        ? registerForm(form, config)
        : false;
    },
    validate(form) {
      const config = getConfig();

      if (
        !(form instanceof HTMLFormElement) ||
        !config
      ) {
        return {
          valid: false,
          errors: new Map()
        };
      }

      return validateForm(form, config);
    },
    submit(form) {
      const config = getConfig();

      if (
        !(form instanceof HTMLFormElement) ||
        !config
      ) {
        return Promise.resolve();
      }

      return submitForm(form, config);
    },
    clearErrors: clearFormErrors,
    setStatus: setFormStatus,
    get registeredCount() {
      return document.querySelectorAll(
        `${FORM_SELECTOR}[data-form-ready="true"]`
      ).length;
    }
  });

  init();
})();
