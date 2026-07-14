(function(global) {
  "use strict";

  // UA Data Manager starter plugin.
  //
  // Copy this file when creating a new plugin. Rename the plugin key, selectors,
  // data attributes, and exported global to match the feature being built.
  // Keep page markup in an HTML template file; keep render() focused on data
  // preparation and calls to small template helpers.

  var defaults = {
    stage: "",
    template: "",
    templateurl: "",
    itemtemplate: ""
  };

  function createStarterPlugin(context, options) {
    return new StarterPlugin(context, normalizeOptions(options || {}));
  }

  function StarterPlugin(context, settings) {
    this.context = context;
    this.settings = settings;
    this.stage = context.resolveElement(settings.stage);
    this.templates = null;
    this.eventsBound = false;
    this.state = {};
  }

  StarterPlugin.prototype.init = function() {
    return this.context.loadTemplate(this.settings).then(function(template) {
      this.templates = TemplateRenderer.prepare(template || this.settings.template, this.settings.itemtemplate);

      if (!this.templates.shell) {
        throw new Error("UA Data Manager starter plugin needs a template or templateurl.");
      }

      this.mountTemplate();
      this.bindEvents();
    }.bind(this));
  };

  StarterPlugin.prototype.render = function() {
    var records;

    if (!this.stage) {
      return this;
    }

    this.mountTemplate();

    records = this.context.records();
    this.replaceValues({
      count: records.length
    });
    this.replaceList("[data-ua-starter-items]", this.templates.item, records);
    this.emitRendered(records);
    return this;
  };

  StarterPlugin.prototype.mountTemplate = function() {
    if (!this.stage || !this.templates || this.stage.querySelector("[data-ua-starter]")) {
      return;
    }

    this.stage.replaceChildren(TemplateRenderer.clone(this.templates.shell.content));
  };

  StarterPlugin.prototype.replaceValues = function(values) {
    TemplateRenderer.replaceTextTargets(this.stage, values);
  };

  StarterPlugin.prototype.replaceList = function(targetSelector, itemTemplate, records) {
    var target = this.stage.querySelector(targetSelector);
    var items;

    if (!target || !itemTemplate) {
      return;
    }

    items = TemplateRenderer.repeat(itemTemplate, records, this.context.escapeHtml);
    target.replaceChildren();
    items.forEach(function(item) {
      target.appendChild(item);
    });
  };

  StarterPlugin.prototype.bindEvents = function() {
    if (!this.stage || this.eventsBound) {
      return;
    }

    // Example:
    // this.context.listen(this.stage, "click", "[data-ua-starter-action]", function(event, element) {
    //   this.state.action = element.getAttribute("data-ua-starter-action");
    //   this.context.manager.render();
    // }.bind(this));

    this.eventsBound = true;
  };

  StarterPlugin.prototype.emitRendered = function(records) {
    if (!this.stage || typeof global.CustomEvent !== "function") {
      return;
    }

    this.stage.dispatchEvent(new global.CustomEvent("ua-starter:rendered", {
      bubbles: true,
      detail: {
        records: records,
        plugin: this
      }
    }));
  };

  var TemplateRenderer = {
    prepare: function(template, itemTemplate) {
      var shell = createTemplate(template || "");
      var itemNode = itemTemplate ? null : shell.content.querySelector("template[data-ua-starter-item-template]");
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
      return template && typeof template.cloneNode === "function"
        ? template.cloneNode(true)
        : (" " + String(template || "")).slice(1);
    },

    repeat: function(template, records, escapeHtml) {
      return (records || []).map(function(record, index) {
        var clone = TemplateRenderer.clone(getTemplateContent(template));
        var values = merge(record || {}, {
          _index: index,
          _number: index + 1
        });

        TemplateRenderer.replaceVariables(clone, values, escapeHtml);
        return clone;
      });
    },

    replaceVariables: function(root, values, escapeHtml) {
      replaceTextNodeVariables(root, values || {}, escapeHtml);
      replaceAttributeVariables(root, values || {}, escapeHtml);
      return root;
    },

    replaceTextTargets: function(root, values) {
      if (!root || typeof root.querySelectorAll !== "function") {
        return;
      }

      Array.prototype.forEach.call(root.querySelectorAll("[data-ua-starter-value]"), function(element) {
        var value = getPathValue(values || {}, element.getAttribute("data-ua-starter-value"));
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

  function replaceTextNodeVariables(root, values, escapeHtml) {
    var walker = global.document.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
    var node;

    while ((node = walker.nextNode())) {
      node.nodeValue = replaceStringVariables(node.nodeValue, values, escapeHtml);
    }
  }

  function replaceAttributeVariables(root, values, escapeHtml) {
    Array.prototype.forEach.call(root.querySelectorAll("*"), function(element) {
      Array.prototype.forEach.call(element.attributes, function(attribute) {
        if (attribute.value.indexOf("{{") === -1) {
          return;
        }

        element.setAttribute(attribute.name, replaceStringVariables(attribute.value, values, escapeHtml));
      });
    });
  }

  function replaceStringVariables(template, values, escapeHtml) {
    return String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function(match, path) {
      var value = getPathValue(values || {}, path);

      if (value === null || typeof value === "undefined") {
        return "";
      }

      return escapeHtml(value);
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

  function normalizeOptions(options) {
    return merge(defaults, options);
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

  if (global.UADataManager && typeof global.UADataManager.registerPlugin === "function") {
    global.UADataManager.registerPlugin("starter", createStarterPlugin);
  } else {
    global.UADataManagerPendingPlugins = global.UADataManagerPendingPlugins || [];
    global.UADataManagerPendingPlugins.push({
      name: "starter",
      factory: createStarterPlugin
    });
  }

  global.UADataManagerStarterPlugin = createStarterPlugin;
}(window));
