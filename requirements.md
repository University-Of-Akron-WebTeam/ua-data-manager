UA Data Manager

1. Data manager will have a core that feeds plugins.
2. Core will parse JSON data.
3. Core will convert CSV and TSV files to JSON as an option.
4. Plugins can manipulate data using filters and sorting.
5. Core will use shared paging and infinite scrolling methods.
6. Core will use HTML documents as templates.
7. Core can be loaded multiple times, but each instance initializes once.
8. Startup uses data/options in the core and rendering behavior in plugins.
9. Core's default paging mode is infinite scrolling.
10. Core has an option for numbered paging.
11. Filters are connected through options.
12. Grid plugin renders data using a grid template and owns grid filtering/sorting.
13. Root folder structure:

```text
ua-data-manager.js
index.html
plugins/
templates/
```

Example startup shape:

```js
UADataManager.init({
  dataurl: "https://dev.uakron.edu/academics_majors/class-search/data/courseswd.json",
  plugins: {
    grid: {
      stage: "#ua-data-stage",
      templateurl: "templates/grid.html",
      filters: {},
      columns: [],
      headers: {},
      paging: {}
    }
  }
});
```

## Current Status

1. Core element builder supports selects, text inputs, checkboxes, checkbox groups, images, and links.
2. Grid filters render into individual HTML template placeholders.
3. Grid rows expose modal details and sortable headers show direction states.
4. Paging calculations remain shared in core while plugins update controls supplied by their HTML templates.
5. Gallery plugin keeps mounting, cloning, repeating, variable replacement, list replacement, paging updates, and lifecycle methods separate.
6. Gallery item templates repeat once per image record and replace `{{variable}}` values, including dot paths.
7. Gallery uses previous/next paging and binds Fancybox to its stable stage element.
8. Core supports `dataPath` for API responses that wrap records in an object.

## Next Session Notes

1. Confirm whether the API-generated captions should be displayed as supplied or transformed for presentation.
2. Decide which Fancybox controls and theme options should be used in production.
3. Move gallery presentation styles from the demo into the appropriate dotCMS theme or component stylesheet.
