(function(global) {
  "use strict";

  // UA Data Manager gallery plugin.
  //
  // This file is intentionally shaped as a template for future plugins:
  // 1. load one HTML template,
  // 2. clone it into the stage,
  // 3. copy repeatable elements,
  // 4. replace values in text and attributes,
  // 5. bind behavior to stable template selectors.

  var defaults = {
    stage: "",
    template: "",
    templateurl: "",
    itemtemplate: "",
    baseurl: "",
    urlFields: ["thumbnail", "full", "image"],
    paging: {
      enabled: true,
      type: "previous-next",
      page: 1,
      pageSize: 24
    },
    fancybox: {
      enabled: true,
      selector: "[data-fancybox=\"ua-gallery\"]",
      options: {}
    },
    captions: {
      enabled: true
    }
  };

  function createGalleryPlugin(context, options) {
    return new GalleryPlugin(context, normalizeOptions(options || {}));
  }

  // Plugin lifecycle

  function GalleryPlugin(context, settings) {
    this.context = context;
    this.settings = settings;
    this.stage = context.resolveElement(settings.stage);
    this.baseurl = settings.baseurl || getUrlOrigin(context.manager.options && context.manager.options.dataurl);
    this.templates = null;
    this.view = null;
    this.eventsBound = false;
    this.fancyboxBound = false;
    this.state = {
      page: Number(settings.paging.page || 1)
    };
  }

  GalleryPlugin.prototype.init = function() {
    return this.context.loadTemplate(this.settings).then(function(template) {
      this.templates = TemplateRenderer.prepare(template || this.settings.template, this.settings.itemtemplate);

      if (!this.templates.shell) {
        throw new Error("UA Data Manager gallery plugin needs a template or templateurl.");
      }

      if (!this.templates.item) {
        throw new Error("UA Data Manager gallery template needs a data-ua-gallery-item-template element or itemtemplate option.");
      }

      this.mountTemplate();
      this.bindEvents();
      this.bindFancybox();
    }.bind(this));
  };

  GalleryPlugin.prototype.render = function() {
    var records;

    if (!this.stage) {
      return this;
    }

    this.mountTemplate();

    records = RecordMapper.prepare(this.context.records(), this.baseurl, this.settings.urlFields);
    this.view = this.settings.paging.enabled === false
      ? createFullView(records)
      : this.context.paging.apply(records, this.settings.paging, this.state);
    this.state.page = this.view.page;

    this.replaceValues({
      count: this.view.total,
      shown: this.view.shown,
      page: this.view.page,
      pageCount: this.view.pageCount,
      paging: ""
    });
    this.replaceList("[data-ua-gallery-items]", this.templates.item, this.view.rows);
    this.updateCaptions();
    this.updatePaging();
    this.bindFancybox();
    this.emitRendered();
    return this;
  };

  // Public template methods.
  //
  // These methods are deliberately generic so another plugin can copy this
  // shape and replace gallery-specific selectors with its own template handles.

  GalleryPlugin.prototype.clone = function(template) {
    return TemplateRenderer.clone(template);
  };

  GalleryPlugin.prototype.replaceVariables = function(template, values) {
    return TemplateRenderer.replaceVariables(template, values, this.context.escapeHtml);
  };

  GalleryPlugin.prototype.repeat = function(template, records) {
    return TemplateRenderer.repeat(template, records, this.context.escapeHtml);
  };

  GalleryPlugin.prototype.mountTemplate = function() {
    if (!this.stage || !this.templates || this.stage.querySelector("[data-ua-gallery]")) {
      return;
    }

    this.stage.replaceChildren(TemplateRenderer.clone(this.templates.shell.content));
  };

  GalleryPlugin.prototype.replaceValues = function(values) {
    TemplateRenderer.replaceTextTargets(this.stage, values);
    TemplateRenderer.replaceVariables(this.stage, values);
  };

  GalleryPlugin.prototype.replaceList = function(targetSelector, itemTemplate, records) {
    var target = this.stage.querySelector(targetSelector);
    var items = this.repeat(itemTemplate, records);

    if (!target) {
      return;
    }

    target.replaceChildren();
    items.forEach(function(item) {
      target.appendChild(item);
    });
  };

  GalleryPlugin.prototype.updateCaptions = function() {
    Array.prototype.forEach.call(this.stage.querySelectorAll("[data-ua-gallery-caption]"), function(element) {
      element.hidden = this.settings.captions.enabled === false;
    }.bind(this));
  };

  GalleryPlugin.prototype.updatePaging = function() {
    var paging = this.stage.querySelector("[data-ua-gallery-paging]");
    var controls;
    var controlMap = {};

    if (paging) {
      paging.hidden = this.settings.paging.enabled === false;
    }

    if (this.settings.paging.enabled === false) {
      return;
    }

    controls = this.context.paging.controls(this.view);

    controls.forEach(function(control) {
      controlMap[control.action] = control;
    });

    Array.prototype.forEach.call(this.stage.querySelectorAll("[data-ua-gallery-control]"), function(element) {
      var control = controlMap[element.getAttribute("data-ua-gallery-control")];

      if (!control) {
        element.hidden = true;
        return;
      }

      element.hidden = false;
      element.disabled = !!control.disabled;
      element.setAttribute("data-ua-gallery-page", control.page);

      if (!element.hasAttribute("data-ua-gallery-static-label")) {
        element.textContent = control.label;
      }
    });
  };

  GalleryPlugin.prototype.bindEvents = function() {
    if (!this.stage || this.eventsBound) {
      return;
    }

    this.context.listen(this.stage, "click", "[data-ua-gallery-page]", function(event, button) {
      this.state.page = Number(button.getAttribute("data-ua-gallery-page") || 1);
      this.context.manager.render();
    }.bind(this));

    this.eventsBound = true;
  };

  // Fancybox supports a container-scoped delegated binding. The stage stays in
  // place while its descendants are replaced, so this only needs to bind once.

  GalleryPlugin.prototype.bindFancybox = function() {
    var fancyboxSettings = this.settings.fancybox;

    if (this.fancyboxBound || !this.stage || !fancyboxSettings.enabled) {
      return false;
    }

    if (!global.Fancybox || typeof global.Fancybox.bind !== "function") {
      return false;
    }

    global.Fancybox.bind(this.stage, fancyboxSettings.selector, fancyboxSettings.options || {});
    this.fancyboxBound = true;
    return true;
  };

  GalleryPlugin.prototype.emitRendered = function() {
    if (!this.stage || typeof global.CustomEvent !== "function") {
      return;
    }

    this.stage.dispatchEvent(new global.CustomEvent("ua-gallery:rendered", {
      bubbles: true,
      detail: {
        view: this.view,
        gallery: this
      }
    }));
  };

  // Template utilities

  var TemplateRenderer = {
    prepare: function(template, itemTemplate) {
      var shell = createTemplate(template || "");
      var itemNode = itemTemplate ? null : shell.content.querySelector("template[data-ua-gallery-item-template]");
      var item = itemTemplate ? createTemplate(itemTemplate) : itemNode;

      if (itemNode) {
        itemNode.remove();
      }

      return {
        shell: shell,
        item: item
      };
    },

    clone: function(template) {
      if (template && typeof template.cloneNode === "function") {
        return template.cloneNode(true);
      }

      return (" " + String(template || "")).slice(1);
    },

    repeat: function(template, records, escapeHtml) {
      return (records || []).map(function(record, index) {
        var clone = TemplateRenderer.clone(getTemplateContent(template));
        var values = merge(record || {}, {
          _index: index,
          _number: index + 1
        });

        return TemplateRenderer.replaceVariables(clone, values, escapeHtml);
      });
    },

    replaceVariables: function(template, values, escapeHtml) {
      if (!template || typeof template.querySelectorAll !== "function") {
        return replaceStringVariables(template, values, escapeHtml);
      }

      replaceNodeVariables(template, values || {});
      return template;
    },

    replaceTextTargets: function(root, values) {
      if (!root || typeof root.querySelectorAll !== "function") {
        return;
      }

      Array.prototype.forEach.call(root.querySelectorAll("[data-ua-gallery-value]"), function(element) {
        var value = getPathValue(values || {}, element.getAttribute("data-ua-gallery-value"));
        element.textContent = value === null || typeof value === "undefined" ? "" : value;
      });
    }
  };

  function createTemplate(html) {
    var template = global.document.createElement("template");
    template.innerHTML = String(html || "");
    return template;
  }

  function getTemplateContent(template) {
    return template && template.content ? template.content : template;
  }

  function replaceNodeVariables(root, values) {
    replaceTextNodeVariables(root, values);
    replaceAttributeVariables(root, values);
  }

  function replaceTextNodeVariables(root, values) {
    var walker = global.document.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
    var node;

    while ((node = walker.nextNode())) {
      node.nodeValue = replaceStringVariables(node.nodeValue, values, identity);
    }
  }

  function replaceAttributeVariables(root, values) {
    Array.prototype.forEach.call(root.querySelectorAll("*"), function(element) {
      Array.prototype.forEach.call(element.attributes, function(attribute) {
        if (attribute.value.indexOf("{{") === -1) {
          return;
        }

        element.setAttribute(attribute.name, replaceStringVariables(attribute.value, values, identity));
      });
    });
  }

  function replaceStringVariables(template, values, escapeHtml) {
    var escape = escapeHtml || identity;

    return String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function(match, path) {
      var value = getPathValue(values || {}, path);

      if (value === null || typeof value === "undefined") {
        return "";
      }

      return escape(value);
    });
  }

  function getPathValue(values, path) {
    return String(path).split(".").reduce(function(value, key) {
      if (value === null || typeof value === "undefined") {
        return undefined;
      }

      return value[key];
    }, values);
  }

  // Record preparation

  var RecordMapper = {
    prepare: function(records, baseurl, urlFields) {
      return (records || []).map(function(record) {
        var prepared = merge(record || {}, {});

        (urlFields || []).forEach(function(field) {
          if (prepared[field]) {
            prepared[field] = resolveUrl(prepared[field], baseurl);
          }
        });

        return prepared;
      });
    }
  };

  function createFullView(records) {
    return {
      rows: records.slice(),
      type: "none",
      page: 1,
      pageSize: records.length,
      pageCount: 1,
      total: records.length,
      shown: records.length,
      hasNext: false,
      hasPrevious: false
    };
  }

  function resolveUrl(value, baseurl) {
    if (!baseurl || !value || typeof global.URL !== "function") {
      return value;
    }

    try {
      return new global.URL(value, baseurl).href;
    } catch (error) {
      return value;
    }
  }

  function getUrlOrigin(url) {
    if (!url || typeof global.URL !== "function") {
      return "";
    }

    try {
      return new global.URL(url, global.location && global.location.href).origin;
    } catch (error) {
      return "";
    }
  }

  // General helpers

  function normalizeOptions(options) {
    var settings = merge(defaults, options);

    settings.paging = merge(defaults.paging, options.paging || {});
    settings.paging.type = "previous-next";
    settings.fancybox = merge(defaults.fancybox, options.fancybox || {});
    settings.captions = merge(defaults.captions, options.captions || {});
    return settings;
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

  function identity(value) {
    return value;
  }

  // Registration supports either script load order, matching the grid plugin.

  if (global.UADataManager && typeof global.UADataManager.registerPlugin === "function") {
    global.UADataManager.registerPlugin("gallery", createGalleryPlugin);
  } else {
    global.UADataManagerPendingPlugins = global.UADataManagerPendingPlugins || [];
    global.UADataManagerPendingPlugins.push({
      name: "gallery",
      factory: createGalleryPlugin
    });
  }

  global.UADataManagerGalleryPlugin = createGalleryPlugin;
}(window));
