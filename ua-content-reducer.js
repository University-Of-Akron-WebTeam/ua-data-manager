(function(global) {
  "use strict";

  // UA Content Reducer.
  //
  // Vanilla JS utility for reducing existing DOM content. It reads content from
  // configured source elements, strips HTML by using textContent, truncates to a
  // configured character count, and can clone/wire "see more" buttons.

  var defaults = {
    targets: "",
    source: "",
    output: "",
    maxCharacters: 160,
    ellipsis: "...",
    preserveWords: true,
    button: {
      mode: "none",
      source: "",
      target: "",
      text: "See more",
      url: "",
      urlAttribute: "data-url",
      urlAttributes: ["data-read-more-url", "data-url"],
      className: "ua-content-reducer-button"
    }
  };

  function run(options) {
    return new ContentReducer(options || {}).run();
  }

  function start(options) {
    return run(options);
  }

  function ContentReducer(options) {
    this.settings = normalizeOptions(options || {});
    this.items = [];
  }

  ContentReducer.prototype.run = function() {
    var targets = resolveElements(this.settings.targets);

    this.items = targets.map(function(target, index) {
      return this.reduceTarget(target, index);
    }, this).filter(Boolean);

    return this;
  };

  ContentReducer.prototype.reduceTarget = function(target, index) {
    var source = resolveScopedElement(target, this.settings.source) || target;
    var output = resolveScopedElement(target, this.settings.output) || source;
    var originalText = cleanText(source);
    var reducedText = reduceText(originalText, this.settings);
    var button;

    output.textContent = reducedText;
    button = this.renderButton(target, source, output, originalText, reducedText, index);

    return {
      target: target,
      source: source,
      output: output,
      button: button,
      originalText: originalText,
      reducedText: reducedText
    };
  };

  ContentReducer.prototype.renderButton = function(target, source, output, originalText, reducedText, index) {
    var buttonOptions = this.settings.button || {};
    var buttonUrl = resolveUrl(buttonOptions, target, source, output, index);
    var shouldShow = originalText.length > reducedText.length || !!buttonUrl;
    var button;

    if (!shouldShow || buttonOptions.mode === "none") {
      return null;
    }

    if (buttonOptions.mode === "clone") {
      button = cloneButton(target, buttonOptions);
    } else if (buttonOptions.mode === "wire") {
      button = resolveScopedElement(target, buttonOptions.source);
    } else if (buttonOptions.mode === "create") {
      button = createButton(buttonOptions);
    }

    if (!button) {
      return null;
    }

    wireButton(button, buttonUrl, output, originalText);
    mountButton(button, target, output, buttonOptions);
    return button;
  };

  function normalizeOptions(options) {
    var settings = merge(defaults, options);

    settings.button = merge(defaults.button, options.button || {});
    settings.maxCharacters = Number(settings.maxCharacters || settings.characters || settings.length || defaults.maxCharacters);

    return settings;
  }

  function resolveElements(value) {
    if (!value) {
      return [];
    }

    if (typeof value === "string") {
      return toArray(global.document.querySelectorAll(value));
    }

    if (value.nodeType === 1) {
      return [value];
    }

    if (typeof value.length === "number") {
      return toArray(value);
    }

    return [];
  }

  function resolveScopedElement(root, selectorOrElement) {
    if (!selectorOrElement) {
      return null;
    }

    if (selectorOrElement.nodeType === 1) {
      return selectorOrElement;
    }

    return root.querySelector(selectorOrElement);
  }

  function cleanText(element) {
    return normalizeWhitespace(element ? element.textContent : "");
  }

  function reduceText(text, settings) {
    var max = Math.max(0, Number(settings.maxCharacters || 0));
    var reduced;

    if (!max || text.length <= max) {
      return text;
    }

    reduced = text.slice(0, max);

    if (settings.preserveWords) {
      reduced = reduced.replace(/\s+\S*$/, "");
    }

    return reduced.replace(/\s+$/, "") + settings.ellipsis;
  }

  function cloneButton(target, options) {
    var source = resolveButtonElement(target, options.source);

    return source ? prepareClonedButton(source.cloneNode(true), options) : null;
  }

  function prepareClonedButton(button, options) {
    button.removeAttribute("id");
    button.removeAttribute("hidden");
    button.removeAttribute("aria-hidden");

    if (options.templateClass) {
      removeClass(button, options.templateClass);
    }

    removeClass(button, "demo-template");
    removeClass(button, "d-none");
    removeClass(button, "dn");

    if (options.className) {
      button.className = options.className;
    }

    return button;
  }

  function createButton(options) {
    var button = global.document.createElement(options.url ? "a" : "button");

    button.textContent = options.text || defaults.button.text;
    button.className = options.className || defaults.button.className;

    if (!options.url) {
      button.type = "button";
    }

    return button;
  }

  function wireButton(button, url, output, originalText) {
    if (url) {
      if (button.tagName && button.tagName.toLowerCase() === "a") {
        button.setAttribute("href", url);
      } else {
        button.addEventListener("click", function() {
          global.location.href = url;
        });
      }
    } else {
      button.addEventListener("click", function() {
        output.textContent = originalText;
        button.setAttribute("hidden", "hidden");
      });
    }
  }

  function resolveUrl(options, target, source, output, index) {
    var url = options.url;
    var attrs = getUrlAttributes(options);
    var urlFromAttributes;

    if (typeof url === "function") {
      return url(target, source, output, index);
    }

    if (url) {
      return url;
    }

    urlFromAttributes = firstAttributeValue(target, attrs)
      || firstAttributeValue(source, attrs)
      || firstAttributeValue(output, attrs)
      || firstNestedAttributeValue(target, attrs);

    return urlFromAttributes || "";
  }

  function getUrlAttributes(options) {
    var attrs = [];

    if (options.urlAttribute) {
      attrs.push(options.urlAttribute);
    }

    if (Array.isArray(options.urlAttributes)) {
      attrs = attrs.concat(options.urlAttributes);
    }

    return uniqueValues(attrs.concat(defaults.button.urlAttributes));
  }

  function firstAttributeValue(element, attrs) {
    var index;
    var value;

    if (!element) {
      return "";
    }

    for (index = 0; index < attrs.length; index += 1) {
      value = element.getAttribute(attrs[index]);

      if (value) {
        return value;
      }
    }

    return "";
  }

  function firstNestedAttributeValue(root, attrs) {
    var index;
    var element;

    if (!root) {
      return "";
    }

    for (index = 0; index < attrs.length; index += 1) {
      element = root.querySelector("[" + attrs[index] + "]");

      if (element && element.getAttribute(attrs[index])) {
        return element.getAttribute(attrs[index]);
      }
    }

    return "";
  }

  function mountButton(button, target, output, options) {
    var mount = resolveScopedElement(target, options.target);

    if (mount && button.parentNode !== mount) {
      mount.appendChild(button);
      return;
    }

    if (output && button.parentNode !== output) {
      output.appendChild(global.document.createTextNode(" "));
      output.appendChild(button);
    }
  }

  function resolveButtonElement(root, selectorOrElement) {
    var element = resolveScopedElement(root, selectorOrElement);

    if (element || !selectorOrElement || selectorOrElement.nodeType === 1) {
      return element;
    }

    return global.document.querySelector(selectorOrElement);
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function removeClass(element, className) {
    if (!element || !className) {
      return;
    }

    if (element.classList) {
      element.classList.remove(className);
      return;
    }

    element.className = String(element.className || "").replace(new RegExp("(^|\\s)" + className + "(?=\\s|$)", "g"), " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }

  function uniqueValues(values) {
    var seen = {};

    return values.filter(function(value) {
      if (!value || seen[value]) {
        return false;
      }

      seen[value] = true;
      return true;
    });
  }

  function merge(base, override) {
    var result = {};
    var key;

    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        result[key] = base[key];
      }
    }

    for (key in override) {
      if (Object.prototype.hasOwnProperty.call(override, key)) {
        result[key] = override[key];
      }
    }

    return result;
  }

  global.UAContentReducer = {
    run: run,
    start: start,
    ContentReducer: ContentReducer
  };
}(window));
