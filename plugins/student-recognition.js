(function(global) {
  "use strict";

  // UA Data Manager student recognition grid plugin.
  //
  // A focused two-column grid with filters and sorting. The HTML template owns
  // the markup; this file prepares data and fills named template targets.

  var defaults = {
    stage: "",
    template: "",
    templateurl: "",
    itemtemplate: "",
    columns: [
      { key: "student", label: "Student", target: "name" },
      { key: "department", label: "Department", target: "department" },
      { key: "recognition", label: "Recognition", target: "recognition" }
    ],
    filters: {
      keyword: {
        type: "text",
        label: "Search",
        target: ["name", "recognition", "department", "program", "year", "summary", "firstName", "lastName", "middleName", "college"]
      },
      recognition: {
        type: "select",
        label: "Recognition",
        target: "recognition",
        allLabel: "All Recognition"
      },
      department: {
        type: "checkbox-group",
        label: "Department",
        target: "department"
      }
    },
    recognitionLabels: {
      PRES: "President's List",
      DEAN: "Dean's List"
    },
    paging: {
      type: "infinite",
      page: 1,
      pageSize: 50
    }
  };

  function createStudentRecognitionPlugin(context, options) {
    return new StudentRecognitionPlugin(context, normalizeOptions(options || {}));
  }

  function StudentRecognitionPlugin(context, settings) {
    this.context = context;
    this.settings = settings;
    this.stage = context.resolveElement(settings.stage);
    this.templates = null;
    this.eventsBound = false;
    this.filtersRendered = false;
    this.currentView = null;
    this.observer = null;
    this.state = {
      filters: getInitialFilters(settings),
      sort: null,
      page: Number(settings.paging.page || 1)
    };
  }

  StudentRecognitionPlugin.prototype.init = function() {
    return this.context.loadTemplate(this.settings).then(function(template) {
      this.templates = TemplateRenderer.prepare(template || this.settings.template, this.settings.itemtemplate);

      if (!this.templates.shell) {
        throw new Error("UA Data Manager student-recognition plugin needs a template or templateurl.");
      }

      if (!this.templates.item) {
        throw new Error("UA Data Manager student-recognition plugin needs a data-ua-student-recognition-row-template template.");
      }

      this.mountTemplate();
      this.bindEvents();
    }.bind(this));
  };

  StudentRecognitionPlugin.prototype.render = function() {
    var activeFilter = getActiveFilter(this.stage);
    var records;
    var filtered;
    var sorted;
    var view;

    if (!this.stage) {
      return this;
    }

    this.mountTemplate();

    records = normalizeRecords(this.context.records(), this.settings);
    filtered = filterRecords(records, this.state.filters, this.settings.filters);
    sorted = sortRecords(filtered, this.state.sort);
    view = this.context.paging.apply(sorted, this.settings.paging, this.state);
    this.currentView = view;
    this.state.page = view.page;

    this.renderColumnHeaders();
    this.renderFilters(records);
    this.replaceValues({
      count: view.total,
      shown: view.rows.length
    });
    this.replaceList("[data-ua-student-recognition-rows]", this.templates.item, view.rows);
    this.watchInfinitePaging();
    restoreActiveFilter(this.stage, activeFilter);
    this.emitRendered(view.rows, records, view);
    return this;
  };

  StudentRecognitionPlugin.prototype.mountTemplate = function() {
    if (!this.stage || !this.templates || this.stage.querySelector("[data-ua-student-recognition]")) {
      return;
    }

    this.stage.replaceChildren(TemplateRenderer.clone(this.templates.shell.content));
  };

  StudentRecognitionPlugin.prototype.renderColumnHeaders = function() {
    var columns = getColumns(this.settings);
    var state = this.state;

    columns.forEach(function(column, index) {
      var header = this.stage.querySelector("[data-ua-student-recognition-column=\"" + (index + 1) + "\"]");
      var button;
      var icon;
      var label;

      if (!header) {
        return;
      }

      button = header.querySelector("[data-ua-student-recognition-sort]");
      icon = header.querySelector("[data-ua-student-recognition-sort-icon]");
      label = header.querySelector("[data-ua-student-recognition-column-label]");

      if (button) {
        button.setAttribute("data-ua-student-recognition-sort", column.target);
        button.setAttribute("aria-label", "Sort by " + column.label);
      }

      if (label) {
        label.textContent = column.label;
      }

      if (icon) {
        icon.innerHTML = getSortIcon(state.sort && state.sort.target === column.target ? state.sort.direction : "");
      }
    }, this);
  };

  StudentRecognitionPlugin.prototype.renderFilters = function(records) {
    var filters = this.settings.filters || {};
    var state = this.state;
    var context = this.context;

    if (this.filtersRendered) {
      return;
    }

    Object.keys(filters).forEach(function(key) {
      var target = this.stage.querySelector("[data-ua-student-recognition-filter-target=\"" + key + "\"]");

      if (!target) {
        return;
      }

      target.innerHTML = renderFilterElement(key, filters[key], state, context, records);
    }, this);

    this.filtersRendered = true;
  };

  StudentRecognitionPlugin.prototype.replaceValues = function(values) {
    TemplateRenderer.replaceTextTargets(this.stage, values);
  };

  StudentRecognitionPlugin.prototype.replaceList = function(targetSelector, itemTemplate, records) {
    var target = this.stage.querySelector(targetSelector);
    var items;

    if (!target || !itemTemplate) {
      return;
    }

    if (!records.length) {
      target.replaceChildren(createEmptyRow(getColumns(this.settings).length));
      return;
    }

    items = TemplateRenderer.repeat(itemTemplate, records, this.context.escapeHtml);
    target.replaceChildren();
    items.forEach(function(item) {
      target.appendChild(item);
    });
  };

  StudentRecognitionPlugin.prototype.bindEvents = function() {
    if (!this.stage || this.eventsBound) {
      return;
    }

    this.context.listen(this.stage, "input", "[data-ua-student-recognition-filter]", function(event, input) {
      if (input.type === "checkbox") {
        return;
      }

      updateFilterState(this.state, input, this.stage);
      this.state.page = 1;
      this.context.manager.render();
    }.bind(this));

    this.context.listen(this.stage, "change", "[data-ua-student-recognition-filter]", function(event, input) {
      updateFilterState(this.state, input, this.stage);
      this.state.page = 1;
      this.context.manager.render();
    }.bind(this));

    this.context.listen(this.stage, "click", "[data-ua-student-recognition-sort]", function(event, button) {
      var target = button.getAttribute("data-ua-student-recognition-sort");
      var direction = this.state.sort && this.state.sort.target === target && this.state.sort.direction === "asc" ? "desc" : "asc";

      this.state.sort = {
        target: target,
        direction: direction
      };
      this.state.page = 1;
      this.context.manager.render();
    }.bind(this));

    this.eventsBound = true;
  };

  StudentRecognitionPlugin.prototype.watchInfinitePaging = function() {
    var scrollRoot = this.stage ? this.stage.querySelector("[data-ua-student-recognition-scroll]") : null;
    var trigger = scrollRoot ? scrollRoot.querySelector("[data-ua-student-recognition-infinite-marker]") : null;
    var view = this.currentView;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (!trigger || !view || view.type !== "infinite" || !view.hasNext || typeof global.IntersectionObserver !== "function") {
      return;
    }

    this.observer = new global.IntersectionObserver(function(entries) {
      if (!entries[0].isIntersecting) {
        return;
      }

      this.observer.disconnect();
      this.observer = null;
      this.state.page = this.context.paging.next(view);
      this.context.manager.render();
    }.bind(this), {
      root: scrollRoot,
      rootMargin: "180px"
    });

    this.observer.observe(trigger);
  };

  StudentRecognitionPlugin.prototype.emitRendered = function(records, allRecords, view) {
    if (!this.stage || typeof global.CustomEvent !== "function") {
      return;
    }

    this.stage.dispatchEvent(new global.CustomEvent("ua-student-recognition:rendered", {
      bubbles: true,
      detail: {
        records: records,
        allRecords: allRecords,
        view: view,
        plugin: this
      }
    }));
  };

  var TemplateRenderer = {
    prepare: function(template, itemTemplate) {
      var shell = createTemplate(template || "");
      var itemNode = itemTemplate ? null : shell.content.querySelector("template[data-ua-student-recognition-row-template]");
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

    replaceVariables: function(root, values) {
      replaceTextNodeVariables(root, values || {});
      replaceAttributeVariables(root, values || {});
      return root;
    },

    replaceTextTargets: function(root, values) {
      if (!root || typeof root.querySelectorAll !== "function") {
        return;
      }

      Array.prototype.forEach.call(root.querySelectorAll("[data-ua-student-recognition-value]"), function(element) {
        var value = getPathValue(values || {}, element.getAttribute("data-ua-student-recognition-value"));
        element.textContent = value === null || typeof value === "undefined" ? "" : value;
      });
    }
  };

  function renderFilterElement(key, filter, state, context, records) {
    var label = filter.label || filter.name || key;
    var value = state.filters[key] || "";
    var options;

    if (isChoiceFilter(filter)) {
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
        "data-ua-student-recognition-filter": key
      }, filter.attributes || {})
    });
  }

  function updateFilterState(state, input, stage) {
    var handle = input.getAttribute("data-ua-student-recognition-filter");
    var value = input.value;
    var checkedInputs;
    var checkedValues;

    if (input.type === "checkbox") {
      checkedInputs = stage.querySelectorAll("[data-ua-student-recognition-filter=\"" + handle + "\"]:checked");
      checkedValues = Array.prototype.map.call(checkedInputs, function(checkedInput) {
        return checkedInput.value;
      });

      if (!checkedValues.length) {
        delete state.filters[handle];
      } else {
        state.filters[handle] = checkedValues;
      }

      return;
    }

    if (value === "") {
      delete state.filters[handle];
    } else {
      state.filters[handle] = value;
    }
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
          var recordValue = String(getPathValue(record, target) || "").toLowerCase();

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

      return String(getPathValue(left, sort.target) || "").localeCompare(String(getPathValue(right, sort.target) || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      }) * direction;
    });
  }

  function normalizeRecords(records, settings) {
    return records.map(function(record) {
      var positionalRecord = getPositionalRecord(record);
      var source = positionalRecord || record;
      var firstName = firstValue(source, ["firstName", "FirstName", "First Name", "first", "First"]);
      var middleName = firstValue(source, ["middleName", "MiddleName", "Middle Name", "middle", "Middle"]);
      var lastName = firstValue(source, ["lastName", "LastName", "Last Name", "last", "Last"]);
      var recognition = normalizeRecognition(firstValue(source, ["recognition", "Recognition", "award", "Award", "awards", "Awards", "Award Name", "honor", "Honor"]), settings);
      var department = firstValue(source, ["department", "Department", "dept", "Dept", "college", "College"]);
      var program = firstValue(source, ["program", "Program", "major", "Major", "degree", "Degree"]) || department;
      var year = firstValue(record, ["year", "Year", "class", "Class", "classYear", "Class Year"]);
      var summary = firstValue(record, ["summary", "Summary", "description", "Description", "details", "Details", "note", "Note"]);

      return merge(record, {
        firstName: firstName,
        middleName: middleName,
        lastName: lastName,
        name: firstValue(record, ["name", "Name", "student", "Student", "studentName", "StudentName", "Student Name", "Full Name", "fullName"]) || compactJoin([firstName, middleName, lastName], " "),
        recognition: recognition,
        department: department,
        program: program,
        college: program,
        year: year,
        summary: summary,
        meta: compactJoin([program, year], " | ")
      });
    });
  }

  function getPositionalRecord(record) {
    var values;
    var knownValue = firstValue(record, ["recognition", "Recognition", "firstName", "FirstName", "First Name", "lastName", "LastName", "Last Name", "college", "College"]);

    if (knownValue) {
      return null;
    }

    values = Object.keys(record).map(function(key) {
      return record[key];
    });

    if (values.length < 5) {
      return null;
    }

    return {
      recognition: values[0],
      lastName: values[1],
      firstName: values[2],
      middleName: values[3],
      college: values[4]
    };
  }

  function normalizeRecognition(value, settings) {
    var labelMap = settings.recognitionLabels || {};
    var key = String(value || "").trim();

    return labelMap[key] || labelMap[key.toUpperCase()] || key;
  }

  function compactJoin(values, separator) {
    return values.filter(function(value) {
      return value !== "" && value !== null && typeof value !== "undefined";
    }).join(separator);
  }

  function firstValue(record, keys) {
    var index;
    var value;

    for (index = 0; index < keys.length; index += 1) {
      value = getPathValue(record, keys[index]);

      if (value !== "" && value !== null && typeof value !== "undefined") {
        return decodeTextEntities(value);
      }
    }

    return "";
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

  function isChoiceFilter(filter) {
    return filter.type === "select" || filter.type === "dropdown" || filter.type === "checkbox-group" || filter.type === "checkbox group";
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
      var value = getPathValue(record, target);

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

  function getColumns(settings) {
    return (settings.columns || defaults.columns).map(function(column) {
      return {
        key: column.key || column.target || column.label,
        label: column.label || column.key || column.target,
        target: column.target || column.key
      };
    });
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

  function createEmptyRow(columnCount) {
    var row = global.document.createElement("tr");
    var cell = global.document.createElement("td");

    cell.colSpan = Math.max(columnCount, 1);
    cell.textContent = "No matching students.";
    row.appendChild(cell);
    return row;
  }

  function createTemplate(html) {
    var template = global.document.createElement("template");
    template.innerHTML = String(html || "");
    return template;
  }

  function getTemplateContent(template) {
    return template && template.content ? template.content : template;
  }

  function replaceTextNodeVariables(root, values) {
    var walker = global.document.createTreeWalker(root, global.NodeFilter.SHOW_TEXT);
    var node;

    while ((node = walker.nextNode())) {
      node.nodeValue = replaceStringVariables(node.nodeValue, values);
    }
  }

  function replaceAttributeVariables(root, values) {
    Array.prototype.forEach.call(root.querySelectorAll("*"), function(element) {
      Array.prototype.forEach.call(element.attributes, function(attribute) {
        if (attribute.value.indexOf("{{") === -1) {
          return;
        }

        element.setAttribute(attribute.name, replaceStringVariables(attribute.value, values));
      });
    });
  }

  function replaceStringVariables(template, values) {
    return String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function(match, path) {
      var value = getPathValue(values || {}, path);

      if (value === null || typeof value === "undefined") {
        return "";
      }

      return decodeTextEntities(value);
    });
  }

  function decodeTextEntities(value) {
    return String(value)
      .replace(/&?#0*39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  function getPathValue(values, path) {
    return String(path).split(".").reduce(function(value, key) {
      if (value === null || typeof value === "undefined") {
        return undefined;
      }

      return value[key];
    }, values);
  }

  function getActiveFilter(stage) {
    var active = global.document.activeElement;

    if (!stage || !active || !stage.contains(active) || !active.hasAttribute("data-ua-student-recognition-filter")) {
      return null;
    }

    return {
      handle: active.getAttribute("data-ua-student-recognition-filter"),
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd
    };
  }

  function restoreActiveFilter(stage, activeFilter) {
    var input;

    if (!activeFilter) {
      return;
    }

    input = stage.querySelector("[data-ua-student-recognition-filter=\"" + activeFilter.handle + "\"]");

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
    global.UADataManager.registerPlugin("student-recognition", createStudentRecognitionPlugin);
  } else {
    global.UADataManagerPendingPlugins = global.UADataManagerPendingPlugins || [];
    global.UADataManagerPendingPlugins.push({
      name: "student-recognition",
      factory: createStudentRecognitionPlugin
    });
  }

  global.UADataManagerStudentRecognitionPlugin = createStudentRecognitionPlugin;
}(window));
