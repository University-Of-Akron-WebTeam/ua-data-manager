"use strict";

var assert = require("assert");
var path = require("path");
var pluginFactory;
var fancyboxBindings = [];

function createTemplateElement() {
  var element = {
    html: ""
  };

  Object.defineProperty(element, "innerHTML", {
    get: function() {
      return element.html;
    },
    set: function(value) {
      element.html = value;
    }
  });

  element.content = {
    cloneNode: function() {
      return {
        html: element.html
      };
    }
  };

  return element;
}

global.window = {
  document: {
    createElement: function() {
      return createTemplateElement();
    }
  },
  CustomEvent: function(name, options) {
    this.type = name;
    this.detail = options.detail;
    this.bubbles = options.bubbles;
    this.cancelable = options.cancelable;
  },
  URL: URL,
  location: {
    href: "http://localhost/gallery-demo.html"
  },
  Fancybox: {
    bind: function(stage, selector, options) {
      fancyboxBindings.push({
        stage: stage,
        selector: selector,
        options: options
      });
    }
  },
  UADataManager: {
    registerPlugin: function(name, factory) {
      if (name === "gallery") {
        pluginFactory = factory;
      }
    }
  }
};

require(path.resolve(__dirname, "..", "plugins", "gallery.js"));

function escapeHtml(value) {
  return String(value === null || typeof value === "undefined" ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function applyPaging(records, options, state) {
  var pageSize = Number(options.pageSize);
  var pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  var page = Math.min(pageCount, Math.max(1, Number(state.page || 1)));
  var rows = records.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: rows,
    type: "previous-next",
    page: page,
    pageSize: pageSize,
    pageCount: pageCount,
    total: records.length,
    shown: rows.length,
    hasNext: page < pageCount,
    hasPrevious: page > 1
  };
}

async function run() {
  var handlers = {};
  var renderedEvents = [];
  var records = [
    { title: "First <unsafe>", image: "first.jpg", meta: { credit: "A & B" } },
    { title: "Second", image: "second.jpg", meta: { credit: "C" } },
    { title: "Third", image: "third.jpg", meta: { credit: "D" } }
  ];
  var stage = {
    html: "",
    replaceChildren: function(fragment) {
      this.html = fragment.html;
    },
    dispatchEvent: function(event) {
      renderedEvents.push(event);
      return true;
    }
  };
  var manager = {
    options: {
      dataurl: "https://dev.uakron.edu/api/vtl/imagegallery"
    },
    render: function() {
      plugin.render();
    }
  };
  var context = {
    manager: manager,
    records: function() {
      return records.slice();
    },
    resolveElement: function() {
      return stage;
    },
    loadTemplate: function(options) {
      return Promise.resolve(options.template);
    },
    renderTemplate: function(template, values) {
      return template.replace(/\{\{([^}]+)\}\}/g, function(match, key) {
        return values[key.trim()] || "";
      });
    },
    escapeHtml: escapeHtml,
    listen: function(root, eventName, selector, handler) {
      handlers[eventName + " " + selector] = handler;
    },
    paging: {
      apply: applyPaging,
      controls: function(view) {
        return [
          { type: "button", label: "Previous", action: "previous", page: Math.max(1, view.page - 1), disabled: !view.hasPrevious },
          { type: "button", label: "Next", action: "next", page: Math.min(view.pageCount, view.page + 1), disabled: !view.hasNext }
        ];
      }
    }
  };
  var plugin = pluginFactory(context, {
    stage: "#gallery",
    template: "<section><div>{{items}}</div>{{paging}}</section>",
    itemtemplate: "<article data-index=\"{{_index}}\"><a href=\"{{image}}\">{{title}}</a><span>{{meta.credit}}</span></article>",
    paging: {
      page: 1,
      pageSize: 2
    },
    fancybox: {
      options: {
        theme: "light"
      }
    }
  });

  await plugin.init();
  plugin.render();

  assert.match(stage.html, /<article/);
  assert.match(stage.html, /First &lt;unsafe&gt;/);
  assert.match(stage.html, /https:\/\/dev\.uakron\.edu\/first\.jpg/);
  assert.match(stage.html, /A &amp; B/);
  assert.match(stage.html, /Page 1 of 2/);
  assert.doesNotMatch(stage.html, /Third/);
  assert.strictEqual(plugin.replaceVariables("{{meta.credit}}", records[0]), "A &amp; B");
  assert.strictEqual(plugin.repeat("{{_number}}:{{title}}", records.slice(0, 2)), "1:First &lt;unsafe&gt;2:Second");
  assert.strictEqual(plugin.clone("item"), "item");
  assert.strictEqual(fancyboxBindings.length, 1);
  assert.strictEqual(fancyboxBindings[0].stage, stage);
  assert.strictEqual(fancyboxBindings[0].selector, "[data-fancybox=\"ua-gallery\"]");
  assert.strictEqual(fancyboxBindings[0].options.theme, "light");

  handlers["click [data-ua-gallery-page]"]({}, {
    getAttribute: function() {
      return "2";
    }
  });

  assert.match(stage.html, /Third/);
  assert.match(stage.html, /Page 2 of 2/);
  assert.doesNotMatch(stage.html, /First/);

  assert.strictEqual(fancyboxBindings.length, 1);
  assert.ok(renderedEvents.some(function(event) {
    return event.type === "ua-gallery:rendered";
  }));

  process.stdout.write("gallery plugin tests passed\n");
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
