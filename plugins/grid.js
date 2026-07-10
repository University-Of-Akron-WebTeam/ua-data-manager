(function(global) {
  "use strict";

  // UA Data Manager grid plugin.
  // Renders filters, sortable rows, modal details, and paging controls.
  // Core supplies data and helpers; this file owns grid markup.
  // The grid keeps filtering and sorting here because those are display choices.
  // Shared behavior, such as paging math and element building, stays in core.

  // Plugin setup
  //
  // The grid accepts a stage, template, filters, headers, details, and paging.
  // Runtime state lives here so every grid instance can track its own filters,
  // sort order, selected modal row, and current page.
  function createGridPlugin(context, options) {
    var settings = merge({
      stage: "",
      template: "",
      templateurl: "",
      filters: {},
      columns: [],
      headers: {},
      paging: {
        type: "infinite",
        page: 1,
        pageSize: 10
      }
    }, options || {});

    var stage = context.resolveElement(settings.stage);
    var template = settings.template || "";
    var currentView = null;
    var eventsBound = false;
    var observer = null;
    var state = {
      filters: getInitialFilters(settings),
      sort: null,
      selectedRecord: null,
      page: Number(settings.paging.page || 1)
    };

    return {
      init: function() {
        return context.loadTemplate(settings).then(function(loadedTemplate) {
          template = loadedTemplate || settings.template;

          if (!template) {
            throw new Error("UA Data Manager grid plugin needs a template or templateurl.");
          }

          if (stage && !eventsBound) {
            bindGridEvents(stage, state, context.manager, context.paging, function() {
              return currentView;
            });
            eventsBound = true;
          }
        });
      },

      // Render flow
      //
      // Each render filters, sorts, pages, and replaces the stage HTML.
      // Focus and scroll position are captured first so typing and infinite
      // scrolling feel steady even though the template is refreshed.
      render: function() {
        var activeFilter = getActiveFilter(stage);
        var activeScroll = getGridScrollElement(stage);
        var scrollTop = activeScroll ? activeScroll.scrollTop : 0;
        var filtered = filterRecords(context.records(), state.filters, settings.filters);
        var sorted = sortRecords(filtered, state.sort);
        var view = context.paging.apply(sorted, settings.paging, state);
        var filterElements = renderFilterElements(settings, state, context, context.records());

        if (!stage) {
          return;
        }

        state.page = view.page;
        currentView = view;

        replaceStageHtml(stage, context.renderTemplate(template, merge(filterElements, {
          headers: renderHeaders(settings, state, context),
          rows: renderRows(view.rows, settings, context),
          paging: renderPaging(view, context),
          modal: renderModal(state.selectedRecord, settings, context),
          count: view.total,
          shown: view.shown
        })));
        restoreGridScroll(stage, scrollTop, view);
        watchInfinitePaging(stage, state, context.manager, context.paging, currentView, observer, function(nextObserver) {
          observer = nextObserver;
        });
        restoreActiveFilter(stage, activeFilter);
      }
    };
  }

  // Events
  //
  // Events are delegated from the stage because the grid markup is replaced on
  // each render. Handlers update state, reset paging when needed, and then ask
  // the manager to render again.
  function bindGridEvents(stage, state, manager, pagingApi, getView) {
    listen(stage, "input", "[data-ua-filter]", function(event, input) {
      if (input.type === "checkbox") {
        return;
      }

      updateFilterState(state, input, stage);
      manager.render();
    });

    listen(stage, "change", "[data-ua-filter]", function(event, input) {
      updateFilterState(state, input, stage);
      manager.render();
    });

    listen(stage, "click", "[data-ua-sort]", function(event, button) {
      var target = button.getAttribute("data-ua-sort");
      var direction = state.sort && state.sort.target === target && state.sort.direction === "asc" ? "desc" : "asc";

      state.sort = {
        target: target,
        direction: direction
      };
      state.page = 1;
      manager.render();
    });

    listen(stage, "click", "[data-ua-page]", function(event, button) {
      if (button.hasAttribute("data-ua-load-more")) {
        return;
      }

      state.page = Number(button.getAttribute("data-ua-page") || 1);
      manager.render();
    });

    listen(stage, "click", "[data-ua-load-more]", function() {
      state.page = pagingApi.next(getView());
      manager.render();
    });

    listen(stage, "click", "[data-ua-row]", function(event, row) {
      state.selectedRecord = getRecordById(getView().rows, row.getAttribute("data-ua-row"));
      manager.render();
    });

    listen(stage, "keydown", "[data-ua-row]", function(event, row) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      state.selectedRecord = getRecordById(getView().rows, row.getAttribute("data-ua-row"));
      manager.render();
    });

    listen(stage, "click", "[data-ua-modal-close]", function() {
      state.selectedRecord = null;
      manager.render();
    });

    stage.addEventListener("keydown", function(event) {
      if (event.key === "Escape" && state.selectedRecord) {
        state.selectedRecord = null;
        manager.render();
      }
    });
  }

  // Infinite scroll
  //
  // The observer watches a marker inside the grid scroll area. That lets filters
  // and paging controls sit outside the scrolled table while rows keep loading
  // when the user reaches the bottom.
  function watchInfinitePaging(stage, state, manager, pagingApi, view, observer, setObserver) {
    var scrollRoot = getGridScrollElement(stage);
    var trigger = scrollRoot ? scrollRoot.querySelector("[data-ua-infinite-scroll-marker]") : null;

    if (observer) {
      observer.disconnect();
      setObserver(null);
    }

    if (!trigger || !view || view.type !== "infinite" || !view.hasNext || typeof IntersectionObserver !== "function") {
      return;
    }

    observer = new IntersectionObserver(function(entries) {
      if (!entries[0].isIntersecting) {
        return;
      }

      observer.disconnect();
      state.page = pagingApi.next(view);
      manager.render();
    }, {
      root: scrollRoot,
      rootMargin: "200px"
    });

    observer.observe(trigger);
    setObserver(observer);
  }

  // Filtering and sorting
  //
  // Text filters use contains matching. Checkbox groups store multiple values.
  // Sorting is string-based with numeric awareness for course-style values.
  function updateFilterState(state, input, stage) {
    var handle = input.getAttribute("data-ua-filter");
    var value = input.value;
    var checkedInputs;
    var checkedValues;

    if (input.type === "checkbox") {
      checkedInputs = stage.querySelectorAll("[data-ua-filter=\"" + handle + "\"]:checked");
      checkedValues = Array.prototype.map.call(checkedInputs, function(checkedInput) {
        return checkedInput.value;
      });

      if (!checkedValues.length) {
        delete state.filters[handle];
      } else {
        state.filters[handle] = checkedValues;
      }

      state.page = 1;
      return;
    }

    if (value === "") {
      delete state.filters[handle];
    } else {
      state.filters[handle] = value;
    }

    state.page = 1;
  }

  function filterRecords(records, activeFilters, filterOptions) {
    var handles = Object.keys(activeFilters);

    if (!handles.length) {
      return records.slice();
    }

    return records.filter(function(record) {
      return handles.every(function(handle) {
        var filter = filterOptions[handle] || {};
        var targets = Array.isArray(filter.target) ? filter.target : [filter.target || handle];
        var queries = Array.isArray(activeFilters[handle]) ? activeFilters[handle] : [activeFilters[handle]];

        return targets.some(function(target) {
          var recordValue = String(record[target] || "").toLowerCase();

          return queries.some(function(query) {
            return recordValue.indexOf(String(query || "").toLowerCase()) !== -1;
          });
        });
      });
    });
  }

  function sortRecords(records, sort) {
    if (!sort || !sort.target) {
      return records.slice();
    }

    return records.slice().sort(function(left, right) {
      var direction = sort.direction === "desc" ? -1 : 1;

      return String(left[sort.target] || "").localeCompare(String(right[sort.target] || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      }) * direction;
    });
  }

  // Headers and paging markup
  //
  // Header buttons expose sort state with simple arrows.
  // Paging control data comes from core, but the grid renders the actual HTML
  // so each plugin can have its own control style.
  function renderHeaders(settings, state, context) {
    var columns = getColumns(settings, []);

    return columns.map(function(column) {
      var columnOptions = getColumnOptions(column, settings);
      var target = columnOptions.target;
      var label = columnOptions.label;
      var sortDirection = state.sort && state.sort.target === target ? state.sort.direction : "";
      var sortIcon = getSortIcon(sortDirection);

      return [
        "<th>",
        "<button type=\"button\" class=\"ua-sort-button\" data-ua-sort=\"", context.escapeHtml(target), "\" aria-label=\"Sort by ", context.escapeHtml(label), "\">",
        "<span>", context.escapeHtml(label), "</span>",
        "<span class=\"ua-sort-icon\" aria-hidden=\"true\">", sortIcon, "</span>",
        "</button>",
        "</th>"
      ].join("");
    }).join("");
  }

  function getSortIcon(direction) {
    if (direction === "asc") {
      return "&uarr;";
    }

    if (direction === "desc") {
      return "&darr;";
    }

    return "&#8597;";
  }

  function renderPaging(view, context) {
    var controls = context.paging.controls(view);

    if (view.type === "infinite") {
      return renderInfinitePaging(controls, context);
    }

    return renderButtonPaging(controls, context);
  }

  function renderInfinitePaging(controls, context) {
    var loadMore = controls.filter(function(control) {
      return control.type === "load-more";
    })[0];

    if (!loadMore || loadMore.disabled) {
      return "";
    }

    return [
      "<button type=\"button\" class=\"ua-load-more\" data-ua-load-more=\"true\">",
      context.escapeHtml(loadMore.label),
      "</button>"
    ].join("");
  }

  function renderButtonPaging(controls, context) {
    var buttons = controls.filter(function(control) {
      return control.type === "button";
    }).map(function(control) {
      return [
        "<li class=\"page-item", control.active ? " active" : "", "\">",
        "<button type=\"button\" class=\"page-link\" data-ua-page=\"", context.escapeHtml(control.page), "\" data-ua-page-action=\"", context.escapeHtml(control.action || "page"), "\"",
        control.disabled ? " disabled" : "",
        ">",
        context.escapeHtml(control.label),
        "</button>",
        "</li>"
      ].join("");
    });

    if (!buttons.length) {
      return "";
    }

    return "<nav aria-label=\"Page navigation\" class=\"pagingControl\"><ul class=\"pagination\">" + buttons.join("") + "</ul></nav>";
  }

  // Filter elements
  //
  // Filters are rendered through the core elementBuilder.
  // Each filter also gets an individual placeholder, such as {{keyword}}, so
  // the HTML template can place filters wherever the page design needs them.
  function renderFilterElements(settings, state, context, records) {
    var filters = settings.filters || {};
    var elements = {};

    elements.filters = Object.keys(filters).map(function(key) {
      elements[key] = renderFilterElement(key, filters[key], state, context, records);
      return elements[key];
    }).join("");

    return elements;
  }

  function renderFilterElement(key, filter, state, context, records) {
      var label = filter.label || filter.name || key;
      var value = state.filters[key] || "";
      var options;

      if (filter.type === "select" || filter.type === "dropdown" || filter.type === "checkbox-group" || filter.type === "checkbox group") {
        options = buildFilterOptions(filter, records);
      }

      return context.elementBuilder.build({
        type: filter.type || "text",
        inputType: filter.inputType || "search",
        name: filter.name || key,
        label: label,
        value: value,
        options: options,
        attributes: merge({
          "data-ua-filter": key
        }, filter.attributes || {})
      });
  }

  function getInitialFilters(settings) {
    var initialFilters = settings.initialFilters || {};
    var filters = settings.filters || {};
    var stateFilters = {};

    Object.keys(filters).forEach(function(key) {
      var filter = filters[key];
      var value;

      if (Object.prototype.hasOwnProperty.call(initialFilters, key)) {
        value = initialFilters[key];
      } else if (Object.prototype.hasOwnProperty.call(filter, "initialValue")) {
        value = filter.initialValue;
      } else if (Object.prototype.hasOwnProperty.call(filter, "value")) {
        value = filter.value;
      }

      if (shouldSetInitialFilter(value)) {
        stateFilters[key] = value;
      }
    });

    return stateFilters;
  }

  function shouldSetInitialFilter(value) {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return value !== "" && value !== null && typeof value !== "undefined";
  }

  function buildFilterOptions(filter, records) {
    var target = Array.isArray(filter.target) ? filter.target[0] : filter.target;
    var values = filter.options || uniqueValues(records, target);

    if (filter.type === "checkbox-group" || filter.type === "checkbox group") {
      return values;
    }

    return [{
      label: filter.allLabel || "All",
      value: ""
    }].concat(values);
  }

  function uniqueValues(records, target) {
    var seen = {};
    var values = [];

    records.forEach(function(record) {
      var value = record[target];

      if (value && !seen[value]) {
        seen[value] = true;
        values.push(value);
      }
    });

    return values.sort(function(left, right) {
      return String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    });
  }

  // Rows and modal
  //
  // Rows use the configured headers/columns and are keyboard selectable.
  // The modal uses details when provided, then falls back to headers or the
  // record itself.
  function renderRows(records, settings, context) {
    var columns = getColumns(settings, records);

    if (!records.length) {
      return "<tr><td colspan=\"" + Math.max(columns.length, 1) + "\">No matching records.</td></tr>";
    }

    return records.map(function(record) {
      return "<tr tabindex=\"0\" data-ua-row=\"" + context.escapeHtml(getRecordId(record)) + "\">" + columns.map(function(column) {
        var columnOptions = getColumnOptions(column, settings);
        var target = columnOptions.target;
        return "<td>" + context.escapeHtml(record[target]) + "</td>";
      }).join("") + "</tr>";
    }).join("");
  }

  function renderModal(record, settings, context) {
    if (!record) {
      return "";
    }

    return [
      "<div class=\"modal fade show ua-grid-modal\" tabindex=\"-1\" role=\"dialog\" aria-modal=\"true\" style=\"display:block;\">",
      "<div class=\"modal-dialog modal-lg\" role=\"document\">",
      "<div class=\"modal-content\">",
      "<div class=\"modal-header\">",
      "<h2 class=\"modal-title h5\">", context.escapeHtml(getModalTitle(record, settings)), "</h2>",
      "<button type=\"button\" class=\"btn-close\" aria-label=\"Close\" data-ua-modal-close=\"true\"></button>",
      "</div>",
      "<div class=\"modal-body\">",
      renderModalDetails(record, settings, context),
      "</div>",
      "<div class=\"modal-footer\">",
      "<button type=\"button\" class=\"btn btn-secondary\" data-ua-modal-close=\"true\">Close</button>",
      "</div>",
      "</div>",
      "</div>",
      "</div>",
      "<div class=\"modal-backdrop fade show ua-grid-modal-backdrop\" data-ua-modal-close=\"true\"></div>"
    ].join("");
  }

  function renderModalDetails(record, settings, context) {
    var details = settings.details || settings.headers || record;
    var keys = Array.isArray(details) ? details : Object.keys(details);

    return [
      "<dl class=\"ua-grid-details\">",
      keys.map(function(key) {
        var detail = getDetailOptions(key, details, settings);
        var value = record[detail.target];

        if (value === "" || value === null || typeof value === "undefined") {
          return "";
        }

        return [
          "<dt>", context.escapeHtml(detail.label), "</dt>",
          "<dd>", context.escapeHtml(value), "</dd>"
        ].join("");
      }).join(""),
      "</dl>"
    ].join("");
  }

  function getModalTitle(record, settings) {
    var titleTarget = settings.modalTitleTarget || "Title";
    return record[titleTarget] || record.Title || record.Course || record.Id || "Details";
  }

  function getDetailOptions(key, details, settings) {
    var detail;

    if (Array.isArray(details)) {
      detail = typeof key === "string" ? (settings.headers[key] || { label: key, target: key }) : key;
    } else {
      detail = details[key] || {};
    }

    if (typeof detail === "string") {
      return {
        label: detail,
        target: detail
      };
    }

    return {
      label: detail.label || key,
      target: detail.target || key
    };
  }

  function getRecordId(record) {
    return encodeURIComponent(record.Id || record.id || record.Course || JSON.stringify(record));
  }

  function getRecordById(records, id) {
    var decodedId = decodeURIComponent(id || "");

    return records.filter(function(record) {
      return String(record.Id || record.id || record.Course || JSON.stringify(record)) === decodedId;
    })[0] || null;
  }

  // Template utilities
  //
  // The stage is replaced from a template element to avoid browser edge cases
  // around innerHTML while focus or blur events are active.
  // Infinite scrolling restores the grid scroll position after rows are added.
  function replaceStageHtml(stage, html) {
    var active = document.activeElement;
    var templateElement = document.createElement("template");

    if (active && stage.contains(active) && typeof active.blur === "function") {
      active.blur();
    }

    templateElement.innerHTML = html;
    stage.replaceChildren(templateElement.content.cloneNode(true));
  }

  function getGridScrollElement(stage) {
    return stage ? stage.querySelector("[data-ua-grid-scroll]") : null;
  }

  function restoreGridScroll(stage, scrollTop, view) {
    var scrollElement = getGridScrollElement(stage);

    if (!scrollElement || !view || view.type !== "infinite") {
      return;
    }

    scrollElement.scrollTop = scrollTop;
  }

  // General helpers
  //
  // These small helpers normalize column configuration, merge options, and
  // support delegated event handling and focus restoration.
  function getColumns(settings, records) {
    if (settings.columns && settings.columns.length) {
      return settings.columns;
    }

    if (settings.headers && Object.keys(settings.headers).length) {
      return Object.keys(settings.headers);
    }

    return Object.keys(records[0] || {});
  }

  function getColumnOptions(column, settings) {
    var key;
    var header;

    if (typeof column === "string") {
      header = settings.headers[column] || {};

      return {
        key: column,
        label: header.label || column,
        target: header.target || column
      };
    }

    key = column.key || column.target || column.label;

    return {
      key: key,
      label: column.label || key,
      target: column.target || key
    };
  }

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

  function getActiveFilter(stage) {
    var active = document.activeElement;

    if (!stage || !active || !stage.contains(active) || !active.hasAttribute("data-ua-filter")) {
      return null;
    }

    return {
      handle: active.getAttribute("data-ua-filter"),
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd
    };
  }

  function restoreActiveFilter(stage, activeFilter) {
    var input;

    if (!activeFilter) {
      return;
    }

    input = stage.querySelector("[data-ua-filter=\"" + activeFilter.handle + "\"]");

    if (!input) {
      return;
    }

    input.focus();

    if (canSetSelectionRange(input)) {
      input.setSelectionRange(activeFilter.selectionStart, activeFilter.selectionEnd);
    }
  }

  function canSetSelectionRange(input) {
    var supportedTypes = {
      email: true,
      password: true,
      search: true,
      tel: true,
      text: true,
      url: true
    };

    return typeof input.setSelectionRange === "function" && supportedTypes[input.type];
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

  // Registration
  //
  // If the core is already present, register immediately.
  // If the plugin loads first, queue it for the core to pick up later.
  if (global.UADataManager && typeof global.UADataManager.registerPlugin === "function") {
    global.UADataManager.registerPlugin("grid", createGridPlugin);
  } else {
    global.UADataManagerPendingPlugins = global.UADataManagerPendingPlugins || [];
    global.UADataManagerPendingPlugins.push({
      name: "grid",
      factory: createGridPlugin
    });
  }

  global.UADataManagerGridPlugin = createGridPlugin;
}(window));
