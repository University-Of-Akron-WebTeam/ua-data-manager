# UA Data Manager

UA Data Manager is a vanilla JavaScript data helper built for dotCMS pages. It is meant to be copied into a page or theme without npm, a bundler, transpiling, or CLI build scripts.

The core file loads data and gives shared utilities to plugins. Plugins own the display and interaction for a specific view, such as the current grid.

## Folder Structure

```text
ua-data-manager/
  index.html
  gallery-demo.html
  ua-data-manager.js
  plugins/
    grid.js
    gallery.js
  templates/
    grid.html
    gallery.html
  tests/
    core.test.js
    gallery.test.js
  requirements.md
  README.md
```

## Quick Start

Add a stage element where the manager should render.

```html
<div id="ua-data-stage"></div>
```

Load the core first, then plugins, then initialize the manager.

```html
<script src="ua-data-manager.js"></script>
<script src="plugins/grid.js"></script>
<script>
  UADataManager.init({
    dataurl: "https://dev.uakron.edu/academics_majors/class-search/data/courseswd.json",
    plugins: {
      grid: {
        stage: "#ua-data-stage",
        templateurl: "templates/grid.html",
        filters: {
          keyword: {
            name: "keyword",
            label: "Search Courses",
            target: ["Course", "Title", "Description", "Instructor"]
          },
          department: {
            type: "select",
            name: "department",
            label: "Department",
            target: "Department"
          },
          career: {
            type: "checkbox-group",
            name: "career",
            label: "Career",
            target: "Career"
          }
        },
        headers: {
          course: { label: "Course", target: "Course" },
          title: { label: "Title", target: "Title" },
          department: { label: "Department", target: "Department" },
          career: { label: "Career", target: "Career" }
        },
        paging: {
          type: "infinite",
          page: 1,
          pageSize: 25
        }
      }
    }
  });
</script>
```

## Core Options

The core accepts these top-level options.

```js
UADataManager.init({
  data: [],
  dataurl: "",
  dataPath: "",
  parseCSV: false,
  parseTSV: false,
  plugins: {}
});
```

`data` can be an array of records.

`dataurl` can point to a JSON, CSV, or TSV file. JSON is the default. Use `parseCSV: true` or `parseTSV: true` for delimited files.

`dataPath` selects an array inside a wrapped JSON response. For example, use `dataPath: "images"` for `{ "images": [...] }`. Dot paths such as `payload.images` are supported.

`plugins` is an object where each key is a plugin name. The grid plugin uses the `grid` key.

## Grid Plugin

The grid plugin renders records into an HTML table, handles filters, sorting, modal details, and paging.

```js
grid: {
  stage: "#ua-data-stage",
  templateurl: "templates/grid.html",
  filters: {},
  initialFilters: {},
  headers: {},
  details: {},
  paging: {}
}
```

`stage` is the selector for the element the grid renders into.

`templateurl` points to the HTML template.

`filters` describes the filter controls.

`initialFilters` sets filters when the grid first loads.

`headers` controls table columns and sortable headers.

`details` controls the fields shown in the row detail modal.

`paging` controls infinite scrolling, numbered pages, or previous/next paging.

## Grid Template

The grid template uses simple placeholders. The plugin replaces each placeholder with HTML.

```html
<div class="ua-datamanager-main">
  <div class="ua-filters">
    {{keyword}}
    {{department}}
    {{career}}
    {{campus}}
    {{mode}}
  </div>
  <div class="ua-result-count">Showing {{shown}} of {{count}}</div>
  <div class="ua-grid-scroll" data-ua-grid-scroll>
    <table class="ua-grid">
      <thead>
        <tr>{{headers}}</tr>
      </thead>
      <tbody>{{rows}}</tbody>
    </table>
    <div class="ua-infinite-scroll-marker" data-ua-infinite-scroll-marker aria-hidden="true"></div>
  </div>
  <div class="ua-paging">{{paging}}</div>
  {{modal}}
</div>
```

The filter placeholders, such as `{{keyword}}` and `{{department}}`, must match the keys in the `filters` option.

`{{shown}}` is the number currently shown.

`{{count}}` is the number of records after filters are applied.

`data-ua-grid-scroll` marks the scrollable grid area.

`data-ua-infinite-scroll-marker` should stay inside the scrollable grid area so infinite scrolling knows when the user is near the bottom.

`{{paging}}` can be inside or outside the scroll area. Keeping it outside lets the table scroll while the paging area stays still.

## Filters

Filters use the core element builder. The grid describes the filter, and the core builds the HTML element.

### Text Search

```js
keyword: {
  name: "keyword",
  label: "Search Courses",
  target: ["Course", "Title", "Description", "Instructor"]
}
```

Text filters use contains-style matching. For example, searching `bio` can match `Biology`.

### Select

```js
department: {
  type: "select",
  name: "department",
  label: "Department",
  target: "Department"
}
```

If `options` is not provided, the grid builds select choices from the data.

### Checkbox Group

```js
career: {
  type: "checkbox-group",
  name: "career",
  label: "Career",
  target: "Career"
}
```

Checkbox groups support multiple checked values.

### Initial Filters

Use `initialFilters` to start the grid already filtered.

```js
initialFilters: {
  campus: "Wayne",
  mode: "Online"
}
```

For a checkbox group, pass an array.

```js
initialFilters: {
  career: ["Undergraduate", "Graduate"]
}
```

You can also set an initial value directly on a filter.

```js
campus: {
  type: "select",
  label: "Campus",
  target: "Campus",
  initialValue: "Wayne"
}
```

## Headers And Sorting

Headers define the grid columns. Each header button is sortable.

```js
headers: {
  course: { label: "Course", target: "Course" },
  title: { label: "Title", target: "Title" },
  department: { label: "Department", target: "Department" },
  career: { label: "Career", target: "Career" },
  campus: { label: "Campus", target: "Campus" },
  mode: { label: "Mode", target: "Instruction_Mode" },
  days: { label: "Days", target: "Days" },
  time: { label: "Start", target: "Start_Time" },
  instructor: { label: "Instructor", target: "Instructor" }
}
```

`label` is what the user sees.

`target` is the data field used for display and sorting.

## Modal Details

Clicking a row opens a modal. Use `details` to choose what fields appear in the modal.

```js
details: {
  course: { label: "Course", target: "Course" },
  title: { label: "Title", target: "Title" },
  description: { label: "Description", target: "Description" },
  instructor: { label: "Instructor", target: "Instructor" }
}
```

If `details` is not provided, the grid falls back to `headers`.

## Paging

Paging math lives in the core so any plugin can use it. The plugin decides how the controls should look.

### Infinite Scroll

```js
paging: {
  type: "infinite",
  page: 1,
  pageSize: 25
}
```

Infinite scroll grows the current result set as the user scrolls. Put the height and overflow on the grid scroll area.

```css
.ua-grid-scroll {
  max-height: 70vh;
  overflow-y: auto;
}

.ua-infinite-scroll-marker {
  height: 1px;
}
```

### Numbered Pages

```js
paging: {
  type: "pages",
  page: 1,
  pageSize: 25
}
```

### Previous / Next

```js
paging: {
  type: "previous-next",
  page: 1,
  pageSize: 12
}
```

This is useful for a future gallery plugin where infinite scrolling is not desired.

## dotCMS Notes

Copy these files into dotCMS in the same relative structure, or update the paths in the script and template URLs.

```text
ua-data-manager.js
plugins/grid.js
templates/grid.html
```

Load order matters:

```html
<script src="ua-data-manager.js"></script>
<script src="plugins/grid.js"></script>
```

The grid plugin can also be loaded by `pluginurl`, but including the plugin script directly is the simplest copy/paste setup.

Avoid using a `<main>` tag inside `grid.html` because dotCMS templates may already have a page-level `<main>`.

## Multiple Managers On One Page

Multiple manager instances can be used on the same page. Give each one its own stage.

```html
<div id="course-grid"></div>
<div id="online-grid"></div>
```

```js
UADataManager.init({
  dataurl: "courses.json",
  plugins: {
    grid: {
      stage: "#course-grid",
      templateurl: "templates/grid.html"
    }
  }
});

UADataManager.init({
  dataurl: "courses.json",
  plugins: {
    grid: {
      stage: "#online-grid",
      templateurl: "templates/grid.html",
      initialFilters: {
        mode: "Online"
      }
    }
  }
});
```

## Current Plugin Direction

The grid plugin owns grid-specific filtering, sorting, rows, modal rendering, and grid paging markup.

The core owns reusable pieces:

- loading and parsing data
- loading templates
- replacing template placeholders
- building common elements
- shared paging calculations and control metadata

This lets the gallery and future plugins reuse the core without inheriting grid-specific markup.

## Gallery Plugin

The gallery plugin mounts one HTML template and repeats one item template for each image in the current masonry page. Previous/next controls load the next or previous set of thumbnails.

```html
<div id="ua-gallery-stage"></div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fancyapps/ui@6.1.14/dist/fancybox/fancybox.css">
<script src="https://cdn.jsdelivr.net/npm/@fancyapps/ui@6.1.14/dist/fancybox/fancybox.umd.js"></script>
<script src="ua-data-manager.js"></script>
<script src="plugins/gallery.js"></script>
```

```js
UADataManager.init({
  dataurl: "https://dev.uakron.edu/api/vtl/imagegallery?folder=Yes&contentID=7b5fdb2f6aab534ee2d8268faaf83f1d&yesUseThisFolderPath=Yes",
  dataPath: "images",
  plugins: {
    gallery: {
      stage: "#ua-gallery-stage",
      templateurl: "templates/gallery.html",
      paging: {
        enabled: true,
        page: 1,
        pageSize: 24
      },
      captions: {
        enabled: true
      },
      fancybox: {
        options: {
          theme: "dark"
        }
      }
    }
  }
});
```

The UA image gallery response supplies `thumbnail`, `full`, `alt`, `icon`, and `caption`. Its image paths are relative; the gallery automatically resolves configured URL fields against the origin of `dataurl`. Use `baseurl` to override that origin or `urlFields` to change which record fields are resolved.

The template owns the gallery HTML. It contains a repeatable `<template data-ua-gallery-item-template>` element, a `[data-ua-gallery-items]` masonry target where item copies are placed, `[data-ua-gallery-value]` elements for counts and page status, and `[data-ua-gallery-control]` buttons for previous/next paging.

Each `{{variable}}` inside the item template is replaced with the matching record property. Dot paths such as `{{media.thumbnail}}` are supported. The reserved variables `{{_index}}` and `{{_number}}` provide the zero-based and one-based positions on the current page.

The plugin keeps template responsibilities separate through `mountTemplate`, `clone`, `repeat`, `replaceVariables`, `replaceValues`, `replaceList`, and `render`. The `render` method prepares data and calls those helpers; it does not build page HTML strings. An inline item template can also be supplied with the `itemtemplate` option.

The repeated item template uses Fancybox's declarative `data-fancybox`, `data-thumb`, and `data-caption` attributes. The plugin binds Fancybox to the stable gallery stage, so gallery items can be replaced without registering duplicate handlers.

Caption overlays are enabled by default. Disable them with:

```js
captions: {
  enabled: false
}
```

Pass Fancybox options through the gallery configuration:

```js
fancybox: {
  enabled: true,
  selector: "[data-fancybox=\"ua-gallery\"]",
  options: {
    theme: "dark"
  }
}
```

If Fancybox is unavailable, the image anchors retain their normal link behavior. Adjust `paging.pageSize` to control how many thumbnails appear in each masonry page.

The gallery emits `ua-gallery:rendered` after each render. Its event detail contains the current paging view and gallery plugin instance.
