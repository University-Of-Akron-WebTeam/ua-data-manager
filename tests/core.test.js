"use strict";

var assert = require("assert");
var path = require("path");
var capturedRecords;

global.window = {
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};

require(path.resolve(__dirname, "..", "ua-data-manager.js"));

window.UADataManager.registerPlugin("capture", function(context) {
  return {
    render: function() {
      capturedRecords = context.records();
    }
  };
});

var manager = window.UADataManager.init({
  data: {
    payload: {
      images: [
        { full: "/one.jpg" },
        { full: "/two.jpg" }
      ]
    }
  },
  dataPath: "payload.images",
  plugins: {
    capture: {}
  }
});

function waitForRender(attempts) {
  if (capturedRecords) {
    assert.deepStrictEqual(capturedRecords, [
      { full: "/one.jpg" },
      { full: "/two.jpg" }
    ]);

    manager.records = {
      payload: {
        images: [
          { full: "/three.jpg" }
        ]
      }
    };
    manager.render();
    assert.deepStrictEqual(capturedRecords, [
      { full: "/three.jpg" }
    ]);
    process.stdout.write("core dataPath tests passed\n");
    return;
  }

  if (!attempts) {
    throw new Error("Core did not render the capture plugin.");
  }

  setTimeout(function() {
    waitForRender(attempts - 1);
  }, 0);
}

waitForRender(10);
