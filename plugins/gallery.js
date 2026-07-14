(function(global) {
  "use strict";

  // UA Data Manager gallery plugin.
  //
  // The gallery is organized around small renderers instead of one long render
  // flow. GalleryPlugin owns lifecycle and state, TemplateRenderer owns
  // cloning/repeating/variable replacement, and PagingRenderer owns controls.

  var defaults = {
    stage: "",
    template: "",
    templateurl: "",
    itemtemplate: "",
    baseurl: "",
    urlFields: ["thumbnail", "full", "image"],
    paging: {
      type: "previous-next",
      page: 1,
      pageSize: 12
    },
    fancybox: {
      enabled: true,
      selector: "[data-fancybox=\"ua-gallery\"]",
      options: {}
    }
  };

  function createGalleryPlugin(context, options) {
    return new GalleryPlugin(context, normalizeOptions(options || {}));
  }

  // Gallery lifecycle

  function GalleryPlugin(context, settings) {
    this.context = context;
    this.settings = settings;
    this.stage = context.resolveElement(settings.stage);
    this.baseurl = settings.baseurl || getUrlOrigin(context.manager.options && context.manager.options.dataurl);
    this.templates = {
      shell: "",
      item: ""
    };
    this.state = {
      page: Number(settings.paging.page || 1)
    };
    this.view = null;
    this.eventsBound = false;
    this.fancyboxBound = false;
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

      this.bindEvents();
      this.bindFancybox();
    }.bind(this));
  };

  GalleryPlugin.prototype.render = function() {
    var records;
    var values;

    if (!this.stage) {
      return this;
    }

    records = RecordMapper.prepare(this.context.records(), this.baseurl, this.settings.urlFields);
    this.view = this.context.paging.apply(records, this.settings.paging, this.state);
    this.state.page = this.view.page;

    values = {
      items: this.repeat(this.templates.item, this.view.rows),
      paging: PagingRenderer.render(this.view, this.context),
      count: this.view.total,
      shown: this.view.shown,
      page: this.view.page,
      pageCount: this.view.pageCount
    };

    // Item values are escaped by repeat(). The completed item and paging
    // fragments are plugin-generated HTML, so the core shell renderer inserts
    // them without escaping the markup itself.
    replaceStageHtml(this.stage, this.context.renderTemplate(this.templates.shell, values));
    this.bindFancybox();
    this.emitRendered();
    return this;
  };

  // Public rendering methods. Keeping these on the plugin instance makes the
  // repetition system reusable by future gallery layouts and integrations.

  GalleryPlugin.prototype.clone = function(template) {
    return TemplateRenderer.clone(template);
  };

  GalleryPlugin.prototype.replaceVariables = function(template, values) {
    return TemplateRenderer.replaceVariables(template, values, this.context.escapeHtml);
  };

  GalleryPlugin.prototype.repeat = function(template, records) {
    return TemplateRenderer.repeat(template, records, this.context.escapeHtml);
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

  // Template rendering

  var TemplateRenderer = {
    prepare: function(template, itemTemplate) {
      var source = String(template || "");
      var container;
      var itemNode;

      if (itemTemplate) {
        return {
          shell: source,
          item: String(itemTemplate)
        };
      }

      if (!global.document || !global.document.createElement) {
        return prepareTemplateWithPattern(source);
      }

      container = global.document.createElement("template");
      container.innerHTML = source;
      itemNode = container.content.querySelector("template[data-ua-gallery-item-template]");

      if (!itemNode) {
        return {
          shell: source,
          item: ""
        };
      }

      itemTemplate = itemNode.innerHTML;
      itemNode.remove();

      return {
        shell: container.innerHTML,
        item: itemTemplate
      };
    },

    clone: function(template) {
      return (" " + String(template || "")).slice(1);
    },

    repeat: function(template, records, escapeHtml) {
      return (records || []).map(function(record, index) {
        var values = merge(record || {}, {
          _index: index,
          _number: index + 1
        });

        return TemplateRenderer.replaceVariables(TemplateRenderer.clone(template), values, escapeHtml);
      }).join("");
    },

    replaceVariables: function(template, values, escapeHtml) {
      return String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function(match, path) {
        var value = getPathValue(values || {}, path);

        if (value === null || typeof value === "undefined") {
          return "";
        }

        return escapeHtml(value);
      });
    }
  };

  function prepareTemplateWithPattern(source) {
    var pattern = /<template\b[^>]*data-ua-gallery-item-template(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>([\s\S]*?)<\/template>/i;
    var match = source.match(pattern);

    return {
      shell: match ? source.replace(match[0], "") : source,
      item: match ? match[1] : ""
    };
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

  // Previous/next paging markup

  var PagingRenderer = {
    render: function(view, context) {
      var controls = context.paging.controls(view);
      var buttons = controls.map(function(control) {
        return [
          "<button type=\"button\" class=\"ua-gallery-page-button ua-gallery-page-", context.escapeHtml(control.action), "\"",
          " data-ua-gallery-page=\"", context.escapeHtml(control.page), "\"",
          control.disabled ? " disabled" : "",
          ">", context.escapeHtml(control.label), "</button>"
        ].join("");
      }).join("");

      return [
        "<nav class=\"ua-gallery-paging\" aria-label=\"Gallery pages\">",
        buttons,
        "<span class=\"ua-gallery-page-status\">Page ", context.escapeHtml(view.page), " of ", context.escapeHtml(view.pageCount), "</span>",
        "</nav>"
      ].join("");
    }
  };

  // General helpers

  function replaceStageHtml(stage, html) {
    var templateElement = global.document.createElement("template");

    templateElement.innerHTML = html;
    stage.replaceChildren(templateElement.content.cloneNode(true));
  }

  function normalizeOptions(options) {
    var settings = merge(defaults, options);

    settings.paging = merge(defaults.paging, options.paging || {});
    settings.paging.type = "previous-next";
    settings.fancybox = merge(defaults.fancybox, options.fancybox || {});
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
