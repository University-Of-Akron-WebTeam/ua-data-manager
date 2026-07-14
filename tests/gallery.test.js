"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var plugin = fs.readFileSync(path.resolve(__dirname, "..", "plugins", "gallery.js"), "utf8");
var template = fs.readFileSync(path.resolve(__dirname, "..", "templates", "gallery.html"), "utf8");
var renderBody = plugin.match(/GalleryPlugin\.prototype\.render = function\(\) \{([\s\S]*?)\n  \};/)[1];

function matches(value, pattern) {
  assert.ok(pattern.test(value), "Expected " + pattern + " to match.");
}

function doesNotMatch(value, pattern) {
  assert.ok(!pattern.test(value), "Expected " + pattern + " not to match.");
}

matches(template, /data-ua-gallery-items/);
matches(template, /data-ua-gallery-item-template/);
matches(template, /data-ua-gallery-control="previous"/);
matches(template, /data-ua-gallery-control="next"/);
matches(template, /data-ua-gallery-value="count"/);
matches(template, /data-ua-gallery-value="shown"/);
matches(template, /data-ua-gallery-value="page"/);
matches(template, /data-ua-gallery-value="pageCount"/);
matches(template, /data-ua-gallery-caption/);
matches(template, /ua-gallery-expand-icon/);
matches(template, /fa-up-right-and-down-left-from-center/);

matches(plugin, /mountTemplate/);
matches(plugin, /replaceList/);
matches(plugin, /replaceTextTargets/);
matches(plugin, /updatePaging/);
matches(plugin, /updateCaptions/);
matches(plugin, /captions: \{/);
matches(plugin, /paging: ""/);

doesNotMatch(renderBody, /<article|<button|<nav|<div|<span/);
doesNotMatch(renderBody, /items\s*:/);
doesNotMatch(renderBody, /renderTemplate/);

process.stdout.write("gallery template flow tests passed\n");
