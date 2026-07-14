"use strict";

var assert = require("assert");
var path = require("path");
var capturedRecords;
var csvManager;

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
    runCsvTest();
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

function runCsvTest() {
  capturedRecords = null;
  csvManager = window.UADataManager.init({
    data: "PRES,Bretz,Paul,,College of Engineering and Polymer Science\nDEAN,Fisher,Alli,,College of Health and Human Sciences",
    parseCSV: true,
    csvHeaders: ["recognition", "lastName", "firstName", "middleName", "college"],
    plugins: {
      capture: {}
    }
  });

  void csvManager;
  waitForCsvRender(10);
}

function waitForCsvRender(attempts) {
  if (capturedRecords) {
    assert.deepStrictEqual(capturedRecords, [
      {
        recognition: "PRES",
        lastName: "Bretz",
        firstName: "Paul",
        middleName: "",
        college: "College of Engineering and Polymer Science"
      },
      {
        recognition: "DEAN",
        lastName: "Fisher",
        firstName: "Alli",
        middleName: "",
        college: "College of Health and Human Sciences"
      }
    ]);
    process.stdout.write("core csvHeaders tests passed\n");
    return;
  }

  if (!attempts) {
    throw new Error("Core did not render the headerless CSV records.");
  }

  setTimeout(function() {
    waitForCsvRender(attempts - 1);
  }, 0);
}
