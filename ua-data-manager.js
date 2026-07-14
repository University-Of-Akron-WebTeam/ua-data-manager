(function(global) {
  "use strict";

  // UA Data Manager core.
  // Loads/parses data, starts plugins, and shares common helpers.
  // Plugins own their display so the core can stay reusable.
  // Designed for dotCMS copy/paste use: no build step, no dependencies.
  // Keep this file generic; plugin-specific display logic belongs in plugins/.

  var pluginFactories = {};
  var pluginWaiters = [];
  var pluginScriptPromises = {};

  var coreDefaults = {
    data: [],
    dataurl: "",
    dataPath: "",
    parseCSV: false,
    parseTSV: false,
    plugins: {}
  };

  function init(options) {
    var manager = new DataManager(options || {});
    manager.init();
    return manager;
  }

  // Plugin registration
  //
  // Plugins may load before or after the core file.
  // Registered factories are stored by name, then used when a manager starts.
  // Pending plugins keep script order flexible for dotCMS templates.
  function registerPlugin(name, factory) {
    pluginFactories[name] = factory;
    notifyPluginWaiters();
  }

  function registerPendingPlugins() {
    var pending = global.UADataManagerPendingPlugins || [];

    pending.forEach(function(plugin) {
      registerPlugin(plugin.name, plugin.factory);
    });

    global.UADataManagerPendingPlugins = [];
  }

  function DataManager(options) {
    this.options = merge(coreDefaults, options || {});
    this.records = [];
    this.plugins = [];
    this.started = false;
  }

  // Manager lifecycle
  //
  // A manager loads data once, starts configured plugins, then asks them to render.
  // Each manager instance owns its records and plugins, so multiple grids can
  // exist on the same page without sharing UI state.
  DataManager.prototype.init = function() {
    if (this.started) {
      return this;
    }

    this.started = true;

    return this.loadData().then(function(records) {
      this.records = records;
      return this.startPlugins();
    }.bind(this));
  };

  DataManager.prototype.loadData = function() {
    if (this.options.dataurl) {
      return fetch(this.options.dataurl)
        .then(function(response) {
          if (!response.ok) {
            throw new Error("UA Data Manager could not load data: " + response.status);
          }

          return response.text();
        })
        .then(function(text) {
          return parseInput(text, this.options);
        }.bind(this));
    }

    return Promise.resolve(parseInput(this.options.data || [], this.options));
  };

  // Plugin loading
  //
  // If a plugin has not already registered itself, the core can inject its script.
  // This supports both explicit script tags and pluginurl/scripturl configuration.
  // After loading, the plugin must call UADataManager.registerPlugin().
  DataManager.prototype.startPlugins = function() {
    var pluginOptions = this.options.plugins || {};
    var pluginNames = Object.keys(pluginOptions);
    var context = this.createPluginContext();
    var missingPlugins = getMissingPlugins(pluginNames);

    if (missingPlugins.length) {
      return loadMissingPluginScripts(missingPlugins, pluginOptions).then(function() {
        return waitForPlugins(pluginNames);
      }).then(function() {
        return this.startPlugins();
      }.bind(this));
    }

    this.plugins = pluginNames.map(function(name) {
      return pluginFactories[name](context, pluginOptions[name] || {});
    });

    return Promise.all(this.plugins.map(function(plugin) {
      if (typeof plugin.init === "function") {
        return plugin.init();
      }

      return Promise.resolve();
    })).then(function() {
      this.render();
      return this;
    }.bind(this));
  };

  function getMissingPlugins(pluginNames) {
    registerKnownGlobalPlugins();

    return pluginNames.filter(function(name) {
      return !pluginFactories[name];
    });
  }

  function registerKnownGlobalPlugins() {
    if (!pluginFactories.grid && global.UADataManagerGridPlugin) {
      registerPlugin("grid", global.UADataManagerGridPlugin);
    }
  }

  function waitForPlugins(pluginNames) {
    var missingPlugins = getMissingPlugins(pluginNames);

    if (!missingPlugins.length) {
      return Promise.resolve();
    }

    return new Promise(function(resolve, reject) {
      var waiter = {
        pluginNames: pluginNames,
        resolve: resolve,
        reject: reject,
        timer: global.setTimeout(function() {
          removePluginWaiter(waiter);
          reject(new Error("UA Data Manager plugin is not registered: " + getMissingPlugins(pluginNames).join(", ")));
        }, 10000)
      };

      pluginWaiters.push(waiter);
    });
  }

  function loadMissingPluginScripts(pluginNames, pluginOptions) {
    return Promise.all(pluginNames.map(function(name) {
      return loadPluginScript(name, pluginOptions[name] || {});
    }));
  }

  function loadPluginScript(name, options) {
    var scriptUrl = options.pluginurl || options.scripturl || "plugins/" + name + ".js";

    if (pluginFactories[name]) {
      return Promise.resolve();
    }

    if (pluginScriptPromises[scriptUrl]) {
      return pluginScriptPromises[scriptUrl];
    }

    pluginScriptPromises[scriptUrl] = new Promise(function(resolve, reject) {
      var script;

      if (!global.document || !global.document.createElement) {
        resolve();
        return;
      }

      script = global.document.createElement("script");
      script.src = scriptUrl;
      script.async = false;
      script.onload = function() {
        if (!pluginFactories[name]) {
          reject(new Error("UA Data Manager loaded plugin script but it did not register: " + name + " from " + scriptUrl));
          return;
        }

        resolve();
      };
      script.onerror = function() {
        reject(new Error("UA Data Manager could not load plugin script: " + scriptUrl));
      };

      global.document.head.appendChild(script);
    });

    return pluginScriptPromises[scriptUrl];
  }

  function notifyPluginWaiters() {
    pluginWaiters.slice().forEach(function(waiter) {
      if (getMissingPlugins(waiter.pluginNames).length) {
        return;
      }

      removePluginWaiter(waiter);
      global.clearTimeout(waiter.timer);
      waiter.resolve();
    });
  }

  function removePluginWaiter(waiter) {
    var index = pluginWaiters.indexOf(waiter);

    if (index !== -1) {
      pluginWaiters.splice(index, 1);
    }
  }

  DataManager.prototype.createPluginContext = function() {
    return {
      manager: this,
      records: function() {
        return getRecordArray(this.records, this.options.dataPath || this.options.datapath);
      }.bind(this),
      loadTemplate: loadTemplate,
      renderTemplate: renderTemplate,
      resolveElement: resolveElement,
      escapeHtml: escapeHtml,
      elementBuilder: elementBuilder,
      listen: listen,
      paging: paging
    };
  };

  // Rendering
  //
  // Core rendering is intentionally simple.
  // The core only tells each plugin to render; plugins decide what changes in
  // their own stage elements.
  DataManager.prototype.render = function() {
    this.plugins.forEach(function(plugin) {
      if (typeof plugin.render === "function") {
        plugin.render();
      }
    });

    return this;
  };

  // Paging helpers
  //
  // Paging math is shared so grids, galleries, and future plugins agree on page
  // state. The controls() method returns data, while render() remains as a
  // fallback for plugins that do not provide their own paging markup.
  var paging = {
    apply: function(records, options, state) {
      var pagingOptions = options || {};
      var pagingState = state || {};
      var type = pagingOptions.type || "infinite";
      var pageSize = Number(pagingOptions.pageSize || 10);
      var page = clampPage(Number(pagingState.page || pagingOptions.page || 1), records.length, pageSize);
      var pageCount = Math.max(1, Math.ceil(records.length / pageSize));
      var rows = type === "infinite"
        ? this.getInfiniteSlice(records, page, pageSize)
        : this.getPage(records, page, pageSize);

      return {
        rows: rows,
        type: type,
        page: page,
        pageSize: pageSize,
        pageCount: pageCount,
        total: records.length,
        shown: rows.length,
        hasNext: page < pageCount,
        hasPrevious: page > 1
      };
    },

    getPage: function(records, page, pageSize) {
      var start = (page - 1) * pageSize;
      return records.slice(start, start + pageSize);
    },

    getInfiniteSlice: function(records, page, pageSize) {
      return records.slice(0, page * pageSize);
    },

    first: function() {
      return 1;
    },

    previous: function(view) {
      return Math.max(1, view.page - 1);
    },

    next: function(view) {
      return Math.min(view.pageCount, view.page + 1);
    },

    last: function(view) {
      return view.pageCount;
    },

    controls: function(view) {
      return getPagingControls(view);
    },

    render: function(view) {
      return renderPagingControls(getPagingControls(view), view);
    }
  };

  function getPagingControls(view) {
    if (view.type === "pages") {
      return getPageControls(view);
    }

    if (view.type === "previous-next") {
      return getPreviousNextControls(view);
    }

    return getInfiniteControls(view);
  }

  function getInfiniteControls(view) {
    return [{
      type: "status",
      label: view.shown + " of " + view.total,
      shown: view.shown,
      total: view.total
    }, {
      type: "load-more",
      label: "Load more",
      action: "next",
      page: paging.next(view),
      disabled: !view.hasNext
    }];
  }

  function getPreviousNextControls(view) {
    return [
      {
        type: "button",
        label: "Previous",
        action: "previous",
        page: paging.previous(view),
        disabled: !view.hasPrevious
      },
      {
        type: "button",
        label: "Next",
        action: "next",
        page: paging.next(view),
        disabled: !view.hasNext
      }
    ];
  }

  function getPageControls(view) {
    var page;
    var controls = [
      {
        type: "button",
        label: "First",
        action: "first",
        page: paging.first(view),
        disabled: !view.hasPrevious
      },
      {
        type: "button",
        label: "Previous",
        action: "previous",
        page: paging.previous(view),
        disabled: !view.hasPrevious
      }
    ];

    for (page = 1; page <= view.pageCount; page += 1) {
      controls.push({
        type: "button",
        label: String(page),
        action: "page",
        page: page,
        active: page === view.page,
        disabled: false
      });
    }

    controls.push({
      type: "button",
      label: "Next",
      action: "next",
      page: paging.next(view),
      disabled: !view.hasNext
    });
    controls.push({
      type: "button",
      label: "Last",
      action: "last",
      page: paging.last(view),
      disabled: !view.hasNext
    });

    return controls;
  }

  function renderPagingControls(controls, view) {
    if (view.type === "infinite") {
      return renderInfiniteControls(controls);
    }

    return renderPageButtons(controls);
  }

  function renderInfiniteControls(controls) {
    var status = controls.filter(function(control) {
      return control.type === "status";
    })[0];
    var loadMore = controls.filter(function(control) {
      return control.type === "load-more";
    })[0];

    if (!loadMore || loadMore.disabled) {
      return "<span class=\"ua-paging-status\">" + escapeHtml(status ? status.label : "") + "</span>";
    }

    return [
      "<span class=\"ua-paging-status\">", escapeHtml(status ? status.label : ""), "</span>",
      "<button type=\"button\" data-ua-load-more=\"true\" data-ua-page=\"", loadMore.page, "\">", escapeHtml(loadMore.label), "</button>"
    ].join("");
  }

  function renderPageButtons(controls) {
    var items = controls.map(function(control) {
      return pageButton(control);
    });

    return "<nav aria-label=\"Page navigation\" class=\"pagingControl\"><ul class=\"pagination\">" + items.join("") + "</ul></nav>";
  }

  function pageButton(control) {
    return [
      "<li class=\"page-item", control.active ? " active" : "", "\">",
      "<button type=\"button\" class=\"page-link\" data-ua-page=\"", control.page, "\" data-ua-page-action=\"", escapeHtml(control.action || "page"), "\"",
      control.disabled ? " disabled" : "",
      ">", escapeHtml(control.label), "</button>",
      "</li>"
    ].join("");
  }

  // Templates and data parsing
  //
  // Templates are plain HTML strings with {{placeholder}} values.
  // Data can be an array, JSON text, CSV text, or TSV text depending on options.
  // The delimited parser is intentionally small and handles quoted values.
  function loadTemplate(options) {
    if (options.templateurl) {
      return fetch(options.templateurl).then(function(response) {
        if (!response.ok) {
          throw new Error("UA Data Manager could not load template: " + response.status);
        }

        return response.text();
      });
    }

    return Promise.resolve(options.template || "");
  }

  function parseInput(input, options) {
    var parsed;

    if (Array.isArray(input)) {
      return input.slice();
    }

    if (options.parseCSV) {
      return parseDelimited(input, ",");
    }

    if (options.parseTSV) {
      return parseDelimited(input, "\t");
    }

    if (typeof input === "string" && input.trim()) {
      parsed = JSON.parse(input);
    } else if (input && typeof input === "object") {
      parsed = input;
    } else {
      parsed = [];
    }

    return getRecordArray(parsed, options.dataPath || options.datapath);
  }

  function getRecordArray(input, dataPath) {
    var records = input;

    // DataManager normally stores an array. Keeping this guard here also lets
    // the plugin context recover safely if wrapped API data is assigned by an
    // integration after initialization.
    if (dataPath && !Array.isArray(records)) {
      records = String(dataPath).split(".").reduce(function(value, key) {
        if (value === null || typeof value === "undefined") {
          return undefined;
        }

        return value[key];
      }, input);
    }

    if (!Array.isArray(records)) {
      throw new Error("UA Data Manager " + (dataPath ? "dataPath '" + dataPath + "'" : "data") + " must resolve to an array.");
    }

    return records.slice();
  }

  function parseDelimited(text, delimiter) {
    var rows = String(text || "").trim().split(/\r?\n/);
    var headers = parseDelimitedRow(rows.shift() || "", delimiter);

    return rows.filter(Boolean).map(function(row) {
      var values = parseDelimitedRow(row, delimiter);
      return headers.reduce(function(record, header, index) {
        record[header] = values[index] || "";
        return record;
      }, {});
    });
  }

  function parseDelimitedRow(row, delimiter) {
    var values = [];
    var value = "";
    var inQuotes = false;
    var index;
    var character;
    var next;

    for (index = 0; index < row.length; index += 1) {
      character = row.charAt(index);
      next = row.charAt(index + 1);

      if (character === "\"" && inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else if (character === "\"") {
        inQuotes = !inQuotes;
      } else if (character === delimiter && !inQuotes) {
        values.push(value.trim());
        value = "";
      } else {
        value += character;
      }
    }

    values.push(value.trim());
    return values;
  }

  function renderTemplate(template, values) {
    return String(template || "").replace(/\{\{([^}]+)\}\}/g, function(match, key) {
      return values[String(key).trim()] || "";
    });
  }

  // Element builder
  //
  // Plugins describe form/media elements with simple options.
  // The core turns those descriptions into consistent HTML for filters and
  // future plugin controls.
  var elementBuilder = {
    build: function(options) {
      var settings = options || {};
      var type = settings.type || "text";

      if (type === "dropdown" || type === "dropdowns/select") {
        type = "select";
      }

      if (type === "search" || type === "input" || type === "text input" || type === "text-input") {
        type = "text";
      }

      if (type === "select") {
        return buildSelect(settings);
      }

      if (type === "checkbox") {
        return buildCheckbox(settings);
      }

      if (type === "checkbox-group" || type === "checkboxGroup" || type === "checkbox group") {
        return buildCheckboxGroup(settings);
      }

      if (type === "image" || type === "images") {
        return buildImage(settings);
      }

      if (type === "link" || type === "links") {
        return buildLink(settings);
      }

      return buildInput(settings);
    }
  };

  function buildSelect(options) {
    var choices = options.options || [];

    return wrapWithLabel(options, [
      "<select", renderAttributes(options.attributes), " name=\"", escapeHtml(options.name || ""), "\">",
      choices.map(function(choice) {
        var option = normalizeChoice(choice);
        var selected = String(option.value) === String(options.value || "") ? " selected" : "";

        return [
          "<option value=\"", escapeHtml(option.value), "\"", selected, ">",
          escapeHtml(option.label),
          "</option>"
        ].join("");
      }).join(""),
      "</select>"
    ].join(""));
  }

  function buildInput(options) {
    return wrapWithLabel(options, [
      "<input type=\"", escapeHtml(options.inputType || "search"), "\"",
      renderAttributes(options.attributes),
      " name=\"", escapeHtml(options.name || ""), "\"",
      " value=\"", escapeHtml(options.value || ""), "\">"
    ].join(""));
  }

  function buildCheckbox(options) {
    var checked = options.checked || String(options.value) === String(options.checkedValue || "true");

    return wrapWithLabel(options, [
      "<input type=\"checkbox\"",
      renderAttributes(options.attributes),
      " name=\"", escapeHtml(options.name || ""), "\"",
      " value=\"", escapeHtml(options.checkedValue || "true"), "\"",
      checked ? " checked" : "",
      ">"
    ].join(""));
  }

  function buildCheckboxGroup(options) {
    var values = Array.isArray(options.value) ? options.value : [];
    var choices = options.options || [];
    var checkboxes = choices.map(function(choice) {
      var option = normalizeChoice(choice);
      var checked = values.indexOf(option.value) !== -1 || values.indexOf(String(option.value)) !== -1;

      return [
        "<label class=\"ua-checkbox-option\">",
        "<input type=\"checkbox\"",
        renderAttributes(options.attributes),
        " name=\"", escapeHtml(options.name || ""), "\"",
        " value=\"", escapeHtml(option.value), "\"",
        checked ? " checked" : "",
        ">",
        "<span>", escapeHtml(option.label), "</span>",
        "</label>"
      ].join("");
    }).join("");

    return [
      "<fieldset class=\"", escapeHtml(options.wrapperClass || "ua-filter ua-checkbox-filter"), "\">",
      options.label ? "<legend>" + escapeHtml(options.label) + "</legend>" : "",
      "<div class=\"ua-checkbox-group\">", checkboxes, "</div>",
      "</fieldset>"
    ].join("");
  }

  function buildImage(options) {
    return [
      "<img",
      renderAttributes(options.attributes),
      " src=\"", escapeHtml(options.src || options.value || ""), "\"",
      " alt=\"", escapeHtml(options.alt || options.label || ""), "\">"
    ].join("");
  }

  function buildLink(options) {
    return [
      "<a",
      renderAttributes(options.attributes),
      " href=\"", escapeHtml(options.href || options.value || "#"), "\">",
      escapeHtml(options.text || options.label || options.href || options.value || ""),
      "</a>"
    ].join("");
  }

  function wrapWithLabel(options, element) {
    if (options.label === false) {
      return element;
    }

    return [
      "<label class=\"", escapeHtml(options.wrapperClass || "ua-filter"), "\">",
      options.label ? "<span>" + escapeHtml(options.label) + "</span>" : "",
      element,
      "</label>"
    ].join("");
  }

  function renderAttributes(attributes) {
    var attrs = attributes || {};

    return Object.keys(attrs).map(function(key) {
      if (attrs[key] === false || attrs[key] === null || typeof attrs[key] === "undefined") {
        return "";
      }

      if (attrs[key] === true) {
        return " " + escapeHtml(key);
      }

      return " " + escapeHtml(key) + "=\"" + escapeHtml(attrs[key]) + "\"";
    }).join("");
  }

  function normalizeChoice(choice) {
    var hasValue;
    var hasLabel;

    if (typeof choice === "object" && choice !== null) {
      hasValue = Object.prototype.hasOwnProperty.call(choice, "value");
      hasLabel = Object.prototype.hasOwnProperty.call(choice, "label");

      return {
        label: hasLabel ? choice.label : choice.text || choice.value || "",
        value: hasValue ? choice.value : choice.label || choice.text || ""
      };
    }

    return {
      label: choice,
      value: choice
    };
  }

  // DOM helpers
  //
  // listen() uses delegated events so plugin templates can be replaced without
  // rebinding every button, row, and filter control.
  // escapeHtml() keeps generated template output safe for plain data values.
  function listen(root, eventName, selector, handler) {
    if (!root) {
      return;
    }

    root.addEventListener(eventName, function(event) {
      var node = event.target;

      while (node && node !== root) {
        if (matches(node, selector)) {
          handler(event, node);
          return;
        }

        node = node.parentNode;
      }
    });
  }

  function matches(element, selector) {
    var method = element.matches || element.msMatchesSelector;
    return method && method.call(element, selector);
  }

  function clampPage(page, recordCount, pageSize) {
    var pageCount = Math.max(1, Math.ceil(recordCount / pageSize));
    return Math.max(1, Math.min(page, pageCount));
  }

  function resolveElement(elementOrSelector) {
    if (typeof elementOrSelector === "string") {
      return document.querySelector(elementOrSelector);
    }

    return elementOrSelector || null;
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

  function escapeHtml(value) {
    return String(value === null || typeof value === "undefined" ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  global.UADataManager = {
    init: init,
    registerPlugin: registerPlugin,
    DataManager: DataManager,
    elementBuilder: elementBuilder,
    paging: paging
  };

  registerPendingPlugins();
}(window));
