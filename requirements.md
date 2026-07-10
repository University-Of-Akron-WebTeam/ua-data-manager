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

## Next Session Notes

1. Move filter rendering into the HTML template separately from the grid plugin logic.
	a.Let's add a element builder to the core.
		-filters: filter options will describe an element (for instance select dropdown) within the html template we will name the element
		          grid will use the core "element builder" to output the element according to the options and element type.
		          core will support these types (dropdowns/select, text input, checkbox and checkbox group, images, links)
		          grid will fill element values as it does now, however options can provide override values		          
2a. clicking on a row will expose a bootstrap modal with details about that row.
2. Leave sorting behavior as-is, but add visible sort arrows/states to sortable headers.
3. (leave for later) Move paging markup into the HTML template somehow while keeping paging methods shared in core.
4. (leave for later) Devise a way to create an image gallery plugin.
